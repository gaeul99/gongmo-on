// ==========================================================
// userStore PostgreSQL 통합 테스트
// Docker DB(gongmo-on-db)가 떠 있을 때만 실행된다 — 꺼져 있으면 건너뛴다.
// 실제 계정·세션·사용자 데이터의 저장/조회/개명 흐름을 확인합니다.
// ==========================================================
import { afterAll, describe, expect, it } from "vitest";

import { closePool, getPool } from "../db/pool";
import { initDb } from "../db/initDb";
import {
  createSession,
  findAccount,
  getSessionUser,
  getUserData,
  hashPassword,
  makeSalt,
  renameAccountProfile,
  saveAccount,
  saveUserData,
  verifyPassword,
  type Account,
} from "./userStore";

let dbUp = false;

try {
  // 테스트에서는 JSON 이관 없이, 연결 대기도 없이 바로 판정한다.
  // skipIf 조건은 describe 수집 시점에 평가되므로 최상위에서 미리 판정해야 한다.
  await initDb({ migrateFromJson: false, connectTimeoutMs: 0 });
  dbUp = true;
} catch {
  dbUp = false;
}

afterAll(async () => {
  if (dbUp) {
    // 테스트 계정은 FK 전파(CASCADE)로 세션·사용자 데이터까지 함께 지운다.
    await getPool().query("DELETE FROM accounts WHERE nickname LIKE 'db-test-%'");
  }
  await closePool();
});

function makeTestAccount(nickname: string): Account {
  const salt = makeSalt();
  return {
    nickname,
    salt,
    passwordHash: hashPassword("test-password-123", salt),
    email: "db-test@example.com",
    createdAt: new Date().toISOString(),
  };
}

describe.skipIf(!dbUp)("userStore — PostgreSQL 통합", () => {
  it("계정 저장·조회·비밀번호 검증이 동작한다", async () => {
    const account = makeTestAccount("db-test-basic");
    await saveAccount(account);

    const found = await findAccount("db-test-basic");
    expect(found).toBeDefined();
    expect(found?.email).toBe("db-test@example.com");
    expect(verifyPassword(found!, "test-password-123")).toBe(true);
    expect(verifyPassword(found!, "wrong-password")).toBe(false);
  });

  it("세션 생성·조회·삭제가 동작하고 사용자당 5개로 제한된다", async () => {
    const account = makeTestAccount("db-test-session");
    await saveAccount(account);

    const firstToken = await createSession("db-test-session");
    for (let i = 0; i < 5; i += 1) {
      await createSession("db-test-session");
    }
    expect(await getSessionUser(firstToken)).toBeUndefined(); // 가장 오래된 세션은 밀려난다

    const token = await createSession("db-test-session");
    expect(await getSessionUser(token)).toBe("db-test-session");

    const count = await getPool().query(
      "SELECT count(*)::int AS count FROM sessions WHERE nickname = 'db-test-session'",
    );
    expect(count.rows[0]?.count).toBe(5);
  });

  it("사용자 데이터를 저장하고 다시 읽는다", async () => {
    const account = makeTestAccount("db-test-userdata");
    await saveAccount(account);

    const record = await saveUserData("db-test-userdata", {
      myContests: [{ id: 1, title: "테스트 공모전" }],
      wishlist: [],
      savedIdeas: [],
      typeTest: { typeId: "planner", percentage: 80 },
      checklist: { a: true },
      roadmaps: {},
      practiceNotes: [],
    });
    expect(record.updatedAt).toBeTruthy();

    const loaded = await getUserData("db-test-userdata");
    expect(loaded.myContests).toEqual([{ id: 1, title: "테스트 공모전" }]);
    expect(loaded.typeTest).toMatchObject({ typeId: "planner" });
  });

  it("아이디 변경이 계정·세션·사용자 데이터를 한 번에 옮긴다", async () => {
    const account = makeTestAccount("db-test-rename-old");
    await saveAccount(account);
    const token = await createSession("db-test-rename-old");
    await saveUserData("db-test-rename-old", {
      myContests: [],
      wishlist: [],
      savedIdeas: [],
      typeTest: null,
      checklist: {},
      roadmaps: {},
      practiceNotes: [],
    });

    await renameAccountProfile("db-test-rename-old", {
      ...account,
      nickname: "db-test-rename-new",
    });

    expect(await findAccount("db-test-rename-old")).toBeUndefined();
    expect((await findAccount("db-test-rename-new"))?.email).toBe(
      "db-test@example.com",
    );
    // 세션은 로그인이 유지되게 새 아이디로 옮겨진다.
    expect(await getSessionUser(token)).toBe("db-test-rename-new");
    const loaded = await getUserData("db-test-rename-new");
    expect(loaded.typeTest).toBeNull();
  });
});
