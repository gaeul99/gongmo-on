// ==========================================================
// 알림 구독자·발송 기록 저장소
// DB가 없는 데모 프로젝트라 backend/data/ 아래 JSON 파일로 보관합니다.
// ==========================================================

import fs from 'fs'
import path from 'path'

export type SubscriberContest = {
  id: number
  title: string
  deadline: string
  url?: string
}

export type Subscriber = {
  nickname: string
  email?: string | undefined
  ideaCategories: string[]
  contests: SubscriberContest[]
  optIn: boolean
  // 이미 마감 알림을 보낸 조합(공모전 id-D값-날짜) — 중복 발송 방지용
  sentKeys: string[]
  updatedAt: string
}

export type OutboxEntry = {
  id: string
  at: string
  channel: 'email'
  to: string
  subject?: string
  text: string
  // 실제 발송 여부 — 'smtp'는 실제 전송, 'log'는 설정 부재로 기록만
  via: string
}

const DATA_DIR = path.resolve(__dirname, '..', 'data')
const SUBSCRIBERS_FILE = path.join(DATA_DIR, 'subscribers.json')
const OUTBOX_FILE = path.join(DATA_DIR, 'outbox.json')
const MAX_OUTBOX = 200

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readJson<T>(file: string, fallback: T): T {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch {
    // 파일이 아직 없는 초기 상태뿐이다 — fallback이 정답.
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    if (raw.trim() === '') return fallback
    // 손상 파일을 빈 값으로 대신 읽으면 이후 저장이 전체를 덮어쓴다.
    // 원본을 보관하고 실패로 멈춘다(userStore.ts와 같은 정책).
    const quarantine = `${file}.corrupt-${Date.now()}`
    try {
      fs.copyFileSync(file, quarantine)
      console.error(
        `[notificationStore] 데이터 파일 손상: ${file} — 원본을 ${quarantine}에 보관했습니다.`,
        error,
      )
    } catch {
      console.error(`[notificationStore] 데이터 파일 손상: ${file} — 보관 실패, 원본은 그대로 있습니다.`, error)
    }
    throw new Error(`Corrupted data file: ${file}`)
  }
}

function writeJson(file: string, value: unknown) {
  ensureDataDir()
  // temp에 쓰고 rename으로 갈아끼운다 — 쓰다가 죽어도 기존 파일은 온전하다.
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

export function listSubscribers(): Subscriber[] {
  return readJson<Subscriber[]>(SUBSCRIBERS_FILE, [])
}

export function upsertSubscriber(input: Omit<Subscriber, 'sentKeys' | 'updatedAt'>): Subscriber {
  const subscribers = listSubscribers()
  const existing = subscribers.find((item) => item.nickname === input.nickname)
  const next: Subscriber = {
    ...input,
    sentKeys: existing?.sentKeys ?? [],
    updatedAt: new Date().toISOString(),
  }
  const updated = existing
    ? subscribers.map((item) => (item.nickname === input.nickname ? next : item))
    : [...subscribers, next]
  writeJson(SUBSCRIBERS_FILE, updated)
  return next
}

export function saveSubscriber(next: Subscriber) {
  const subscribers = listSubscribers()
  const updated = subscribers.some((item) => item.nickname === next.nickname)
    ? subscribers.map((item) => (item.nickname === next.nickname ? next : item))
    : [...subscribers, next]
  writeJson(SUBSCRIBERS_FILE, updated)
}

export function appendOutbox(entry: Omit<OutboxEntry, 'id' | 'at'>): OutboxEntry {
  const outbox = readJson<OutboxEntry[]>(OUTBOX_FILE, [])
  const record: OutboxEntry = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  }
  const next = [...outbox, record].slice(-MAX_OUTBOX)
  writeJson(OUTBOX_FILE, next)
  return record
}
