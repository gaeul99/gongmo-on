// ==========================================================
// OpenAI 기반 아이디어 분석 서비스
// 입력 아이디어와 실제 공모전·유사 사례 목록을 받아
// 유사도·분석 문구·추천 점수를 AI로 생성해 돌려줍니다.
// 사실 관계가 필요한 데이터(공모전 제목·링크 등)는 클라이언트가
// 보내온 실제 데이터에만 근거하고, AI는 그 위의 분석 문장만 만듭니다.
//
// 응답 시간은 출력 토큰 수에 비례합니다(게이트웨이 실측 ~100토큰/초 —
// 2026-10-12 기준 gpt-5.6-luna가 전체 JSON 2,788토큰을 28.4초 만에 생성).
// 한 번에 전부 생성하면 25초 예산을 깨므로, (1) 분석 본문과 (2) 공모전
// 적합도 점수를 두 요청으로 쪼개 동시에 보냅니다 — 벽시계 시간은 느린
// 쪽(본문)에 맞춰지고, 점수 요청만 실패하면 본문은 살려 돌려줍니다.
// ==========================================================
import OpenAI from "openai";

export type AnalyzeRequestIdea = {
  title: string;
  description: string;
  category: string;
};

export type AnalyzeReferenceCase = {
  id: number;
  title: string;
  organizer: string;
  domain: string;
};

export type AnalyzeContest = {
  id: number;
  title: string;
  organizer: string;
  field: string;
  deadline: string;
};

export type AnalyzeRequestBody = {
  idea: AnalyzeRequestIdea;
  referenceCases: AnalyzeReferenceCase[];
  contests: AnalyzeContest[];
};

export type SimilarCaseAnalysis = {
  id: number;
  similarity: number;
  summary: string;
  overlap: string[];
  difference: string;
};

export type ContestAnalysis = {
  id: number;
  matchScore: number;
  matchReason: string;
};

// 상세 분석 — 아이디어 요약과 여러 각도의 참고 의견 목록
export type IdeaDetailAnalysis = {
  ideaSummary: string;
  targetUsers: string[];
  strengths: string[];
  improvements: string[];
  judgePoints: string[];
  extensionIdeas: string[];
};

export type IdeaAnalysis = {
  overallNotice: string;
  differentiationTip: string;
  detail: IdeaDetailAnalysis;
  similarCases: SimilarCaseAnalysis[];
  contests: ContestAnalysis[];
};

export class AiNotConfiguredError extends Error {
  constructor() {
    super("OpenAI API 키가 설정되지 않았습니다.");
    this.name = "AiNotConfiguredError";
  }
}

export class AiUpstreamError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiUpstreamError";
  }
}

export class AiRequestTooLargeError extends Error {
  constructor() {
    super("분석 요청이 허용 범위를 초과했습니다.");
    this.name = "AiRequestTooLargeError";
  }
}

// 게이트웨이 토큰(JWT)은 유효기간이 있고, 만료되면 모든 호출이 401로 거절된다.
// 일반 업스트림 오류와 구분해 관리자에게 토큰 갱신이 필요하다고 알려주기 위한 전용 오류다.
export class AiKeyExpiredError extends Error {
  constructor() {
    super("AI 인증 토큰이 만료되었습니다.");
    this.name = "AiKeyExpiredError";
  }
}

// .env에 아직 예시 문구(여기에_API_KEY)가 들어 있는 경우도 미설정으로 봅니다.
const PLACEHOLDER_KEYS = new Set(["", "여기에_API_KEY"]);

export function isAiConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  return !PLACEHOLDER_KEYS.has(key);
}

