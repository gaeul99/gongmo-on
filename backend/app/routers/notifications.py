# ==========================================================
# 알림 구독 라우트 — 구독·주간 다이제스트·수동 마감 점검.
# ==========================================================
import re
from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.deps import json_body
from app.security import require_admin_token
from app.services import notification_scheduler
from app.services.notification_senders import send_email
from app.stores import notification_store

router = APIRouter()

EMAIL_PATTERN = re.compile(r"^\S+@\S+\.\S+$")
DATE_PATTERN = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"success": False, "error": {"code": code, "message": message}},
    )


def _parse_contests(input_value) -> list[dict]:
    if not isinstance(input_value, list):
        return []
    result = []
    for item in input_value:
        if (
            isinstance(item, dict)
            and isinstance(item.get("id"), (int, float))
            and not isinstance(item.get("id"), bool)
            and isinstance(item.get("title"), str)
            and DATE_PATTERN.match(str(item.get("deadline") or ""))
        ):
            result.append(item)
    return result[:50]


def _parse_categories(input_value) -> list[str]:
    if not isinstance(input_value, list):
        return []
    return [item for item in input_value if isinstance(item, str) and len(item) > 0][:20]


@router.post("/subscribe")
def post_subscribe(body: dict = Depends(json_body)):
    nickname = body.get("nickname").strip() if isinstance(body.get("nickname"), str) else ""
    email = body.get("email").strip() if isinstance(body.get("email"), str) else ""

    if not nickname or len(nickname) > 20:
        return _error(400, "INVALID_NICKNAME", "아이디가 올바르지 않아요.")
    if not email or not EMAIL_PATTERN.match(email):
        return _error(400, "INVALID_EMAIL", "알림을 받을 이메일 주소가 필요해요.")

    subscriber = notification_store.upsert_subscriber(
        nickname=nickname,
        email=email,
        idea_categories=_parse_categories(body.get("ideaCategories")),
        contests=_parse_contests(body.get("contests")),
        opt_in=body.get("optIn") is not False,
    )

    # 구독(또는 정보 갱신) 직후 환영 메시지를 보내 발송 경로를 바로 확인할 수 있게 합니다.
    delivery = "skipped"
    if subscriber["optIn"]:
        delivery = send_email(
            email,
            "[공모온] 알림 구독이 시작됐어요",
            "\n".join(
                [
                    f"{subscriber['nickname']}님, 공모온 알림 구독이 완료됐습니다!",
                    "",
                    f"· 등록한 이메일: {subscriber['email']}",
                    f"· 알림 대상 공모전: {len(subscriber['contests'])}개",
                    "",
                    "응모·관심 공모전의 마감이 다가오면(D-7·D-3·당일) 알려 드릴게요.",
                ]
            ),
        )

    return {"success": True, "data": {"subscriber": subscriber["nickname"], "delivery": delivery}}


@router.post("/run")
def post_run_check(request: Request):
    # 전체 구독자 대량 발송을 트리거하는 수동 점검은 관리자 토큰이 있어야 한다.
    try:
        require_admin_token(request.headers.get("x-admin-token"))
    except Exception:
        return _error(403, "FORBIDDEN", "관리자 토큰이 필요해요.")
    sent = notification_scheduler.run_deadline_check()
    return {"success": True, "data": {"notifiedContests": sent}}


@router.post("/weekly")
def post_weekly_digest(body: dict = Depends(json_body)):
    # 주간 다이제스트는 실제 이메일을 발송하므로 따로 더 타이트하게 제한한다.
    # (제한 값은 main.py의 엔드포인트별 rate limit 참고)
    nickname = body.get("nickname").strip() if isinstance(body.get("nickname"), str) else ""
    email = body.get("email").strip() if isinstance(body.get("email"), str) else ""

    if not email or not EMAIL_PATTERN.match(email):
        return _error(400, "INVALID_EMAIL", "이메일 형식이 올바르지 않아요.")

    contests = []
    if isinstance(body.get("contests"), list):
        for item in body["contests"]:
            if (
                isinstance(item, dict)
                and isinstance(item.get("id"), (int, float))
                and not isinstance(item.get("id"), bool)
                and isinstance(item.get("title"), str)
                and isinstance(item.get("field"), str)
                and DATE_PATTERN.match(str(item.get("deadline") or ""))
            ):
                entry = dict(item)
                # startDate는 선택 값 — 형식이 틀리면 항목을 버리지 않고 값만 뺀다.
                if not (isinstance(entry.get("startDate"), str) and DATE_PATTERN.match(entry["startDate"])):
                    entry.pop("startDate", None)
                contests.append(entry)
        contests = contests[:100]

    fields = _parse_categories(body.get("fields"))
    today = datetime.now()
    today_midnight = datetime(today.year, today.month, today.day)
    in_four_weeks = today_midnight + timedelta(days=28)

    def first_token(field: str) -> str:
        parts = field.strip().split(" ")
        return parts[0] if parts else ""

    wanted = {first_token(field) for field in fields} - {""}

    matched = []
    for item in contests:
        try:
            deadline = datetime.strptime(item["deadline"], "%Y-%m-%d")
        except ValueError:
            continue
        if deadline < today_midnight or deadline > in_four_weeks:
            continue
        # 관심 분야가 비어 있으면 전체 분야를 보냅니다(신규 가입자 대비).
        if wanted and first_token(item.get("field", "")) not in wanted:
            continue
        matched.append(item)
    matched.sort(key=lambda item: item["deadline"])
    matched = matched[:10]

    if not matched:
        return {
            "success": True,
            "data": {
                "matched": 0,
                "delivery": "skipped",
                "message": "이번 주에 도착한 새 공모전이 없어요.",
            },
        }

    lines = [f"{nickname or '공모온 이용자'}님, 이번 주 공모온 새 공모전 소식이에요.", ""]
    # 아직 접수가 시작되지 않은 공모전은 접수 시작일을 함께 알려 준다.
    today_stamp = f"{today_midnight.year}-{today_midnight.month:02d}-{today_midnight.day:02d}"
    for item in matched:
        lines.append(f"· {item['title']} ({item['field']})")
        opening = f" · 접수 시작 {item['startDate']}" if item.get("startDate") and item["startDate"] > today_stamp else ""
        lines.append(f"  마감 {item['deadline']}{opening}{f' · {item['url']}' if item.get('url') else ''}")
    lines.append("")
    lines.append(
        f"관심 분야: {', '.join(sorted(wanted))}"
        if wanted
        else "관심 분야를 정하면 내 분야의 공모전만 모아 보내 드려요."
    )
    lines.append("공모온 — 아이디어에서 공모전까지, 가장 빠른 길")

    delivery = send_email(
        email,
        f"[공모온] 이번 주 새 공모전 소식 ({len(matched)}건)",
        "\n".join(lines),
    )

    return {"success": True, "data": {"matched": len(matched), "delivery": delivery}}
