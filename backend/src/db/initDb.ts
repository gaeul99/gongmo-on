// ==========================================================
// DB 초기화 — 스키마 적용 + (최초 1회) 기존 JSON 데이터 이관.
// 서버 시작 때 initDb()를 호출한다. DB가 아직 안 떠 있으면
// Docker Desktop 실행·docker compose up -d를 안내하며 잠시 기다린다.
// ==========================================================

import fs from "fs";
import path from "path";
import { getPool } from "./pool";
import { SCHEMA_SQL } from "./schema";
import type { Account, UserDataRecord } from "../services/userStore";
import type { Inquiry } from "../services/inquiryStore";
import type { OutboxEntry, Subscriber } from "../services/notificationStore";
import type { SyncedContest } from "../services/contestSync";

// 옛 JSON 저장소 위치 — userStore.ts 등이 쓰던 바로 그 폴더(src/data).
const DATA_DIR = path.resolve(__dirname, "..", "data");

const CONNECT_RETRY_MS = 2_000;
const DEFAULT_CONNECT_TIMEOUT_MS = 60_000;

async function waitUntilConnected(timeoutMs: number): Promise<void> {
  const pool = getPool();
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    try {
      await pool.query("SELECT 1");
      return;
    } catch (error) {
      if (Date.now() >= deadline) {
        console.error(
          "[db] 데이터베이스에 연결하지 못했습니다. Docker Desktop이 실행 중인지,\n" +
            "     backend 폴더에서 `docker compose up -d`로 DB 컨테이너가 떠 있는지 확인해 주세요.",
          error,
        );
        throw error;
      }
      await new Promise((resolve) => setTimeout(resolve, CONNECT_RETRY_MS));
    }
  }
}

function readJsonFile<T>(file: string): T | undefined {
  const file_ = path.join(DATA_DIR, file);
  let raw: string;
  try {
    raw = fs.readFileSync(file_, "utf-8");
  } catch {
    return undefined; // 파일이 없는 초기 상태다.
  }
  try {
    const parsed = JSON.parse(raw) as T;
    return parsed;
  } catch (error) {
    console.error(`[db] ${file_}을(를) 읽지 못해 이관을 건너뜁니다.`, error);
    return undefined;
  }
}

async function countRows(table: string): Promise<number> {
  const result = await getPool().query<{ count: string }>(
    `SELECT count(*)::text AS count FROM ${table}`,
  );
  return Number(result.rows[0]?.count ?? "0");
}

// ---------- 저장소별 이관 ----------

async function migrateAccounts(accounts: Account[]): Promise<number> {
  let inserted = 0;
  for (const account of accounts) {
    await getPool().query(
      `INSERT INTO accounts (nickname, salt, password_hash, email, phone, created_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (nickname) DO NOTHING`,
      [
        account.nickname,
        account.salt,
        account.passwordHash,
        account.email,
        account.phone ?? null,
        account.createdAt,
      ],
    );
    inserted += 1;
  }
  return inserted;
}

async function migrateSessions(
  sessions: Record<string, { nickname: string; createdAt: string }>,
): Promise<number> {
  let inserted = 0;
  for (const [token, session] of Object.entries(sessions)) {
    // 계정이 없는 세션은 외래키에 걸려 들어갈 수 없다 — 옛 데이터의 불량 항목이므로 버린다.
    const known = await getPool().query("SELECT 1 FROM accounts WHERE nickname = $1", [
      session.nickname,
    ]);
    if (known.rowCount === 0) continue;
    await getPool().query(
      `INSERT INTO sessions (token, nickname, created_at) VALUES ($1, $2, $3)
       ON CONFLICT (token) DO NOTHING`,
      [token, session.nickname, session.createdAt],
    );
    inserted += 1;
  }
  return inserted;
}

async function migrateUserdata(
  store: Record<string, UserDataRecord>,
): Promise<number> {
  let inserted = 0;
  for (const [nickname, record] of Object.entries(store)) {
    const known = await getPool().query("SELECT 1 FROM accounts WHERE nickname = $1", [
      nickname,
    ]);
    if (known.rowCount === 0) continue;
    await getPool().query(
      `INSERT INTO userdata (nickname, data, updated_at) VALUES ($1, $2, $3)
       ON CONFLICT (nickname) DO NOTHING`,
      [nickname, JSON.stringify(record.data), record.updatedAt],
    );
    inserted += 1;
  }
  return inserted;
}

async function migrateSubscribers(subscribers: Subscriber[]): Promise<number> {
  let inserted = 0;
  for (const subscriber of subscribers) {
    await getPool().query(
      `INSERT INTO subscribers (nickname, email, idea_categories, contests, opt_in, sent_keys, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (nickname) DO NOTHING`,
      [
        subscriber.nickname,
        subscriber.email ?? "",
        JSON.stringify(subscriber.ideaCategories ?? []),
        JSON.stringify(subscriber.contests ?? []),
        subscriber.optIn,
        JSON.stringify(subscriber.sentKeys ?? []),
        subscriber.updatedAt,
      ],
    );
    inserted += 1;
  }
  return inserted;
}

async function migrateInquiries(inquiries: Inquiry[]): Promise<number> {
  let inserted = 0;
  for (const inquiry of inquiries) {
    await getPool().query(
      `INSERT INTO inquiries (id, at, email, category, content) VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (id) DO NOTHING`,
      [inquiry.id, inquiry.at, inquiry.email, inquiry.category, inquiry.content],
    );
    inserted += 1;
  }
  return inserted;
}

