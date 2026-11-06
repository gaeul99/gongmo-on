import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient
from starlette.requests import Request

from app.main import app
from app.routers import ideas, notifications
from app.services import ai_limits, contest_sync
from app.utils.validation import ApiError
from app.stores import user_store


def test_competing_signup_uses_insert_only_not_upsert():
    class Result:
        def fetchone(self):
            return None
    class Connection:
        def execute(self, sql, args):
            assert 'DO NOTHING' in sql
            assert 'DO UPDATE' not in sql
            return Result()
    account = dict(nickname='taken', salt='s', passwordHash='h', email='a@example.com', createdAt='2026-11-06T00:00:00Z')
    assert user_store._insert_account(Connection(), account) is False


def test_concurrent_ai_calls_never_exceed_two_and_busy_requests_do_not_spend_budget(monkeypatch):
    monkeypatch.setattr(ai_limits, '_slots', threading.BoundedSemaphore(2))
    reservations = []
    monkeypatch.setattr(ai_limits, 'reserve_daily_budget', lambda *args: reservations.append(args))
    lock = threading.Lock()
    active = peak = 0

    def attempt(_):
        nonlocal active, peak
        request = Request({'type': 'http', 'headers': [], 'client': ('127.0.0.1', 1)})
        try:
            with ai_limits.ai_request(request, 2):
                with lock:
                    active += 1
                    peak = max(peak, active)
                time.sleep(0.08)
                with lock:
                    active -= 1
            return 'ok'
        except ApiError as error:
            assert error.code == 'AI_BUSY'
            return 'busy'

    with ThreadPoolExecutor(max_workers=20) as workers:
        outcomes = list(workers.map(attempt, range(20)))
    assert peak == 2
    assert outcomes.count('busy') >= 1
    assert len(reservations) == outcomes.count('ok')


def test_ai_slots_release_when_budget_or_upstream_fails(monkeypatch):
    monkeypatch.setattr(ai_limits, '_slots', threading.BoundedSemaphore(1))
    request = Request({'type': 'http', 'headers': [], 'client': ('127.0.0.1', 1)})
    def exhausted(*_):
        raise ApiError(429, 'AI_DAILY_LIMIT', 'limit')
    monkeypatch.setattr(ai_limits, 'reserve_daily_budget', exhausted)
    with pytest.raises(ApiError):
        with ai_limits.ai_request(request, 2):
            pass
    monkeypatch.setattr(ai_limits, 'reserve_daily_budget', lambda *_: None)
    with pytest.raises(RuntimeError):
        with ai_limits.ai_request(request, 2):
            raise RuntimeError('upstream failure')
    with ai_limits.ai_request(request, 2):
        pass


def test_quota_error_is_429_not_500_and_no_ai_request_is_made(monkeypatch):
    monkeypatch.setattr(ai_limits, '_slots', threading.BoundedSemaphore(2))
    monkeypatch.setattr(ideas.ai_service, 'is_ai_configured', lambda: True)
    called = []
    monkeypatch.setattr(ideas.ai_service, 'analyze_idea', lambda *_: called.append(True))
    def exhausted(*_):
        raise ApiError(429, 'AI_DAILY_LIMIT', '오늘 사용량에 도달했어요.')
    monkeypatch.setattr(ai_limits, 'reserve_daily_budget', exhausted)
    response = TestClient(app).post('/api/ideas/analyze', json={
        'idea': {'title': '테스트', 'description': '설명'}, 'referenceCases': [], 'contests': [],
    })
    assert response.status_code == 429
    assert response.json()['error']['code'] == 'AI_DAILY_LIMIT'
    assert called == []


def test_notification_endpoints_reject_anonymous_email_requests():
    client = TestClient(app)
    for endpoint in ['subscribe', 'weekly']:
        response = client.post(f'/api/notifications/{endpoint}', json={'email': 'victim@example.com'})
        assert response.status_code == 401


def test_subscription_uses_authenticated_identity_and_never_sends_welcome_on_every_save(monkeypatch):
    saved = []
    monkeypatch.setattr(notifications.notification_store, 'upsert_subscriber', lambda **kwargs: saved.append(kwargs) or kwargs)
    monkeypatch.setattr(notifications, 'send_email', lambda *_: pytest.fail('bookmark save must not send welcome email'))
    result = notifications.post_subscribe(
        {'nickname': 'someone-else', 'email': 'victim@example.com', 'optIn': True},
        account={'nickname': 'alice', 'email': 'alice@example.com'},
    )
    assert result['success']
    assert saved[0]['nickname'] == 'alice'
    assert saved[0]['email'] == 'alice@example.com'


def test_empty_collection_is_failure_and_does_not_advance_last_success(monkeypatch):
    monkeypatch.setattr(contest_sync, '_load_state', lambda: {})
    monkeypatch.setattr(contest_sync, 'collect_contest_korea', lambda: [])
    monkeypatch.setattr(contest_sync, 'collect_wevity', lambda: [])
    monkeypatch.setattr(contest_sync, '_persist_state', lambda *_: pytest.fail('must retain last success'))
    with pytest.raises(RuntimeError):
        contest_sync._run_sync()


def test_public_sync_status_separates_recent_success_from_latest_failure(monkeypatch):
    from contextlib import contextmanager
    now = datetime.now(timezone.utc)
    class Conn:
        def execute(self, *_): return self
        def fetchone(self): return (now, now, now - timedelta(hours=8), 'failed', 123)
    class Pool:
        @contextmanager
        def connection(self): yield Conn()
    monkeypatch.setattr(contest_sync, 'get_pool', lambda: Pool())
    status = contest_sync.get_sync_status()
    assert status['lastOutcome'] == 'failed'
    assert status['stale'] is True
    assert status['inProgress'] is False
    assert status['count'] == 123
    assert 'error' not in status
