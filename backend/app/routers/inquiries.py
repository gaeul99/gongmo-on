# ==========================================================
# 문의 접수 라우트 — 푸터 '문의하기' 창에서 온 요청을 받습니다.
# ==========================================================
import os
import re

from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.deps import json_body
from app.stores import inquiry_store
from app.services.notification_senders import send_email

# 문의를 받을 담당자 이메일. 배포 시 CONTACT_EMAIL 환경변수로 바꿀 수 있다.
CONTACT_EMAIL = os.environ.get("CONTACT_EMAIL") or "rkf111122@gmail.com"

EMAIL_PATTERN = re.compile(r"^\S+@\S+\.\S+$")

# 프론트 ContactModal의 분류 선택지와 같은 순서·같은 값이다.
CATEGORIES = ["서비스 이용", "버그 신고", "기능 제안", "기타"]

router = APIRouter()


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"success": False, "error": {"code": code, "message": message}},
    )


@router.post("")
def post_inquiry(body: dict = Depends(json_body)):
    email = body.get("email").strip() if isinstance(body.get("email"), str) else ""
    category = body.get("category").strip() if isinstance(body.get("category"), str) else ""
    content = body.get("content").strip() if isinstance(body.get("content"), str) else ""

    if category not in CATEGORIES:
        return _error(400, "INVALID_CATEGORY", "문의 분류를 골라 주세요.")
    if email and not EMAIL_PATTERN.match(email):
        return _error(400, "INVALID_EMAIL", "답변 받을 이메일 주소가 올바르지 않아요.")
    if not content or len(content) > 2000:
        return _error(400, "INVALID_CONTENT", "문의 내용은 1자 이상 2000자 이하로 적어 주세요.")

    inquiry = inquiry_store.append_inquiry(email=email, category=category, content=content)

    # 담당자에게 알림 메일을 보낸다. SMTP가 없으면 로그·아웃박스에만 기록된다(데모 모드).
    delivery = send_email(
        CONTACT_EMAIL,
        f"[공모온] 새 문의가 접수됐어요 — {category}",
        "\n".join(
            [
                f"분류: {category}",
                f"답변 받을 이메일: {email or '(없음)'}",
                f"접수 시각: {inquiry['at']}",
                "",
                content,
            ]
        ),
    )

    return {"success": True, "data": {"id": inquiry["id"], "delivery": delivery}}
