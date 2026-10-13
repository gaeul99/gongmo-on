// ==========================================================
// ai.service.ts 단위 테스트 — Vitest
// OpenAI SDK를 모킹해 스트리밍 응답을 흉내 내고,
// 오류 매핑(토큰 만료·업스트림)·응답 정규화·요청 예산·
// 게이트웨이 토큰 만료 공지·gpt-5 파라미터 분기를 검증합니다.
// npm test (backend/)로 실행합니다.
// ==========================================================
import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock이 코드 이동(hoist)되므로 모킹 안에서 쓰는 상태는 vi.hoisted로 만든다.
const streamState = vi.hoisted(() => ({
  coreText: "",
  scoreText: "",
  coreError: null as unknown,
  scoreError: null as unknown,
  calls: [] as Array<{ system: string; options: Record<string, unknown> }>,
}));

const resetStreamState = vi.hoisted(() => () => {
  streamState.coreText = "";
  streamState.scoreText = "";
  streamState.coreError = null;
  streamState.scoreError = null;
  streamState.calls = [];
});

vi.mock("openai", () => {
  type ChatOptions = {
    messages: Array<{ role: string; content: string }>;
  } & Record<string, unknown>;

  // 문자열을 여러 delta 조각으로 쪼개 스트리밍 응답을 흉내 낸다.
  const makeStream = (text: string) => {
    const chunks = [];
    for (let i = 0; i < text.length; i += 80) {
      chunks.push({ choices: [{ delta: { content: text.slice(i, i + 80) } }] });
    }
    return {
      controller: { abort: () => {} },
      async *[Symbol.asyncIterator]() {
        yield* chunks;
      },
    };
  };

  return {
    default: class MockOpenAI {
      chat = {
        completions: {
          create: async (options: ChatOptions) => {
            const system = options.messages[0]?.content ?? "";
            streamState.calls.push({ system, options });
            // 점수 프롬프트('공모전 추천 도우미')와 본문 프롬프트를 구분한다.
            if (system.includes("공모전 추천 도우미")) {
              if (streamState.scoreError) throw streamState.scoreError;
              return makeStream(streamState.scoreText);
            }
            if (streamState.coreError) throw streamState.coreError;
            return makeStream(streamState.coreText);
          },
        },
      };
    },
  };
});

import {
  AiKeyExpiredError,
  AiNotConfiguredError,
  AiUpstreamError,
  analyzeIdea,
  estimateAnalysisBudget,
  getAiTokenNotice,
  isAiConfigured,
  isExpiredKeyError,
  type AnalyzeRequestBody,
} from "./ai.service";

const validCoreResponse = {
  overallNotice: "중복 가능성이 낮은 편입니다.",
  differentiationTip: "알림 시점을 사용자가 고르게 하세요.",
  ideaSummary: "대학생이 공모 찾기를 알림으로 돕는 앱",
  targetUsers: ["타깃 1", "타깃 2", "타깃 3"],
  strengths: ["강점 1", "강점 2", "강점 3"],
  improvements: ["보완 1", "보완 2", "보완 3"],
  judgePoints: ["주제 적합성 — 내용", "실현 가능성 — 내용", "기대 효과 — 내용"],
  extensionIdeas: ["확장 1", "확장 2", "확장 3"],
  similarCases: [
    { id: 1, similarity: 77, summary: "요약", overlap: ["겹침1", "겹침2", "겹침3"], difference: "다른 점" },
  ],
};

const validScoreResponse = {
  contests: [
    { id: 5, matchScore: 88.4, matchReason: "주제가 직접 연결됩니다." },
    { id: 6, matchScore: 999, matchReason: "점수 상한 초과 응답." },
  ],
};

const makeBody = (title: string): AnalyzeRequestBody => ({
  idea: {
    title,
    description: "대학생 30만 명에게 마감 알림을 보내 탐색 시간을 줄이는 앱",
    category: "개발",
  },
  referenceCases: [{ id: 1, title: "유사 사례 A", organizer: "A사", domain: "개발" }],
  contests: [
    { id: 5, title: "공모전 다섯", organizer: "주최5", field: "개발", deadline: "2026-11-30" },
    { id: 6, title: "공모전 여섯", organizer: "주최6", field: "기획", deadline: "2026-12-31" },
  ],
});

