// ==========================================================
// OpenAI 기반 아이디어 분석 서비스
// 입력 아이디어와 실제 공모전·유사 사례 목록을 받아
// 유사도·분석 문구·추천 점수를 AI로 생성해 돌려줍니다.
// 사실 관계가 필요한 데이터(공모전 제목·링크 등)는 클라이언트가
// 보내온 실제 데이터에만 근거하고, AI는 그 위의 분석 문장만 만듭니다.
// ==========================================================
import OpenAI from 'openai'

export type AnalyzeRequestIdea = {
  title: string
  description: string
  category: string
}

export type AnalyzeReferenceCase = {
  id: number
  title: string
  organizer: string
  domain: string
}

export type AnalyzeContest = {
  id: number
  title: string
  organizer: string
  field: string
  deadline: string
}

export type AnalyzeRequestBody = {
  idea: AnalyzeRequestIdea
  referenceCases: AnalyzeReferenceCase[]
  contests: AnalyzeContest[]
}

export type SimilarCaseAnalysis = {
  id: number
  similarity: number
  summary: string
  overlap: string[]
  difference: string
}

export type ContestAnalysis = {
  id: number
  matchScore: number
  matchReason: string
}

export type IdeaAnalysis = {
  overallNotice: string
  differentiationTip: string
  similarCases: SimilarCaseAnalysis[]
  contests: ContestAnalysis[]
}

export class AiNotConfiguredError extends Error {
  constructor() {
    super('OpenAI API 키가 설정되지 않았습니다.')
    this.name = 'AiNotConfiguredError'
  }
}

export class AiUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AiUpstreamError'
  }
}

// .env에 아직 예시 문구(여기에_API_KEY)가 들어 있는 경우도 미설정으로 봅니다.
const PLACEHOLDER_KEYS = new Set(['', '여기에_API_KEY'])

export function isAiConfigured(): boolean {
  const key = process.env.OPENAI_API_KEY?.trim() ?? ''
  return !PLACEHOLDER_KEYS.has(key)
}

function getClient(): OpenAI {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey || PLACEHOLDER_KEYS.has(apiKey)) {
    throw new AiNotConfiguredError()
  }
  // OPENAI_BASE_URL이 있으면 OpenAI 호환 중계 게이트웨이(엘리스 mlapi.run 등)를 쓴다.
  const options: ConstructorParameters<typeof OpenAI>[0] = { apiKey, timeout: 60_000, maxRetries: 1 }
  const baseURL = process.env.OPENAI_BASE_URL?.trim()
  if (baseURL) options.baseURL = baseURL
  return new OpenAI(options)
}

const SYSTEM_PROMPT = `당신은 대한민국 공모전 아이디어 분석 도우미입니다. 사용자가 입력한 아이디어를 분석해 아래 JSON 형식으로만 답하세요.

{
  "overallNotice": "아이디어 전체의 중복 가능성에 대한 1~2문장 평가",
  "differentiationTip": "차별화 포인트를 어떻게 다듬으면 좋은지 2~3문장 안내",
  "similarCases": [
    { "id": 숫자, "similarity": 0부터 100 사이 정수, "summary": "2~3문장 분석 요약", "overlap": ["겹치는 점 3개"], "difference": "다른 점과 차별화 제안 1~2문장" }
  ],
  "contests": [
    { "id": 숫자, "matchScore": 0부터 100 사이 정수, "matchReason": "2~3문장 추천 이유" }
  ]
}

규칙:
- 모든 문장은 한국어로 쓰고, 입력된 아이디어 제목과 설명을 구체적으로 언급하세요.
- similarCases에는 전달된 모든 사례의 id를, contests에는 전달된 모든 공모전의 id를 빠짐없이 포함하세요.
- 유사도가 높은 사례일수록 겹치는 점(overlap)을 구체적으로 짚어 주세요.
- matchScore가 높은 공모전일수록 아이디어와 주제 적합성이 높아야 합니다.
- 전달되지 않은 사실(실제 서비스의 존재, 실제 수상작 내용 등)을 만들어 내지 말고, 입력과 전달된 사례 정보 안에서만 분석하세요.`

function buildUserPrompt(body: AnalyzeRequestBody): string {
  return [
    '[사용자 아이디어]',
    JSON.stringify(body.idea, null, 2),
    '',
    '[분석 대상 유사 사례 (실제 공모전)]',
    JSON.stringify(body.referenceCases, null, 2),
    '',
    '[추천 후보 공모전 (실제 접수 중)]',
    JSON.stringify(body.contests, null, 2),
  ].join('\n')
}

function clampScore(value: unknown, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback
  return Math.min(100, Math.max(0, Math.round(value)))
}

function asText(value: unknown, fallback: string): string {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : fallback
}

function asTextList(value: unknown, fallbacks: string[]): string[] {
  if (!Array.isArray(value)) return [...fallbacks]
  const list = value
    .filter((item): item is string => typeof item === 'string' && item.trim() !== '')
    .map((item) => item.trim())
  while (list.length < fallbacks.length) {
    list.push(fallbacks[list.length] ?? '')
  }
  return list.slice(0, fallbacks.length)
}

