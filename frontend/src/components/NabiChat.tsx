// ==========================================================
// 공내비 챗봇 "나비" — 전 화면 우하단 도크 패널
// 기본은 서버 키(backend/.env)로 바로 대화한다. 서버 키가 없거나
// 거부되면 시작 화면에서 키를 입력받아 sessionStorage에만 보관하고,
// 매 전송마다 x-chat-key 헤더로 백엔드(/api/chat)에 전달한다(사용자 키 우선).
// 사실 근거는 data/chatContext.js의 스냅숏이 책임진다.
// 계획서: artifacts/gongnabi-chatbot-plan.html
// ==========================================================
import { useEffect, useRef, useState } from 'react'
import { buildChatSnapshot } from '../data/chatContext.js'
import { DATA_AS_OF } from '../data/dashboard.js'
import './NabiChat.css'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
const KEY_STORAGE = 'gongnabi:chat-key'
const CHAT_MODEL_LABEL = 'openai/gpt-5.6-luna'
const REQUEST_TIMEOUT_MS = 45_000
const MAX_MESSAGE_LENGTH = 1000

const EXAMPLE_QUESTIONS = [
  '이번 주 마감 공모전 알려줘',
  '내 유형 검사 결과 알려줘',
  '내 응모 정리해 줘',
  '아이디어 주제 추천해 줘',
  '제출 전에 뭘 확인해야 해?',
  '공내비 사용법 알려줘',
]

type ChatRole = 'user' | 'assistant'

type ChatBubble = {
  id: number
  role: ChatRole
  content: string
  // 'error' 말풍선은 기록에서 제외되고, 안의 '다시 시도' 버튼이 직전 질문을 재전송한다.
  kind?: 'error'
  meta?: string
  retry?: boolean
}

type ChatApiPayload = {
  success?: boolean
  data?: { reply?: unknown; keySource?: unknown }
  error?: { code?: string; message?: string }
}

type ChatConfigPayload = {
  success?: boolean
  data?: { serverKey?: boolean }
}

class ChatKeyRejected extends Error {}

class ChatRequestError extends Error {
  code: string
  constructor(code: string, message: string) {
    super(message)
    this.code = code
  }
}

function readSavedKey(): string {
  try {
    return sessionStorage.getItem(KEY_STORAGE) ?? ''
  } catch {
    return ''
  }
}

function saveKey(key: string): void {
  try {
    sessionStorage.setItem(KEY_STORAGE, key)
  } catch {
    // 저장이 막힌 환경에서는 메모리(keyRef)로만 이번 세션을 버팁니다.
  }
}

function clearSavedKey(): void {
  try {
    sessionStorage.removeItem(KEY_STORAGE)
  } catch {
    // 무시 — 이미 없는 키다.
  }
}

async function requestChat(
  apiKey: string,
  messages: Array<{ role: ChatRole; content: string }>,
  notif: unknown,
): Promise<string> {
  const snapshot = buildChatSnapshot(notif)
  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-chat-key': apiKey },
      body: JSON.stringify({ messages, snapshot }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === 'TimeoutError') {
      throw new ChatRequestError('TIMEOUT', '응답이 45초를 넘었어요. 잠시 후 다시 시도해 주세요.')
    }
    throw new ChatRequestError('NETWORK', '백엔드 서버에 연결할 수 없어요. 서버가 켜져 있는지 확인해 주세요.')
  }

  const payload = (await response.json().catch(() => null)) as ChatApiPayload | null
  if (response.status === 401) {
    throw new ChatKeyRejected()
  }
  if (!payload?.success || typeof payload.data?.reply !== 'string' || payload.data.reply === '') {
    const code = payload?.error?.code ?? `HTTP_${response.status}`
    throw new ChatRequestError(code, payload?.error?.message ?? '모델 서버 응답에 문제가 있어요. 잠시 후 다시 시도해 주세요.')
  }
  return payload.data.reply
}