// OpenAI SDK 오류 중 401 'expired_key'(토큰 만료)만 골라낸다. 그 외 401은
// 키 자체가 잘못된 경우라 만료와 다르게 안내해야 한다.
export function isExpiredKeyError(error: unknown): boolean {
  const status = (error as { status?: number } | null)?.status;
  if (status !== 401) return false;
  const code = (error as { code?: string } | null)?.code;
  if (code === "expired_key") return true;
  const bodyCode = (error as { error?: { code?: string } } | null)?.error?.code;
  if (bodyCode === "expired_key") return true;
  const message = error instanceof Error ? error.message : String(error);
  return /expired/i.test(message);
}

const MAX_ANALYSIS_ITEMS = 60;
const MAX_ANALYSIS_TEXT_CHARS = 25_000;

export function estimateAnalysisBudget(body: AnalyzeRequestBody): {
  totalItems: number;
  totalTextChars: number;
  tooLarge: boolean;
} {
  const items = [...body.referenceCases, ...body.contests];
  const totalTextChars = items.reduce((total, item) => {
    const candidate = Object.values(item as Record<string, unknown>)
      .filter((value): value is string => typeof value === "string")
      .join(" ");
    return total + candidate.length;
  }, 0);

  return {
    totalItems: items.length,
    totalTextChars,
    tooLarge:
      items.length > MAX_ANALYSIS_ITEMS ||
      totalTextChars > MAX_ANALYSIS_TEXT_CHARS,
  };
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey || PLACEHOLDER_KEYS.has(apiKey)) {
    throw new AiNotConfiguredError();
  }
  // OPENAI_BASE_URL이 있으면 OpenAI 호환 중계 게이트웨이(엘리스 mlapi.run 등)를 쓴다.
  // 프론트가 분석을 30초 안에 받기로 약속했으므로 백엔드가 먼저(25초) 포기한다 —
  // 재시도는 예산 안에 못 끝나므로 끈다(끄지 않으면 실패 후 재생성으로 2배 걸린다).
  const options: ConstructorParameters<typeof OpenAI>[0] = {
    apiKey,
    timeout: 25_000,
    maxRetries: 0,
  };
  const baseURL = process.env.OPENAI_BASE_URL?.trim();
  if (baseURL) options.baseURL = baseURL;
  return new OpenAI(options);
}

