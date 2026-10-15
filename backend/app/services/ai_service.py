# ==========================================================
# OpenAI 기반 아이디어 분석 서비스
# 입력 아이디어와 실제 공모전·유사 사례 목록을 받아
# 유사도·분석 문구·추천 점수를 AI로 생성해 돌려줍니다.
# 사실 관계가 필요한 데이터(공모전 제목·링크 등)는 클라이언트가
# 보내온 실제 데이터에만 근거하고, AI는 그 위의 분석 문장만 만듭니다.
#
# 응답 시간은 출력 토큰 수에 비례하므로 (1) 분석 본문과 (2) 공모전
# 적합도 점수를 두 요청으로 쪼개 동시에 보냅니다 — 점수 요청만 실패하면
# 본문은 살려 돌려줍니다.
# ==========================================================
import json
import math
import os
import threading
import time
from collections import OrderedDict
from concurrent.futures import ThreadPoolExecutor

from openai import OpenAI


class AiNotConfiguredError(Exception):
    pass


class AiUpstreamError(Exception):
    pass


class AiRequestTooLargeError(Exception):
    pass


# 게이트웨이 토큰(JWT)은 유효기간이 있고, 만료되면 모든 호출이 401로 거절된다.
# 일반 업스트림 오류와 구분해 관리자에게 토큰 갱신이 필요하다고 알려주기 위한 전용 오류다.
class AiKeyExpiredError(Exception):
    pass


# .env에 아직 예시 문구(여기에_API_KEY)가 들어 있는 경우도 미설정으로 봅니다.
PLACEHOLDER_KEYS = {"", "여기에_API_KEY"}

MAX_ANALYSIS_ITEMS = 60
MAX_ANALYSIS_TEXT_CHARS = 25_000


def is_ai_configured() -> bool:
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    return key not in PLACEHOLDER_KEYS


def _error_status(error) -> int | None:
    return getattr(error, "status", None) if error is not None else None


def _error_code(error) -> str | None:
    code = getattr(error, "code", None)
    if isinstance(code, str):
        return code
    body = getattr(error, "error", None)
    if isinstance(body, dict):
        inner = body.get("code")
        if isinstance(inner, str):
            return inner
    return None


def _error_message(error) -> str:
    if isinstance(error, BaseException):
        return str(error)
    return str(error)


# OpenAI SDK 오류 중 401 'expired_key'(토큰 만료)만 골라낸다. 그 외 401은
# 키 자체가 잘못된 경우라 만료와 다르게 안내해야 한다.
def is_expired_key_error(error) -> bool:
    if error is None:
        return False
    if _error_status(error) != 401:
        return False
    code = _error_code(error)
    if code == "expired_key":
        return True
    return "expired" in _error_message(error).lower()


def estimate_analysis_budget(body: dict) -> dict:
    items = list(body.get("referenceCases") or []) + list(body.get("contests") or [])
    total_text_chars = 0
    for item in items:
        if isinstance(item, dict):
            candidate = " ".join(v for v in item.values() if isinstance(v, str))
            total_text_chars += len(candidate)
    return {
        "totalItems": len(items),
        "totalTextChars": total_text_chars,
        "tooLarge": len(items) > MAX_ANALYSIS_ITEMS or total_text_chars > MAX_ANALYSIS_TEXT_CHARS,
    }


def _get_client() -> OpenAI:
    api_key = (os.getenv("OPENAI_API_KEY") or "").strip()
    if not api_key or api_key in PLACEHOLDER_KEYS:
        raise AiNotConfiguredError()
    # OPENAI_BASE_URL이 있으면 OpenAI 호환 중계 게이트웨이(엘리스 mlapi.run 등)를 쓴다.
    # 프론트가 분석을 30초 안에 받기로 약속했으므로 백엔드가 먼저(25초) 포기한다 —
    # 재시도는 예산 안에 못 끝나므로 끈다(끄지 않으면 실패 후 재생성으로 2배 걸린다).
    options: dict = {"api_key": api_key, "timeout": 25.0, "max_retries": 0}
    base_url = (os.getenv("OPENAI_BASE_URL") or "").strip()
    if base_url:
        options["base_url"] = base_url
    return OpenAI(**options)


