# ==========================================================
# 회원가입·로그인·로그아웃·회원정보 수정
# 계정은 user_store(PostgreSQL accounts 테이블)에, 비밀번호는
# salt+scrypt 해시로만 저장합니다.
# ==========================================================
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.deps import json_body
from app.stores import user_store
from app.utils.timeutil import iso_now
from app.utils.validation import (
    get_bearer_token,
    has_control_chars,
    is_valid_email,
    is_valid_phone,
    normalise_text,
)

NICKNAME_MAX = 20
PASSWORD_MAX = 40
EMAIL_MAX = 60

router = APIRouter()


def public_user(account: dict) -> dict:
    return {
        "nickname": account["nickname"],
        "joinedAt": account["createdAt"],
        "email": account["email"],
        "phone": account.get("phone"),
    }


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"success": False, "error": {"code": code, "message": message}},
    )


def _phone_digits(body: dict) -> str:
    return "".join(ch for ch in normalise_text(body.get("phone")) if ch.isdigit())


@router.post("/signup")
def post_signup(body: dict = Depends(json_body)):
    nickname = normalise_text(body.get("nickname"))
    password = body.get("password") if isinstance(body.get("password"), str) else ""
    email = normalise_text(body.get("email"))
    phone_digits = _phone_digits(body)

    if not nickname or len(nickname) > NICKNAME_MAX or has_control_chars(nickname):
        return _error(400, "INVALID_NICKNAME", "아이디는 1~20자로 입력해 주세요.")
    if len(password) < 8 or len(password) > PASSWORD_MAX:
        return _error(400, "INVALID_PASSWORD", "비밀번호는 8자 이상이어야 해요.")
    if not is_valid_email(email) or len(email) > EMAIL_MAX:
        return _error(400, "INVALID_EMAIL", "알림을 받을 이메일 주소를 입력해 주세요.")
    if not is_valid_phone(phone_digits):
        return _error(
            400,
            "INVALID_PHONE",
            "휴대폰 번호 형식이 올바르지 않아요. 숫자만 9~12자로 입력해 주세요.",
        )
    if user_store.find_account(nickname):
        return _error(409, "NICKNAME_TAKEN", "이미 가입된 아이디예요. 다른 아이디를 사용해 주세요.")

    salt = user_store.make_salt()
    account = {
        "nickname": nickname,
        "salt": salt,
        "passwordHash": user_store.hash_password(password, salt),
        "email": email,
        "phone": phone_digits or None,
        "createdAt": iso_now(),
    }
    user_store.save_account(account)
    token = user_store.create_session(nickname)
    return {"success": True, "data": {"user": public_user(account), "token": token}}


@router.post("/login")
def post_sign_in(body: dict = Depends(json_body)):
    nickname = normalise_text(body.get("nickname"))
    password = body.get("password") if isinstance(body.get("password"), str) else ""

    # 미가입 아이디와 비밀번호 불일치를 같은 응답으로 묶는다 — 응답 차이로
    # 아이디 존재 여부를 탐지(계정 열거)할 수 없게 하기 위해서입니다.
    account = user_store.find_account(nickname)
    if not account or not user_store.verify_password(account, password):
        return _error(401, "AUTH_FAILED", "아이디 또는 비밀번호가 올바르지 않아요.")

    token = user_store.create_session(nickname)
    return {"success": True, "data": {"user": public_user(account), "token": token}}


@router.post("/logout")
def post_logout(request: Request):
    token = get_bearer_token(request.headers.get("authorization"))
    if token:
        user_store.delete_session(token)
    return {"success": True}


@router.put("/profile")
def put_profile(request: Request, body: dict = Depends(json_body)):
    token = get_bearer_token(request.headers.get("authorization"))
    current = user_store.get_session_user(token) if token else None
    if not current:
        return _error(401, "UNAUTHORIZED", "로그인 후 이용해 주세요.")
    account = user_store.find_account(current)
    if not account:
        return _error(404, "ACCOUNT_NOT_FOUND", "계정을 찾을 수 없어요. 다시 로그인해 주세요.")

    current_password = body.get("currentPassword") if isinstance(body.get("currentPassword"), str) else ""
    if not current_password or not user_store.verify_password(account, current_password):
        return _error(401, "WRONG_PASSWORD", "현재 비밀번호가 일치하지 않아요.")

    next_nickname = normalise_text(body.get("nickname")) or account["nickname"]
    next_email = normalise_text(body.get("email")) or account["email"]
    phone_digits = _phone_digits(body)

    if not next_nickname or len(next_nickname) > NICKNAME_MAX or has_control_chars(next_nickname):
        return _error(400, "INVALID_NICKNAME", "아이디는 1~20자로 입력해 주세요.")
    if not is_valid_email(next_email) or len(next_email) > EMAIL_MAX:
        return _error(400, "INVALID_EMAIL", "알림을 받을 이메일 주소를 입력해 주세요.")
    if not is_valid_phone(phone_digits):
        return _error(
            400,
            "INVALID_PHONE",
            "휴대폰 번호 형식이 올바르지 않아요. 숫자만 9~12자로 입력해 주세요.",
        )
    if next_nickname != account["nickname"] and user_store.find_account(next_nickname):
        return _error(409, "NICKNAME_TAKEN", "이미 사용 중인 아이디예요. 다른 아이디를 사용해 주세요.")

    updated = {
        **account,
        "nickname": next_nickname,
        "email": next_email,
        "phone": phone_digits or None,
    }
    if next_nickname != account["nickname"]:
        # 아이디는 로그인 ID이자 저장소 키라, 바꾸면 계정·세션·사용자 데이터를
        # 한 트랜잭션으로 새 아이디에 옮긴다 — 중간에 실패해도 전부 원래대로 돌아와
        # 로그인 상태와 내역이 그대로 유지됩니다.
        user_store.rename_account_profile(account["nickname"], updated)
    else:
        user_store.save_account(updated)
    return {"success": True, "data": {"user": public_user(updated)}}