// 요청 1 — 분석 본문(요약·강점·보완점·심사 포인트·확장·유사 사례).
// 각 항목을 '정확히 한 문장'으로 묶어 출력 토큰을 줄인다 — 문장 수가 곧 시간이다.
const CORE_SYSTEM_PROMPT = `당신은 대한민국 공모전 아이디어 분석 도우미입니다. 사용자가 입력한 아이디어를 분석해 아래 JSON 형식으로만 답하세요.

{
  "overallNotice": "중복 가능성이 높은지·보통인지·낮은지를 분명히 밝히고 근거를 덧붙인 1~2문장 평가",
  "differentiationTip": "차별화 포인트를 어떻게 다듬으면 좋은지 2~3문장 안내",
  "ideaSummary": "(대상)·(문제)·(방법)이 드러나는, 쉬운 말의 매우 짧은 한 문장 요약(30자 이내)",
  "targetUsers": ["예상 타깃 사용자 3개(누가 + 어떤 상황에서 + 왜 필요한지가 담긴 정확히 한 문장)"],
  "strengths": ["강점 3개(입력 설명의 근거를 인용한 정확히 한 문장)"],
  "improvements": ["보완하면 좋은 점 3개(무엇을 어떻게 바꿀지의 행동 지침 한 문장)"],
  "judgePoints": ["심사에서 어필할 포인트 3개('심사 기준 — 내용' 형태의 한 문장)"],
  "extensionIdeas": ["확장 아이디어 3개(확장 대상·방법이 구체적인 한 문장)"],
  "similarCases": [
    { "id": 숫자, "similarity": 0부터 100 사이 정수, "summary": "1~2문장 분석 요약", "overlap": ["겹치는 점 3개(짧은 구절)"], "difference": "다른 점과 차별화 제안 1~2문장" }
  ]
}

규칙:
- 모든 문장은 한국어로 쓰고, 입력된 아이디어 제목과 설명의 고유한 단어(기능·대상·상황)를 문맥에 맞게 직접 인용하세요.
- ideaSummary는 '(대상)이 (문제)를 (방식)으로 돕는' 뜻이 담긴 30자 이내 초단문으로 쓰세요. 기대 효과·이유·부연 설명을 덧붙이지 말고, 쉼표로 절을 이어 늘리지 마세요. 어려운 한자어·문어체(~하도록, ~를 제공·지원하는)를 피해 말하듯 쉬운 표현(~하게 도와주는)으로 쓰세요.
- targetUsers는 단순 신분 나열(예: 대학생)만 쓰지 말고 그 사용자가 겪는 상황까지 담으세요.
- strengths·improvements·judgePoints·extensionIdeas는 어떤 아이디어에나 붙일 수 있는 일반론을 쓰지 마세요. 반드시 입력 아이디어의 실제 단어나 상황에 근거하세요.
- improvements 각 항목은 '무엇을 어떻게 바꾸면 출품에서 유리해지는지'를 알려 주는 다음 단계처럼 쓰세요.
- 입력 설명에 숫자 목표(대상 사용자 수·절감 시간 등)가 있으면 strengths와 judgePoints의 '기대 효과'에서 그 수치를 그대로 인용해 효과로 연결하세요. 설명에 숫자가 전혀 없다면 improvements 한 항목에서 설명에 정량 목표(누구에게 얼마나)를 넣는 행동 지침을 주세요.
- judgePoints 각 항목은 공모전 심사 기준(주제 적합성·실현 가능성·차별성·기대 효과) 중 무엇에 대응하는지 '기준 — 내용' 형태로 시작하세요.
- extensionIdeas는 입력 자원으로 바로 시도할 수 있는 확장을 최소 1개 포함하세요.
- similarCases에는 전달된 모든 사례의 id를 빠짐없이 포함하세요.
- targetUsers·strengths·improvements·judgePoints·extensionIdeas는 각각 정확히 3개 항목을 담습니다.
- 근거 없는 사실(실존 서비스·실제 수상 내역·통계 수치)을 새로 만들어 내지 말고, 입력과 전달된 사례 정보 안에서만 분석하세요.
- 유사도가 높은 사례일수록 겹치는 점(overlap)을 구체적으로 짚어 주세요.
- 답이 길어지면 전달이 늦어집니다. 각 항목은 지정한 문장 수를 지키고, 근거가 담기는 선에서 짧게 유지하세요.`;

// 요청 2 — 공모전 적합도 점수. 본문과 필요로 하는 컨텍스트가 달라(후보 16건 vs 사례 3건)
// 프롬프트를 나누면 각자 입력도 작아지고, 동시 요청으로 전체 시간은 느린 쪽에 맞춰진다.
const SCORE_SYSTEM_PROMPT = `당신은 대한민국 공모전 추천 도우미입니다. 사용자 아이디어와 공모전 후보 목록을 받아 각 공모전의 주제 적합성을 평가해 아래 JSON 형식으로만 답하세요.

{
  "contests": [
    { "id": 숫자, "matchScore": 0부터 100 사이 정수, "matchReason": "추천 이유를 담은 정확히 한 문장" }
  ]
}

규칙:
- contests에는 전달된 모든 공모전의 id를 빠짐없이 포함하세요.
- matchReason은 한국어로 쓰고, 아이디어의 핵심 단어(기능·대상·상황)를 직접 인용해 한 문장으로 유지하세요.
- matchScore는 주제 적합성 기준으로 아래 구간을 지켜 차등 있게 매기세요. 점수가 비슷하게 몰리면 추천 정보가 사라지므로 무관한 공모전은 낮은 점수를 주는 것을 피하지 마세요.
  · 81~100: 제안서의 핵심 주제와 공모전 주제가 직접 연결되고, 아이디어를 그대로 출품할 수 있는 경우
  · 56~80: 아이디어를 크게 바꾸지 않고도 출품 주제에 맞출 수 있는 경우
  · 26~55: 아이디어를 비틀거나 확장해야만 제안할 수 있는 주변부 주제인 경우
  · 0~25: 주제·출품 형식이 아이디어와 맞지 않는 경우
- matchScore가 낮은(55 이하) 공모전의 matchReason은 추천 문구처럼 쓰지 말고, 어떤 조건을 갖추면 제안해 볼 만한지 또는 왜 어긋나는지 솔직하게 한 문장으로 적으세요.
- 근거 없는 사실(실존 서비스·실제 수상 내역·통계 수치)을 새로 만들어 내지 말고, 전달된 정보 안에서만 판단하세요.`;

