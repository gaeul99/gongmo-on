// ==========================================================
// 대시보드 집계 모듈
// DashboardPage는 이 모듈이 돌려준 결과만 그립니다.
// 데이터 출처는 네 곳 — contestPool.js(목업 + 자동 등록 공모전),
// ideaSparks.js(스파크), localStorage(내 활동), 백엔드 알림 기록(패널에서 직접 요청).
// ==========================================================

import { getAllContests } from './contestPool.js'
import {
  DAILY_MISSIONS,
  IDEA_EXAMPLES,
  IDEA_FIELDS,
  IDEA_FORMS,
  IDEA_WHOS,
} from './ideaSparks.js'
import { deadlineStatus } from '../utils/contestAlerts.js'

const MY_CONTESTS_STORAGE_KEY = 'gongmo-on:my-contests'
const WISHLIST_STORAGE_KEY = 'gongmo-on:wishlist'
const SAVED_IDEAS_STORAGE_KEY = 'gongmo-on:saved-ideas'

// 정적 데이터(공모전·참고자료)의 기준일. mockData.js를 갱신할 때 함께 고칩니다.
export const DATA_AS_OF = '2026-10-02'

const DAY_MS = 24 * 60 * 60 * 1000

function readStoredList(key) {
  try {
    const raw = localStorage.getItem(key)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// 접수 중 공모전(앱 데이터)과 내 응모·관심 스냅숏을 id로 합쳐 상태를 붙인 뒤
// 마감일 순으로 정렬합니다. 마감된 공모전은 목록 뒤로 내려 보냅니다.
/**
 * @typedef {Object} DeadlineRow
 * @property {number|string} id
 * @property {string} title
 * @property {string} organizer
 * @property {string} deadline
 * @property {string[]} kinds '접수 중'·'응모'·'관심' 중 해당하는 표시
 * @property {{ left: number|null, tone: string, label: string }} status
 */
/**
 * @param {Date} [now]
 * @param {Array<object>} [pool] 공모전 풀(기본값: contestPool.js 전체). 화면이 풀을 구독 중이면 넘겨 준다.
 * @returns {DeadlineRow[]}
 */
export function buildDeadlineRows(now = new Date(), pool = getAllContests()) {
  const byId = new Map()
  for (const contest of pool) {
    byId.set(contest.id, { ...contest, kinds: ['접수 중'] })
  }

  const tracked = [
    ...readStoredList(MY_CONTESTS_STORAGE_KEY).map((item) => ({ ...item, kind: '응모' })),
    ...readStoredList(WISHLIST_STORAGE_KEY).map((item) => ({ ...item, kind: '관심' })),
  ]
  for (const item of tracked) {
    const existing = byId.get(item.id)
    if (existing) {
      if (!existing.kinds.includes(item.kind)) existing.kinds = [...existing.kinds, item.kind]
    } else {
      byId.set(item.id, { ...item, kinds: [item.kind] })
    }
  }

  return [...byId.values()]
    .map((contest) => ({ ...contest, status: deadlineStatus(contest.deadline, now) }))
    .sort((a, b) => {
      const closedDiff =
        (a.status.tone === 'closed' ? 1 : 0) - (b.status.tone === 'closed' ? 1 : 0)
      if (closedDiff !== 0) return closedDiff
      return String(a.deadline).localeCompare(String(b.deadline))
    })
}

// 접수가 곧 시작되는 공모전(startDate가 오늘 이후)을 시작일 가까운 순으로 정렬합니다.
// 첫화면 '곧 시작되는 공모전' 박스의 '전체 보기'가 이 목록을 가리킵니다.
// left는 접수 시작일까지 남은 일수(오늘 0시 기준).
/**
 * @param {Date} [now]
 * @returns {Array<{ id: number, title: string, organizer: string, field: string, startDate: string, left: number }>}
 */
export function buildUpcomingStartRows(now = new Date()) {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return getAllContests()
    .map((contest) => {
      const start = new Date(`${contest.startDate}T00:00:00`)
      return { contest, start }
    })
    .filter((row) => !Number.isNaN(row.start.getTime()) && row.start.getTime() > startOfToday.getTime())
    .map(({ contest, start }) => ({
      id: contest.id,
      title: contest.title,
      organizer: contest.organizer,
      field: contest.field,
      startDate: contest.startDate,
      left: Math.round((start.getTime() - startOfToday.getTime()) / DAY_MS),
    }))
    .sort((a, b) => a.left - b.left)
}

// 공모전 분야의 첫 단어('기타 (아이디어·방송통신)' → '기타')로 묶어 건수를 셉니다.
export function buildFieldBreakdown(pool = getAllContests()) {
  const counts = new Map()
  for (const contest of pool) {
    const field = String(contest.field ?? '').split(' ')[0] || '기타'
    counts.set(field, (counts.get(field) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// 로드맵을 만들 수 있는 공모전 — 내 응모·관심 목록 중 아직 마감하지 않은 것.
// 응모가 관심보다 앞에 오게 하고, 같은 공모전이 양쪽에 있으면 응모 쪽을 살립니다.
/**
 * @param {Date} [now]
 * @returns {Array<{ id: number|string, title: string, organizer: string, deadline: string, kind: string, status: { left: number|null, tone: string, label: string } }>}
 */
export function buildRoadmapCandidates(now = new Date()) {
  const seen = new Map()
  const push = (item, kind) => {
    if (item && !seen.has(item.id)) seen.set(item.id, { ...item, kind })
  }
  readStoredList(MY_CONTESTS_STORAGE_KEY).forEach((row) => push(row, '응모'))
  readStoredList(WISHLIST_STORAGE_KEY).forEach((row) => push(row, '관심'))

  return [...seen.values()]
    .map((row) => ({ ...row, status: deadlineStatus(row.deadline, now) }))
    .filter((row) => row.status.tone !== 'closed')
    .sort((a, b) => String(a.deadline).localeCompare(String(b.deadline)))
}

// 이 브라우저에 저장된 내 활동 건수. 로그인 여부와 관계없이 저장된 목록 기준입니다.
export function buildActivityCounts() {
  return {
    myContests: readStoredList(MY_CONTESTS_STORAGE_KEY).length,
    wishlist: readStoredList(WISHLIST_STORAGE_KEY).length,
    savedIdeas: readStoredList(SAVED_IDEAS_STORAGE_KEY).length,
  }
}

// 내 응모 기록을 도전 히스토리로 요약 — 누적 도전 수, 수상·탈락·진행 중 건수와
// 응모한 공모전의 분야 분포. 결과 기록(마이페이지) 전에는 전부 '진행 중'으로 셉니다.
export function buildChallengeHistory(pool = getAllContests()) {
  const rows = readStoredList(MY_CONTESTS_STORAGE_KEY)
  const tally = { total: rows.length, progress: 0, won: 0, lost: 0 }
  const fields = new Map()
  for (const row of rows) {
    const key = row.result === 'won' ? 'won' : row.result === 'lost' ? 'lost' : 'progress'
    tally[key] += 1
    const known = pool.find((contest) => contest.id === row.id)
    const field = String(known?.field ?? row.field ?? '기타').split(' ')[0] || '기타'
    fields.set(field, (fields.get(field) ?? 0) + 1)
  }
  return {
    ...tally,
    fields: [...fields.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)),
  }
}

// 아이디어 스파크 콘텐츠 규모.
// '하루에 하나' 규칙(날 수로 나눈 나머지)을 따릅니다.
export function buildSparkStats(now = new Date()) {
  return {
    combos: IDEA_FIELDS.length * IDEA_WHOS.length * IDEA_FORMS.length,
    missions: DAILY_MISSIONS.length,
    examples: IDEA_EXAMPLES.length,
    todayMission: DAILY_MISSIONS[Math.floor(now.getTime() / DAY_MS) % DAILY_MISSIONS.length],
  }
}