# 요청 1 — 분석 본문(요약·강점·보완점·심사 포인트·확장·유사 사례).
# 각 항목을 '정확히 한 문장'으로 묶어 출력 토큰을 줄인다 — 문장 수가 곧 시간이다.
CORE_SYSTEM_PROMPT = """당신은 대한민국 공모전 아이디어 분석 도우미입니다. 사용자가 입력한 아이디어를 분석해 아래 JSON 형식으로만 답하세요.

{
  "overallNotice": "중복 가능성이 높은지·보통인지·낮은지를 분명히 밝히고 근거를 덧붙인 1~2문장 평가",
  "differentiationTip": "차별화 포인트를 어떻게 다듬으면 좋은지 2~3문장 안내",
  "ideaSummary": "(대상)·(문제)·(방법)이 드러나는, 쉬운 말의 매우 짧은 한 문장 요약(30자 이내)",
  "targetUsers": ["예상 타깃 사용자 3개(누가 + 어떤 상황에서 + 왜 필요한지가 담긴 정확히 한 문장)"],
  "strengths": ["강점 3개(입력 설명의 근거를 인용한 정확히 한 문장)"],
  "improvements": ["보완하면 좋은 점 3개(무엇을 어떻게 바꿀지의 행동 지침 한 문장)"],
  "judgePoints": ["심사에서 어필할 포인트 3개('심사 기준 — 내용' 형태의 한 문장)"],
  "extensionIdeas": ["확장 아이디어 3개(확장 대상·방법이 구체적인 한 문장)"],
  "similarCases": [
    { "id": 숫자, "similarity": 0부터 100 사이 정수, "summary": "1~2문장 분석 요약", "overlap": ["겹치는 점 3개(짧은 구절)"], "difference": "다른 점과 차별화 제안 1~2문장" }
  ]
}

규칙:
- 모든 문장은 한국어로 쓰고, 입력된 아이디어 제목과 설명의 고유한 단어(기능·대상·상황)를 문맥에 맞게 직접 인용하세요.
- ideaSummary는 '(대상)이 (문제)를 (방식)으로 돕는' 뜻이 담긴 30자 이내 초단문으로 쓰세요. 기대 효과·이유·부연 설명을 덧붙이지 말고, 쉼표로 절을 이어 늘리지 마세요. 어려운 한자어·문어체(~하도록, ~를 제공·지원하는)를 피해 말하듯 쉬운 표현(~하게 도와주는)으로 쓰세요.
- targetUsers는 단순 신분 나열(예: 대학생)만 쓰지 말고 그 사용자가 겪는 상황까지 담으세요.
- strengths·improvements·judgePoints·extensionIdeas는 어떤 아이디어에나 붙일 수 있는 일반론을 쓰지 마세요. 반드시 입력 아이디어의 실제 단어나 상황에 근거하세요.
- improvements 각 항목은 '무엇을 어떻게 바꾸면 출품에서 유리해지는지'를 알려 주는 다음 단계처럼 쓰세요.
- 입력 설명에 숫자 목표(대상 사용자 수·절감 시간 등)가 있으면 strengths와 judgePoints의 '기대 효과'에서 그 수치를 그대로 인용해 효과로 연결하세요. 설명에 숫자가 전혀 없다면 improvements 한 항목에서 설명에 정량 목표(누구에게 얼마나)를 넣는 행동 지침을 주세요.
- judgePoints 각 항목은 공모전 심사 기준(주제 적합성·실현 가능성·차별성·기대 효과) 중 무엇에 대응하는지 '기준 — 내용' 형태로 시작하세요.
- extensionIdeas는 입력 자원으로 바로 시도할 수 있는 확장을 최소 1개 포함하세요.
- similarCases에는 전달된 모든 사례의 id를 빠짐없이 포함하세요.
- targetUsers·strengths·improvements·judgePoints·extensionIdeas는 각각 정확히 3개 항목을 담습니다.
- 근거 없는 사실(실존 서비스·실제 수상 내역·통계 수치)을 새로 만들어 내지 말고, 입력과 전달된 사례 정보 안에서만 분석하세요.
- 유사도가 높은 사례일수록 겹치는 점(overlap)을 구체적으로 짚어 주세요.
- 답이 길어지면 전달이 늦어집니다. 각 항목은 지정한 문장 수를 지키고, 근거가 담기는 선에서 짧게 유지하세요."""

