// ==========================================================
// PostgreSQL 접속 풀 — 이 프로젝트의 유일한 저장소 계층.
// 연결 정보는 backend/.env의 DATABASE_URL로 지정한다.
// dotenv는 서버 최상위 import보다 늦게 로드되므로 모듈을 읽는 시점이
// 아니라 처음 사용하는 시점에 env를 읽어 풀을 만든다(ai.service.ts와 같은 패턴).
// ==========================================================

import pg from "pg";
import dotenv from "dotenv";

export const DEFAULT_DATABASE_URL =
  "postgresql://gongmo:gongmo@localhost:5432/gongmo_on";

let pool: pg.Pool | null = null;

export function getPool(): pg.Pool {
  if (pool) return pool;
  dotenv.config();
  pool = new pg.Pool({
    connectionString: process.env.DATABASE_URL?.trim() || DEFAULT_DATABASE_URL,
    max: 10,
  });
  // 풀의 백그라운드 오류가 프로세스를 끊지 않게 잡아 둔다 — 쿼리 오류는
  // 각 호출의 reject로 전달되므로 여기서는 예기치 못한 유휴 오류만 만난다.
  pool.on("error", (error) => {
    console.error("[db] 연결 풀 오류:", error);
  });
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
