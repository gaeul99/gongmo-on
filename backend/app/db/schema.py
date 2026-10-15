# ==========================================================
# 데이터베이스 스키마 — 서버 시작 때마다 그대로 실행한다.
# 모두 CREATE TABLE IF NOT EXISTS라 몇 번을 실행해도 안전하고,
# 기존 데이터가 지워지지 않는다. 옛 TS 버전(db/schema.ts)과
# 동일한 문자열을 유지한다.
# ==========================================================

SCHEMA_SQL = """
CREATE TABLE IF NOT EXISTS accounts (
  nickname      text PRIMARY KEY,
  salt          text NOT NULL,
  password_hash text NOT NULL,
  email         text NOT NULL,
  phone         text,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token      text PRIMARY KEY,
  nickname   text NOT NULL REFERENCES accounts (nickname) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS sessions_nickname_idx ON sessions (nickname, created_at);

CREATE TABLE IF NOT EXISTS userdata (
  nickname   text PRIMARY KEY REFERENCES accounts (nickname) ON DELETE CASCADE,
  data       jsonb NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 구독은 로그인 없이도 닉네임만으로 등록할 수 있어 계정과 외래키로 묶지 않는다.
CREATE TABLE IF NOT EXISTS subscribers (
  nickname        text PRIMARY KEY,
  email           text NOT NULL,
  idea_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  contests        jsonb NOT NULL DEFAULT '[]'::jsonb,
  opt_in          boolean NOT NULL DEFAULT true,
  sent_keys       jsonb NOT NULL DEFAULT '[]'::jsonb,
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS inquiries (
  id       text PRIMARY KEY,
  at       timestamptz NOT NULL DEFAULT now(),
  email    text NOT NULL DEFAULT '',
  category text NOT NULL,
  content  text NOT NULL
);
CREATE INDEX IF NOT EXISTS inquiries_at_idx ON inquiries (at DESC);

CREATE TABLE IF NOT EXISTS contests (
  id          integer PRIMARY KEY,
  source      text NOT NULL,
  source_id   text NOT NULL,
  title       text NOT NULL,
  organizer   text NOT NULL DEFAULT '',
  field       text NOT NULL DEFAULT '',
  start_date  text,
  deadline    text NOT NULL,
  eligibility text NOT NULL DEFAULT '',
  age_groups  jsonb NOT NULL DEFAULT '[]'::jsonb,
  image       text NOT NULL DEFAULT '',
  url         text NOT NULL,
  description text NOT NULL DEFAULT '',
  apply_steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  CONSTRAINT contests_source_unique UNIQUE (source, source_id),
  CONSTRAINT contests_deadline_format CHECK (deadline ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
);
CREATE INDEX IF NOT EXISTS contests_deadline_idx ON contests (deadline);

-- 공모전 수집기의 내부 상태(id 발급기·소스 등록부·마지막 동기화 시각) — 항상 1행.
CREATE TABLE IF NOT EXISTS sync_state (
  id        integer PRIMARY KEY CHECK (id = 1),
  next_id   integer NOT NULL DEFAULT 1000,
  registry  jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_sync timestamptz
);

CREATE TABLE IF NOT EXISTS outbox (
  id      text PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  channel text NOT NULL,
  to_addr text NOT NULL,
  subject text,
  body    text NOT NULL,
  via     text NOT NULL
);
CREATE INDEX IF NOT EXISTS outbox_at_idx ON outbox (at DESC);
"""
