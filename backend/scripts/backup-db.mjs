// PostgreSQL 덤프 백업 — backend 폴더에서 `npm run db:backup`
// docker exec로 gongmo-on-db 컨테이너의 pg_dump를 실행해
// backend/backups/에 타임스탬프 .sql 파일로 저장한다.
// 복원: docker exec -i gongmo-on-db psql -U gongmo -d gongmo_on < <덤프파일>
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const backupsDir = join(here, '..', 'backups');

const CONTAINER = 'gongmo-on-db';
const DB_USER = 'gongmo';
const DB_NAME = 'gongmo_on';

let sql;
try {
  // --clean --if-exists: 복원 때 기존 객체를 drop하고 다시 만들어 그대로 덮어쓰게 한다
  sql = execFileSync(
    'docker',
    ['exec', CONTAINER, 'pg_dump', '-U', DB_USER, '--clean', '--if-exists', DB_NAME],
    { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  );
} catch (err) {
  console.error('백업 실패 — DB 컨테이너가 떠 있는지 확인하세요: backend 폴더에서 npm run db:up');
  console.error(String(err.stderr || err.message || err));
  process.exit(1);
}

if (sql.trim().length === 0) {
  console.error('백업 실패 — pg_dump 결과가 비어 있습니다.');
  process.exit(1);
}

mkdirSync(backupsDir, { recursive: true });
const stamp = new Date()
  .toLocaleString('sv-SE', { hour12: false }) // "YYYY-MM-DD HH:mm:ss"
  .replace(/[\s:]/g, '_');
const file = join(backupsDir, `${DB_NAME}_${stamp}.sql`);
writeFileSync(file, sql, 'utf8');

const kb = Math.round(statSync(file).size / 1024);
console.log(`백업 완료: backend\\backups\\${DB_NAME}_${stamp}.sql (${kb} KB)`);
