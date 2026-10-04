// ==========================================================
// 성장 타임라인 — 흩어진 활동 기록(응모·관심·아이디어·유형 검사·회고)을
// 한 줄의 시간 흐름으로 모아 주는 데이터 조립기
// ==========================================================

import { CONTEST_TYPES } from '../data/contestTypeTest.js'

/**
 * @typedef {Object} TimelineEvent
 * @property {string} date YYYY-MM-DD (정렬 기준)
 * @property {'apply'|'wish'|'idea'|'test'|'retro'} type 이벤트 종류
 * @property {string} label 화면 배지 문구
 * @property {string} title 이벤트 대상 제목
 * @property {string} [meta] 보조 설명 (회고 별점, 검사 유형 등)
 */

// 유형 검사 기록(localStorage 'gongnabi:type-test')에서 이벤트 한 건을 만든다.
// 검사를 안 했거나 유형 정의가 바뀌어 못 찾으면 이벤트를 만들지 않는다.
function testEvent() {
  try {
    const raw = localStorage.getItem('gongnabi:type-test')
    const record = raw ? JSON.parse(raw) : null
    if (!record || typeof record !== 'object' || Array.isArray(record)) return null
    const hasOwn = Object.prototype.hasOwnProperty.call(CONTEST_TYPES, record.typeId)
    if (!hasOwn || typeof record.savedAt !== 'string' || !record.savedAt) return null
    const type = CONTEST_TYPES[record.typeId]
    return {
      date: record.savedAt,
      type: 'test',
      label: '유형 검사',
      title: `${type.emoji} ${type.name} 판정`,
      meta:
        typeof record.percentage === 'number'
          ? `성향 일치율 ${record.percentage}%`
          : undefined,
    }
  } catch {
    return null
  }
}

/**
 * @param {{ myContests: Array<{id:number,title:string,appliedAt:string,deadline:string}>,
 *           wishlist: Array<{id:number,title:string,addedAt:string}>,
 *           savedIdeas: Array<{id:string,title:string,category:string,savedAt:string}>,
 *           retros: Record<string, {contestId:number,rating:number,updatedAt:string}> }} sources
 * @returns {TimelineEvent[]} 날짜 내림차순, 같은 날짜면 응모→회고→아이디어→관심→검사 순
 */
export function buildGrowthTimeline({ myContests, wishlist, savedIdeas, retros }) {
  const events = []

  for (const contest of myContests) {
    if (!contest.appliedAt) continue
    events.push({
      date: contest.appliedAt,
      type: 'apply',
      label: '응모',
      title: contest.title,
    })
  }
  for (const contest of wishlist) {
    if (!contest.addedAt) continue
    events.push({
      date: contest.addedAt,
      type: 'wish',
      label: '관심',
      title: contest.title,
    })
  }
  for (const idea of savedIdeas) {
    if (!idea.savedAt) continue
    events.push({
      date: idea.savedAt,
      type: 'idea',
      label: '아이디어',
      title: idea.title,
      meta: idea.category ? `분야 ${idea.category}` : undefined,
    })
  }
  for (const retro of Object.values(retros || {})) {
    if (!retro || typeof retro.updatedAt !== 'string' || !retro.updatedAt) continue
    events.push({
      date: retro.updatedAt,
      type: 'retro',
      label: '회고',
      title: retro.contestTitle ? retro.contestTitle : '공모전 회고',
      meta: `만족도 ${'★'.repeat(Math.min(5, Math.max(1, retro.rating | 0)))}`,
    })
  }
  const test = testEvent()
  if (test) events.push(test)

  // 날짜가 같을 때는 종류별 우선순위로 안정적으로 묶는다(응모가 회고보다 먼저 보이게).
  const TYPE_ORDER = { apply: 0, retro: 1, idea: 2, wish: 3, test: 4 }
  return events.sort((a, b) => {
    if (a.date !== b.date) return a.date < b.date ? 1 : -1
    return TYPE_ORDER[a.type] - TYPE_ORDER[b.type]
  })
}