async function migrateOutbox(entries: OutboxEntry[]): Promise<number> {
  let inserted = 0;
  for (const entry of entries) {
    await getPool().query(
      `INSERT INTO outbox (id, at, channel, to_addr, subject, body, via) VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [entry.id, entry.at, entry.channel, entry.to, entry.subject ?? null, entry.text, entry.via],
    );
    inserted += 1;
  }
  return inserted;
}

async function migrateContests(state: {
  nextId: number;
  registry: Record<string, unknown>;
  contests: SyncedContest[];
  lastSync?: string | undefined;
}): Promise<number> {
  await getPool().query(
    `INSERT INTO sync_state (id, next_id, registry, last_sync) VALUES (1, $1, $2, $3)
     ON CONFLICT (id) DO NOTHING`,
    [state.nextId, JSON.stringify(state.registry ?? {}), state.lastSync ?? null],
  );
  let inserted = 0;
  for (const contest of state.contests) {
    await getPool().query(
      `INSERT INTO contests
         (id, source, source_id, title, organizer, field, start_date, deadline,
          eligibility, age_groups, image, url, description, apply_steps)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
       ON CONFLICT (id) DO NOTHING`,
      [
        contest.id,
        contest.source,
        contest.sourceId,
        contest.title,
        contest.organizer ?? "",
        contest.field,
        contest.startDate ?? null,
        contest.deadline,
        contest.eligibility ?? "",
        JSON.stringify(contest.ageGroups ?? []),
        contest.image ?? "",
        contest.url,
        contest.description ?? "",
        JSON.stringify(contest.applySteps ?? []),
      ],
    );
    inserted += 1;
  }
  return inserted;
}

// 스키마 적용 후, 테이블이 비어 있고 옛 JSON 파일이 남아 있으면 데이터를 옮긴다.
// 파일은 지우지 않는다 — 언제든 다시 볼 수 있는 백업으로 남긴다.
async function migrateLegacyJson(): Promise<void> {
  const accounts = readJsonFile<Account[]>("accounts.json");
  if (accounts && (await countRows("accounts")) === 0 && accounts.length > 0) {
    console.log(`[db] accounts.json의 계정 ${accounts.length}건을 DB로 이관합니다.`);
    await migrateAccounts(accounts);
  }

  const sessions = readJsonFile<Record<string, { nickname: string; createdAt: string }>>(
    "sessions.json",
  );
  if (sessions && (await countRows("sessions")) === 0 && Object.keys(sessions).length > 0) {
    const inserted = await migrateSessions(sessions);
    console.log(`[db] sessions.json의 세션 ${inserted}건을 DB로 이관합니다.`);
  }

  const userdata = readJsonFile<Record<string, UserDataRecord>>("userdata.json");
  if (userdata && (await countRows("userdata")) === 0 && Object.keys(userdata).length > 0) {
    const inserted = await migrateUserdata(userdata);
    console.log(`[db] userdata.json의 사용자 데이터 ${inserted}건을 DB로 이관합니다.`);
  }

  const subscribers = readJsonFile<Subscriber[]>("subscribers.json");
  if (
    subscribers &&
    (await countRows("subscribers")) === 0 &&
    subscribers.length > 0
  ) {
    console.log(`[db] subscribers.json의 구독자 ${subscribers.length}건을 DB로 이관합니다.`);
    await migrateSubscribers(subscribers);
  }

  const inquiries = readJsonFile<Inquiry[]>("inquiries.json");
  if (inquiries && (await countRows("inquiries")) === 0 && inquiries.length > 0) {
    console.log(`[db] inquiries.json의 문의 ${inquiries.length}건을 DB로 이관합니다.`);
    await migrateInquiries(inquiries);
  }

  const outbox = readJsonFile<OutboxEntry[]>("outbox.json");
  if (outbox && (await countRows("outbox")) === 0 && outbox.length > 0) {
    console.log(`[db] outbox.json의 발송 기록 ${outbox.length}건을 DB로 이관합니다.`);
    await migrateOutbox(outbox);
  }

  type LegacyContestState = {
    nextId?: number;
    registry?: Record<string, unknown>;
    contests?: SyncedContest[];
    lastSync?: string;
  };
  const contests = readJsonFile<LegacyContestState>("contests.json");
  if (
    contests &&
    Array.isArray(contests.contests) &&
    (await countRows("contests")) === 0 &&
    contests.contests.length > 0
  ) {
    console.log(
      `[db] contests.json의 공모전 ${contests.contests.length}건을 DB로 이관합니다. 잠시 걸릴 수 있어요.`,
    );
    const inserted = await migrateContests({
      nextId: Number(contests.nextId) > 0 ? Number(contests.nextId) : 1000,
      registry: contests.registry ?? {},
      contests: contests.contests,
      lastSync: contests.lastSync,
    });
    console.log(`[db] 공모전 ${inserted}건 이관 완료.`);
  }
}

export async function initDb(
  options: { migrateFromJson?: boolean; connectTimeoutMs?: number } = {},
): Promise<void> {
  const { migrateFromJson = true, connectTimeoutMs = DEFAULT_CONNECT_TIMEOUT_MS } =
    options;
  await waitUntilConnected(connectTimeoutMs);
  await getPool().query(SCHEMA_SQL);
  if (migrateFromJson) {
    await migrateLegacyJson();
  }
}
