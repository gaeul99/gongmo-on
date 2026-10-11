// ==========================================================
// 공내비 챗봇(나비) 서비스
// 프론트가 보내온 대화 기록과 대시보드 스냅숏을 시스템 프롬프트에
// 붙여 mlapi.run 게이트웨이의 gpt-5-luna 모델로 전달합니다.
// 기본은 서버 .env의 OPENAI_API_KEY로 대화하고, 요청 헤더(x-chat-key)로
// 사용자 키가 오면 그 키를 우선해 그 요청 안에서만 사용합니다.
// 어떤 키든 콘솔·파일 로그에 남기지 않습니다.
// ==========================================================
import OpenAI from 'openai'

export type ChatRole = 'user' | 'assistant'

export type ChatHistoryMessage = {
  role: ChatRole
  content: string
}

export class ChatKeyMissingError extends Error {
  constructor() {
    super('대화에 쓸 API 키가 없어요. 서버에 키가 설정되지 않았다면 챗봇 시작 화면에서 키를 입력해 주세요.')
    this.name = 'ChatKeyMissingError'
  }
}

export class ChatKeyRejectedError extends Error {
  constructor() {
    super('키가 거부되었어요. 올바른 API 키인지 확인하고 다시 입력해 주세요.')
    this.name = 'ChatKeyRejectedError'
  }
}

export class ChatUpstreamError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ChatUpstreamError'
  }
}

export class ChatTimeoutError extends Error {
  constructor() {
    super('모델 응답이 지연되고 있어요. 잠시 후 다시 시도해 주세요.')
    this.name = 'ChatTimeoutError'
  }
}

// .env의 분석용 키 예시 문구를 챗봇 키로도 쓰지 못하게 막습니다.
const PLACEHOLDER_KEYS = new Set(['', '여기에_API_KEY'])

// 챗봇 키 우선순위 — 요청 헤더(x-chat-key)로 온 사용자 키가 있으면 그것을 쓰고,
// 없으면 서버 .env의 OPENAI_API_KEY(분석 기능과 공유)로 폴백합니다. 둘 다 없으면
// ChatKeyMissingError. 서버 키 운영 방식은 계획서 9장이 남겨 둔 확장 경로다.
export type ChatKeySource = 'user' | 'server'

function resolveChatKey(headerKey: string): { key: string; source: ChatKeySource } {
  const trimmed = headerKey.trim()
  if (trimmed && !PLACEHOLDER_KEYS.has(trimmed)) {
    return { key: trimmed, source: 'user' }
  }
  const serverKey = process.env.OPENAI_API_KEY?.trim() ?? ''
  if (serverKey && !PLACEHOLDER_KEYS.has(serverKey)) {
    return { key: serverKey, source: 'server' }
  }
  throw new ChatKeyMissingError()
}

export function hasServerChatKey(): boolean {
  const serverKey = process.env.OPENAI_API_KEY?.trim() ?? ''
  return serverKey !== '' && !PLACEHOLDER_KEYS.has(serverKey)
}

// 계획서(artifacts/gongnabi-chatbot-plan.html)의 연결 정보. 환경변수로 바꿀 수 있게 남겨 둡니다.
// 모델은 2026-10-02 실측 기준 게이트웨이가 허용하는 openai/gpt-5.6-luna로 고정한다
// (계획서의 gpt-5-luna는 'not allowed' 400으로 거부됨 — 분석 기능의 .env 모델과 동일).
const DEFAULT_CHAT_BASE_URL = 'https://mlapi.run/286e9158-d32e-436d-a23d-36b43fc8e68a/v1'
const DEFAULT_CHAT_MODEL = 'openai/gpt-5.6-luna'
const CHAT_TIMEOUT_MS = 60_000

// 프론트와 같은 상한 — 오래된 턴은 잘라내고 메시지별 길이를 제한합니다.
export const MAX_HISTORY_MESSAGES = 12
export const MAX_MESSAGE_LENGTH = 1000

export function normalizeHistory(raw: unknown): ChatHistoryMessage[] {
  if (!Array.isArray(raw)) return []
  const cleaned: ChatHistoryMessage[] = []
  for (const item of raw) {
    const role = (item as { role?: unknown } | null)?.role
    const content = (item as { content?: unknown } | null)?.content
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      const trimmed = content.trim()
      if (trimmed !== '') cleaned.push({ role, content: trimmed.slice(0, MAX_MESSAGE_LENGTH) })
    }
  }
  return cleaned.slice(-MAX_HISTORY_MESSAGES)
}