# 요청 2 — 공모전 적합도 점수. 본문과 필요로 하는 컨텍스트가 달라(후보 16건 vs 사례 3건)
# 프롬프트를 나누면 각자 입력도 작아지고, 동시 요청으로 전체 시간은 느린 쪽에 맞춰진다.
SCORE_SYSTEM_PROMPT = """당신은 대한민국 공모전 추천 도우미입니다. 사용자 아이디어와 공모전 후보 목록을 받아 각 공모전의 주제 적합성을 평가해 아래 JSON 형식으로만 답하세요.

{
  "contests": [
    { "id": 숫자, "matchScore": 0부터 100 사이 정수, "matchReason": "추천 이유를 담은 정확히 한 문장" }
  ]
}

규칙:
- contests에는 전달된 모든 공모전의 id를 빠짐없이 포함하세요.
- matchReason은 한국어로 쓰고, 아이디어의 핵심 단어(기능·대상·상황)를 직접 인용해 한 문장으로 유지하세요.
- matchScore는 주제 적합성 기준으로 아래 구간을 지켜 차등 있게 매기세요. 점수가 비슷하게 몰리면 추천 정보가 사라지므로 무관한 공모전은 낮은 점수를 주는 것을 피하지 마세요.
  · 81~100: 제안서의 핵심 주제와 공모전 주제가 직접 연결되고, 아이디어를 그대로 출품할 수 있는 경우
  · 56~80: 아이디어를 크게 바꾸지 않고도 출품 주제에 맞출 수 있는 경우
  · 26~55: 아이디어를 비틀거나 확장해야만 제안할 수 있는 주변부 주제인 경우
  · 0~25: 주제·출품 형식이 아이디어와 맞지 않는 경우
- matchScore가 낮은(55 이하) 공모전의 matchReason은 추천 문구처럼 쓰지 말고, 어떤 조건을 갖추면 제안해 볼 만한지 또는 왜 어긋나는지 솔직하게 한 문장으로 적으세요.
- 근거 없는 사실(실존 서비스·실제 수상 내역·통계 수치)을 새로 만들어 내지 말고, 전달된 정보 안에서만 판단하세요."""


def _dump(value) -> str:
    return json.dumps(value, ensure_ascii=False, indent=2)


def _build_core_user_prompt(body: dict) -> str:
    return "\n".join(
        [
            "[사용자 아이디어]",
            _dump(body["idea"]),
            "",
            "[분석 대상 유사 사례 (실제 공모전)]",
            _dump(body["referenceCases"]),
        ]
    )


def _build_score_user_prompt(body: dict) -> str:
    # 점수 판단에 필요한 필드만 남긴다 — 설명·신청 절차 문장은 토큰만 늘리고 판단에 불필요하다.
    contest_digest = [
        {
            "id": contest.get("id"),
            "title": contest.get("title"),
            "organizer": contest.get("organizer"),
            "field": contest.get("field"),
            "deadline": contest.get("deadline"),
        }
        for contest in body.get("contests") or []
    ]
    return "\n".join(
        [
            "[사용자 아이디어]",
            _dump(body["idea"]),
            "",
            "[추천 후보 공모전 (실제 접수 중)]",
            _dump(contest_digest),
        ]
    )


def _clamp_score(value, fallback: int) -> int:
    if not isinstance(value, (int, float)) or isinstance(value, bool) or not math.isfinite(value):
        return fallback
    return min(100, max(0, round(value)))


def _as_text(value, fallback: str) -> str:
    if isinstance(value, str) and value.strip() != "":
        return value.strip()
    return fallback


def _as_text_list(value, fallbacks: list[str]) -> list[str]:
    if not isinstance(value, list):
        return list(fallbacks)
    result = [item.strip() for item in value if isinstance(item, str) and item.strip() != ""]
    while len(result) < len(fallbacks):
        result.append(fallbacks[len(result)])
    return result[: len(fallbacks)]


def _find_entry(items: list, entry_id):
    for item in items:
        if isinstance(item, dict) and item.get("id") == entry_id:
            return item
    return None


