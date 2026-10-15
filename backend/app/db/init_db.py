# ==========================================================
# DB 초기화 — 스키마 적용 + (최초 1회) 기존 JSON 데이터 이관.
# 서버 시작 때 init_db()를 호출한다. DB가 아직 안 떠 있으면
# Docker Desktop 실행·docker compose up -d를 안내하며 잠시 기다린다.
# ==========================================================
import json
import sys
import time
from pathlib import Path

import psycopg

from app.db.pool import get_pool
from app.db.schema import SCHEMA_SQL

# 옛 JSON 저장소 위치 — 옛 TS 버전(src/db/initDb.ts)이 쓰던 backend/src/data.
DATA_DIR = Path(__file__).resolve().parents[2] / "src" / "data"

CONNECT_RETRY_SEC = 2.0
DEFAULT_CONNECT_TIMEOUT_SEC = 60.0


def _wait_until_connected(timeout_sec: float) -> None:
    pool = get_pool()
    deadline = time.monotonic() + timeout_sec
    while True:
        try:
            with pool.connection() as conn:
                conn.execute("SELECT 1")
            return
        except psycopg.Error as error:
            if time.monotonic() >= deadline:
                print(
                    "[db] 데이터베이스에 연결하지 못했습니다. Docker Desktop이 실행 중인지,\n"
                    "     backend 폴더에서 `docker compose up -d`로 DB 컨테이너가 떠 있는지 확인해 주세요.",
                    error,
                    file=sys.stderr,
                )
                raise
            time.sleep(CONNECT_RETRY_SEC)


def _read_json_file(file: str):
    path = DATA_DIR / file
    try:
        raw = path.read_text(encoding="utf-8")
    except OSError:
        return None  # 파일이 없는 초기 상태다.
    try:
        return json.loads(raw)
    except (ValueError, TypeError) as error:
        print(f"[db] {path}을(를) 읽지 못해 이관을 건너뜁니다.", error)
        return None


def _count_rows(table: str) -> int:
    with get_pool().connection() as conn:
        row = conn.execute(f"SELECT count(*) AS count FROM {table}").fetchone()
    return int(row[0]) if row else 0


# ---------- 저장소별 이관 ----------

def _migrate_accounts(accounts: list[dict]) -> int:
    inserted = 0
    with get_pool().connection() as conn:
        for account in accounts:
            conn.execute(
                """INSERT INTO accounts (nickname, salt, password_hash, email, phone, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s)
                   ON CONFLICT (nickname) DO NOTHING""",
                (
                    account.get("nickname"),
                    account.get("salt"),
                    account.get("passwordHash"),
                    account.get("email"),
                    account.get("phone"),
                    account.get("createdAt"),
                ),
            )
            inserted += 1
    return inserted


def _migrate_sessions(sessions: dict) -> int:
    inserted = 0
    with get_pool().connection() as conn:
        for token, session in sessions.items():
            # 계정이 없는 세션은 외래키에 걸려 들어갈 수 없다 — 옛 데이터의 불량 항목이므로 버린다.
            known = conn.execute(
                "SELECT 1 FROM accounts WHERE nickname = %s", (session.get("nickname"),)
            ).fetchone()
            if known is None:
                continue
            conn.execute(
                """INSERT INTO sessions (token, nickname, created_at) VALUES (%s, %s, %s)
                   ON CONFLICT (token) DO NOTHING""",
                (token, session.get("nickname"), session.get("createdAt")),
            )
            inserted += 1
    return inserted


def _migrate_userdata(store: dict) -> int:
    inserted = 0
    with get_pool().connection() as conn:
        for nickname, record in store.items():
            known = conn.execute(
                "SELECT 1 FROM accounts WHERE nickname = %s", (nickname,)
            ).fetchone()
            if known is None:
                continue
            conn.execute(
                """INSERT INTO userdata (nickname, data, updated_at) VALUES (%s, %s, %s)
                   ON CONFLICT (nickname) DO NOTHING""",
                (nickname, json.dumps(record.get("data"), ensure_ascii=False), record.get("updatedAt")),
            )
            inserted += 1
    return inserted


def _migrate_subscribers(subscribers: list[dict]) -> int:
    inserted = 0
    with get_pool().connection() as conn:
        for subscriber in subscribers:
            conn.execute(
                """INSERT INTO subscribers
                     (nickname, email, idea_categories, contests, opt_in, sent_keys, updated_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (nickname) DO NOTHING""",
                (
                    subscriber.get("nickname"),
                    subscriber.get("email") or "",
                    json.dumps(subscriber.get("ideaCategories") or [], ensure_ascii=False),
                    json.dumps(subscriber.get("contests") or [], ensure_ascii=False),
                    subscriber.get("optIn", True),
                    json.dumps(subscriber.get("sentKeys") or [], ensure_ascii=False),
                    subscriber.get("updatedAt"),
                ),
            )
            inserted += 1
    return inserted


