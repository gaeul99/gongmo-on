# 시각 포맷 유틸 — JS Date.prototype.toISOString과 같은 표현을 만든다.
from datetime import datetime, timezone


def iso_utc(dt: datetime) -> str:
    """'2026-10-15T06:18:29.123Z' 형태(UTC, 밀리초 3자리, Z 접미사)."""
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    dt = dt.astimezone(timezone.utc)
    return dt.strftime("%Y-%m-%dT%H:%M:%S") + f".{dt.microsecond // 1000:03d}Z"


def iso_now() -> str:
    return iso_utc(datetime.now(timezone.utc))
