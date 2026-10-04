// ==========================================================
// 대시보드 집계 모듈
// DashboardPage는 이 모듈이 돌려준 결과만 그립니다.
// 데이터 출처는 네 곳 — mockData.js(공모전·참고자료), ideaSparks.js(스파크),
// localStorage(내 활동), 백엔드 알림 기록(패널에서 직접 요청).
// ==========================================================

import { contests } from './mockData.js'
import {
  DAILY_MISSIONS,
  IDEA_EXAMPLES,
  IDEA_FIELDS,
  IDEA_FORMS,
  IDEA_WHOS,
} from './ideaSparks.js'
import { deadlineStatus } from '../utils/contestAlerts.js'

const MY_CONTESTS_STORAGE_KEY = 'idea-navigation:my-contests'
const WISHLIST_STORAGE_KEY = 'idea-navigation:wishlist'
const SAVED_IDEAS_STORAGE_KEY = 'idea-navigation:saved-ideas'

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
 * @returns {DeadlineRow[]}
 */
export function buildDeadlineRows(now = new Date()) {
  const byId = new Map()
  for (const contest of contests) {
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

// 공모전 분야의 첫 단어('기타 (아이디어·방송통신)' → '기타')로 묶어 건수를 셉니다.
export function buildFieldBreakdown() {
  const counts = new Map()
  for (const contest of contests) {
    const field = String(contest.field ?? '').split(' ')[0] || '기타'
    counts.set(field, (counts.get(field) ?? 0) + 1)
  }
  return [...counts.entries()]
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
}

// 이 브라우저에 저장된 내 활동 건수. 로그인 여부와 관계없이 저장된 목록 기준입니다.
export function buildActivityCounts() {
  return {
    myContests: readStoredList(MY_CONTESTS_STORAGE_KEY).length,
    wishlist: readStoredList(WISHLIST_STORAGE_KEY).length,
    savedIdeas: readStoredList(SAVED_IDEAS_STORAGE_KEY).length,
  }
}

// 아이디어 스파크 콘텐츠 규모. 오늘의 미션은 챗봇 스냅숏(chatContext.js)에서
// 브레인스토밍 맥락으로 사용됩니다.
// '하루에 하나' 규칙(날 수로 나눈 나머지)을 따릅니다.
export function buildSparkStats(now = new Date()) {
  return {
    combos: IDEA_FIELDS.length * IDEA_WHOS.length * IDEA_FORMS.length,
    missions: DAILY_MISSIONS.length,
    examples: IDEA_EXAMPLES.length,
    todayMission: DAILY_MISSIONS[Math.floor(now.getTime() / DAY_MS) % DAILY_MISSIONS.length],
  }
}
