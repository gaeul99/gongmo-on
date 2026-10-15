# ==========================================================
# ai_service 단위 테스트 — pytest
# OpenAI SDK를 모킹해 스트리밍 응답을 흉내 내고,
# 오류 매핑(토큰 만료·업스트림)·응답 정규화·요청 예산·
# 게이트웨이 토큰 만료 공지·gpt-5 파라미터 분기를 검증합니다.
# 실행: backend 폴더에서 .venv/Scripts/python.exe -m pytest app/tests -q
# ==========================================================
import base64
import json
import os

import pytest

from app.services import ai_service
from app.services.ai_service import (
    AiKeyExpiredError,
    AiNotConfiguredError,
    AiRequestTooLargeError,
    AiUpstreamError,
    analyze_idea,
    estimate_analysis_budget,
    get_ai_token_notice,
    is_ai_configured,
    is_expired_key_error,
)


class _FakeError(Exception):
    """openai SDK 오류를 흉내 내는 예외 — status·code 속성을 붙일 수 있다."""

    def __init__(self, message, status=None, code=None, body=None):
        super().__init__(message)
        if status is not None:
            self.status = status
        if code is not None:
            self.code = code
        if body is not None:
            self.error = body


# 문자열을 여러 delta 조각으로 쪼개 스트리밍 응답을 흉내 낸다.
class _FakeStream:
    def __init__(self, text: str):
        self._chunks = [
            {"choices": [{"delta": {"content": text[i : i + 80]}}]}
            for i in range(0, len(text), 80)
        ]

    def __iter__(self):
        return iter(self._chunks)

    def close(self):
        pass


class _FakeCompletions:
    def __init__(self, state):
        self._state = state

    def create(self, **options):
        system = options["messages"][0]["content"]
        self._state["calls"].append({"system": system, "options": options})
        # 점수 프롬프트('공모전 추천 도우미')와 본문 프롬프트를 구분한다.
        if "공모전 추천 도우미" in system:
            if self._state["scoreError"] is not None:
                raise self._state["scoreError"]
            return _FakeStream(self._state["scoreText"])
        if self._state["coreError"] is not None:
            raise self._state["coreError"]
        return _FakeStream(self._state["coreText"])


class _FakeClient:
    def __init__(self, state):
        self.chat = type("Chat", (), {})()
        self.chat.completions = _FakeCompletions(state)


@pytest.fixture()
def stream_state(monkeypatch):
    state = {"coreText": "", "scoreText": "", "coreError": None, "scoreError": None, "calls": []}
    # OpenAI 클래스 자체를 가짜로 바꿔 _get_client의 키 검증은 실제 로직을 타게 둔다.
    monkeypatch.setattr(ai_service, "OpenAI", lambda **options: _FakeClient(state))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-123")
    monkeypatch.setenv("OPENAI_MODEL", "openai/gpt-5.6-luna")
    return state


def _make_body(title: str) -> dict:
    return {
        "idea": {
            "title": title,
            "description": "대학생 30만 명에게 마감 알림을 보내 탐색 시간을 줄이는 앱",
            "category": "개발",
        },
        "referenceCases": [{"id": 1, "title": "유사 사례 A", "organizer": "A사", "domain": "개발"}],
        "contests": [
            {"id": 5, "title": "공모전 다섯", "organizer": "주최5", "field": "개발", "deadline": "2026-11-30"},
            {"id": 6, "title": "공모전 여섯", "organizer": "주최6", "field": "기획", "deadline": "2026-12-31"},
        ],
    }


def _make_contest(contest_id: int) -> dict:
    return {
        "id": contest_id,
        "title": f"공모전 {contest_id}",
        "organizer": "주최사",
        "field": "개발",
        "deadline": "2026-11-30",
    }


