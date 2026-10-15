# ==========================================================
# 요청 검증 유틸 — 옛 TS 버전(utils/apiValidation.ts)과 같은 규칙.
# ==========================================================
import re

from fastapi import HTTPException

CONTROL_CHARS = re.compile(r"[\x00-\x1f\x7f]")
EMAIL_PATTERN = re.compile(r"^\S+@\S+\.\S+$")


class ApiError(HTTPException):
    """표준 에러 응답 형식({ success, error: { code, message } })으로 렌더되는 예외."""

    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(status_code=status_code, detail=None)
        self.code = code
        self.message = message


def normalise_text(value) -> str:
    return value.strip() if isinstance(value, str) else ""


def has_control_chars(value: str) -> bool:
    return CONTROL_CHARS.search(value) is not None


def is_valid_email(value) -> bool:
    email = normalise_text(value)
    return 0 < len(email) <= 60 and EMAIL_PATTERN.match(email) is not None


def is_valid_phone(value) -> bool:
    digits = re.sub(r"\D", "", normalise_text(value))
    return len(digits) == 0 or 9 <= len(digits) <= 12


def get_bearer_token(authorization: str | None) -> str:
    if authorization and authorization.startswith("Bearer "):
        return authorization[7:]
    return ""


def assert_length(value: str, max_length: int, label: str) -> str | None:
    if len(value) == 0:
        return f"{label}을(를) 입력해 주세요."
    if len(value) > max_length:
        return f"{label}은(는) {max_length}자 이내로 입력해 주세요."
    return None