# AI 응답을 요청한 id 개수에 맞게 보정합니다. 누락·과다·형식 오류가 있어도
# 클라이언트가 바로 그릴 수 있는 완전한 형태로 만들어 돌려줍니다.
# score_raw는 공모전 점수 요청의 응답(실패 시 None) — 비어 있으면 contests를
# 빈 배열로 돌려 프론트가 목업 점수를 그대로 쓰게 합니다(mergeAnalysis).
def normalize_analysis(core_raw, score_raw, body: dict) -> dict:
    root = core_raw if isinstance(core_raw, dict) else {}
    raw_similar = root.get("similarCases") if isinstance(root.get("similarCases"), list) else []
    score_root = score_raw if isinstance(score_raw, dict) else {}
    raw_contests = score_root.get("contests") if isinstance(score_root.get("contests"), list) else []

    similar_cases = []
    for reference_case in body.get("referenceCases") or []:
        entry = _find_entry(raw_similar, reference_case.get("id"))
        similar_cases.append(
            {
                "id": reference_case.get("id"),
                "similarity": _clamp_score(entry.get("similarity") if entry else None, 50),
                "summary": _as_text(
                    entry.get("summary") if entry else None,
                    f"{reference_case.get('title')} 관련 실제 공모전입니다. 아이디어와의 관계를 직접 확인해 보세요.",
                ),
                "overlap": _as_text_list(
                    entry.get("overlap") if entry else None,
                    [
                        f"{reference_case.get('domain')} 주제의 실제 공모 사례",
                        "아이디어와 겹치는 주제·대상",
                        "공모전 심사 구조",
                    ],
                ),
                "difference": _as_text(
                    entry.get("difference") if entry else None,
                    "전달된 사례 정보 안에서 아이디어만의 차별화 포인트를 한 문장으로 정리해 보세요.",
                ),
            }
        )

    # 점수 응답이 아예 없으면 빈 배열 — 일부만 왔을 때는 없는 id를 기본값으로 채운다.
    contests = []
    if len(raw_contests) > 0:
        for contest in body.get("contests") or []:
            entry = _find_entry(raw_contests, contest.get("id"))
            contests.append(
                {
                    "id": contest.get("id"),
                    "matchScore": _clamp_score(entry.get("matchScore") if entry else None, 50),
                    "matchReason": _as_text(
                        entry.get("matchReason") if entry else None,
                        f"{contest.get('title')}에 제안해 볼 수 있는지 검토해 보세요.",
                    ),
                }
            )

    detail = {
        "ideaSummary": _as_text(root.get("ideaSummary"), "입력 내용을 한 문장으로 다시 정리해 보세요."),
        "targetUsers": _as_text_list(
            root.get("targetUsers"),
            [
                "아이디어 문제를 직접 겪는 핵심 사용자",
                "사용자를 돕는 보호자·관리자",
                "심사위원이 체감할 수 있는 일반 이용자",
            ],
        ),
        "strengths": _as_text_list(
            root.get("strengths"),
            [
                "문제 의식이 명확해 주제 공감대가 높습니다.",
                "입력에 해결 방식이 담겨 있어 기획 설명이 쉽습니다.",
                "공모전 제안서로 바로 발전시킬 수 있는 구조입니다.",
            ],
        ),
        "improvements": _as_text_list(
            root.get("improvements"),
            [
                "핵심 사용자의 구체적 사례나 수치를 덧붙이세요.",
                "동작 화면(와이어프레임·목업)을 1장 이상 준비하세요.",
                "유사 시도와의 차이를 한 문장으로 요약하세요.",
            ],
        ),
        "judgePoints": _as_text_list(
            root.get("judgePoints"),
            [
                "주제 적합성 — 공모전 주제 문구와 문제 정의를 맞추세요.",
                "실현 가능성 — 만들 수 있는 범위로 기능을 좁히세요.",
                "기대 효과 — 측정 가능한 숫자로 표현하세요.",
            ],
        ),
        "extensionIdeas": _as_text_list(
            root.get("extensionIdeas"),
            [
                "같은 방식을 다른 분야에 적용한 확장판을 제시해 보세요.",
                "기록이 쌓일수록 유용한 데이터 기반 기능을 더하세요.",
                "단계적 확장 로드맵을 덧붙여 보세요.",
            ],
        ),
    }

    return {
        "overallNotice": _as_text(root.get("overallNotice"), "유사 사례를 참고해 차별화 요소를 검토하세요."),
        "differentiationTip": _as_text(
            root.get("differentiationTip"),
            "유사 사례들의 다른 점을 참고해 내 아이디어만의 차별화 포인트를 1~2개 문장으로 정리해 보세요.",
        ),
        "detail": detail,
        "similarCases": similar_cases,
        "contests": contests,
    }


# 출력 토큰 상한 — 출력이 길수록 생성이 느려지므로 런어웨이만 막는다.
CORE_MAX_OUTPUT_TOKENS = 3_000
SCORE_MAX_OUTPUT_TOKENS = 1_500

# 요청 하나당 스트림 예산(초). 프론트 약속 30초 안에 두 요청(동시 실행)이
# 모두 끝나야 하므로 각각 25초로 묶는다.
STREAM_BUDGET_SEC = 25.0


