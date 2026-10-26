# ==========================================================
# 계정·세션·사용자 데이터 저장소 — PostgreSQL(gongmo-on-db 컨테이너).
# 스키마는 app/db/schema.py가 관리하고, 브라우저를 정리해도 서버 DB에
# 계정과 내역이 남아 다시 로그인하면 복원됩니다.
# ==========================================================
import hashlib
import hmac
import json
import secrets
from datetime import datetime, timedelta, timezone

from psycopg import Connection

from app.db.pool import get_pool
from app.utils.timeutil import iso_utc

SESSION_MAX_AGE = timedelta(days=30)  # 30일
SESSION_MAX_PER_USER = 5

# Node crypto.scryptSync(password, salt, 64)의 기본 파라미터 — 기존 해시와 호환.
SCRYPT_N = 16384
SCRYPT_R = 8
SCRYPT_P = 1
SCRYPT_DKLEN = 64


# ---------- 비밀번호 해시 (salt + scrypt, 평문 저장 없음) ----------

def hash_password(password: str, salt: str) -> str:
    return hashlib.scrypt(
        password.encode("utf-8"),
        salt=salt.encode("utf-8"),
        n=SCRYPT_N,
        r=SCRYPT_R,
        p=SCRYPT_P,
        dklen=SCRYPT_DKLEN,
        maxmem=64 * 1024 * 1024,
    ).hex()


def make_salt() -> str:
    return secrets.token_hex(16)


def verify_password(account: dict, password: str) -> bool:
    candidate = hash_password(password, account["salt"])
    a = bytes.fromhex(candidate)
    b = bytes.fromhex(account["passwordHash"])
    return len(a) == len(b) and hmac.compare_digest(a, b)


# ---------- 행 → 타입 변환 ----------

def _to_account(row) -> dict:
    return {
        "nickname": row[0],
        "salt": row[1],
        "passwordHash": row[2],
        "email": row[3],
        "phone": row[4],
        "createdAt": iso_utc(row[5]),
    }


ACCOUNT_COLUMNS = "nickname, salt, password_hash, email, phone, created_at"


# ---------- 계정 ----------

def find_account(nickname: str) -> dict | None:
    with get_pool().connection() as conn:
        row = conn.execute(
            f"SELECT {ACCOUNT_COLUMNS} FROM accounts WHERE nickname = %s",
            (nickname,),
        ).fetchone()
    return _to_account(row) if row else None


def _upsert_account(conn: Connection, account: dict) -> None:
    conn.execute(
        """INSERT INTO accounts (nickname, salt, password_hash, email, phone, created_at)
           VALUES (%s, %s, %s, %s, %s, %s)
           ON CONFLICT (nickname) DO UPDATE SET
             salt = EXCLUDED.salt,
             password_hash = EXCLUDED.password_hash,
             email = EXCLUDED.email,
             phone = EXCLUDED.phone,
             created_at = EXCLUDED.created_at""",
        (
            account["nickname"],
            account["salt"],
            account["passwordHash"],
            account["email"],
            account.get("phone"),
            account["createdAt"],
        ),
    )


def save_account(account: dict) -> None:
    with get_pool().connection() as conn:
        _upsert_account(conn, account)


# ---------- 세션 ----------

def create_session(nickname: str) -> str:
    token = secrets.token_hex(32)
    with get_pool().connection() as conn:
        # 사용자당 세션은 최대 5개 — 넘치면 가장 오래된 것부터 버린다.
        with conn.transaction():
            existing = conn.execute(
                "SELECT token FROM sessions WHERE nickname = %s ORDER BY created_at ASC, token ASC",
                (nickname,),
            ).fetchall()
            overflow = len(existing) + 1 - SESSION_MAX_PER_USER
            for i in range(max(overflow, 0)):
                oldest = existing[i][0]
                conn.execute("DELETE FROM sessions WHERE token = %s", (oldest,))
            conn.execute(
                "INSERT INTO sessions (token, nickname) VALUES (%s, %s)",
                (token, nickname),
            )
    return token


def get_session_user(token: str) -> str | None:
    with get_pool().connection() as conn:
        row = conn.execute(
            "SELECT nickname, created_at FROM sessions WHERE token = %s",
            (token,),
        ).fetchone()
    if row is None:
        return None
    created_at = row[1]
    if created_at.tzinfo is None:
        created_at = created_at.replace(tzinfo=timezone.utc)
    if datetime.now(timezone.utc) - created_at > SESSION_MAX_AGE:
        delete_session(token)
        return None
    return row[0]


def delete_session(token: str) -> None:
    with get_pool().connection() as conn:
        conn.execute("DELETE FROM sessions WHERE token = %s", (token,))


# 아이디 변경 — 계정·세션·사용자 데이터를 한 트랜잭션으로 새 아이디에 옮긴다.
# 어느 단계에서 실패해도 모두 원래대로 돌아갑니다.
def rename_account_profile(old_nickname: str, updated: dict) -> None:
    with get_pool().connection() as conn:
        with conn.transaction():
            _upsert_account(conn, updated)
            conn.execute(
                "UPDATE userdata SET nickname = %s WHERE nickname = %s",
                (updated["nickname"], old_nickname),
            )
            conn.execute(
                "UPDATE sessions SET nickname = %s WHERE nickname = %s",
                (updated["nickname"], old_nickname),
            )
            conn.execute("DELETE FROM accounts WHERE nickname = %s", (old_nickname,))


# 서버 시작 때 만료된 세션을 한 번 정리합니다.
def prune_expired_sessions() -> None:
    with get_pool().connection() as conn:
        conn.execute("DELETE FROM sessions WHERE created_at < now() - interval '30 days'")


# ---------- 사용자 데이터 ----------

def empty_user_data() -> dict:
    return {
        "myContests": [],
        "wishlist": [],
        "savedIdeas": [],
        "typeTest": None,
        "checklist": {},
        "roadmaps": {},
        "practiceNotes": [],
    }


def get_user_data(nickname: str) -> dict:
    with get_pool().connection() as conn:
        row = conn.execute(
            "SELECT data FROM userdata WHERE nickname = %s",
            (nickname,),
        ).fetchone()
    return row[0] if row else empty_user_data()


def save_user_data(nickname: str, data: dict) -> dict:
    with get_pool().connection() as conn:
        row = conn.execute(
            """INSERT INTO userdata (nickname, data) VALUES (%s, %s)
               ON CONFLICT (nickname) DO UPDATE SET data = EXCLUDED.data, updated_at = now()
               RETURNING updated_at""",
            (nickname, json.dumps(data, ensure_ascii=False)),
        ).fetchone()
    updated_at = row[0] if row else datetime.now(timezone.utc)
    return {"data": data, "updatedAt": iso_utc(updated_at)}