function buildCoreUserPrompt(body: AnalyzeRequestBody): string {
  return [
    "[사용자 아이디어]",
    JSON.stringify(body.idea, null, 2),
    "",
    "[분석 대상 유사 사례 (실제 공모전)]",
    JSON.stringify(body.referenceCases, null, 2),
  ].join("\n");
}

function buildScoreUserPrompt(body: AnalyzeRequestBody): string {
  // 점수 판단에 필요한 필드만 남긴다 — 설명·신청 절차 문장은 토큰만 늘리고 판단에 불필요하다.
  const contestDigest = body.contests.map(
    ({ id, title, organizer, field, deadline }) => ({
      id,
      title,
      organizer,
      field,
      deadline,
    }),
  );
  return [
    "[사용자 아이디어]",
    JSON.stringify(body.idea, null, 2),
    "",
    "[추천 후보 공모전 (실제 접수 중)]",
    JSON.stringify(contestDigest, null, 2),
  ].join("\n");
}

function clampScore(value: unknown, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(0, Math.round(value)));
}

function asText(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() !== ""
    ? value.trim()
    : fallback;
}

function asTextList(value: unknown, fallbacks: string[]): string[] {
  if (!Array.isArray(value)) return [...fallbacks];
  const list = value
    .filter(
      (item): item is string => typeof item === "string" && item.trim() !== "",
    )
    .map((item) => item.trim());
  while (list.length < fallbacks.length) {
    list.push(fallbacks[list.length] ?? "");
  }
  return list.slice(0, fallbacks.length);
}