export const CHAT_SYSTEM_PROMPT = `당신은 공내비 도우미 "나비"입니다. 사용자의 질문을 두 종류로 구분해 답합니다.

[대시보드·앱 데이터 질문] — 마감일, 내 응모·관심, 분야별 건수, 추천 공모전, 아이디어 조합
- 사실은 아래 [대시보드 스냅숏]에만 근거합니다. 스냅숏에 없는 정보는 "스냅숏에 없어요"라고 답합니다.
- 날짜 계산을 하지 않습니다. 남은 일 수는 스냅숏의 left·label·tone 값을 그대로 사용합니다.
- 데이터 기준일(asOf)을 함께 안내합니다. 예: "기준일 2026-10-01 데이터예요".
- 추천 후보는 스냅숏의 공모전만 사용합니다. 앱 밖 공모전을 찾아 달라고 하면 앱의 "국내 공모전 전체 검색"(위비티·캠퍼스픽 등)을 안내합니다.
- 마감 임박(tone이 urgent) 공모전이 있으면 먼저 안내합니다.
- 아이디어 브레인스토밍은 스냅숏의 sparks(분야·대상·형태 조합) 안에서 먼저 제안하고, 일반적인 발상 방법을 덧붙일 수 있습니다.
- 스냅숏의 typeTest(유형 검사 결과)와 checklist(제출 전 자가 점검 진행률)도 근거로 삼습니다. typeTest가 있으면 조언에 사용자 유형을 반영하고, checklist가 있으면 남은 점검 항목을 격려와 함께 안내합니다. 둘 다 없으면 검사를 해 보라고 먼저 권합니다.

[일반 질문] — 공모전 상식, 준비 방법, 서류·발표 팁, 앱 사용법, 아이디어 발상 등
- 스냅숏과 관계없이 일반 지식으로 답합니다.
- 단, 특정 공모전의 일정·주최·URL 같은 구체적 사실과 뉴스는 만들어 내지 않고 직접 확인이 필요하다고 안내합니다.
- 앱 사용법은 아래 [공내비 앱 안내]를 근거로 답합니다.

[공내비 앱 안내]
- 입력 화면에서 아이디어(제목·설명·분야)를 적으면 중복 검사, 차별화 포인트, 유사 사례, 추천 공모전을 분석해 보여 줍니다.
- 결과 화면에서 공모전에 응모 표시를 하거나 관심 목록에 넣을 수 있고, 아이디어는 보관함에 저장됩니다.
- 마이페이지에서 내 응모·관심 공모전·보관한 아이디어를 관리하고, 대시보드에서 전체 현황과 마감 임박 목록을 봅니다.
- 첫화면의 유형 검사는 24문항으로 7가지 공내비 유형 중 하나와 성향 일치율, 유형별 강점·보완점·준비 로드맵, 잘 맞는 유형, 추천 공모전 3건을 알려 줍니다. 추천 공모전은 좋아요/싫어요로 평가할 수 있습니다.
- 결과 화면의 '제출 전 자가 점검'은 8개 항목을 하나씩 체크하며 응모 준비를 점검하는 기능입니다.
- 마이페이지 달력에서 내보내기 버튼으로 응모·관심 전체 일정을 PDF·엑셀(CSV)·엑셀(.xlsx)·캘린더(.ics) 네 가지 형식으로 내보낼 수 있습니다. PDF와 CSV에는 달력에 표시된 것과 같은 월간 달력(색 점·일정)과 목록이 담기고, 엑셀(.xlsx)에는 행 높이·열 너비와 색이 유지된 달력 시트와 목록 시트가 담기며, .ics에는 마감일과 '마감 7일 전' 일정이 들어가 캘린더 앱의 달력에 표시됩니다. 달력에는 응모한 공모전(초록)·공모전 마감일(주황)·마감 7일 전(빨강)·마감 지난(회색) 점이 표시되고, 날짜를 누르면 그 날 마감인 공모전과 마감 7일 전인 공모전을 볼 수 있습니다.
- 상단 검색에서 앱 속 공모전을 찾으면 상세 화면으로 연결되고, 그곳에서 공모전 소개·응모 방법을 볼 수 있습니다. 검색 결과에서 바로 관심 목록에 추가할 수도 있습니다.
- 마이페이지의 '성장 타임라인'에서 응모·관심·아이디어·유형 검사·회고 활동이 시간 순으로 쌓이는 걸 볼 수 있습니다.
- 응모한 공모전마다 '회고 쓰기'로 만족도(별점 1~5)·잘한 점·다음에 시도할 것을 기록하는 회고 노트를 남길 수 있습니다. 회고는 타임라인에도 기록됩니다.
- 접수가 새로 시작된 공모전이 데이터에 추가되면 첫화면 상단 배너로 알려 드립니다. 마이페이지에서 알림 받기를 켜고 끌 수 있고 '알림 미리보기'로 바로 체험할 수 있습니다.
- 분석·챗봇 답변은 AI의 참고 의견이므로 제출 전 직접 확인이 필요합니다.

[액션 태그]
- 사용자를 앱 화면으로 바로 이동시킬 수 있으면, 답변 본문 마지막에 아래 태그를 추가합니다. 앱이 태그를 이동 버튼으로 바꿔 보여 줍니다.
- [[contest:ID]] — 특정 공모전 상세 화면으로 이동. ID는 반드시 스냅숏 deadlines에 있는 id만 사용합니다.
- [[input]] — 아이디어 입력 화면으로 이동. 사용자가 새 아이디어를 분석하고 싶어 하면 붙입니다.
- 태그는 답변당 최대 2개, 본문 뒤에 각각 한 줄로 씁니다. 태그 안에 다른 문구를 넣지 않습니다.
- 스냅숏에 근거가 없는 ID를 만들어 내지 않습니다.

공통:
- 요청과 근거에 없는 사실(실제 서비스의 존재, 뉴스, 다른 공모전 정보)을 만들어 내지 않습니다.
- 답변은 한국어로 2~6문장. 정리에 도움이 되면 짧은 목록을 씁니다.`

