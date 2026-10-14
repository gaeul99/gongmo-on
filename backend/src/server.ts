import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import type { NextFunction, Request, Response } from "express";
import { ideaRouter } from "./routes/idea.routes";
import { notificationRouter } from "./routes/notification.routes";
import { accountRouter, userDataRouter } from "./routes/account.routes";
import { contestRouter } from "./routes/contest.routes";
import { inquiryRouter } from "./routes/inquiry.routes";
import { startNotificationScheduler } from "./services/notificationScheduler";
import { emailConfigured } from "./services/notificationSenders";
import { getAiTokenNotice } from "./services/ai.service";
import { pruneExpiredSessions } from "./services/userStore";
import { startContestSyncScheduler } from "./services/contestSync";
import { rateLimit, securityHeaders } from "./middleware/security";
import { requestLogger } from "./utils/requestLogger";

dotenv.config();

const app = express();

// 개발 기본값은 Vite 개발 서버(5173). 배포하면 CLIENT_ORIGIN 환경변수에
// 실제 웹사이트 주소를 쉼표로 나열해 확장한다. Origin이 없는 서버 간 호출은
// 브라우저가 아니라 CSRF 위험이 없어 그대로 허용한다.
const allowedOrigins = (
  process.env.CLIENT_ORIGIN ?? "http://localhost:5173,http://127.0.0.1:5173"
)
  .split(",")
  .map((value) => value.trim())
  .filter(Boolean);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
  }),
);
app.use(requestLogger());
app.use(securityHeaders);
// 사용자 데이터(아이디어 분석 스냅숏 포함)가 커질 수 있어 기본 100kb를 넉넉히 올립니다.
app.use(express.json({ limit: "2mb" }));

// 남용이 비용·스팸으로 이어지는 엔드포인트부터 IP별 요청 수를 제한한다.
// AI 호출(토큰 비용), 로그인(무차별 대입), 알림 이메일(발송 남용).
app.use(
  "/api/ideas",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 15, name: "ideas" }),
);
app.use(
  "/api/auth",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 30, name: "auth" }),
);
app.use(
  "/api/notifications",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 20, name: "notifications" }),
);
// 동기화 엔드포인트는 외부 사이트를 긁어 오므로 남용 시 상대 사이트에 부담이 간다.
app.use(
  "/api/contests",
  rateLimit({ windowMs: 10 * 60 * 1000, max: 60, name: "contests" }),
);

// 3000 포트는 데이터 전용 API 서버라서 화면은 따로 없다. 브라우저로 직접 열었을 때
// "Cannot GET /" 대신 웹사이트 주소를 안내해 주는 용도의 페이지.
app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
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
</html>`);
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "GongmoOn API is running",
  });
});

app.use("/api/ideas", ideaRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/auth", accountRouter);
app.use("/api/userdata", userDataRouter);
app.use("/api/contests", contestRouter);
app.use("/api/inquiries", inquiryRouter);

// 정의되지 않은 경로 — Express 기본 HTML 대신 표준 JSON으로 답한다.
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: { code: "NOT_FOUND", message: "찾을 수 없는 요청이에요." },
  });
});

// JSON 파싱 실패 등 라우트에서 잡지 못한 오류도 표준 응답 형식({ success, error })으로 돌려줍니다.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      success: false,
      error: {
        code: "INVALID_REQUEST",
        message: "요청 본문이 올바른 JSON이 아니에요.",
      },
    });
    return;
  }
  // 요청 본문이 2mb 한도를 넘으면 Express가 413으로 던진다 — 500으로 뭉개지 않게 분기한다.
  if (
    typeof err === "object" &&
    err !== null &&
    "type" in err &&
    (err as { type?: string }).type === "entity.too.large"
  ) {
    res.status(413).json({
      success: false,
      error: {
        code: "PAYLOAD_TOO_LARGE",
        message: "요청 본문이 너무 커요. 내용을 줄여 주세요.",
      },
    });
    return;
  }
  console.error("[server] 알 수 없는 오류:", err);
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL", message: "서버 내부 오류가 발생했어요." },
  });
});

// 배포 환경(VPS·PaaS)에서는 PORT 환경변수로 포트를 지정한다. 미지정 시 개발 기본값 3000.
const PORT = Number(process.env.PORT) || 3000;

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(
    `[알림] 이메일: ${emailConfigured() ? "SMTP 발송" : "로그 모드(SMTP 미설정)"}`,
  );
  // 게이트웨이 토큰(JWT)은 유효기간이 있어 만료되면 AI 분석이 함께 멈춘다.
  // 시작 시 남은 기간을 보여 관리자가 미리 갱신하도록 한다.
  const tokenNotice = getAiTokenNotice();
  if (tokenNotice) console.log(tokenNotice);
  // 만료된 로그인 세션을 시작 때 한 번 정리합니다.
  pruneExpiredSessions();
  startNotificationScheduler();
  // 위비티·콘테스트코리아에서 공모전을 자동 등록한다(최근 동기화가 있으면 건너뜀).
  startContestSyncScheduler();
});
