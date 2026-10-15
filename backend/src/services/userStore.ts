// ==========================================================
// 계정·세션·사용자 데이터 저장소 — PostgreSQL(gongmo-on-db 컨테이너).
// 스키마는 db/schema.ts가 관리하고, 브라우저를 정리해도 서버 DB에
// 계정과 내역이 남아 다시 로그인하면 복원됩니다.
// ==========================================================

import crypto from "crypto";
import { getPool } from "../db/pool";

export type Account = {
  nickname: string;
  salt: string;
  passwordHash: string;
  email: string;
  phone?: string | undefined;
  createdAt: string;
};

// 프론트 dataPortability.js의 내보내기 형식과 같은 구조 — 로그인 복원이
// 파일 가져오기와 같은 병합 경로를 타게 하기 위해서입니다.
export type UserData = {
  myContests: unknown[];
  wishlist: unknown[];
  savedIdeas: unknown[];
  typeTest: unknown;
  checklist: Record<string, boolean>;
  roadmaps: Record<string, unknown>;
  practiceNotes: unknown[];
};

export type UserDataRecord = {
  data: UserData;
  updatedAt: string;
};

const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30; // 30일
const SESSION_MAX_PER_USER = 5;

// ---------- 비밀번호 해시 (salt + scrypt, 평문 저장 없음) ----------

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString("hex");
}

export function makeSalt(): string {
  return crypto.randomBytes(16).toString("hex");
}

export function verifyPassword(account: Account, password: string): boolean {
  const candidate = hashPassword(password, account.salt);
  const a = Buffer.from(candidate, "hex");
  const b = Buffer.from(account.passwordHash, "hex");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---------- 행 → 타입 변환 ----------

type AccountRow = {
  nickname: string;
  salt: string;
  password_hash: string;
  email: string;
  phone: string | null;
  created_at: Date;
};

function toAccount(row: AccountRow): Account {
  return {
    nickname: row.nickname,
    salt: row.salt,
    passwordHash: row.password_hash,
    email: row.email,
    ...(row.phone ? { phone: row.phone } : {}),
    createdAt: row.created_at.toISOString(),
  };
}

// ---------- 계정 ----------

export async function findAccount(nickname: string): Promise<Account | undefined> {
  const result = await getPool().query<AccountRow>(
    "SELECT nickname, salt, password_hash, email, phone, created_at FROM accounts WHERE nickname = $1",
    [nickname],
  );
  const row = result.rows[0];
  return row ? toAccount(row) : undefined;
}

export async function saveAccount(account: Account): Promise<void> {
  await getPool().query(
    `INSERT INTO accounts (nickname, salt, password_hash, email, phone, created_at)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (nickname) DO UPDATE SET
       salt = EXCLUDED.salt,
       password_hash = EXCLUDED.password_hash,
       email = EXCLUDED.email,
       phone = EXCLUDED.phone,
       created_at = EXCLUDED.created_at`,
    [
      account.nickname,
      account.salt,
      account.passwordHash,
      account.email,
      account.phone ?? null,
      account.createdAt,
    ],
  );
}

// ---------- 세션 ----------

export async function createSession(nickname: string): Promise<string> {
  const token = crypto.randomBytes(32).toString("hex");
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    // 사용자당 세션은 최대 5개 — 넘치면 가장 오래된 것부터 버린다.
    const existing = await client.query<{ token: string }>(
      "SELECT token FROM sessions WHERE nickname = $1 ORDER BY created_at ASC, token ASC",
      [nickname],
    );
    const overflow = existing.rows.length + 1 - SESSION_MAX_PER_USER;
    for (let i = 0; i < overflow; i += 1) {
      const oldest = existing.rows[i]?.token;
      if (oldest) await client.query("DELETE FROM sessions WHERE token = $1", [oldest]);
    }
    await client.query(
      "INSERT INTO sessions (token, nickname) VALUES ($1, $2)",
      [token, nickname],
    );
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return token;
}

export async function getSessionUser(token: string): Promise<string | undefined> {
  const result = await getPool().query<{ nickname: string; created_at: Date }>(
    "SELECT nickname, created_at FROM sessions WHERE token = $1",
    [token],
  );
  const session = result.rows[0];
  if (!session) return undefined;
  if (Date.now() - session.created_at.getTime() > SESSION_MAX_AGE_MS) {
    await deleteSession(token);
    return undefined;
  }
  return session.nickname;
}

export async function deleteSession(token: string): Promise<void> {
  await getPool().query("DELETE FROM sessions WHERE token = $1", [token]);
}

// 아이디 변경 — 계정·세션·사용자 데이터를 한 트랜잭션으로 새 아이디에 옮긴다.
// 옛 JSON 저장소 때는 3개 파일에 걸친 다단계 쓰기라 중간 실패를 순서로 막았지만,
// 이제는 한 트랜잭션이라 어느 단계에서 실패해도 모두 원래대로 돌아갑니다.
export async function renameAccountProfile(
  oldNickname: string,
  updated: Account,
): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query(
      `INSERT INTO accounts (nickname, salt, password_hash, email, phone, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (nickname) DO UPDATE SET
         salt = EXCLUDED.salt,
         password_hash = EXCLUDED.password_hash,
         email = EXCLUDED.email,
         phone = EXCLUDED.phone,
         created_at = EXCLUDED.created_at`,
      [
        updated.nickname,
        updated.salt,
        updated.passwordHash,
        updated.email,
        updated.phone ?? null,
        updated.createdAt,
      ],
    );
    await client.query("UPDATE userdata SET nickname = $2 WHERE nickname = $1", [
      oldNickname,
      updated.nickname,
    ]);
    await client.query("UPDATE sessions SET nickname = $2 WHERE nickname = $1", [
      oldNickname,
      updated.nickname,
    ]);
    await client.query("DELETE FROM accounts WHERE nickname = $1", [oldNickname]);
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

// 서버 시작 때 만료된 세션을 한 번 정리합니다.
export async function pruneExpiredSessions(): Promise<void> {
  await getPool().query(
    "DELETE FROM sessions WHERE created_at < now() - interval '30 days'",
  );
}

// ---------- 사용자 데이터 ----------

function emptyUserData(): UserData {
  return {
    myContests: [],
    wishlist: [],
    savedIdeas: [],
    typeTest: null,
    checklist: {},
    roadmaps: {},
    practiceNotes: [],
  };
}

export async function getUserData(nickname: string): Promise<UserData> {
  const result = await getPool().query<{ data: UserData; updated_at: Date }>(
    "SELECT data, updated_at FROM userdata WHERE nickname = $1",
    [nickname],
  );
  const row = result.rows[0];
  return row?.data ?? emptyUserData();
}

export async function saveUserData(
  nickname: string,
  data: UserData,
): Promise<UserDataRecord> {
  const result = await getPool().query<{ updated_at: Date }>(
    `INSERT INTO userdata (nickname, data) VALUES ($1, $2)
     ON CONFLICT (nickname) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
     RETURNING updated_at`,
    [nickname, JSON.stringify(data)],
  );
  const updatedAt = result.rows[0]?.updated_at ?? new Date();
  return { data, updatedAt: updatedAt.toISOString() };
}