// AI 응답을 요청한 id 개수에 맞게 보정합니다. 누락·과다·형식 오류가 있어도
// 클라이언트가 바로 그릴 수 있는 완전한 형태로 만들어 돌려줍니다.
// scoreRaw는 공모전 점수 요청의 응답(실패 시 null) — 비어 있으면 contests를
// 빈 배열로 돌려 프론트가 목업 점수를 그대로 쓰게 합니다(mergeAnalysis).
function normalizeAnalysis(
  coreRaw: unknown,
  scoreRaw: unknown,
  body: AnalyzeRequestBody,
): IdeaAnalysis {
  const root = (
    typeof coreRaw === "object" && coreRaw !== null ? coreRaw : {}
  ) as Record<string, unknown>;
  const rawSimilar = Array.isArray(root.similarCases) ? root.similarCases : [];
  const scoreRoot = (
    typeof scoreRaw === "object" && scoreRaw !== null ? scoreRaw : {}
  ) as Record<string, unknown>;
  const rawContests = Array.isArray(scoreRoot.contests)
    ? scoreRoot.contests
    : [];

  const findEntry = (list: unknown[], id: number) =>
    list.find((item) => (item as Record<string, unknown>)?.id === id) as
      | Record<string, unknown>
      | undefined;

  const similarCases: SimilarCaseAnalysis[] = body.referenceCases.map(
    (referenceCase) => {
      const entry = findEntry(rawSimilar, referenceCase.id);
      return {
        id: referenceCase.id,
        similarity: clampScore(entry?.similarity, 50),
        summary: asText(
          entry?.summary,
          `${referenceCase.title} 관련 실제 공모전입니다. 아이디어와의 관계를 직접 확인해 보세요.`,
        ),
        overlap: asTextList(entry?.overlap, [
          `${referenceCase.domain} 주제의 실제 공모 사례`,
          "아이디어와 겹치는 주제·대상",
          "공모전 심사 구조",
        ]),
        difference: asText(
          entry?.difference,
          "전달된 사례 정보 안에서 아이디어만의 차별화 포인트를 한 문장으로 정리해 보세요.",
        ),
      };
    },
  );

  // 점수 응답이 아예 없으면 빈 배열 — 일부만 왔을 때는 없는 id를 기본값으로 채운다.
  const contests: ContestAnalysis[] =
    rawContests.length === 0
      ? []
      : body.contests.map((contest) => {
          const entry = findEntry(rawContests, contest.id);
          return {
            id: contest.id,
            matchScore: clampScore(entry?.matchScore, 50),
            matchReason: asText(
              entry?.matchReason,
              `${contest.title}에 제안해 볼 수 있는지 검토해 보세요.`,
            ),
          };
        });

  const detail: IdeaDetailAnalysis = {
    ideaSummary: asText(
      root.ideaSummary,
      "입력 내용을 한 문장으로 다시 정리해 보세요.",
    ),
    targetUsers: asTextList(root.targetUsers, [
      "아이디어 문제를 직접 겪는 핵심 사용자",
      "사용자를 돕는 보호자·관리자",
      "심사위원이 체감할 수 있는 일반 이용자",
    ]),
    strengths: asTextList(root.strengths, [
      "문제 의식이 명확해 주제 공감대가 높습니다.",
      "입력에 해결 방식이 담겨 있어 기획 설명이 쉽습니다.",
      "공모전 제안서로 바로 발전시킬 수 있는 구조입니다.",
    ]),
    improvements: asTextList(root.improvements, [
      "핵심 사용자의 구체적 사례나 수치를 덧붙이세요.",
      "동작 화면(와이어프레임·목업)을 1장 이상 준비하세요.",
      "유사 시도와의 차이를 한 문장으로 요약하세요.",
    ]),
    judgePoints: asTextList(root.judgePoints, [
      "주제 적합성 — 공모전 주제 문구와 문제 정의를 맞추세요.",
      "실현 가능성 — 만들 수 있는 범위로 기능을 좁히세요.",
      "기대 효과 — 측정 가능한 숫자로 표현하세요.",
    ]),
    extensionIdeas: asTextList(root.extensionIdeas, [
      "같은 방식을 다른 분야에 적용한 확장판을 제시해 보세요.",
      "기록이 쌓일수록 유용한 데이터 기반 기능을 더하세요.",
      "단계적 확장 로드맵을 덧붙여 보세요.",
    ]),
  };

  return {
    overallNotice: asText(
      root.overallNotice,
      "유사 사례를 참고해 차별화 요소를 검토하세요.",
    ),
    differentiationTip: asText(
      root.differentiationTip,
      "유사 사례들의 다른 점을 참고해 내 아이디어만의 차별화 포인트를 1~2개 문장으로 정리해 보세요.",
    ),
    detail,
    similarCases,
    contests,
  };
}

// 출력 토큰 상한 — 출력이 길수록 생성이 느려지므로 런어웨이만 막는다.
// 본문(분석 문장 + 유사 사례 3건)과 점수(후보 16건)를 나눠 담는 크기다.
// (게이트웨이는 비스트리밍 응답에 2,000토큰 상한이 있지만, 스트리밍이면 허용된다.)
const CORE_MAX_OUTPUT_TOKENS = 3_000;
const SCORE_MAX_OUTPUT_TOKENS = 1_500;

// 요청 하나당 스트림 예산(초). 프론트 약속 30초 안에 두 요청(동시 실행)이
// 모두 끝나야 하므로 각각 25초로 묶는다.
const STREAM_BUDGET_MS = 25_000;

