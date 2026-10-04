// ==========================================================
// 신규 공모전 오픈 알림
// mockData.js의 접수 중 공모전 목록이 갱신(새 공모전 추가)됐을 때
// 이전 방문 때 본 적 없는 공모전을 감지합니다.
// 본 적 있는 공모전 id는 localStorage('gongnabi:seen-contests')에 기록하고,
// 첫 방문에는 전체를 '본 것'으로 기록해 빈 화면에 알림이 뜨지 않게 합니다.
// ==========================================================

const SEEN_KEY = 'gongnabi:seen-contests'
const OPT_IN_KEY = 'idea-navigation:new-contest-alert'

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

/** 첫화면 '새 공모전 알림' 수신 여부 (기본 켜짐) */
export function isNewContestOptIn() {
  try {
    const raw = localStorage.getItem(OPT_IN_KEY)
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

export function setNewContestOptIn(value) {
  try {
    localStorage.setItem(OPT_IN_KEY, String(value))
  } catch {
    // 저장 실패 시에도 이번 방문의 동작에는 지장 없습니다.
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
    // 저장 실패 시 다음 방문에 같은 공모전이 다시 '새 공모전'으로 보일 수 있습니다.
  }
}

/** 마이페이지 미리보기: 마감이 가장 늦은 2건을 '새 공모전'으로 만들어 배너를 체험하게 합니다.
 * @param {ContestLite[]} contestList
 */
export function resetSeenForPreview(contestList) {
  if (contestList.length < 3) return
  const sorted = [...contestList].sort((a, b) => (a.deadline < b.deadline ? 1 : -1))
  const keep = sorted.slice(2).map((contest) => contest.id)
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(keep))
  } catch {
    // 무시
  }
}
