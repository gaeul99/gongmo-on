# ==========================================================
# 공모전 자동 등록 라우트
# GET /api/contests        — 자동 수집된 공모전 목록(마감 지난 것도 기록으로 포함 —
#                            마감 60일 경과분만 동기화 때 제거된다)
# GET /api/contests/popular — 공모전별 찜 사용자 수(탐색 화면 '인기도순' 정렬용)
# POST /api/contests/sync  — 즉시 동기화 실행(수동 점검용)
# ==========================================================
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app.security import require_admin_token
from app.services import contest_sync
from app.stores import user_store

router = APIRouter()


@router.get("")
def get_contests():
    contests = contest_sync.get_contests()
    return {"success": True, "count": len(contests), "contests": contests}


@router.get("/popular")
def get_popular_contests():
    """공모전별 찜 사용자 수 — 많은 순으로 내려 준다. 찜이 없으면 빈 목록."""
    counts = user_store.wishlist_counts()
    popular = [
        {"contestId": contest_id, "count": count}
        for contest_id, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))
    ]
    return {"success": True, "popular": popular}


@router.post("/sync")
def post_sync(request: Request):
    # 수동 동기화는 외부 사이트에 부하를 주므로 마감 점검과 같은 관리자 토큰으로 보호한다
    try:
        require_admin_token(request.headers.get("x-admin-token"))
    except Exception:
        return JSONResponse(
            status_code=403,
            content={"success": False, "error": {"code": "FORBIDDEN", "message": "관리자 토큰이 필요해요."}},
        )
    force = request.query_params.get("force") != "0"
    try:
        summary = contest_sync.sync_contests(force=force)
        return {"success": True, "summary": summary}
    except Exception as error:
        print(f"[contest.routes] 동기화 실패: {error!r}")
        return JSONResponse(
            status_code=500,
            content={
                "success": False,
                "error": {
                    "code": "SYNC_FAILED",
                    "message": "공모전 동기화에 실패했어요. 잠시 후 다시 시도해 주세요.",
                },
            },
        )