const makeContest = (id: number): AnalyzeRequestBody["contests"][number] => ({
  id,
  title: `공모전 ${id}`,
  organizer: "주최사",
  field: "개발",
  deadline: "2026-11-30",
});

describe("isAiConfigured", () => {
  it("키가 비어 있거나 예시 문구면 false", () => {
    expect(isAiConfigured()).toBe(false); // beforeEach에서 ''로 스텁됨
    vi.stubEnv("OPENAI_API_KEY", "여기에_API_KEY");
    expect(isAiConfigured()).toBe(false);
  });

  it("실제 키가 있으면 true", () => {
    vi.stubEnv("OPENAI_API_KEY", "test-key-123");
    expect(isAiConfigured()).toBe(true);
  });
});

describe("isExpiredKeyError — 게이트웨이 토큰 만료 판별", () => {
  it("401 + code expired_key(최상위)는 true", () => {
    const error = Object.assign(new Error("The key has expired"), {
      status: 401,
      code: "expired_key",
    });
    expect(isExpiredKeyError(error)).toBe(true);
  });

  it("401 + 중첩 error.code expired_key(SDK 응답 본문)도 true", () => {
    const error = Object.assign(new Error("401 Unauthorized"), {
      status: 401,
      error: { code: "expired_key" },
    });
    expect(isExpiredKeyError(error)).toBe(true);
  });

  it("401이면서 메시지에 expired가 있으면 true", () => {
    const error = Object.assign(new Error("The key has expired"), { status: 401 });
    expect(isExpiredKeyError(error)).toBe(true);
  });

  it("401이라도 키 자체가 잘못된 경우는 false — 만료와 다르게 안내해야 한다", () => {
    const error = Object.assign(new Error("Incorrect API key provided"), {
      status: 401,
      code: "invalid_api_key",
    });
    expect(isExpiredKeyError(error)).toBe(false);
  });

  it("401이 아니면 false", () => {
    expect(isExpiredKeyError(Object.assign(new Error("boom"), { status: 500 }))).toBe(false);
    expect(isExpiredKeyError(null)).toBe(false);
  });
});

describe("estimateAnalysisBudget — 요청 크기 상한", () => {
  it("작은 요청은 통과한다", () => {
    const body = makeBody("작은 요청");
    const budget = estimateAnalysisBudget(body);
    expect(budget.tooLarge).toBe(false);
    expect(budget.totalItems).toBe(3); // 유사 사례 1 + 공모전 2
  });

  it("후보가 60건을 넘으면 tooLarge", () => {
    const referenceCases = Array.from({ length: 59 }, (_, i) => ({
      id: i + 1,
      title: `사례 ${i + 1}`,
      organizer: "주최사",
      domain: "개발",
    }));
    const contests = Array.from({ length: 2 }, (_, i) => makeContest(100 + i));
    expect(estimateAnalysisBudget({ ...makeBody("61건"), referenceCases, contests }).tooLarge).toBe(true);
  });

  it("후보가 정확히 60건이면 통과한다", () => {
    const referenceCases = Array.from({ length: 58 }, (_, i) => ({
      id: i + 1,
      title: `사례 ${i + 1}`,
      organizer: "주최사",
      domain: "개발",
    }));
    const contests = Array.from({ length: 2 }, (_, i) => makeContest(200 + i));
    expect(estimateAnalysisBudget({ ...makeBody("60건"), referenceCases, contests }).tooLarge).toBe(false);
  });

  it("항목이 적어도 텍스트 총량이 25,000자를 넘으면 tooLarge", () => {
    const referenceCases = [{ id: 1, title: "긴".repeat(26_000), organizer: "주최사", domain: "개발" }];
    expect(estimateAnalysisBudget({ ...makeBody("긴 텍스트"), referenceCases, contests: [] }).tooLarge).toBe(true);
  });
});

