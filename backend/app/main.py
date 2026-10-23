# ==========================================================
# 공모온 API 서버 — FastAPI 엔트리.
# 옛 TypeScript(Express) 버전(src/server.ts)과 같은 응답 형식·포트·
# 미들웨어 동작을 유지한다. 실행: backend 폴더에서 `npm run dev`.
# ==========================================================
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path

# Windows 콘솔(cp949)에서 이메일 로그의 한글·특수문자 print가
# UnicodeEncodeError로 서버 응답을 깨뜨리지 않게 한다 — 인코딩은 콘솔
# 기본값을 유지해 한글이 보이게 두고, 못 넣는 문자만 안전하게 치환한다.
for _stream in (sys.stdout, sys.stderr):
    if _stream is not None and hasattr(_stream, "reconfigure"):
        _stream.reconfigure(errors="replace")

from dotenv import load_dotenv

load_dotenv()

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, JSONResponse
from fastapi.staticfiles import StaticFiles
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.config import client_origins
from app.routers import auth, contests, ideas, inquiries, notifications, userdata
from app.security import (
    PayloadLimitMiddleware,
    RequestLogAndHeadersMiddleware,
    TooManyRequests,
    rate_limit,
)
from app.utils.validation import ApiError
from app.services import contest_sync
from app.services.ai_service import get_ai_token_notice
from app.services.notification_scheduler import start_notification_scheduler
from app.services.notification_senders import email_configured
from app.stores import user_store
from app.db.init_db import init_db
from app.db.pool import close_pool

# 개발 기본값은 Vite 개발 서버(5173). 배포하면 CLIENT_ORIGIN 환경변수에
# 실제 웹사이트 주소를 쉼표로 나열해 확장한다. Origin이 없는 서버 간 호출은
# 브라우저가 아니라 CSRF 위험이 없어 그대로 허용한다.
@asynccontextmanager
async def lifespan(_app):
    _on_startup()
    yield
    # 종료 때 DB 연결 풀을 닫아 psycopg 풀 종료 경고를 막는다.
    close_pool()