VALID_CORE_RESPONSE = {
    "overallNotice": "중복 가능성이 낮은 편입니다.",
    "differentiationTip": "알림 시점을 사용자가 고르게 하세요.",
    "ideaSummary": "대학생이 공모 찾기를 알림으로 돕는 앱",
    "targetUsers": ["타깃 1", "타깃 2", "타깃 3"],
    "strengths": ["강점 1", "강점 2", "강점 3"],
    "improvements": ["보완 1", "보완 2", "보완 3"],
    "judgePoints": ["주제 적합성 — 내용", "실현 가능성 — 내용", "기대 효과 — 내용"],
    "extensionIdeas": ["확장 1", "확장 2", "확장 3"],
    "similarCases": [
        {"id": 1, "similarity": 77, "summary": "요약", "overlap": ["겹침1", "겹침2", "겹침3"], "difference": "다른 점"}
    ],
}

VALID_SCORE_RESPONSE = {
    "contests": [
        {"id": 5, "matchScore": 88.4, "matchReason": "주제가 직접 연결됩니다."},
        {"id": 6, "matchScore": 999, "matchReason": "점수 상한 초과 응답."},
    ]
}


def test_is_ai_configured(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "")
    assert is_ai_configured() is False
    monkeypatch.setenv("OPENAI_API_KEY", "여기에_API_KEY")
    assert is_ai_configured() is False
    monkeypatch.setenv("OPENAI_API_KEY", "test-key-123")
    assert is_ai_configured() is True


class TestExpiredKey:
    def test_top_level_code(self):
        error = _FakeError("The key has expired", status=401, code="expired_key")
        assert is_expired_key_error(error) is True

    def test_nested_body_code(self):
        error = _FakeError("401 Unauthorized", status=401, body={"code": "expired_key"})
        assert is_expired_key_error(error) is True

    def test_message_expired(self):
        error = _FakeError("The key has expired", status=401)
        assert is_expired_key_error(error) is True

    def test_invalid_key_is_not_expired(self):
        error = _FakeError("Incorrect API key provided", status=401, code="invalid_api_key")
        assert is_expired_key_error(error) is False

    def test_not_401(self):
        assert is_expired_key_error(_FakeError("boom", status=500)) is False
        assert is_expired_key_error(None) is False


class TestBudget:
    def test_small_request_passes(self):
        budget = estimate_analysis_budget(_make_body("작은 요청"))
        assert budget["tooLarge"] is False
        assert budget["totalItems"] == 3  # 유사 사례 1 + 공모전 2

    def test_over_60_items(self):
        reference_cases = [
            {"id": i + 1, "title": f"사례 {i + 1}", "organizer": "주최사", "domain": "개발"}
            for i in range(59)
        ]
        contests = [_make_contest(100 + i) for i in range(2)]
        body = _make_body("61건")
        body["referenceCases"] = reference_cases
        body["contests"] = contests
        assert estimate_analysis_budget(body)["tooLarge"] is True

    def test_exactly_60_items(self):
        reference_cases = [
            {"id": i + 1, "title": f"사례 {i + 1}", "organizer": "주최사", "domain": "개발"}
            for i in range(58)
        ]
        contests = [_make_contest(200 + i) for i in range(2)]
        body = _make_body("60건")
        body["referenceCases"] = reference_cases
        body["contests"] = contests
        assert estimate_analysis_budget(body)["tooLarge"] is False

    def test_too_much_text(self):
        body = _make_body("긴 텍스트")
        body["referenceCases"] = [{"id": 1, "title": "긴" * 26_000, "organizer": "주최사", "domain": "개발"}]
        body["contests"] = []
        assert estimate_analysis_budget(body)["tooLarge"] is True


def _make_jwt(exp_seconds: int) -> str:
    header = base64.urlsafe_b64encode(json.dumps({"alg": "HS256", "typ": "JWT"}).encode()).rstrip(b"=").decode()
    payload = base64.urlsafe_b64encode(json.dumps({"exp": exp_seconds}).encode()).rstrip(b"=").decode()
    return f"{header}.{payload}.sig"


