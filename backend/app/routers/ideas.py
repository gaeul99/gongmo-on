# ==========================================================
# 아이디어 분석 요청 라우트
# 입력 검증 → AI 서비스 호출 → 표준 응답 형식으로 포장합니다.
# ==========================================================
from fastapi import APIRouter, Depends
from fastapi.responses import JSONResponse

from app.deps import json_body
from app.services import ai_service

MAX_TITLE_LENGTH = 100
MAX_DESCRIPTION_LENGTH = 2000
MAX_CATEGORY_LENGTH = 100
# 후보 목록 상한 — 개수와 항목 문자열 길이를 묶어 토큰 비용 폭탄을 막는다.
MAX_CANDIDATE_ITEMS = 60
MAX_CANDIDATE_TEXT = 200

router = APIRouter()


def _error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status,
        content={"success": False, "error": {"code": code, "message": message}},
    )


# 후보 목록은 클라이언트가 보내는 값이라 곧이곧대로 AI 프롬프트에 들어간다.
# 형식이 맞는 항목만 남기고(id는 정수), 문자 필드는 상한 안으로 잘라 보낸다.
def sanitize_candidates(input_value) -> list[dict]:
    if not isinstance(input_value, list):
        return []
    result = []
    for item in input_value:
        if isinstance(item, dict) and isinstance(item.get("id"), int) and not isinstance(item.get("id"), bool):
            entry = dict(item)
            for key in list(entry.keys()):
                if isinstance(entry[key], str):
                    entry[key] = entry[key].strip()[:MAX_CANDIDATE_TEXT]
            result.append(entry)
    return result[:MAX_CANDIDATE_ITEMS]


@router.post("/analyze")
def post_idea_analysis(body: dict = Depends(json_body)):
    idea = body.get("idea")

    if (
        not isinstance(idea, dict)
        or not isinstance(idea.get("title"), str)
        or idea.get("title", "").strip() == ""
        or not isinstance(idea.get("description"), str)
        or idea.get("description", "").strip() == ""
    ):
        return _error(400, "INVALID_REQUEST", "아이디어 제목과 설명을 입력해 주세요.")
    if len(idea["title"]) > MAX_TITLE_LENGTH or len(idea["description"]) > MAX_DESCRIPTION_LENGTH:
        return _error(
            400,
            "INVALID_REQUEST",
            f"제목은 {MAX_TITLE_LENGTH}자, 설명은 {MAX_DESCRIPTION_LENGTH}자 이내로 입력해 주세요.",
        )
    if not isinstance(body.get("referenceCases"), list) or not isinstance(body.get("contests"), list):
        return _error(400, "INVALID_REQUEST", "분석 대상 사례·공모전 목록이 필요합니다.")
    if isinstance(idea.get("category"), str) and len(idea["category"]) > MAX_CATEGORY_LENGTH:
        return _error(400, "INVALID_REQUEST", "관심 분야는 100자 이내로 입력해 주세요.")
    if not ai_service.is_ai_configured():
        return _error(
            503,
            "AI_NOT_CONFIGURED",
            "OpenAI API 키가 설정되지 않았어요. backend/.env에 키를 넣은 뒤 서버를 다시 시작해 주세요.",
        )

    try:
        data = ai_service.analyze_idea(
            {
                "idea": {
                    "title": idea["title"].strip(),
                    "description": idea["description"].strip(),
                    "category": idea["category"].strip() if isinstance(idea.get("category"), str) else "",
                },
                "referenceCases": sanitize_candidates(body.get("referenceCases")),
                "contests": sanitize_candidates(body.get("contests")),
            }
        )
        return {"success": True, "data": data}
    except ai_service.AiNotConfiguredError:
        return _error(503, "AI_NOT_CONFIGURED", "OpenAI API 키가 설정되지 않았어요.")
    except ai_service.AiRequestTooLargeError:
        return _error(
            400,
            "AI_REQUEST_TOO_LARGE",
            "분석 요청이 너무 큽니다. 후보 수와 설명 길이를 줄인 뒤 다시 시도해 주세요.",
        )
    except ai_service.AiKeyExpiredError:
        print(
            "[ai] AI 인증 토큰이 만료되었습니다. mlapi.run에서 토큰을 재발급해 backend/.env의 OPENAI_API_KEY를 교체한 뒤 서버를 재시작하세요."
        )
        return _error(
            503,
            "AI_TOKEN_EXPIRED",
            "AI 인증 토큰이 만료되었어요. 토큰이 갱신되면 다시 분석할 수 있어요.",
        )
    except ai_service.AiUpstreamError as error:
        print(f"[ai] 분석 실패: {error}")
        return _error(502, "AI_UPSTREAM", "AI 분석 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.")
    except Exception as error:
        print(f"[ai] 알 수 없는 오류: {error!r}")
        return _error(500, "INTERNAL", "서버 내부 오류가 발생했어요.")
