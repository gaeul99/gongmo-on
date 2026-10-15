# ==========================================================
# 문의 접수 저장소 — PostgreSQL(gongmo-on-db 컨테이너).
# 이메일 발송(SMTP)이 실패하거나 로그 모드여도 접수 내역은 DB에 남습니다.
# ==========================================================
import time

from app.db.pool import get_pool
from app.security import random_hex
from app.utils.timeutil import iso_now

MAX_INQUIRIES = 500


def append_inquiry(email: str, category: str, content: str) -> dict:
    record = {
        "id": f"{int(time.time() * 1000)}-{random_hex(4)}",
        "at": iso_now(),
        "email": email,
        "category": category,
        "content": content,
    }
    with get_pool().connection() as conn:
        conn.execute(
            "INSERT INTO inquiries (id, at, email, category, content) VALUES (%s, %s, %s, %s, %s)",
            (record["id"], record["at"], record["email"], record["category"], record["content"]),
        )
        # 오래된 문의부터 잘라낸다 — 최근 500건이면 데모 용도로 충분하다.
        conn.execute(
            f"""DELETE FROM inquiries WHERE id NOT IN (
                  SELECT id FROM inquiries ORDER BY at DESC, id DESC LIMIT {MAX_INQUIRIES}
                )"""
        )
    return record