// JSON 하나를 스트리밍으로 받아 조각을 모은다. 게이트웨이는 비스트리밍 응답에
// 토큰 상한을 두고 긴 답은 스트리밍으로 받으라고 안내한다. SDK 타임아웃이 응답
// 헤더 수신까지만 묶는 경우를 대비해 스트림 소비에도 예산을 직접 건다.
async function streamChatJSON(
  client: OpenAI,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  maxOutputTokens: number,
): Promise<string> {
  // gpt-5 계열은 temperature 기본값(1)만 허용하고 max_tokens 대신
  // max_completion_tokens를 쓴다. 모델명이 'openai/gpt-5.6-luna'처럼
  // 접두사를 가질 수 있어 마지막 조각으로 판정한다.
  const bareModel = model.split("/").pop() ?? model;
  const isGpt5Family = bareModel.startsWith("gpt-5");
  const stream = await client.chat.completions.create({
    model,
    response_format: { type: "json_object" },
    stream: true,
    ...(isGpt5Family
      ? {
          max_completion_tokens: maxOutputTokens,
          reasoning_effort: "low" as const,
        }
      : { max_tokens: maxOutputTokens }),
    ...(isGpt5Family ? {} : { temperature: 0.6 }),
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });
  const streamTimeout = setTimeout(
    () => stream.controller.abort(),
    STREAM_BUDGET_MS,
  );
  try {
    let contentText = "";
    for await (const chunk of stream) {
      contentText += chunk.choices[0]?.delta?.content ?? "";
    }
    return contentText.trim();
  } finally {
    clearTimeout(streamTimeout);
  }
}

// 같은 입력에 대한 분석 결과를 잠깐 기억해 재요청 시 동일한 결과를 돌려줍니다.
// gpt-5 계열은 temperature가 기본값(1)으로 고정되어 실행마다 점수·문구가 조금씩
// 달라지므로, 반복 시행 결과의 일관성 확보와 토큰 절약을 위해 캐시로 보완합니다.
const ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000;
const ANALYSIS_CACHE_MAX = 50;
const analysisCache = new Map<
  string,
  { value: IdeaAnalysis; expiresAt: number }
>();

function analysisCacheKey(body: AnalyzeRequestBody): string {
  return JSON.stringify([
    body.idea.title,
    body.idea.description,
    body.idea.category,
    body.referenceCases.map((item) => item.id),
    body.contests.map((item) => item.id),
  ]);
}