def _migrate_inquiries(inquiries: list[dict]) -> int:
    inserted = 0
    with get_pool().connection() as conn:
        for inquiry in inquiries:
            conn.execute(
                """INSERT INTO inquiries (id, at, email, category, content)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (id) DO NOTHING""",
                (
                    inquiry.get("id"),
                    inquiry.get("at"),
                    inquiry.get("email"),
                    inquiry.get("category"),
                    inquiry.get("content"),
                ),
            )
            inserted += 1
    return inserted


def _migrate_outbox(entries: list[dict]) -> int:
    inserted = 0
    with get_pool().connection() as conn:
        for entry in entries:
            conn.execute(
                """INSERT INTO outbox (id, at, channel, to_addr, subject, body, via)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (id) DO NOTHING""",
                (
                    entry.get("id"),
                    entry.get("at"),
                    entry.get("channel"),
                    entry.get("to"),
                    entry.get("subject"),
                    entry.get("text"),
                    entry.get("via"),
                ),
            )
            inserted += 1
    return inserted


def _migrate_contests(state: dict) -> int:
    contests = state.get("contests") or []
    inserted = 0
    with get_pool().connection() as conn:
        conn.execute(
            """INSERT INTO sync_state (id, next_id, registry, last_sync) VALUES (1, %s, %s, %s)
               ON CONFLICT (id) DO NOTHING""",
            (
                state.get("nextId") if isinstance(state.get("nextId"), (int, float)) and state.get("nextId", 0) > 0 else 1000,
                json.dumps(state.get("registry") or {}, ensure_ascii=False),
                state.get("lastSync"),
            ),
        )
        for contest in contests:
            conn.execute(
                """INSERT INTO contests
                     (id, source, source_id, title, organizer, field, start_date, deadline,
                      eligibility, age_groups, image, url, description, apply_steps)
                   VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                   ON CONFLICT (id) DO NOTHING""",
                (
                    contest.get("id"),
                    contest.get("source"),
                    contest.get("sourceId"),
                    contest.get("title"),
                    contest.get("organizer") or "",
                    contest.get("field"),
                    contest.get("startDate"),
                    contest.get("deadline"),
                    contest.get("eligibility") or "",
                    json.dumps(contest.get("ageGroups") or [], ensure_ascii=False),
                    contest.get("image") or "",
                    contest.get("url"),
                    contest.get("description") or "",
                    json.dumps(contest.get("applySteps") or [], ensure_ascii=False),
                ),
            )
            inserted += 1
    return inserted


# 스키마 적용 후, 테이블이 비어 있고 옛 JSON 파일이 남아 있으면 데이터를 옮긴다.
# 파일은 지우지 않는다 — 언제든 다시 볼 수 있는 백업으로 남긴다.
def _migrate_legacy_json() -> None:
    accounts = _read_json_file("accounts.json")
    if accounts and _count_rows("accounts") == 0 and len(accounts) > 0:
        print(f"[db] accounts.json의 계정 {len(accounts)}건을 DB로 이관합니다.")
        _migrate_accounts(accounts)

    sessions = _read_json_file("sessions.json")
    if sessions and _count_rows("sessions") == 0 and len(sessions) > 0:
        inserted = _migrate_sessions(sessions)
        print(f"[db] sessions.json의 세션 {inserted}건을 DB로 이관합니다.")

    userdata = _read_json_file("userdata.json")
    if userdata and _count_rows("userdata") == 0 and len(userdata) > 0:
        inserted = _migrate_userdata(userdata)
        print(f"[db] userdata.json의 사용자 데이터 {inserted}건을 DB로 이관합니다.")

    subscribers = _read_json_file("subscribers.json")
    if subscribers and _count_rows("subscribers") == 0 and len(subscribers) > 0:
        print(f"[db] subscribers.json의 구독자 {len(subscribers)}건을 DB로 이관합니다.")
        _migrate_subscribers(subscribers)

    inquiries = _read_json_file("inquiries.json")
    if inquiries and _count_rows("inquiries") == 0 and len(inquiries) > 0:
        print(f"[db] inquiries.json의 문의 {len(inquiries)}건을 DB로 이관합니다.")
        _migrate_inquiries(inquiries)

    outbox = _read_json_file("outbox.json")
    if outbox and _count_rows("outbox") == 0 and len(outbox) > 0:
        print(f"[db] outbox.json의 발송 기록 {len(outbox)}건을 DB로 이관합니다.")
        _migrate_outbox(outbox)

    contests = _read_json_file("contests.json")
    if (
        contests
        and isinstance(contests.get("contests"), list)
        and _count_rows("contests") == 0
        and len(contests["contests"]) > 0
    ):
        print(
            f"[db] contests.json의 공모전 {len(contests['contests'])}건을 DB로 이관합니다. 잠시 걸릴 수 있어요."
        )
        inserted = _migrate_contests(contests)
        print(f"[db] 공모전 {inserted}건 이관 완료.")


def init_db(migrate_from_json: bool = True, connect_timeout_sec: float = DEFAULT_CONNECT_TIMEOUT_SEC) -> None:
    _wait_until_connected(connect_timeout_sec)
    with get_pool().connection() as conn:
        conn.execute(SCHEMA_SQL)
    if migrate_from_json:
        _migrate_legacy_json()