class TestTokenNotice:
    def test_non_jwt_returns_none(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "sk-proj-openai-style-key")
        assert get_ai_token_notice() is None

    def test_far_expiry(self, monkeypatch):
        import time

        monkeypatch.setenv("OPENAI_API_KEY", _make_jwt(int(time.time()) + 100 * 86_400))
        assert "만료까지 100일 남았습니다" in get_ai_token_notice()

    def test_near_expiry_warns(self, monkeypatch):
        import time

        monkeypatch.setenv("OPENAI_API_KEY", _make_jwt(int(time.time() + 2 * 86_400)))
        assert "2일 뒤 만료됩니다" in get_ai_token_notice()

    def test_expired_token(self, monkeypatch):
        import time

        monkeypatch.setenv("OPENAI_API_KEY", _make_jwt(int(time.time()) - 86_400))
        notice = get_ai_token_notice()
        assert "토큰이 만료되었습니다" in notice
        assert "재발급" in notice

    def test_unparseable_payload(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "notJsonBase64.notJsonBase64.sig")
        assert get_ai_token_notice() is None


class TestAnalyzeIdea:
    def test_full_response_normalised(self, stream_state):
        stream_state["coreText"] = json.dumps(VALID_CORE_RESPONSE, ensure_ascii=False)
        stream_state["scoreText"] = json.dumps(VALID_SCORE_RESPONSE, ensure_ascii=False)

        analysis = analyze_idea(_make_body("정규화-완전"))

        assert analysis["overallNotice"] == "중복 가능성이 낮은 편입니다."
        assert analysis["detail"]["ideaSummary"] == "대학생이 공모 찾기를 알림으로 돕는 앱"
        assert analysis["detail"]["strengths"] == ["강점 1", "강점 2", "강점 3"]
        assert len(analysis["similarCases"]) == 1
        assert analysis["similarCases"][0]["id"] == 1
        assert analysis["similarCases"][0]["similarity"] == 77
        # 점수는 반올림되고(88.4 → 88) 100을 넘으면 상한으로 잘린다(999 → 100)
        assert analysis["contests"] == [
            {"id": 5, "matchScore": 88, "matchReason": "주제가 직접 연결됩니다."},
            {"id": 6, "matchScore": 100, "matchReason": "점수 상한 초과 응답."},
        ]

    def test_extra_items_trimmed_to_three(self, stream_state):
        core = dict(VALID_CORE_RESPONSE)
        core["strengths"] = ["강점 1", "강점 2", "강점 3", "강점 4"]
        stream_state["coreText"] = json.dumps(core, ensure_ascii=False)
        stream_state["scoreText"] = json.dumps(VALID_SCORE_RESPONSE, ensure_ascii=False)

        analysis = analyze_idea(_make_body("정규화-초과항목"))
        assert analysis["detail"]["strengths"] == ["강점 1", "강점 2", "강점 3"]

    def test_missing_fields_filled_with_defaults(self, stream_state):
        stream_state["coreText"] = json.dumps({})
        stream_state["scoreText"] = json.dumps({"contests": [{"id": 5, "matchScore": "88"}]})

        analysis = analyze_idea(_make_body("정규화-기본값"))

        assert len(analysis["detail"]["targetUsers"]) == 3
        assert "수치" in analysis["detail"]["improvements"][0]
        assert "주제 적합성" in analysis["detail"]["judgePoints"][0]
        # 유사 사례는 요청 id마다 기본값으로 채워진다
        assert analysis["similarCases"][0]["id"] == 1
        assert analysis["similarCases"][0]["similarity"] == 50
        # 점수 응답에 없던 id 6은 기본 점수(50)·기본 문구로 채워진다
        assert analysis["contests"] == [
            {"id": 5, "matchScore": 50, "matchReason": "공모전 다섯에 제안해 볼 수 있는지 검토해 보세요."},
            {"id": 6, "matchScore": 50, "matchReason": "공모전 여섯에 제안해 볼 수 있는지 검토해 보세요."},
        ]

    def test_score_failure_keeps_core_with_empty_contests(self, stream_state):
        stream_state["coreText"] = json.dumps(VALID_CORE_RESPONSE, ensure_ascii=False)
        stream_state["scoreError"] = _FakeError("score stream failed")

        analysis = analyze_idea(_make_body("점수-실패"))

        assert analysis["detail"]["strengths"] == ["강점 1", "강점 2", "강점 3"]
        assert analysis["contests"] == []

    def test_expired_key_maps_to_dedicated_error(self, stream_state):
        stream_state["coreError"] = _FakeError("The key has expired", status=401, code="expired_key")

        with pytest.raises(AiKeyExpiredError):
            analyze_idea(_make_body("만료"))

    def test_generic_failure_wraps_as_upstream_error(self, stream_state):
        stream_state["coreError"] = _FakeError("boom")

        with pytest.raises(AiUpstreamError, match="boom"):
            analyze_idea(_make_body("업스트림"))

    def test_empty_or_invalid_json_response(self, stream_state):
        stream_state["coreText"] = ""
        stream_state["scoreText"] = json.dumps(VALID_SCORE_RESPONSE, ensure_ascii=False)
        with pytest.raises(AiUpstreamError, match="모델 응답이 비어"):
            analyze_idea(_make_body("빈-응답"))

        stream_state["coreText"] = "안녕하세요, JSON이 아닙니다"
        with pytest.raises(AiUpstreamError, match="JSON으로 해석하지 못했습니다"):
            analyze_idea(_make_body("json-아님"))

    def test_cache_hit_does_not_call_openai_again(self, stream_state):
        stream_state["coreText"] = json.dumps(VALID_CORE_RESPONSE, ensure_ascii=False)
        stream_state["scoreText"] = json.dumps(VALID_SCORE_RESPONSE, ensure_ascii=False)

        first = analyze_idea(_make_body("캐시-확인용-아이디어"))
        calls_after_first = len(stream_state["calls"])
        second = analyze_idea(_make_body("캐시-확인용-아이디어"))

        assert second == first  # 같은 객체 — 캐시 히트
        assert len(stream_state["calls"]) == calls_after_first

    def test_missing_key_raises_before_calling(self, stream_state, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "")
        with pytest.raises(AiNotConfiguredError):
            analyze_idea(_make_body("미설정"))
        assert stream_state["calls"] == []

    def test_gpt5_parameter_branch(self, stream_state):
        stream_state["coreText"] = json.dumps(VALID_CORE_RESPONSE, ensure_ascii=False)
        stream_state["scoreText"] = json.dumps(VALID_SCORE_RESPONSE, ensure_ascii=False)
        analyze_idea(_make_body("파라미터-분기"))

        assert len(stream_state["calls"]) == 2
        for call in stream_state["calls"]:
            options = call["options"]
            assert "max_tokens" not in options
            assert "temperature" not in options
            assert isinstance(options["max_completion_tokens"], int)
            assert options["reasoning_effort"] == "low"
        # 본문(3,000)과 점수(1,500)의 출력 상한이 각각 적용된다
        core = next(c for c in stream_state["calls"] if "아이디어 분석 도우미" in c["system"])
        score = next(c for c in stream_state["calls"] if "공모전 추천 도우미" in c["system"])
        assert core["options"]["max_completion_tokens"] == 3_000
        assert score["options"]["max_completion_tokens"] == 1_500

    def test_budget_error(self, monkeypatch):
        monkeypatch.setenv("OPENAI_API_KEY", "test-key-123")
        body = _make_body("너무 큼")
        body["referenceCases"] = [
            {"id": i, "title": "x" * 500, "organizer": "주최사", "domain": "개발"} for i in range(61)
        ]
        with pytest.raises(AiRequestTooLargeError):
            analyze_idea(body)