function getCachedAnalysis(key: string): IdeaAnalysis | null {
  const hit = analysisCache.get(key);
  if (!hit) return null;
  if (hit.expiresAt < Date.now()) {
    analysisCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCachedAnalysis(key: string, value: IdeaAnalysis): void {
  if (analysisCache.size >= ANALYSIS_CACHE_MAX) {
    const oldest = analysisCache.keys().next().value;
    if (oldest !== undefined) analysisCache.delete(oldest);
  }
  analysisCache.set(key, {
    value,
    expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS,
  });
}

// 스트림 실패 원인을 서비스 오류로 바꾼다. 토큰 만료(401 expired_key)만 전용 오류로
// 골라내고, 나머지는 모두 업스트림 오류로 포장한다.
function toAiServiceError(reason: unknown): Error {
  if (isExpiredKeyError(reason)) return new AiKeyExpiredError();
  const message = reason instanceof Error ? reason.message : String(reason);
  return new AiUpstreamError(`OpenAI 호출에 실패했습니다: ${message}`);
}

export async function analyzeIdea(
  body: AnalyzeRequestBody,
): Promise<IdeaAnalysis> {
  const budget = estimateAnalysisBudget(body);
  if (budget.tooLarge) {
    throw new AiRequestTooLargeError();
  }

  // dotenv가 라우트 import보다 늦게 로드되므로 모델명은 모듈 레벨이 아니라 호출 시점에 읽는다.
  // 중계 게이트웨이는 'openai/gpt-5.6-luna'처럼 접두사 붙은 모델명을 요구한다.
  const AI_MODEL = process.env.OPENAI_MODEL?.trim() || "gpt-4o-mini";
  const client = getClient();
  const cacheKey = analysisCacheKey(body);
  const cached = getCachedAnalysis(cacheKey);
  if (cached) return cached;

  // 본문과 점수를 동시에 요청한다. 본문 실패는 분석 전체 실패(목업 대체)지만,
  // 점수 실패는 본문을 살린다 — 프론트가 점수만 목업 값으로 채워 보여 준다.
  const [coreResult, scoreResult] = await Promise.allSettled([
    streamChatJSON(
      client,
      AI_MODEL,
      CORE_SYSTEM_PROMPT,
      buildCoreUserPrompt(body),
      CORE_MAX_OUTPUT_TOKENS,
    ),
    streamChatJSON(
      client,
      AI_MODEL,
      SCORE_SYSTEM_PROMPT,
      buildScoreUserPrompt(body),
      SCORE_MAX_OUTPUT_TOKENS,
    ),
  ]);

  if (coreResult.status === "rejected") {
    throw toAiServiceError(coreResult.reason);
  }
  if (scoreResult.status === "rejected") {
    console.error(
      "[ai] 공모전 점수 생성에 실패해 본문 분석만 반환합니다:",
      scoreResult.reason,
    );
  }

  const coreContent = coreResult.value;
  if (!coreContent) {
    throw new AiUpstreamError("모델 응답이 비어 있습니다.");
  }

  let coreParsed: unknown;
  try {
    coreParsed = JSON.parse(coreContent);
  } catch {
    throw new AiUpstreamError("모델 응답을 JSON으로 해석하지 못했습니다.");
  }

  let scoreParsed: unknown = null;
  if (scoreResult.status === "fulfilled" && scoreResult.value) {
    try {
      scoreParsed = JSON.parse(scoreResult.value);
    } catch {
      console.error(
        "[ai] 공모전 점수 응답을 JSON으로 해석하지 못해 점수를 폐기합니다.",
      );
    }
  }

  const analysis = normalizeAnalysis(coreParsed, scoreParsed, body);
  setCachedAnalysis(cacheKey, analysis);
  return analysis;
}

// 게이트웨이 토큰(JWT)의 만료일을 읽어 서버 시작 로그로 알려준다.
// 토큰이 만료되면 분석·챗봇이 한꺼번에 멈추므로 관리자가 미리 갱신할 수 있게
// 남은 기간을 시작 시점에 보여 준다. JWT가 아닌 키(공식 OpenAI sk-... 등)는
// 만료 정보가 없어 아무것도 출력하지 않는다.
const TOKEN_WARN_DAYS = 3;

export function getAiTokenNotice(): string | null {
  const key = process.env.OPENAI_API_KEY?.trim() ?? "";
  const segments = key.split(".");
  if (segments.length !== 3) return null;
  let payload: { exp?: number };
  try {
    payload = JSON.parse(
      Buffer.from(segments[1] ?? "", "base64url").toString("utf8"),
    );
  } catch {
    return null;
  }
  if (typeof payload.exp !== "number") return null;

  const expiresAt = new Date(payload.exp * 1000).toLocaleString("ko-KR");
  const daysLeft = Math.ceil((payload.exp * 1000 - Date.now()) / 86_400_000);
  if (daysLeft <= 0) {
    return `[경고] AI 인증 토큰이 만료되었습니다(${expiresAt}). mlapi.run에서 재발급한 토큰으로 backend/.env의 OPENAI_API_KEY를 교체하세요.`;
  }
  if (daysLeft <= TOKEN_WARN_DAYS) {
    return `[경고] AI 인증 토큰이 ${daysLeft}일 뒤 만료됩니다(${expiresAt}). 미리 재발급해 교체해 두세요.`;
  }
  return `[AI] 인증 토큰 만료까지 ${daysLeft}일 남았습니다(${expiresAt}).`;
}
