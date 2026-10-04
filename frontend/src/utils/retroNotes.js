// ==========================================================
// 회고 노트 저장소 — 응모한 공모전마다 하나씩 남기는 활동 회고
// localStorage 'idea-navigation:retros'에 { [공모전 id]: 회고 }로 저장합니다.
// ==========================================================

export const RETRO_STORAGE_KEY = 'idea-navigation:retros'

/**
 * @typedef {Object} RetroNote
 * @property {number} contestId 응모한 공모전 id (키와 같은 값)
 * @property {string} contestTitle 회고가 사라지지 않게 스냅숏으로 함께 저장
 * @property {string} organizer
 * @property {string} deadline
 * @property {number} rating 만족도 1~5
 * @property {string} keep 잘한 점 (선택)
 * @property {string} next 다음에 시도할 것 (선택)
 * @property {string} createdAt YYYY-MM-DD
 * @property {string} updatedAt YYYY-MM-DD
 */

/**
 * @returns {Record<string, RetroNote>} 저장된 회고 전체. 깨진 데이터면 빈 객체.
 */
export function loadRetros() {
  try {
    const raw = localStorage.getItem(RETRO_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
    return parsed
  } catch {
    return {}
  }
}

/**
 * 회고 한 건을 저장(신규 or 수정)합니다. 별점은 1~5로 강제합니다.
 * @param {{ contestId: number, contestTitle: string, organizer: string, deadline: string,
 *           rating: number, keep: string, next: string }} entry
 * @returns {Record<string, RetroNote>} 갱신된 전체 회고
 */
export function saveRetro(entry) {
  const all = loadRetros()
  const key = String(entry.contestId)
  const today = new Date().toISOString().slice(0, 10)
  const previous = all[key]
  all[key] = {
    contestId: entry.contestId,
    contestTitle: entry.contestTitle,
    organizer: entry.organizer,
    deadline: entry.deadline,
    rating: Math.min(5, Math.max(1, Math.round(entry.rating))),
    keep: entry.keep,
    next: entry.next,
    createdAt: previous ? previous.createdAt : today,
    updatedAt: today,
  }
  try {
    localStorage.setItem(RETRO_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // 저장에 실패해도 메모리상 결과는 돌려 줍니다.
  }
  return all
}

/**
 * 회고 한 건을 삭제합니다. 응모를 취소하거나 회고를 지울 때 씁니다.
 * @param {number} contestId
 * @returns {Record<string, RetroNote>} 갱신된 전체 회고
 */
export function deleteRetro(contestId) {
  const all = loadRetros()
  delete all[String(contestId)]
  try {
    localStorage.setItem(RETRO_STORAGE_KEY, JSON.stringify(all))
  } catch {
    // 저장에 실패해도 메모리상 결과는 돌려 줍니다.
  }
  return all
}
