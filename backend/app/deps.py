# 공통 의존성 — JSON 본문 파싱.
# 동기 라우트는 스레드풀에서 실행되므로 본문 읽기(await)는 비동기 의존성에서
# 미리 끝내고, 결과만 라우트에 주입한다.
import json

from fastapi import Request

from app.utils.validation import ApiError


async def json_body(request: Request) -> dict:
    raw = await request.body()
    if not raw:
        return {}
    try:
        parsed = json.loads(raw)
    except ValueError:
        raise ApiError(400, "INVALID_REQUEST", "요청 본문이 올바른 JSON이 아니에요.")
    # 배열·문자열 등 객체가 아닌 JSON은 옛 TS 버전과 같이 빈 객체로 본다.
    return parsed if isinstance(parsed, dict) else {}
