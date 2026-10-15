# ==========================================================
# 사용자 데이터(응모·찜·아이디어·회고 등) 라우트
# 로그인 토큰으로 본인 데이터만 읽고 씁니다. 저장 형식은
# dataPortability.js 내보내기와 같은 구조라 로그인 복원이
# 파일 가져오기와 같은 병합 로직을 재사용할 수 있습니다.
# ==========================================================
import json

from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app.deps import json_body
from app.stores import user_store
from app.utils.validation import get_bearer_token

# 목록·객체 크기 제한 — 비정상 요청이 저장 파일을 부풀리지 않게 합니다.
MAX_LIST_ITEMS = 300
MAX_MAP_ENTRIES = 500
# 항목 하나·데이터 전체의 JSON 문자 길이 상한. 분석 스냅숏이 들어 있는
# 보관 아이디어도 넉넉히 수용하는 크기이며, 전체 상한이 저장 파일의 부풀림을 막는다.
MAX_ITEM_CHARS = 64_000
MAX_TOTAL_CHARS = 1_000_000

router = APIRouter()


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"success": False, "error": {"code": code, "message": message}},
    )


def resolve_nickname(request: Request) -> str | None:
    token = get_bearer_token(request.headers.get("authorization"))
    if not token:
        return None
    return user_store.get_session_user(token)


def _json_len(value) -> int:
    return len(json.dumps(value, ensure_ascii=False, separators=(",", ":")))


def sanitize_list(value) -> list:
    if not isinstance(value, list):
        return []
    return [
        item
        for item in value[:MAX_LIST_ITEMS]
        if item is not None and _json_len(item) <= MAX_ITEM_CHARS
    ]


def sanitize_map(value) -> dict:
    if not isinstance(value, dict):
        return {}
    result = {}
    for key, item in list(value.items())[:MAX_MAP_ENTRIES]:
        if isinstance(key, str) and len(key) <= 100 and isinstance(item, bool):
            result[key] = item
    return result


# 유형 검사 결과 — TypeTestPage가 저장하는 형태(typeId+백분율)만 통과시킨다.
# 임의의 거대 JSON이 그대로 저장되지 않게 검증한다.
def sanitize_type_test(value):
    if value is None:
        return None
    if not isinstance(value, dict):
        return None
    type_id = value.get("typeId")
    if not isinstance(type_id, str) or len(type_id) > 40:
        return None
    percentage = value.get("percentage")
    if percentage is not None and (not isinstance(percentage, (int, float)) or isinstance(percentage, bool) or value.get("percentage") != percentage or not _is_finite(percentage)):
        return None
    saved_at = value.get("savedAt")
    if not isinstance(saved_at, str) or len(saved_at) > 40:
        return None
    distribution = None
    if isinstance(value.get("distribution"), list):
        rows = []
        for row in value["distribution"][:10]:
            if (
                isinstance(row, dict)
                and isinstance(row.get("id"), str)
                and len(row.get("id")) <= 40
                and isinstance(row.get("percent"), (int, float))
                and not isinstance(row.get("percent"), bool)
            ):
                rows.append(row)
        distribution = rows
    result = {"typeId": type_id, "savedAt": saved_at}
    if percentage is not None and isinstance(percentage, (int, float)) and not isinstance(percentage, bool) and _is_finite(percentage):
        result["percentage"] = percentage
    if distribution is not None:
        result["distribution"] = distribution
    return result


def _is_finite(value) -> bool:
    import math

    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


# 로드맵 체크 — roadmap.js 저장 형태({ [공모전id]: { checked, updatedAt } })만
# 통과시킨다. 출품 로드맵 체크가 서버 백업에 빠지지 않게 하는 필드다.
def sanitize_roadmaps(value) -> dict:
    if not isinstance(value, dict):
        return {}
    result = {}
    for contest_id, entry in list(value.items())[:200]:
        if not isinstance(contest_id, str) or len(contest_id) > 40 or not isinstance(entry, dict):
            continue
        checked = sanitize_map(entry.get("checked"))
        updated_at = entry.get("updatedAt")
        record = {"checked": checked}
        if isinstance(updated_at, str):
            record["updatedAt"] = updated_at[:40]
        result[contest_id] = record
    return result


# 저장 전에 형태를 다듬는다. 항목 내부 필드까지 검증하지는 않지만(프론트가
# 쓴 데이터라), 각 항목의 크기와 전체 크기는 상한 안으로 묶어 저장 파일이
# 비정상적으로 커지지 않게 한다.
def sanitize_user_data(body) -> dict | None:
    input_data = body if isinstance(body, dict) else {}
    sanitized = {
        "myContests": sanitize_list(input_data.get("myContests")),
        "wishlist": sanitize_list(input_data.get("wishlist")),
        "savedIdeas": sanitize_list(input_data.get("savedIdeas")),
        "typeTest": sanitize_type_test(input_data.get("typeTest")),
        "checklist": sanitize_map(input_data.get("checklist")),
        "roadmaps": sanitize_roadmaps(input_data.get("roadmaps")),
        "practiceNotes": sanitize_list(input_data.get("practiceNotes")),
    }
    if _json_len(sanitized) > MAX_TOTAL_CHARS:
        return None
    return sanitized


@router.get("")
def get_userdata(request: Request):
    nickname = resolve_nickname(request)
    if not nickname:
        return _error(401, "UNAUTHORIZED", "로그인이 필요해요. 다시 로그인해 주세요.")
    return {"success": True, "data": user_store.get_user_data(nickname)}


@router.put("")
def put_userdata(request: Request, body: dict = Depends(json_body)):
    nickname = resolve_nickname(request)
    if not nickname:
        return _error(401, "UNAUTHORIZED", "로그인이 필요해요. 다시 로그인해 주세요.")
    sanitized = sanitize_user_data(body.get("data"))
    if sanitized is None:
        return _error(
            400,
            "DATA_TOO_LARGE",
            "저장하려는 데이터가 너무 커요. 일부를 정리한 뒤 다시 시도해 주세요.",
        )
    record = user_store.save_user_data(nickname, sanitized)
    return {"success": True, "data": {"updatedAt": record["updatedAt"]}}
