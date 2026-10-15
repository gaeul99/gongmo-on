# ==========================================================
# 공통 보안 미들웨어 — 옛 TS 버전(middleware/security.ts)과 같은 동작.
# 의존성을 늘리지 않기 위해 slowapi·helmet 대신 데모 규모(단일 프로세스)에
# 맞는 초경량 구현을 쓴다.
# ==========================================================
import hashlib
import hmac
import os
import secrets
import threading
import time

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse

_buckets: dict[str, dict] = {}
_buckets_lock = threading.Lock()
_last_sweep = time.monotonic()


def rate_limit(window_ms: int, max_count: int, name: str):
    """
    IP별 요청 수 제한. 윈도우가 지나면 카운트가 초기화되고, 초과하면 429를 돌려준다.
    경로 접두어별 제한은 main.py의 PATH_RATE_LIMITS에서 이 함수의 인자를 그대로 쓴다.
    """

    def check(request: Request) -> None:
        global _last_sweep
        now = time.monotonic()
        # 10분마다 만료된 버킷을 비워 맵이 무한히 자라지 않게 한다.
        if now - _last_sweep > 600:
            with _buckets_lock:
                for key in [k for k, b in _buckets.items() if b["reset_at"] <= now]:
                    del _buckets[key]
            _last_sweep = now
        client_ip = request.client.host if request.client else "unknown"
        key = f"{name}:{client_ip}"
        with _buckets_lock:
            bucket = _buckets.get(key)
            if bucket is None or bucket["reset_at"] <= now:
                _buckets[key] = {"count": 1, "reset_at": now + window_ms / 1000}
                return
            bucket["count"] += 1
            if bucket["count"] > max_count:
                raise TooManyRequests()

    return check


class TooManyRequests(Exception):
    pass


def require_admin_token(provided: str | None) -> None:
    """수동 마감 점검(POST /api/notifications/run)처럼 관리 전용 동작을 보호한다."""
    expected = os.getenv("ADMIN_TOKEN") or ""
    if (
        not expected
        or provided is None
        or not hmac.compare_digest(provided.encode("utf-8"), expected.encode("utf-8"))
    ):
        raise AdminForbidden()


class AdminForbidden(Exception):
    pass


def timing_safe_equal_hex(a: str, b: str) -> bool:
    try:
        left = bytes.fromhex(a)
        right = bytes.fromhex(b)
    except ValueError:
        return False
    return len(left) == len(right) and hmac.compare_digest(left, right)


def random_hex(byte_count: int) -> str:
    return secrets.token_hex(byte_count)


def sha256_hex(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


class RequestLogAndHeadersMiddleware(BaseHTTPMiddleware):
    """요청 로그 + 보안 헤더(helmet 없이 최소한의 응답 헤더를 채운다)."""

    async def dispatch(self, request: Request, call_next):
        request_id = secrets.token_hex(8)
        started = time.monotonic()
        print(f"[{time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())}Z] {request.method} {request.url.path} requestId={request_id}")
        try:
            response = await call_next(request)
        except Exception:
            print(f"[server] 알 수 없는 오류: {request.method} {request.url.path}", flush=True)
            raise
        duration_ms = round((time.monotonic() - started) * 1000)
        print(
            f"[{time.strftime('%Y-%m-%dT%H:%M:%S', time.gmtime())}Z] {request.method} {request.url.path} requestId={request_id} status={response.status_code} durationMs={duration_ms}"
        )
        response.headers["X-Request-Id"] = request_id
        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "no-referrer"
        return response


class PayloadLimitMiddleware(BaseHTTPMiddleware):
    """요청 본문 2MB 상한 — 옛 TS 버전(express.json limit)과 같은 값."""

    MAX_BODY_BYTES = 2 * 1024 * 1024

    async def dispatch(self, request: Request, call_next):
        content_length = request.headers.get("content-length")
        if content_length and content_length.isdigit() and int(content_length) > self.MAX_BODY_BYTES:
            return JSONResponse(
                status_code=413,
                content={
                    "success": False,
                    "error": {
                        "code": "PAYLOAD_TOO_LARGE",
                        "message": "요청 본문이 너무 커요. 내용을 줄여 주세요.",
                    },
                },
            )
        return await call_next(request)
