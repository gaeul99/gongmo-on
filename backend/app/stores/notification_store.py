# ==========================================================
# 알림 구독자·발송 기록 저장소 — PostgreSQL(gongmo-on-db 컨테이너).
# ==========================================================
import json
import time

from psycopg.types.json import Json

from app.db.pool import get_pool
from app.security import random_hex
from app.utils.timeutil import iso_now, iso_utc

MAX_OUTBOX = 200

SUBSCRIBER_COLUMNS = (
    "nickname, email, idea_categories, contests, opt_in, sent_keys, updated_at"
)


def _to_subscriber(row) -> dict:
    return {
        "nickname": row[0],
        "email": row[1],
        "ideaCategories": row[2] or [],
        "contests": row[3] or [],
        "optIn": row[4],
        "sentKeys": row[5] or [],
        "updatedAt": iso_utc(row[6]),
    }


def list_subscribers() -> list[dict]:
    with get_pool().connection() as conn:
        rows = conn.execute(
            f"""SELECT {SUBSCRIBER_COLUMNS}
                FROM subscribers ORDER BY updated_at ASC"""
        ).fetchall()
    return [_to_subscriber(row) for row in rows]


def upsert_subscriber(
    nickname: str,
    email: str,
    idea_categories: list,
    contests: list,
    opt_in: bool,
) -> dict:
    # 이미 보낸 알림 기록(sent_keys)은 구독 정보를 갱신해도 유지한다.
    with get_pool().connection() as conn:
        row = conn.execute(
            f"""INSERT INTO subscribers (nickname, email, idea_categories, contests, opt_in, sent_keys)
                VALUES (%s, %s, %s, %s, %s, '[]'::jsonb)
                ON CONFLICT (nickname) DO UPDATE SET
                  email = EXCLUDED.email,
                  idea_categories = EXCLUDED.idea_categories,
                  contests = EXCLUDED.contests,
                  opt_in = EXCLUDED.opt_in,
                  updated_at = now()
                RETURNING {SUBSCRIBER_COLUMNS}""",
            (
                nickname,
                email or "",
                json.dumps(idea_categories or [], ensure_ascii=False),
                json.dumps(contests or [], ensure_ascii=False),
                opt_in,
            ),
        ).fetchone()
    return _to_subscriber(row)


def save_subscriber(next_subscriber: dict) -> None:
    with get_pool().connection() as conn:
        conn.execute(
            """INSERT INTO subscribers (nickname, email, idea_categories, contests, opt_in, sent_keys)
               VALUES (%s, %s, %s, %s, %s, %s)
               ON CONFLICT (nickname) DO UPDATE SET
                 email = EXCLUDED.email,
                 idea_categories = EXCLUDED.idea_categories,
                 contests = EXCLUDED.contests,
                 opt_in = EXCLUDED.opt_in,
                 sent_keys = EXCLUDED.sent_keys,
                 updated_at = now()""",
            (
                next_subscriber["nickname"],
                next_subscriber.get("email") or "",
                json.dumps(next_subscriber.get("ideaCategories") or [], ensure_ascii=False),
                json.dumps(next_subscriber.get("contests") or [], ensure_ascii=False),
                next_subscriber.get("optIn", True),
                json.dumps(next_subscriber.get("sentKeys") or [], ensure_ascii=False),
            ),
        )


def append_outbox(channel: str, to: str, subject: str | None, text: str, via: str) -> dict:
    record = {
        "id": f"{int(time.time() * 1000)}-{random_hex(4)}",
        "at": iso_now(),
        "channel": channel,
        "to": to,
        "subject": subject,
        "text": text,
        "via": via,
    }
    with get_pool().connection() as conn:
        conn.execute(
            """INSERT INTO outbox (id, at, channel, to_addr, subject, body, via)
               VALUES (%s, %s, %s, %s, %s, %s, %s)""",
            (
                record["id"],
                record["at"],
                record["channel"],
                record["to"],
                record["subject"],
                record["text"],
                record["via"],
            ),
        )
        # 아웃박스는 최근 200건만 유지해 테이블이 커지지 않게 합니다.
        conn.execute(
            f"""DELETE FROM outbox WHERE id NOT IN (
                  SELECT id FROM outbox ORDER BY at DESC, id DESC LIMIT {MAX_OUTBOX}
                )"""
        )
    return record
