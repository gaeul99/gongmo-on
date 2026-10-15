# ==========================================================
# 환경 변수 접근 유틸 — backend/.env를 읽는다.
# 옛 TS 버전(pool.ts·ai.service.ts)과 같이, 모듈을 읽는 시점이 아니라
# 처음 사용하는 시점에 env를 읽기 위해 함수로 감춰 둔다.
# ==========================================================
import os

from dotenv import load_dotenv

# dotenv는 서버 진입점(main.py)에서 가장 먼저 로드되지만, 테스트 등
# 다른 경로로 모듈을 import할 때도 .env가 반영되도록 여기서 한 번 더 부른다.
load_dotenv()

DEFAULT_DATABASE_URL = "postgresql://gongmo:gongmo@localhost:5432/gongmo_on"


def database_url() -> str:
    return (os.getenv("DATABASE_URL") or "").strip() or DEFAULT_DATABASE_URL


def client_origins() -> list[str]:
    raw = os.getenv("CLIENT_ORIGIN") or "http://localhost:5173,http://127.0.0.1:5173"
    return [value.strip() for value in raw.split(",") if value.strip()]
