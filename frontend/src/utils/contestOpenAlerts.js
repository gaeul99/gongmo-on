// ==========================================================
// 신규 공모전 표시 유틸
// mockData.js의 접수 중 공모전 목록이 갱신(새 공모전 추가)됐을 때
// 이전 방문 때 본 적 없는 공모전을 감지합니다 — 홈 '곧 마감' 패널의 NEW 배지가 씁니다.
// 본 적 있는 공모전 id는 localStorage('gongmo-on:seen-contests')에 기록하고,
// 첫 방문에는 전체를 '본 것'으로 기록해 빈 화면에 배지가 붙지 않게 합니다.
// ==========================================================

import { STORAGE_KEYS } from './storageKeys.js'

const SEEN_KEY = STORAGE_KEYS.seenContests

// mockData.js contests 항목의 최소 구조
/**
 * @typedef {Object} ContestLite
 * @property {number} id
 * @property {string} title
 * @property {string} organizer
 * @property {string} deadline
 * @property {string} field
 * @property {string} url
 */

function loadSeenIds() {
  try {
    const raw = localStorage.getItem(SEEN_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** 이번 데이터 기준에서 처음 보는 공모전 목록 (첫 방문이면 기록만 하고 빈 배열)
 * @param {ContestLite[]} contestList
 * @returns {ContestLite[]}
 */
export function getNewContests(contestList) {
  const seen = loadSeenIds()
  if (seen === null) {
    markContestsSeen(contestList)
    return []
  }
  const seenSet = new Set(seen)
  return contestList.filter((contest) => !seenSet.has(contest.id))
}

export function markContestsSeen(contestList) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(contestList.map((contest) => contest.id)))
  } catch {
    // 저장에 실패해도 다음 방문에 같은 공모전이 다시 '새 공모전'으로 보일 수 있습니다.
  }
}