def _stream_chat_json(
    client: OpenAI,
    model: str,
    system_prompt: str,
    user_prompt: str,
    max_output_tokens: int,
) -> str:
    # gpt-5 계열은 temperature 기본값(1)만 허용하고 max_tokens 대신
    # max_completion_tokens를 쓴다. 모델명이 'openai/gpt-5.6-luna'처럼
    # 접두사를 가질 수 있어 마지막 조각으로 판정한다.
    bare_model = model.rsplit("/", 1)[-1]
    is_gpt5_family = bare_model.startswith("gpt-5")
    options: dict = {
        "model": model,
        "response_format": {"type": "json_object"},
        "stream": True,
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ],
    }
    if is_gpt5_family:
        options["max_completion_tokens"] = max_output_tokens
        options["reasoning_effort"] = "low"
    else:
        options["max_tokens"] = max_output_tokens
        options["temperature"] = 0.6

    stream = client.chat.completions.create(**options)
    deadline = time.monotonic() + STREAM_BUDGET_SEC
    content_text = ""
    try:
        for chunk in stream:
            if time.monotonic() > deadline:
                break
            if isinstance(chunk, dict):  # 테스트용 모의 청크
                choices = chunk.get("choices") or []
                content = None
                if choices:
                    delta = choices[0].get("delta") or {}
                    content = delta.get("content")
            else:  # 실제 OpenAI SDK 청크
                delta = chunk.choices[0].delta if chunk.choices else None
                content = getattr(delta, "content", None) if delta is not None else None
            if content:
                content_text += content
    finally:
        stream.close()
    return content_text.strip()


# 같은 입력에 대한 분석 결과를 잠깐 기억해 재요청 시 동일한 결과를 돌려줍니다.
# gpt-5 계열은 temperature가 기본값(1)으로 고정되어 실행마다 점수·문구가 조금씩
# 달라지므로, 반복 시행 결과의 일관성 확보와 토큰 절약을 위해 캐시로 보완합니다.
ANALYSIS_CACHE_TTL_SEC = 10 * 60
ANALYSIS_CACHE_MAX = 50
_analysis_cache: OrderedDict[str, dict] = OrderedDict()
_cache_lock = threading.Lock()


def _analysis_cache_key(body: dict) -> str:
    return json.dumps(
        [
            body["idea"]["title"],
            body["idea"]["description"],
            body["idea"]["category"],
            [item.get("id") for item in body.get("referenceCases") or []],
            [item.get("id") for item in body.get("contests") or []],
        ],
        ensure_ascii=False,
        separators=(",", ":"),
    )


def _get_cached_analysis(key: str) -> dict | None:
    with _cache_lock:
        hit = _analysis_cache.get(key)
        if hit is None:
            return None
        if hit["expiresAt"] < time.monotonic():
            del _analysis_cache[key]
            return None
        return hit["value"]


def _set_cached_analysis(key: str, value: dict) -> None:
    with _cache_lock:
        if len(_analysis_cache) >= ANALYSIS_CACHE_MAX:
            _analysis_cache.popitem(last=False)
        _analysis_cache[key] = {"value": value, "expiresAt": time.monotonic() + ANALYSIS_CACHE_TTL_SEC}


# 스트림 실패 원인을 서비스 오류로 바꾼다. 토큰 만료(401 expired_key)만 전용 오류로
# 골라내고, 나머지는 모두 업스트림 오류로 포장한다.
def _to_ai_service_error(reason) -> Exception:
    if is_expired_key_error(reason):
        return AiKeyExpiredError()
    message = _error_message(reason)
    return AiUpstreamError(f"OpenAI 호출에 실패했습니다: {message}")


def _run_stream(client: OpenAI, model: str, system_prompt: str, user_prompt: str, max_output_tokens: int) -> str:
    try:
        return _stream_chat_json(client, model, system_prompt, user_prompt, max_output_tokens)
    except Exception as error:  # OpenAI SDK 오류를 그대로 올려 오류 매핑이 판정하게 한다
        raise error


