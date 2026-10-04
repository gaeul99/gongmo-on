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
  phone?: string | undefined
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
  channel: 'email' | 'sms'
  to: string
  subject?: string
  text: string
  // 실제 발송 여부 — 'smtp' | 'solapi'는 실제 전송, 'log'는 설정 부재로 기록만
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
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown) {
  ensureDataDir()
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8')
}

export function listSubscribers(): Subscriber[] {
  return readJson<Subscriber[]>(SUBSCRIBERS_FILE, [])
}

export function getSubscriber(nickname: string): Subscriber | undefined {
  return listSubscribers().find((item) => item.nickname === nickname)
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

export function listOutbox(limit = 50): OutboxEntry[] {
  return readJson<OutboxEntry[]>(OUTBOX_FILE, []).slice(-limit)
}

export type NotificationStats = {
  subscribers: number
  byChannel: {
    email: { total: number; real: number }
    sms: { total: number; real: number }
  }
  recent: OutboxEntry[]
}

// 대시보드용 집계 — 구독자 수, 채널별 발송 건수(log/실발송 구분), 최근 기록 3건.
export function getNotificationStats(): NotificationStats {
  const outbox = readJson<OutboxEntry[]>(OUTBOX_FILE, [])
  const tally = (channel: OutboxEntry['channel']) => {
    const rows = outbox.filter((entry) => entry.channel === channel)
    return {
      total: rows.length,
      real: rows.filter((entry) => entry.via === 'smtp' || entry.via === 'solapi').length,
    }
  }
  return {
    subscribers: listSubscribers().length,
    byChannel: { email: tally('email'), sms: tally('sms') },
    recent: outbox.slice(-3).reverse(),
  }
}