// AI 응답을 요청한 id 개수에 맞게 보정합니다. 누락·과다·형식 오류가 있어도
// 클라이언트가 바로 그릴 수 있는 완전한 형태로 만들어 돌려줍니다.
function normalizeAnalysis(raw: unknown, body: AnalyzeRequestBody): IdeaAnalysis {
  const root = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  const rawSimilar = Array.isArray(root.similarCases) ? root.similarCases : []
  const rawContests = Array.isArray(root.contests) ? root.contests : []

  const findEntry = (list: unknown[], id: number) =>
    list.find((item) => (item as Record<string, unknown>)?.id === id) as
      | Record<string, unknown>
      | undefined

  const similarCases: SimilarCaseAnalysis[] = body.referenceCases.map((referenceCase) => {
    const entry = findEntry(rawSimilar, referenceCase.id)
    return {
      id: referenceCase.id,
      similarity: clampScore(entry?.similarity, 50),
      summary: asText(
        entry?.summary,
        `${referenceCase.title} 관련 실제 공모전입니다. 아이디어와의 관계를 직접 확인해 보세요.`,
      ),
      overlap: asTextList(entry?.overlap, [
        `${referenceCase.domain} 주제의 실제 공모 사례`,
        '아이디어와 겹치는 주제·대상',
        '공모전 심사 구조',
      ]),
      difference: asText(
        entry?.difference,
        '전달된 사례 정보 안에서 아이디어만의 차별화 포인트를 한 문장으로 정리해 보세요.',
      ),
    }
  })

  const contests: ContestAnalysis[] = body.contests.map((contest) => {
    const entry = findEntry(rawContests, contest.id)
    return {
      id: contest.id,
      matchScore: clampScore(entry?.matchScore, 50),
      matchReason: asText(
        entry?.matchReason,
        `${contest.title}에 제안해 볼 수 있는지 검토해 보세요.`,
      ),
    }
  })

  return {
    overallNotice: asText(
      root.overallNotice,
      '유사 사례를 참고해 차별화 요소를 검토하세요.',
    ),
    differentiationTip: asText(
      root.differentiationTip,
      '유사 사례들의 다른 점을 참고해 내 아이디어만의 차별화 포인트를 1~2개 문장으로 정리해 보세요.',
    ),
    similarCases,
    contests,
  }
}

// 같은 입력에 대한 분석 결과를 잠깐 기억해 재요청 시 동일한 결과를 돌려줍니다.
// gpt-5 계열은 temperature가 기본값(1)으로 고정되어 실행마다 점수·문구가 조금씩
// 달라지므로, 반복 시행 결과의 일관성 확보와 토큰 절약을 위해 캐시로 보완합니다.
const ANALYSIS_CACHE_TTL_MS = 10 * 60 * 1000
const ANALYSIS_CACHE_MAX = 50
const analysisCache = new Map<string, { value: IdeaAnalysis; expiresAt: number }>()

function analysisCacheKey(body: AnalyzeRequestBody): string {
  return JSON.stringify([
    body.idea.title,
    body.idea.description,
    body.idea.category,
    body.referenceCases.map((item) => item.id),
    body.contests.map((item) => item.id),
  ])
}

function getCachedAnalysis(key: string): IdeaAnalysis | null {
  const hit = analysisCache.get(key)
  if (!hit) return null
  if (hit.expiresAt < Date.now()) {
    analysisCache.delete(key)
    return null
  }
  return hit.value
}

function setCachedAnalysis(key: string, value: IdeaAnalysis): void {
  if (analysisCache.size >= ANALYSIS_CACHE_MAX) {
    const oldest = analysisCache.keys().next().value
    if (oldest !== undefined) analysisCache.delete(oldest)
  }
  analysisCache.set(key, { value, expiresAt: Date.now() + ANALYSIS_CACHE_TTL_MS })
}

export async function analyzeIdea(body: AnalyzeRequestBody): Promise<IdeaAnalysis> {
  // dotenv가 라우트 import보다 늦게 로드되므로 모델명은 모듈 레벨이 아니라 호출 시점에 읽는다.
  // 중계 게이트웨이는 'openai/gpt-5.6-luna'처럼 접두사 붙은 모델명을 요구한다.
  const AI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'
  const client = getClient()
  const cacheKey = analysisCacheKey(body)
  const cached = getCachedAnalysis(cacheKey)
  if (cached) return cached

  let content: string | null
  try {
    // gpt-5 계열은 temperature 기본값(1)만 허용하므로 구형 모델에만 0.6을 보낸다.
    // 모델명이 'openai/gpt-5.6-luna'처럼 접두사를 가질 수 있어 마지막 조각으로 판정한다.
    const bareModel = AI_MODEL.split('/').pop() ?? AI_MODEL
    const completion = await client.chat.completions.create({
      model: AI_MODEL,
      response_format: { type: 'json_object' },
      ...(bareModel.startsWith('gpt-5') ? {} : { temperature: 0.6 }),
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: buildUserPrompt(body) },
      ],
    })
    content = completion.choices[0]?.message?.content ?? null
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new AiUpstreamError(`OpenAI 호출에 실패했습니다: ${message}`)
  }

  if (!content) {
    throw new AiUpstreamError('모델 응답이 비어 있습니다.')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    throw new AiUpstreamError('모델 응답을 JSON으로 해석하지 못했습니다.')
  }

  const analysis = normalizeAnalysis(parsed, body)
  setCachedAnalysis(cacheKey, analysis)
  return analysis
}
