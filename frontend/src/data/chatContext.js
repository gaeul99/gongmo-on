// ==========================================================
// 대시보드 챗봇 스냅숏
// 챗봇이 답변의 근거로 삼을 대시보드 현황을 매 전송마다 다시 계산해 만든다.
// 출처는 dashboard.js 집계 4종 + ideaSparks.js 릴 + 백엔드 알림 통계이며,
// 여기서 만든 객체가 그대로 백엔드 → AI 시스템 프롬프트로 주입된다.
// 마감 D-x는 deadlineStatus가 계산한 값을 그대로 실어 보내고,
// AI가 날짜를 새로 계산하지 않게 하는 것이 이 모듈의 역할이다.
// ==========================================================

import { contests } from './mockData.js'
import { CONTEST_TYPES } from './contestTypeTest.js'
import { IDEA_FIELDS, IDEA_FORMS, IDEA_WHOS } from './ideaSparks.js'
import {
  DATA_AS_OF,
  buildActivityCounts,
  buildDeadlineRows,
  buildFieldBreakdown,
  buildSparkStats,
} from './dashboard.js'

// 오늘 날짜를 지역 시간대 기준 'YYYY-MM-DD'로 만든다.
// toISOString은 UTC라 한국 시간 새벽에 날짜가 하루 밀릴 수 있다.
function formatLocalDate(date) {
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

// 알림 통계는 백엔드가 살아 있을 때만 의미가 있다. 형태가 어긋나면 null로 넘겨
// AI가 "알림 기록을 확인할 수 없어요"라고 답하도록 한다.
/** @param {unknown} stats */
function slimNotif(stats) {
  if (!stats || typeof stats !== 'object' || Array.isArray(stats)) return null
  const channels =
    stats.byChannel && typeof stats.byChannel === 'object' && !Array.isArray(stats.byChannel)
      ? stats.byChannel
      : {}
  const channelStat = (value) =>
    value && typeof value === 'object' && typeof value.total === 'number' ? value : null
  return {
    subscribers: typeof stats.subscribers === 'number' ? stats.subscribers : null,
    email: channelStat(channels.email),
    recent: Array.isArray(stats.recent) ? stats.recent.slice(-3) : [],
  }
}

// 유형 검사 결과(localStorage 'gongnabi:type-test')를 스냅숏용으로 축약한다.
// 검사를 안 했거나 저장된 typeId가 현재 유형 정의에 없으면 null로 넘겨 AI가 언급하지 않게 한다.
function slimTypeTest() {
  try {
    const raw = localStorage.getItem('gongnabi:type-test')
    const record = raw ? JSON.parse(raw) : null
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null
    const hasOwn = Object.prototype.hasOwnProperty.call(CONTEST_TYPES, record.typeId)
    if (!hasOwn) return null
    const type = CONTEST_TYPES[record.typeId]
    return {
      name: type.name,
      emoji: type.emoji,
      percentage: typeof record.percentage === 'number' ? record.percentage : null,
      savedAt: typeof record.savedAt === 'string' ? record.savedAt : null,
    }
  } catch {
    return null
  }
}

// 제출 전 자가 점검 완료 수. ResultPage가 'idea-navigation:submission-checklist'에 저장하고
// 항목은 8개로 고정이라 total을 상수로 둔다.
function slimChecklist() {
  try {
    const raw = localStorage.getItem('idea-navigation:submission-checklist')
    const list = raw ? JSON.parse(raw) : null
    if (!list || typeof list !== 'object' || Array.isArray(list)) return null
    const done = Object.values(list).filter(Boolean).length
    return { done, total: 8 }
  } catch {
    return null
  }
}

/**
 * @param {unknown} [notifStats] DashboardPage가 가져온 백엔드 알림 통계 (형태는 slimNotif가 검사)
 * @param {Date} [now]
 * @returns {object} AI 시스템 프롬프트에 주입할 대시보드 스냅숏
 */
export function buildChatSnapshot(notifStats = null, now = new Date()) {
  const deadlineRows = buildDeadlineRows(now)
  const activity = buildActivityCounts()
  const spark = buildSparkStats(now)

  return {
    asOf: DATA_AS_OF,
    today: formatLocalDate(now),
    kpi: {
      contests: contests.length,
      myContests: activity.myContests,
      wishlist: activity.wishlist,
      savedIdeas: activity.savedIdeas,
    },
    // 공모전은 제목·주최·마감일·상태만 축약해 실는다(토큰 절약).
    // id는 AI가 [[contest:ID]] 액션 태그로 상세 화면 이동을 유도할 때 쓴다.
    deadlines: deadlineRows.map((row) => ({
      id: row.id,
      title: row.title,
      organizer: row.organizer,
      deadline: row.deadline,
      kinds: row.kinds,
      left: row.status.left,
      label: row.status.label,
      tone: row.status.tone,
    })),
    fields: buildFieldBreakdown(),
    // 브레인스토밍 요청에 아이디어 조합 원본(분야·대상·형태)을 근거로 답하게 실는다.
    sparks: {
      combos: spark.combos,
      missions: spark.missions,
      examples: spark.examples,
      todayMission: spark.todayMission,
      fields: IDEA_FIELDS,
      whos: IDEA_WHOS,
      forms: IDEA_FORMS,
    },
    notif: slimNotif(notifStats),
    typeTest: slimTypeTest(),
    checklist: slimChecklist(),
  }
}
