"""Bound upstream AI calls with durable daily budgets and a small concurrency gate."""
import hashlib
import os
import threading
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from fastapi import Request

from app.db.pool import get_pool
from app.security import _client_ip
from app.stores import user_store
from app.utils.validation import ApiError, get_bearer_token


def _positive_env(name: str, default: int, maximum: int = 100_000) -> int:
    try:
        return max(1, min(maximum, int(os.getenv(name, str(default)))))
    except ValueError:
        return default


# Each analysis uses two upstream calls; recommendation and judging use one.
_slots = threading.BoundedSemaphore(_positive_env('AI_MAX_CONCURRENT', 2, 8))


def _actor(request: Request) -> tuple[str, int]:
    token = get_bearer_token(request.headers.get('authorization'))
    if token:
        nickname = user_store.get_session_user(token)
        account = user_store.find_account(nickname) if nickname else None
        if not account:
            raise ApiError(401, 'SESSION_EXPIRED', '로그인이 만료됐어요. 다시 로그인해 주세요.')
        # Stable across nickname changes. Do not put email, IP or tokens in usage rows.
        identity = f"account:{account.get('id') or account['createdAt']}"
        limit = _positive_env('AI_USER_DAILY_UNITS', 40)
    else:
        identity = f'guest:{_client_ip(request)}'
        limit = _positive_env('AI_GUEST_DAILY_UNITS', 4)
    return hashlib.sha256(identity.encode()).hexdigest(), limit


def reserve_daily_budget(actor: str, limit: int, units: int):
    day = datetime.now(timezone(timedelta(hours=9))).date()
    # Both increments commit together. A per-account rejection also rolls back
    # the global reservation, including concurrent requests on other workers.
    with get_pool().connection() as conn:
        conn.execute('DELETE FROM ai_usage WHERE usage_day < %s', (day - timedelta(days=2),))
        for key, cap in [('global', _positive_env('AI_GLOBAL_DAILY_UNITS', 400)), (actor, limit)]:
            row = conn.execute(
                '''INSERT INTO ai_usage (usage_day, actor, units)
                   SELECT %s, %s, %s WHERE %s <= %s
                   ON CONFLICT (usage_day, actor) DO UPDATE
                     SET units = ai_usage.units + EXCLUDED.units
                     WHERE ai_usage.units + EXCLUDED.units <= %s
                   RETURNING units''',
                (day, key, units, units, cap, cap),
            ).fetchone()
            if row is None:
                message = ('오늘 서비스의 AI 사용량에 도달했어요. 내일 다시 이용해 주세요.' if key == 'global'
                           else '오늘 AI 사용량에 도달했어요. 로그인하거나 내일 다시 이용해 주세요.'
                           if limit == _positive_env('AI_GUEST_DAILY_UNITS', 4)
                           else '오늘 계정의 AI 사용량에 도달했어요. 내일 다시 이용해 주세요.')
                raise ApiError(429, 'AI_DAILY_LIMIT', message)


@contextmanager
def ai_request(request: Request, units: int):
    actor, limit = _actor(request)
    if not _slots.acquire(blocking=False):
        raise ApiError(429, 'AI_BUSY', 'AI 분석 요청이 몰리고 있어요. 잠시 후 다시 시도해 주세요.')
    try:
        reserve_daily_budget(actor, limit, units)
        yield
    finally:
        _slots.release()
