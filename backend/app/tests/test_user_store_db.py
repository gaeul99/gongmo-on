# ==========================================================
# user_store PostgreSQL 통합 테스트 — pytest
# Docker DB(gongmo-on-db)가 떠 있을 때만 실행된다 — 꺼져 있으면 건너뛴다.
# 실제 계정·세션·사용자 데이터의 저장/조회/개명 흐름을 확인합니다.
# ==========================================================
import pytest

from app.db.init_db import init_db
from app.db.pool import close_pool, get_pool
from app.stores import user_store
from app.utils.timeutil import iso_now

_db_up = False
try:
    # 테스트에서는 JSON 이관 없이, 연결 대기도 없이 바로 판정한다.
    init_db(migrate_from_json=False, connect_timeout_sec=0)
    _db_up = True
except Exception:
    _db_up = False


@pytest.fixture(scope="module", autouse=True)
def _cleanup_after_module():
    yield
    if _db_up:
        # 테스트 계정은 FK 전파(CASCADE)로 세션·사용자 데이터까지 함께 지운다.
        with get_pool().connection() as conn:
            conn.execute("DELETE FROM accounts WHERE nickname LIKE 'db-test-%'")
    close_pool()


def make_test_account(nickname: str) -> dict:
    salt = user_store.make_salt()
    return {
        "nickname": nickname,
        "salt": salt,
        "passwordHash": user_store.hash_password("test-password-123", salt),
        "email": "db-test@example.com",
        "createdAt": iso_now(),
    }


@pytest.mark.skipif(not _db_up, reason="PostgreSQL(gongmo-on-db)이 떠 있을 때만 실행")
class TestUserStore:
    def test_account_save_find_verify(self):
        account = make_test_account("db-test-basic")
        user_store.save_account(account)

        found = user_store.find_account("db-test-basic")
        assert found is not None
        assert found["email"] == "db-test@example.com"
        assert user_store.verify_password(found, "test-password-123") is True
        assert user_store.verify_password(found, "wrong-password") is False

    def test_session_lifecycle_and_limit(self):
        account = make_test_account("db-test-session")
        user_store.save_account(account)

        first_token = user_store.create_session("db-test-session")
        for _ in range(5):
            user_store.create_session("db-test-session")
        assert user_store.get_session_user(first_token) is None  # 가장 오래된 세션은 밀려난다

        token = user_store.create_session("db-test-session")
        assert user_store.get_session_user(token) == "db-test-session"

        with get_pool().connection() as conn:
            count = conn.execute(
                "SELECT count(*) FROM sessions WHERE nickname = 'db-test-session'"
            ).fetchone()[0]
        assert count == 5

    def test_user_data_roundtrip(self):
        account = make_test_account("db-test-userdata")
        user_store.save_account(account)

        record = user_store.save_user_data(
            "db-test-userdata",
            {
                "myContests": [{"id": 1, "title": "테스트 공모전"}],
                "wishlist": [],
                "savedIdeas": [],
                "typeTest": {"typeId": "planner", "percentage": 80},
                "checklist": {"a": True},
                "roadmaps": {},
                "practiceNotes": [],
            },
        )
        assert record["updatedAt"]

        loaded = user_store.get_user_data("db-test-userdata")
        assert loaded["myContests"] == [{"id": 1, "title": "테스트 공모전"}]
        assert loaded["typeTest"]["typeId"] == "planner"

    def test_rename_moves_account_session_userdata(self):
        account = make_test_account("db-test-rename-old")
        user_store.save_account(account)
        token = user_store.create_session("db-test-rename-old")
        user_store.save_user_data(
            "db-test-rename-old",
            {
                "myContests": [],
                "wishlist": [],
                "savedIdeas": [],
                "typeTest": None,
                "checklist": {},
                "roadmaps": {},
                "practiceNotes": [],
            },
        )

        user_store.rename_account_profile(
            "db-test-rename-old", {**account, "nickname": "db-test-rename-new"}
        )

        assert user_store.find_account("db-test-rename-old") is None
        assert user_store.find_account("db-test-rename-new")["email"] == "db-test@example.com"
        # 세션은 로그인이 유지되게 새 아이디로 옮겨진다.
        assert user_store.get_session_user(token) == "db-test-rename-new"
        assert user_store.get_user_data("db-test-rename-new")["typeTest"] is None