app = FastAPI(
    openapi_url=None,
    docs_url=None,
    redoc_url=None,
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=client_origins(),
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.add_middleware(PayloadLimitMiddleware)
app.add_middleware(RequestLogAndHeadersMiddleware)

# 단일 서비스 배포(Docker, STATIC_DIR 지정)에서는 빌드된 SPA 화면도 같은 서버가
# 서빙한다. 로컬 개발은 Vite(5173)가 화면을 담당하므로 STATIC_DIR가 없으면
# 기존처럼 API 전용으로 동작한다.
_static_dir = Path((os.getenv("STATIC_DIR") or "").strip())


class SPAStaticFiles(StaticFiles):
    """SPA 마운트 — 파일이 없는 화면 경로는 index.html로, /api 경로는 JSON 404로 답한다."""

    async def get_response(self, path: str, scope):
        if scope["path"] == "/api" or scope["path"].startswith("/api/"):
            return JSONResponse(
                status_code=404,
                content={"success": False, "error": {"code": "NOT_FOUND", "message": "찾을 수 없는 요청이에요."}},
            )
        try:
            response = await super().get_response(path, scope)
            if response.status_code == 404:
                response = await super().get_response("index.html", scope)
        except StarletteHTTPException as error:
            # Starlette 버전에 따라 404가 응답 대신 예외로 오기도 한다.
            if error.status_code != 404:
                raise
            response = await super().get_response("index.html", scope)
        return response


# 남용이 비용·스팸으로 이어지는 엔드포인트부터 IP별 요청 수를 제한한다.
# AI 호출(토큰 비용), 로그인(무차별 대입), 알림 이메일(발송 남용).
def _limit(window_minutes: int, max_count: int, name: str):
    check = rate_limit(window_ms=window_minutes * 60 * 1000, max_count=max_count, name=name)

    async def dependency(request: Request):
        check(request)

    return dependency


# 3000 포트는 데이터 전용 API 서버라서 화면은 따로 없다. 브라우저로 직접 열었을 때
# "Cannot GET /" 대신 웹사이트 주소를 안내해 주는 용도의 페이지.
ROOT_HTML = """<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>공모온 API 서버</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    background: #eff6ff;
    color: #182236;
    min-height: 100vh;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 32px 16px;
  }
  .card {
    width: 100%;
    max-width: 560px;
    background: #fff;
    border: 1px solid #dbeafe;
    border-radius: 20px;
    padding: 40px 36px 32px;
    box-shadow: 0 18px 40px rgba(29, 78, 216, 0.10);
  }
  .logo {
    width: 48px; height: 48px;
    border-radius: 14px;
    background: #1d4ed8;
    color: #fff;
    font-size: 24px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 20px;
  }
  h1 { font-size: 24px; margin-bottom: 8px; }
  .lead { font-size: 14px; line-height: 1.7; color: #64748b; margin-bottom: 24px; }
  .lead strong { color: #1d4ed8; }
  .cta {
    display: inline-block;
    background: #1d4ed8;
    color: #fff;
    text-decoration: none;
    font-size: 14px; font-weight: 700;
    padding: 12px 22px;
    border-radius: 999px;
    margin-bottom: 28px;
  }
  .cta:hover { background: #1e40af; }
  .endpoints { border-top: 1px solid #e3edfb; padding-top: 20px; }
  .endpoints h2 { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; color: #94a3b8; margin-bottom: 12px; }
  .row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }
  code { font-family: Consolas, "D2Coding", monospace; font-size: 12.5px; color: #334155; }
  .method {
    flex: 0 0 44px;
    text-align: center;
    font-size: 10.5px; font-weight: 800;
    border-radius: 6px;
    padding: 3px 0;
  }
  .get { background: #e7f6ec; color: #1e7c3a; }
  .post { background: #dbeafe; color: #1d4ed8; }
  .put { background: #fff6e0; color: #b45309; }
  .desc { margin-left: auto; color: #94a3b8; font-size: 12px; }
  footer { margin-top: 24px; font-size: 12px; color: #b8c4d6; }
</style>
</head>
<body>
  <main class="card">
    <div class="logo">공</div>
    <h1>공모온 API 서버</h1>
    <p class="lead">
      이 서버는 공모온의 <strong>데이터와 AI 분석</strong>을 담당하는 백엔드예요.
      웹사이트 화면은 5173 포트에서 실행됩니다.
    </p>
    <a class="cta" href="http://localhost:5173">공모온 웹사이트 열기 &rarr;</a>
    <section class="endpoints">
      <h2>API 엔드포인트</h2>
      <div class="row"><span class="method get">GET</span><code>/api/health</code><span class="desc">서버 상태 확인</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/ideas/analyze</code><span class="desc">아이디어 분석 (AI)</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/ideas/judge</code><span class="desc">제안서 심사 시뮬레이션 (AI)</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/notifications/subscribe</code><span class="desc">알림 구독 등록</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/notifications/run</code><span class="desc">알림 수동 점검</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/auth/signup</code><span class="desc">회원가입 (계정 서버 저장)</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/auth/login</code><span class="desc">로그인</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/auth/logout</code><span class="desc">로그아웃</span></div>
      <div class="row"><span class="method get">GET</span><code>/api/userdata</code><span class="desc">내 데이터 불러오기</span></div>
      <div class="row"><span class="method put">PUT</span><code>/api/userdata</code><span class="desc">내 데이터 저장</span></div>
      <div class="row"><span class="method get">GET</span><code>/api/contests</code><span class="desc">자동 수집 공모전 목록</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/contests/sync</code><span class="desc">공모전 자동 등록 즉시 실행</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/inquiries</code><span class="desc">문의 접수 (푸터 문의하기)</span></div>
    </section>
    <footer>GongmoOn API &middot; 개발 서버 &middot; http://localhost:3000</footer>
  </main>
</body>
</html>"""


# STATIC_DIR(단일 서비스 배포)에서는 이 안내 페이지 대신 SPA가 / 를 서빙한다.
if not _static_dir.is_dir():

    @app.get("/", response_class=HTMLResponse)
    def root():
        return ROOT_HTML


@app.get("/api/health")
def health():
    return {"success": True, "message": "GongmoOn API is running"}


app.include_router(
    ideas.router,
    prefix="/api/ideas",
    dependencies=[Depends(_limit(10, 15, "ideas"))],
)
app.include_router(
    notifications.router,
    prefix="/api/notifications",
    dependencies=[Depends(_limit(10, 20, "notifications"))],
)
app.include_router(
    auth.router,
    prefix="/api/auth",
    dependencies=[Depends(_limit(10, 30, "auth"))],
)
app.include_router(userdata.router, prefix="/api/userdata")
app.include_router(
    contests.router,
    prefix="/api/contests",
    dependencies=[Depends(_limit(10, 60, "contests"))],
)
# 문의는 아무나 보낼 수 있고 담당자에게 메일을 보내므로 스팸 방지를 위해 타이트하게 제한한다.
app.include_router(
    inquiries.router,
    prefix="/api/inquiries",
    dependencies=[Depends(_limit(10, 5, "inquiries"))],
)

# 마운트는 API 라우터 등록이 끝난 뒤에 둔다 — 나머지 경로만 화면으로 간다.
if _static_dir.is_dir():
    app.mount("/", SPAStaticFiles(directory=_static_dir, html=True), name="spa")


# 정의되지 않은 경로 — Express 기본 HTML 대신 표준 JSON으로 답한다.
@app.exception_handler(StarletteHTTPException)
async def http_exception_handler(request: Request, exc: StarletteHTTPException):
    if exc.status_code in (404, 405):
        return JSONResponse(
            status_code=404,
            content={"success": False, "error": {"code": "NOT_FOUND", "message": "찾을 수 없는 요청이에요."}},
        )
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {"code": "HTTP_ERROR", "message": str(exc.detail)}},
    )