describe("getAiTokenNotice — 게이트웨이 토큰(JWT) 만료 공지", () => {
  const makeJwt = (expSeconds: number) => {
    const header = Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
    const payload = Buffer.from(JSON.stringify({ exp: expSeconds })).toString("base64url");
    return `${header}.${payload}.sig`;
  };

  it("JWT가 아니면 null", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-proj-openai-style-key");
    expect(getAiTokenNotice()).toBe(null);
  });

  it("만료까지 3일보다 멀면 안내 문구를 돌려준다", () => {
    vi.stubEnv("OPENAI_API_KEY", makeJwt(Math.floor(Date.now() / 1000) + 100 * 86_400));
    expect(getAiTokenNotice()).toMatch(/만료까지 100일 남았습니다/);
  });

  it("만료가 3일 이내로 다가오면 경고 문구를 돌려준다", () => {
    const exp = Math.floor((Date.now() + 2 * 86_400_000) / 1000);
    vi.stubEnv("OPENAI_API_KEY", makeJwt(exp));
    expect(getAiTokenNotice()).toMatch(/2일 뒤 만료됩니다/);
  });

  it("이미 만료된 토큰이면 재발급 안내 경고를 돌려준다", () => {
    const exp = Math.floor((Date.now() - 86_400_000) / 1000);
    vi.stubEnv("OPENAI_API_KEY", makeJwt(exp));
    expect(getAiTokenNotice()).toMatch(/토큰이 만료되었습니다/);
    expect(getAiTokenNotice()).toMatch(/재발급/);
  });

  it("페이로드를 해석할 수 없는 JWT는 null", () => {
    vi.stubEnv("OPENAI_API_KEY", "notJsonBase64.notJsonBase64.sig");
    expect(getAiTokenNotice()).toBe(null);
  });
});