function getChatClient(apiKey: string): OpenAI {
  const options: ConstructorParameters<typeof OpenAI>[0] = {
    apiKey,
    timeout: CHAT_TIMEOUT_MS,
    maxRetries: 0, // 재시도는 사용자의 '다시 시도' 버튼으로만 합니다.
  }
  const baseURL = process.env.OPENAI_CHAT_BASE_URL?.trim()
  options.baseURL = baseURL || DEFAULT_CHAT_BASE_URL
  return new OpenAI(options)
}

function buildMessages(
  history: ChatHistoryMessage[],
  snapshot: unknown,
): Array<{ role: 'system' | ChatRole; content: string }> {
  let snapshotText = '{}'
  try {
    snapshotText = JSON.stringify(snapshot, null, 2) ?? '{}'
  } catch {
    // 순환 참조 등으로 직렬화가 실패해도 대화는 계속합니다.
  }
  return [
    { role: 'system', content: `${CHAT_SYSTEM_PROMPT}\n\n[대시보드 스냅숏]\n${snapshotText}` },
    ...history.map((message) => ({ role: message.role, content: message.content })),
  ]
}

export async function sendChatMessage(
  headerKey: string,
  history: ChatHistoryMessage[],
  snapshot: unknown,
): Promise<{ reply: string; model: string; keySource: ChatKeySource }> {
  // dotenv가 모듈 import보다 늦게 로드되므로 설정값은 호출 시점에 읽습니다.
  const CHAT_MODEL = process.env.OPENAI_CHAT_MODEL?.trim() || DEFAULT_CHAT_MODEL
  const { key: apiKey, source: keySource } = resolveChatKey(headerKey)
  const client = getChatClient(apiKey)

  let content: string | null
  try {
    const bareModel = CHAT_MODEL.split('/').pop() ?? CHAT_MODEL
    const completion = await client.chat.completions.create({
      model: CHAT_MODEL,
      // gpt-5 계열은 temperature 기본값(1)만 허용하므로 보내지 않습니다.
      ...(bareModel.startsWith('gpt-5') ? {} : { temperature: 0.6 }),
      messages: buildMessages(history, snapshot),
    })
    content = completion.choices[0]?.message?.content ?? null
  } catch (error) {
    const status = (error as { status?: number } | null)?.status
    const errorName = error instanceof Error ? error.name : ''
    if (status === 401 || status === 403) {
      throw new ChatKeyRejectedError()
    }
    if (errorName === 'APIConnectionTimeoutError' || errorName === 'TimeoutError') {
      throw new ChatTimeoutError()
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new ChatUpstreamError(`모델 호출에 실패했습니다: ${message}`)
  }

  if (!content || content.trim() === '') {
    throw new ChatUpstreamError('모델 응답이 비어 있습니다.')
  }

  return { reply: content.trim(), model: CHAT_MODEL, keySource }
}