function NabiChat() {
  const [open, setOpen] = useState(false)
  // 서버 키가 있으면 키 입력 없이 바로 대화한다. 마운트 때 서버 키 여부를 확인하며,
  // 확인 전에는 낙관적으로 대화 화면을 보여 준다(백엔드가 꺼져 있으면 전송 시 안내 말풍선).
  const [phase, setPhase] = useState<'key' | 'chat'>('chat')
  const [keyValue, setKeyValue] = useState('')
  const [keyError, setKeyError] = useState('')
  const [hasUserKey, setHasUserKey] = useState(() => readSavedKey() !== '')
  const [bubbles, setBubbles] = useState<ChatBubble[]>([])
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  // 백엔드 알림 통계. 스냅숏의 알림 문단을 채우고, 실패해도 대화는 계속된다.
  const [notif, setNotif] = useState<unknown>(null)

  const keyRef = useRef(readSavedKey())
  // 서버 키 보유 여부. null은 아직 확인 전(백엔드 꺼짐 포함)이라는 뜻이다.
  const serverKeyRef = useRef<boolean | null>(null)
  const nextIdRef = useRef(1)
  const logRef = useRef<HTMLDivElement | null>(null)
  const keyInputRef = useRef<HTMLInputElement | null>(null)

  // 서버 키가 있는지 확인해, 없는 환경에서만 키 입력 화면으로 내보낸다.
  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/chat/config`, { signal: AbortSignal.timeout(5000) })
      .then(async (response) => {
        const payload = (await response.json()) as ChatConfigPayload
        if (!payload.success || typeof payload.data?.serverKey !== 'boolean') {
          throw new Error('bad payload')
        }
        return payload.data.serverKey
      })
      .then((serverKey) => {
        if (cancelled) return
        serverKeyRef.current = serverKey
        if (!serverKey && readSavedKey() === '') setPhase('key')
      })
      .catch(() => {
        // 백엔드가 꺼져 있으면 판단을 보류한다 — 전송 시 네트워크 안내 말풍선이 뜬다.
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 패널을 열 때마다 알림 통계를 새로 가져온다. 스냅숏 기준일을 최신으로 유지하기 위해서다.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    fetch(`${API_BASE}/api/notifications/stats`, { signal: AbortSignal.timeout(5000) })
      .then(async (response) => {
        const payload = (await response.json()) as { success?: boolean; data?: unknown }
        if (!payload.success || payload.data === undefined || payload.data === null) {
          throw new Error('bad payload')
        }
        return payload.data
      })
      .then((data) => {
        if (!cancelled) setNotif(data)
      })
      .catch(() => {
        // 백엔드가 꺼져 있으면 이전 값을 유지하거나 없는 채로 둔다.
      })
    return () => {
      cancelled = true
    }
  }, [open])

  // 새 말풍선이 생길 때마다 목록 맨 아래로 따라간다.
  useEffect(() => {
    const element = logRef.current
    if (element) element.scrollTop = element.scrollHeight
  }, [bubbles, sending, open, phase])

  useEffect(() => {
    if (phase === 'key' && open) keyInputRef.current?.focus()
  }, [phase, open])

  function appendBubble(bubble: Omit<ChatBubble, 'id'>) {
    const id = nextIdRef.current
    nextIdRef.current += 1
    setBubbles((prev) => [...prev, { ...bubble, id }])
  }

  function startChat(event: React.FormEvent) {
    event.preventDefault()
    const trimmed = keyValue.trim()
    if (trimmed === '') {
      setKeyError('키를 입력해 주세요.')
      return
    }
    keyRef.current = trimmed
    saveKey(trimmed)
    setHasUserKey(true)
    setKeyError('')
    setKeyValue('')
    setPhase('chat')
  }

  function deleteKey() {
    clearSavedKey()
    keyRef.current = ''
    setHasUserKey(false)
    setBubbles([])
    setKeyValue('')
    setKeyError('')
    // 사용자 키를 지워도 서버 키가 살아 있으면 대화를 이어간다.
    setPhase(serverKeyRef.current === true ? 'chat' : 'key')
  }

  async function sendMessage(rawText: string, isRetry = false) {
    const content = rawText.trim()
    if (content === '' && !isRetry) return
    if (sending) return
    // 서버 키가 확인된 환경에서는 사용자 키 없이도 보낼 수 있다.
    // 서버 키 여부를 아직 못 받았으면(백엔드 꺼짐) 그대로 보내 네트워크 안내를 받게 한다.
    if (keyRef.current === '' && readSavedKey() === '' && serverKeyRef.current !== true) {
      setPhase('key')
      return
    }

    // 오류 말풍선은 대화 기록에서 제외한다. 재시도면 직전 질문이 이미 기록에 있다.
    const baseHistory = bubbles
      .filter((bubble) => bubble.kind !== 'error')
      .map((bubble) => ({ role: bubble.role, content: bubble.content }))
    const history: Array<{ role: ChatRole; content: string }> = isRetry
      ? baseHistory
      : [...baseHistory, { role: 'user' as const, content }]

    if (!isRetry) {
      appendBubble({ role: 'user', content })
      setDraft('')
    }
    setSending(true)
    try {
      const reply = await requestChat(keyRef.current, history, notif)
      appendBubble({ role: 'assistant', content: reply })
    } catch (error) {
      if (error instanceof ChatKeyRejected) {
        // 키만 다시 받고, 지금까지의 대화는 그대로 유지한다.
        // 서버 키 환경에서의 401은 서버 키 문제라, 사용자 키를 입력하면 이어서 대화할 수 있다.
        keyRef.current = ''
        clearSavedKey()
        setHasUserKey(false)
        setKeyError(
          serverKeyRef.current === true
            ? '서버 키가 거부되었어요. 직접 API 키를 입력하면 내 키로 계속 대화할 수 있어요.'
            : '키가 거부되었어요. 올바른 API 키인지 확인하고 다시 입력해 주세요.',
        )
        setPhase('key')
        return
      }
      const code = error instanceof ChatRequestError ? error.code : 'UNKNOWN'
      const message =
        error instanceof Error && error.message !== ''
          ? error.message
          : '알 수 없는 문제가 발생했어요. 다시 시도해 주세요.'
      appendBubble({ role: 'assistant', kind: 'error', content: message, meta: code, retry: true })
    } finally {
      setSending(false)
    }
  }

  function submitDraft(event: React.FormEvent) {
    event.preventDefault()
    void sendMessage(draft)
  }

  function handleInputKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      void sendMessage(draft)
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        className="chat-fab"
        onClick={() => setOpen(true)}
        aria-label="나비 챗봇 열기"
        aria-expanded="false"
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
        </svg>
      </button>
    )
  }

  const stateLabel = phase === 'key' ? '키 필요' : sending ? '응답 중…' : '연결됨'
  const stateClass =
    phase === 'key' || sending ? 'chat-state chat-state-warn' : 'chat-state chat-state-ok'

  return (
    <div className="chat-dock" role="dialog" aria-label="나비 챗봇">
      <div className="chat-head">
        <span className="chat-avatar" aria-hidden="true">
          나
        </span>
        <div className="chat-title">
          <span className="chat-name">나비</span>
          <span className="chat-model">{CHAT_MODEL_LABEL}</span>
        </div>
        <span className={stateClass}>{stateLabel}</span>
        {phase === 'chat' && hasUserKey && (
          <button type="button" className="chat-minor-btn" onClick={deleteKey}>
            키 삭제
          </button>
        )}
        <button
          type="button"
          className="chat-minor-btn chat-close"
          onClick={() => setOpen(false)}
          aria-label="챗봇 닫기"
        >
          닫기
        </button>
      </div>

      {phase === 'key' ? (
        <div className="chat-body-key">
          <form className="chat-keyform" onSubmit={startChat}>
            <label className="chat-keylabel" htmlFor="chat-key-input">
              API 키
            </label>
            <input
              id="chat-key-input"
              ref={keyInputRef}
              type="password"
              className="chat-keyinput"
              value={keyValue}
              onChange={(event) => {
                setKeyValue(event.target.value)
                if (keyError !== '') setKeyError('')
              }}
              placeholder="mlapi.run API 키"
              autoComplete="off"
              aria-invalid={keyError !== ''}
              aria-describedby={keyError !== '' ? 'chat-key-error' : undefined}
            />
            {keyError !== '' && (
              <p id="chat-key-error" className="chat-keyerror" role="alert">
                {keyError}
              </p>
            )}
            <button type="submit" className="chat-start">
              대화 시작
            </button>
            <p className="chat-keynote">
              키는 이 탭(sessionStorage)에만 저장되며 서버에 남지 않아요. 공용 PC에서는 사용 후 키
              삭제를 권장해요.
            </p>
          </form>
        </div>
      ) : (
        <>
          <div className="chat-log" ref={logRef} aria-live="polite">
            {bubbles.length === 0 && (
              <>
                <div className="chat-bub chat-bub-bot">
                  안녕하세요, 공내비 도우미 나비예요. 마감·응모 현황부터 공모전 상식, 아이디어 고민까지
                  무엇이든 물어보세요.
                  <span className="chat-bub-meta">기준일 {DATA_AS_OF}</span>
                </div>
                <div className="chat-chips">
                  {EXAMPLE_QUESTIONS.map((question) => (
                    <button
                      key={question}
                      type="button"
                      className="chat-chip"
                      onClick={() => setDraft(question)}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </>
            )}
            {bubbles.map((bubble) => (
              <div
                key={bubble.id}
                className={
                  bubble.kind === 'error'
                    ? 'chat-bub chat-bub-error'
                    : bubble.role === 'user'
                      ? 'chat-bub chat-bub-user'
                      : 'chat-bub chat-bub-bot'
                }
              >
                {bubble.content}
                {bubble.meta !== undefined && <span className="chat-bub-meta">{bubble.meta}</span>}
                {bubble.retry === true && (
                  <button
                    type="button"
                    className="chat-retry"
                    onClick={() => void sendMessage('', true)}
                  >
                    다시 시도
                  </button>
                )}
              </div>
            ))}
            {sending && (
              <div className="chat-bub chat-bub-bot chat-typing" aria-label="답변 작성 중">
                <i />
                <i />
                <i />
              </div>
            )}
          </div>

          <form className="chat-input" onSubmit={submitDraft}>
            <textarea
              className="chat-textarea"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={handleInputKeyDown}
              placeholder="메시지를 입력하세요…"
              rows={2}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={sending}
              aria-label="나비에게 보낼 메시지"
            />
            <button type="submit" className="chat-send" disabled={sending || draft.trim() === ''}>
              전송
            </button>
          </form>
        </>
      )}

      <p className="chat-disclaimer">
        답변은 AI의 참고 의견이며, 스냅숏 기준일({DATA_AS_OF}) 이후 변동은 반영되지 않아요.
      </p>
    </div>
  )
}

export default NabiChat