describe("analyzeIdea — OpenAI 모킹", () => {
  beforeEach(() => {
    resetStreamState();
    vi.stubEnv("OPENAI_API_KEY", "test-key-123");
    vi.stubEnv("OPENAI_MODEL", "openai/gpt-5.6-luna");
    vi.stubEnv("OPENAI_BASE_URL", "");
  });

  it("완전한 응답을 정규화해 그대로 돌려준다", async () => {
    streamState.coreText = JSON.stringify(validCoreResponse);
    streamState.scoreText = JSON.stringify(validScoreResponse);

    const analysis = await analyzeIdea(makeBody("정규화-완전"));

    expect(analysis.overallNotice).toBe("중복 가능성이 낮은 편입니다.");
    expect(analysis.detail.ideaSummary).toBe("대학생이 공모 찾기를 알림으로 돕는 앱");
    expect(analysis.detail.strengths).toEqual(["강점 1", "강점 2", "강점 3"]);
    expect(analysis.similarCases).toHaveLength(1);
    expect(analysis.similarCases[0]).toMatchObject({ id: 1, similarity: 77 });
    // 점수는 반올림되고(88.4 → 88) 100을 넘으면 상한으로 잘린다(999 → 100)
    expect(analysis.contests).toEqual([
      { id: 5, matchScore: 88, matchReason: "주제가 직접 연결됩니다." },
      { id: 6, matchScore: 100, matchReason: "점수 상한 초과 응답." },
    ]);
  });

  it("항목이 3개를 넘는 응답은 앞의 3개만 남긴다", async () => {
    streamState.coreText = JSON.stringify({
      ...validCoreResponse,
      strengths: ["강점 1", "강점 2", "강점 3", "강점 4"],
    });
    streamState.scoreText = JSON.stringify(validScoreResponse);

    const analysis = await analyzeIdea(makeBody("정규화-초과항목"));
    expect(analysis.detail.strengths).toEqual(["강점 1", "강점 2", "강점 3"]);
  });

  it("응답에 빠진 필드는 기본값으로 채워 항상 유효한 결과를 보장한다", async () => {
    streamState.coreText = JSON.stringify({});
    streamState.scoreText = JSON.stringify({ contests: [{ id: 5, matchScore: "88" }] });

    const analysis = await analyzeIdea(makeBody("정규화-기본값"));

    expect(analysis.detail.targetUsers).toHaveLength(3);
    expect(analysis.detail.improvements[0]).toContain("수치");
    expect(analysis.detail.judgePoints[0]).toContain("주제 적합성");
    // 유사 사례는 요청 id마다 기본값으로 채워진다
    expect(analysis.similarCases[0]).toMatchObject({ id: 1, similarity: 50 });
    // 점수 응답에 없던 id 6은 기본 점수(50)·기본 문구로 채워진다
    expect(analysis.contests).toEqual([
      { id: 5, matchScore: 50, matchReason: "공모전 다섯에 제안해 볼 수 있는지 검토해 보세요." },
      { id: 6, matchScore: 50, matchReason: "공모전 여섯에 제안해 볼 수 있는지 검토해 보세요." },
    ]);
  });

  it("점수 요청만 실패하면 본문은 살리고 contests는 빈 배열로 돌려준다", async () => {
    streamState.coreText = JSON.stringify(validCoreResponse);
    streamState.scoreError = new Error("score stream failed");

    const analysis = await analyzeIdea(makeBody("점수-실패"));

    expect(analysis.detail.strengths).toEqual(["강점 1", "강점 2", "강점 3"]);
    expect(analysis.contests).toEqual([]);
  });

  it("토큰 만료(401 expired_key)는 전용 오류(AiKeyExpiredError)로 매핑한다", async () => {
    streamState.coreError = Object.assign(new Error("The key has expired"), {
      status: 401,
      code: "expired_key",
    });

    await expect(analyzeIdea(makeBody("만료"))).rejects.toBeInstanceOf(AiKeyExpiredError);
  });

  it("일반 호출 실패는 업스트림 오류로 포장한다", async () => {
    streamState.coreError = new Error("boom");

    await expect(analyzeIdea(makeBody("업스트림"))).rejects.toThrow(AiUpstreamError);
    await expect(analyzeIdea(makeBody("업스트림"))).rejects.toThrow(/boom/);
  });

  it("본문이 비어 있거나 JSON이 아니면 업스트림 오류를 던진다", async () => {
    streamState.coreText = "";
    streamState.scoreText = JSON.stringify(validScoreResponse);
    await expect(analyzeIdea(makeBody("빈-응답"))).rejects.toThrow("모델 응답이 비어");

    streamState.coreText = "안녕하세요, JSON이 아닙니다";
    await expect(analyzeIdea(makeBody("json-아님"))).rejects.toThrow("JSON으로 해석하지 못했습니다");
  });

  it("같은 입력 재요청은 캐시를 써서 OpenAI를 다시 호출하지 않는다", async () => {
    streamState.coreText = JSON.stringify(validCoreResponse);
    streamState.scoreText = JSON.stringify(validScoreResponse);

    const first = await analyzeIdea(makeBody("캐시-확인용-아이디어"));
    const callsAfterFirst = streamState.calls.length;
    const second = await analyzeIdea(makeBody("캐시-확인용-아이디어"));

    expect(second).toBe(first); // 같은 객체 — 캐시 히트
    expect(streamState.calls.length).toBe(callsAfterFirst);
  });

  it("키가 없으면 호출 전에 미설정 오류를 던진다", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(analyzeIdea(makeBody("미설정"))).rejects.toBeInstanceOf(AiNotConfiguredError);
    expect(streamState.calls).toHaveLength(0);
  });

  it("gpt-5 계열은 max_completion_tokens·reasoning_effort로 보내고 temperature·max_tokens는 생략한다", async () => {
    streamState.coreText = JSON.stringify(validCoreResponse);
    streamState.scoreText = JSON.stringify(validScoreResponse);
    await analyzeIdea(makeBody("파라미터-분기"));

    expect(streamState.calls).toHaveLength(2);
    for (const { options } of streamState.calls) {
      expect(options.max_tokens).toBeUndefined();
      expect(options.temperature).toBeUndefined();
      expect(options.max_completion_tokens).toBeTypeOf("number");
      expect(options.reasoning_effort).toBe("low");
    }
    // 본문(3,000)과 점수(1,500)의 출력 상한이 각각 적용된다
    const core = streamState.calls.find((call) => call.system.includes("아이디어 분석 도우미"));
    const score = streamState.calls.find((call) => call.system.includes("공모전 추천 도우미"));
    expect(core?.options.max_completion_tokens).toBe(3_000);
    expect(score?.options.max_completion_tokens).toBe(1_500);
  });
});
