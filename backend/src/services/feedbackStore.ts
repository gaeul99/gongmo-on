// ==========================================================
// 유형 검사 추천 피드백 저장소
// DB가 없는 데모 프로젝트라 backend/data/feedback.json에 보관합니다.
// 같은 브라우저(sessionId)가 같은 조합(유형+공모전)에 다시 평가하면
// 최신 표로 교체해 집계가 한 사람 한 표를 유지합니다.
// ==========================================================

import fs from 'fs'
import path from 'path'

export type FeedbackVote = 'up' | 'down'

export type FeedbackEntry = {
  id: string
  sessionId: string
  typeId: string
  contestId: number
  contestTitle: string
  vote: FeedbackVote
  votedAt: string
}

const DATA_DIR = path.resolve(__dirname, '..', 'data')
const FEEDBACK_FILE = path.join(DATA_DIR, 'feedback.json')
const MAX_FEEDBACK = 500

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

function listFeedback(): FeedbackEntry[] {
  return readJson<FeedbackEntry[]>(FEEDBACK_FILE, [])
}

export function upsertFeedback(input: Omit<FeedbackEntry, 'id' | 'votedAt'>): FeedbackEntry {
  const entries = listFeedback()
  const existing = entries.find(
    (item) =>
      item.sessionId === input.sessionId &&
      item.typeId === input.typeId &&
      item.contestId === input.contestId,
  )
  const record: FeedbackEntry = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    votedAt: new Date().toISOString(),
  }
  const next = existing
    ? entries.map((item) => (item.id === existing.id ? record : item))
    : [...entries, record].slice(-MAX_FEEDBACK)
  writeJson(FEEDBACK_FILE, next)
  return record
}

export type FeedbackTally = {
  total: number
  up: number
  down: number
  // 👍 비율(0~1). 표가 없으면 null — "측정된 정확도가 아직 없다"를 구분하기 위함.
  accuracy: number | null
}

export type FeedbackStats = FeedbackTally & {
  byType: Record<string, FeedbackTally>
  recent: FeedbackEntry[]
}

function tally(entries: FeedbackEntry[]): FeedbackTally {
  const up = entries.filter((entry) => entry.vote === 'up').length
  const down = entries.filter((entry) => entry.vote === 'down').length
  return {
    total: entries.length,
    up,
    down,
    accuracy: up + down > 0 ? Math.round((up / (up + down)) * 100) / 100 : null,
  }
}

// 대시보드용 집계 — 전체 합계, 유형별 👍/👎 비율, 최근 평가 3건.
export function getFeedbackStats(): FeedbackStats {
  const entries = listFeedback()
  const byType: Record<string, FeedbackEntry[]> = {}
  for (const entry of entries) {
    const rows = byType[entry.typeId] ?? []
    rows.push(entry)
    byType[entry.typeId] = rows
  }
  const grouped: Record<string, FeedbackTally> = {}
  for (const [typeId, rows] of Object.entries(byType)) {
    grouped[typeId] = tally(rows)
  }
  return {
    ...tally(entries),
    byType: grouped,
    recent: entries.slice(-3).reverse(),
  }
}
