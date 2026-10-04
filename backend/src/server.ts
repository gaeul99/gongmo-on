import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import type { NextFunction, Request, Response } from "express";
import { ideaRouter } from "./routes/idea.routes";
import { chatRouter } from "./routes/chat.routes";
import { notificationRouter } from "./routes/notification.routes";
import { feedbackRouter } from "./routes/feedback.routes";
import { startNotificationScheduler } from "./services/notificationScheduler";
import { emailConfigured, smsConfigured } from "./services/notificationSenders";

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

// 3000 포트는 데이터 전용 API 서버라서 화면은 따로 없다. 브라우저로 직접 열었을 때
// "Cannot GET /" 대신 웹사이트 주소를 안내해 주는 용도의 페이지.
app.get("/", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>공내비 API 서버</title>
<style>
  :root { color-scheme: light; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: "Pretendard", "Malgun Gothic", "Apple SD Gothic Neo", sans-serif;
    background: #f5f3ff;
    color: #1e1b2e;
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
    border: 1px solid #e9e4fb;
    border-radius: 20px;
    padding: 40px 36px 32px;
    box-shadow: 0 18px 40px rgba(109, 40, 217, 0.10);
  }
  .logo {
    width: 48px; height: 48px;
    border-radius: 14px;
    background: #6d28d9;
    color: #fff;
    font-size: 24px; font-weight: 800;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 20px;
  }
  h1 { font-size: 24px; margin-bottom: 8px; }
  .lead { font-size: 14px; line-height: 1.7; color: #6b6680; margin-bottom: 24px; }
  .lead strong { color: #6d28d9; }
  .cta {
    display: inline-block;
    background: #6d28d9;
    color: #fff;
    text-decoration: none;
    font-size: 14px; font-weight: 700;
    padding: 12px 22px;
    border-radius: 999px;
    margin-bottom: 28px;
  }
  .cta:hover { background: #5b21b6; }
  .endpoints { border-top: 1px solid #eee9fb; padding-top: 20px; }
  .endpoints h2 { font-size: 12px; font-weight: 700; letter-spacing: 0.08em; color: #9a94ad; margin-bottom: 12px; }
  .row { display: flex; align-items: center; gap: 10px; padding: 6px 0; font-size: 13px; }
  code { font-family: Consolas, "D2Coding", monospace; font-size: 12.5px; color: #3b3550; }
  .method {
    flex: 0 0 44px;
    text-align: center;
    font-size: 10.5px; font-weight: 800;
    border-radius: 6px;
    padding: 3px 0;
  }
  .get { background: #e7f6ec; color: #1e7c3a; }
  .post { background: #f1eafd; color: #6d28d9; }
  .desc { margin-left: auto; color: #9a94ad; font-size: 12px; }
  footer { margin-top: 24px; font-size: 12px; color: #b3adc2; }
</style>
</head>
<body>
  <main class="card">
    <div class="logo">공</div>
    <h1>공내비 API 서버</h1>
    <p class="lead">
      이 서버는 공내비의 <strong>데이터와 AI 분석</strong>을 담당하는 백엔드예요.
      웹사이트 화면은 5173 포트에서 실행됩니다.
    </p>
    <a class="cta" href="http://localhost:5173">공내비 웹사이트 열기 &rarr;</a>
    <section class="endpoints">
      <h2>API 엔드포인트</h2>
      <div class="row"><span class="method get">GET</span><code>/api/health</code><span class="desc">서버 상태 확인</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/ideas/analyze</code><span class="desc">아이디어 분석 (AI)</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/chat</code><span class="desc">나비 챗봇</span></div>
      <div class="row"><span class="method get">GET</span><code>/api/chat/config</code><span class="desc">챗봇 서버 키 보유 여부</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/notifications/subscribe</code><span class="desc">알림 구독 등록</span></div>
      <div class="row"><span class="method get">GET</span><code>/api/notifications/stats</code><span class="desc">알림 발송 통계</span></div>
      <div class="row"><span class="method get">GET</span><code>/api/notifications/outbox</code><span class="desc">발송 기록</span></div>
      <div class="row"><span class="method get">GET</span><code>/api/notifications/channels</code><span class="desc">채널 상태</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/notifications/run</code><span class="desc">알림 수동 점검</span></div>
      <div class="row"><span class="method post">POST</span><code>/api/feedback</code><span class="desc">유형 검사 추천 평가 기록</span></div>
      <div class="row"><span class="method get">GET</span><code>/api/feedback/stats</code><span class="desc">추천 평가 집계</span></div>
    </section>
    <footer>GongNabi API &middot; 개발 서버 &middot; http://localhost:3000</footer>
  </main>
</body>
</html>`);
});

app.get("/api/health", (req, res) => {
  res.json({
    success: true,
    message: "GongNabi API is running",
  });
});

app.use("/api/ideas", ideaRouter);
app.use("/api/chat", chatRouter);
app.use("/api/notifications", notificationRouter);
app.use("/api/feedback", feedbackRouter);

// JSON 파싱 실패 등 라우트에서 잡지 못한 오류도 표준 응답 형식({ success, error })으로 돌려줍니다.
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof SyntaxError && "body" in err) {
    res.status(400).json({
      success: false,
      error: { code: "INVALID_REQUEST", message: "요청 본문이 올바른 JSON이 아니에요." },
    });
    return;
  }
  console.error("[server] 알 수 없는 오류:", err);
  res.status(500).json({
    success: false,
    error: { code: "INTERNAL", message: "서버 내부 오류가 발생했어요." },
  });
});

app.listen(3000, () => {
  console.log("Server running on http://localhost:3000");
  console.log(
    `[알림] 이메일: ${emailConfigured() ? "SMTP 발송" : "로그 모드(SMTP 미설정)"} / 문자: ${
      smsConfigured() ? "Solapi 발송" : "로그 모드(Solapi 미설정)"
    }`,
  );
  startNotificationScheduler();
});