def analyze_idea(body: dict) -> dict:
    budget = estimate_analysis_budget(body)
    if budget["tooLarge"]:
        raise AiRequestTooLargeError()

    # 모델명은 호출 시점에 읽는다 — .env 로드 순서와 무관하게 최신 값을 쓴다.
    # 중계 게이트웨이는 'openai/gpt-5.6-luna'처럼 접두사 붙은 모델명을 요구한다.
    ai_model = (os.getenv("OPENAI_MODEL") or "").strip() or "gpt-4o-mini"
    client = _get_client()
    cache_key = _analysis_cache_key(body)
    cached = _get_cached_analysis(cache_key)
    if cached is not None:
        return cached

    # 본문과 점수를 동시에 요청한다. 본문 실패는 분석 전체 실패(목업 대체)지만,
    # 점수 실패는 본문을 살린다 — 프론트가 점수만 목업 값으로 채워 보여 준다.
    with ThreadPoolExecutor(max_workers=2) as executor:
        core_future = executor.submit(
            _run_stream, client, ai_model, CORE_SYSTEM_PROMPT, _build_core_user_prompt(body), CORE_MAX_OUTPUT_TOKENS
        )
        score_future = executor.submit(
            _run_stream, client, ai_model, SCORE_SYSTEM_PROMPT, _build_score_user_prompt(body), SCORE_MAX_OUTPUT_TOKENS
        )

        core_error: Exception | None = None
        core_content = ""
        try:
            core_content = core_future.result()
        except Exception as error:
            core_error = error

        score_error: Exception | None = None
        score_content = ""
        try:
            score_content = score_future.result()
        except Exception as error:
            score_error = error

    if core_error is not None:
        raise _to_ai_service_error(core_error)
    if score_error is not None:
        print(f"[ai] 공모전 점수 생성에 실패해 본문 분석만 반환합니다: {score_error}")

    if not core_content:
        raise AiUpstreamError("모델 응답이 비어 있습니다.")

    try:
        core_parsed = json.loads(core_content)
    except ValueError:
        raise AiUpstreamError("모델 응답을 JSON으로 해석하지 못했습니다.")

    score_parsed = None
    if score_content:
        try:
            score_parsed = json.loads(score_content)
        except ValueError:
            print("[ai] 공모전 점수 응답을 JSON으로 해석하지 못해 점수를 폐기합니다.")

    analysis = normalize_analysis(core_parsed, score_parsed, body)
    _set_cached_analysis(cache_key, analysis)
    return analysis


# 게이트웨이 토큰(JWT)의 만료일을 읽어 서버 시작 로그로 알려준다.
# 토큰이 만료되면 AI 분석이 멈추므로 관리자가 미리 갱신할 수 있게
# 남은 기간을 시작 시점에 보여 준다. JWT가 아닌 키(공식 OpenAI sk-... 등)는
# 만료 정보가 없어 아무것도 출력하지 않는다.
TOKEN_WARN_DAYS = 3


def _decode_jwt_payload(segment: str) -> dict | None:
    import base64

    padded = segment + "=" * (-len(segment) % 4)
    try:
        raw = base64.urlsafe_b64decode(padded.encode("utf-8"))
        payload = json.loads(raw.decode("utf-8"))
    except Exception:
        return None
    return payload if isinstance(payload, dict) else None


def _format_korean_datetime(dt) -> str:
    # JS toLocaleString('ko-KR')와 비슷한 사람이 읽는 표기(로그용).
    hour = dt.hour
    meridiem = "오전" if hour < 12 else "오후"
    hour12 = hour % 12 or 12
    return f"{dt.year}. {dt.month:02d}. {dt.day:02d}. {meridiem} {hour12}:{dt.minute:02d}:{dt.second:02d}"


def get_ai_token_notice() -> str | None:
    key = (os.getenv("OPENAI_API_KEY") or "").strip()
    segments = key.split(".")
    if len(segments) != 3:
        return None
    payload = _decode_jwt_payload(segments[1] or "")
    if payload is None or not isinstance(payload.get("exp"), (int, float)):
        return None
    exp = payload["exp"]

    from datetime import datetime, timezone

    expires_at = _format_korean_datetime(datetime.fromtimestamp(exp, tz=timezone.utc).astimezone())
    days_left = math.ceil((exp - time.time()) / 86_400)
    if days_left <= 0:
        return f"[경고] AI 인증 토큰이 만료되었습니다({expires_at}). mlapi.run에서 재발급한 토큰으로 backend/.env의 OPENAI_API_KEY를 교체하세요."
    if days_left <= TOKEN_WARN_DAYS:
        return f"[경고] AI 인증 토큰이 {days_left}일 뒤 만료됩니다({expires_at}). 미리 재발급해 교체해 두세요."
    return f"[AI] 인증 토큰 만료까지 {days_left}일 남았습니다({expires_at})."
