# ==========================================================
# PostgreSQL 접속 풀 — 이 프로젝트의 유일한 저장소 계층.
# 연결 정보는 backend/.env의 DATABASE_URL로 지정한다.
# FastAPI의 동기 엔드포인트는 스레드풀에서 실행되므로 동기 psycopg를 쓴다.
# ==========================================================
import threading

import psycopg
from psycopg_pool import ConnectionPool

from app.config import database_url

_pool: ConnectionPool | None = None
_pool_lock = threading.Lock()


def get_pool() -> ConnectionPool:
    global _pool
    if _pool is not None:
        return _pool
    with _pool_lock:
        if _pool is None:
            _pool = ConnectionPool(
                conninfo=database_url(),
                min_size=0,
                max_size=10,
                open=True,
            )
    return _pool


def close_pool() -> None:
    global _pool
    with _pool_lock:
        if _pool is not None:
            _pool.close()
            _pool = None
