# ==========================================================
# 주간 새 공모전 다이제스트(post_weekly_digest) 테스트 — pytest
# 접수 시작일(startDate) 표시와 후보 검증 규칙을 확인합니다.
# 실제 이메일 발송은 send_email을 모킹해 막습니다.
# ==========================================================
from datetime import datetime, timedelta

import pytest

from app.routers import notifications
from app.routers.notifications import post_weekly_digest


@pytest.fixture()
def send_email_mock(monkeypatch):
    calls = []
    monkeypatch.setattr(notifications, "send_email", lambda to, subject, text: calls.append({"to": to, "subject": subject, "text": text}) or "log")
    return calls


def date_offset(days: int) -> str:
    value = datetime.now() + timedelta(days=days)
    return f"{value.year}-{value.month:02d}-{value.day:02d}"


def contest(**overrides):
    base = {"id": 1, "title": "테스트 공모전", "field": "개발", "deadline": date_offset(14)}
    base.update(overrides)
    return base


class TestWeeklyDigest:
    def test_upcoming_start_date_shown(self, send_email_mock):
        result = post_weekly_digest(
            {"nickname": "테스터", "email": "tester@example.com", "fields": [], "contests": [contest(startDate=date_offset(3))]}
        )

        assert result["success"] is True
        assert len(send_email_mock) == 1
        assert f"접수 시작 {date_offset(3)}" in send_email_mock[0]["text"]

    def test_already_open_contest_has_no_start_date(self, send_email_mock):
        post_weekly_digest(
            {
                "nickname": "테스터",
                "email": "tester@example.com",
                "fields": [],
                "contests": [
                    contest(startDate=date_offset(-5)),
                    contest(id=2, title="오늘 시작", startDate=date_offset(0)),
                ],
            }
        )

        assert "접수 시작" not in send_email_mock[0]["text"]

    def test_invalid_start_date_ignored_but_item_kept(self, send_email_mock):
        result = post_weekly_digest(
            {"nickname": "테스터", "email": "tester@example.com", "fields": [], "contests": [contest(startDate="내일쯤")]}
        )

        assert result["data"]["matched"] == 1
        assert "테스트 공모전" in send_email_mock[0]["text"]
        assert "접수 시작" not in send_email_mock[0]["text"]

    def test_past_and_far_contests_excluded(self, send_email_mock):
        result = post_weekly_digest(
            {
                "nickname": "테스터",
                "email": "tester@example.com",
                "fields": [],
                "contests": [
                    contest(id=1, title="지난 공모전", deadline=date_offset(-1)),
                    contest(id=2, title="먼 공모전", deadline=date_offset(40)),
                    contest(id=3, title="알맞은 공모전"),
                ],
            }
        )

        assert result["data"]["matched"] == 1
        text = send_email_mock[0]["text"]
        assert "알맞은 공모전" in text
        assert "지난 공모전" not in text
        assert "먼 공모전" not in text

    def test_no_candidates_sends_nothing(self, send_email_mock):
        result = post_weekly_digest(
            {"nickname": "테스터", "email": "tester@example.com", "fields": [], "contests": []}
        )

        assert result["data"]["matched"] == 0
        assert result["data"]["delivery"] == "skipped"
        assert send_email_mock == []
