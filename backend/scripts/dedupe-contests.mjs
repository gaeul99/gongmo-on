// 중복 공모전 정리 — backend 폴더에서 `node scripts/dedupe-contests.mjs`
// 위비티·콘테스트코리아가 같은 공모전을 각각 올려 소스 키가 달라 둘 다
// 등록된 경우를 정리한다. 제목(공백 정규화)+마감일이 같으면 같은 공모전으로
// 보고 id가 가장 작은 한 건만 남긴다. sync_state.registry의 죽은 id 포인터는
// 남긴 공모전의 id로 고쳐 다음 동기화 때 재등록되지 않게 한다.
// 같은 규칙의 등록 가드는 app/services/contest_sync.py에 있고, 레거시 마이그레이션
// 원본(src/data/contests.json)도 같은 방식으로 정리해 재이관 때 중복이 돌아오지 않게 한다.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const here = dirname(fileURLToPath(import.meta.url));
const backendDir = join(here, '..');
const LEGACY_JSON = join(backendDir, 'src', 'data', 'contests.json');

// .env의 DATABASE_URL을 최우선으로 쓴다(app/db/pool.ts와 같은 우선순위).
let databaseUrl = 'postgresql://gongmo:gongmo@localhost:5432/gongmo_on';
try {
  const env = readFileSync(join(backendDir, '.env'), 'utf8');
  const match = env.match(/^DATABASE_URL=(.+)$/m);
  if (match) databaseUrl = match[1].trim();
} catch {
  // .env가 없으면 기본 접속 정보를 쓴다.
}

function normTitle(title) {
  return String(title ?? '').replace(/\s+/g, ' ').trim();
}

// (정규화한 제목, 마감일)이 같으면 같은 공모전으로 본다.
function dupKey(contest) {
  return `${normTitle(contest.title)}|${contest.deadline}`;
}

// 첫 등록(id 최소)만 남기고 나머지 id를 제거 대상으로 돌려준다.
function pickVictims(contests) {
  const first = new Map(); // dupKey → 남길 contest
  const victims = new Map(); // 제거할 id → 남긴 id
  for (const contest of [...contests].sort((a, b) => a.id - b.id)) {
    const key = dupKey(contest);
    const kept = first.get(key);
    if (kept) victims.set(contest.id, kept.id);
    else first.set(key, contest);
  }
  return victims;
}

// registry 포인터를 제거되는 id → 남긴 id로 고친다.
function fixRegistry(registry, victims) {
  let fixed = 0;
  for (const entry of Object.values(registry ?? {})) {
    if (entry && typeof entry.id === 'number' && victims.has(entry.id)) {
      entry.id = victims.get(entry.id);
      fixed += 1;
    }
  }
  return fixed;
}

// ---------- 1. PostgreSQL ----------
const client = new pg.Client({ connectionString: databaseUrl });
await client.connect();

const { rows } = await client.query('SELECT id, title, deadline FROM contests ORDER BY id ASC');
const victims = pickVictims(rows);

if (victims.size === 0) {
  console.log(`DB 공모전 ${rows.length}건 — 제목+마감일 기준 중복 없음. 그대로 둡니다.`);
} else {
  const keptRows = await client.query('SELECT registry FROM sync_state WHERE id = 1');
  const registry = keptRows.rows[0]?.registry ?? {};
  const fixed = fixRegistry(registry, victims);

  await client.query('BEGIN');
  await client.query('DELETE FROM contests WHERE id = ANY($1::int[])', [[...victims.keys()]]);
  await client.query('UPDATE sync_state SET registry = $1::jsonb WHERE id = 1', [
    JSON.stringify(registry),
  ]);
  await client.query('COMMIT');
  console.log(
    `DB 정리 완료 — ${rows.length}건 중 중복 ${victims.size}건 삭제, ` +
      `남은 건수 ${rows.length - victims.size}건, registry 포인터 ${fixed}건 수정`,
  );
}

const gate = await client.query(
  'SELECT next_id, last_sync, (SELECT count(*) FROM contests) AS total FROM sync_state WHERE id = 1',
);
const state = gate.rows[0];
console.log(
  `DB 상태 — 총 ${state.total}건, next_id ${state.next_id}, ` +
    `마지막 동기화 ${state.last_sync ? new Date(state.last_sync).toISOString() : '없음'}`,
);
await client.end();

// ---------- 2. 레거시 마이그레이션 원본(src/data/contests.json) ----------
let legacy;
try {
  legacy = JSON.parse(readFileSync(LEGACY_JSON, 'utf8'));
} catch {
  console.log('레거시 contests.json을 읽지 못해 건너뜁니다.');
  legacy = null;
}
if (legacy && Array.isArray(legacy.contests)) {
  const legacyVictims = pickVictims(legacy.contests);
  if (legacyVictims.size === 0) {
    console.log(`레거시 contests.json ${legacy.contests.length}건 — 중복 없음.`);
  } else {
    const fixedLegacy = fixRegistry(legacy.registry, legacyVictims);
    legacy.contests = legacy.contests.filter((contest) => !legacyVictims.has(contest.id));
    writeFileSync(LEGACY_JSON, `${JSON.stringify(legacy, null, 2)}\n`, 'utf8');
    console.log(
      `레거시 contests.json 정리 완료 — 중복 ${legacyVictims.size}건 삭제, ` +
        `남은 건수 ${legacy.contests.length}건, registry 포인터 ${fixedLegacy}건 수정`,
    );
  }
}