@app.exception_handler(TooManyRequests)
async def too_many_requests_handler(request: Request, exc: TooManyRequests):
    return JSONResponse(
        status_code=429,
        content={
            "success": False,
            "error": {
                "code": "TOO_MANY_REQUESTS",
                "message": "요청이 너무 많아요. 잠시 후에 다시 시도해 주세요.",
            },
        },
    )


@app.exception_handler(ApiError)
async def api_error_handler(request: Request, exc: ApiError):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {"code": exc.code, "message": exc.message}},
    )


@app.exception_handler(Exception)
async def unhandled_error_handler(request: Request, exc: Exception):
    import traceback

    print("[server] 알 수 없는 오류:", repr(exc))
    traceback.print_exc()
    return JSONResponse(
        status_code=500,
        content={"success": False, "error": {"code": "INTERNAL", "message": "서버 내부 오류가 발생했어요."}},
    )


def _on_startup():
    # PostgreSQL(Docker 컨테이너) 연결 + 스키마 적용. 최초 실행이면 옛 JSON
    # 데이터(backend/src/data/*.json)도 자동으로 이관한다. 연결 실패 시
    # initDb가 방법을 안내하므로 재시도 없이 종료한다.
    init_db()

    port = int(os.getenv("PORT") or 3000)
    print(f"Server running on http://localhost:{port}")
    print(f"[알림] 이메일: {'SMTP 발송' if email_configured() else '로그 모드(SMTP 미설정)'}")
    # 게이트웨이 토큰(JWT)은 유효기간이 있어 만료되면 AI 분석이 함께 멈춘다.
    # 시작 시 남은 기간을 보여 관리자가 미리 갱신하도록 한다.
    token_notice = get_ai_token_notice()
    if token_notice:
        print(token_notice)
    # 만료된 로그인 세션을 시작 때 한 번 정리합니다.
    try:
        user_store.prune_expired_sessions()
    except Exception as error:
        print("[server] 만료 세션 정리 실패:", error)
    start_notification_scheduler()
    # 위비티·콘테스트코리아에서 공모전을 자동 등록한다(최근 동기화가 있으면 건너뜀).
    contest_sync.start_contest_sync_scheduler()


# 배포 환경(VPS·PaaS)에서는 PORT 환경변수로 포트를 지정한다. 미지정 시 개발 기본값 3000.
if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT") or 3000), log_level="warning")
