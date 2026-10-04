// ==========================================================
// 유형 검사 추천 피드백 전송
// 추천 공모전에 대한 👍/👎 평가를 백엔드(/api/feedback)에 기록합니다.
// 백엔드가 꺼져 있어도 화면 동작에는 지장이 없게 호출 실패는 조용히 무시합니다.
// ==========================================================

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

/**
 * @typedef {Object} FeedbackPayload
 * @property {string} sessionId 브라우저별 익명 ID — 같은 조합 재평가 시 최신 표로 교체됨
 * @property {string} typeId 유형 검사 결과 유형 id
 * @property {number} contestId 추천 공모전 id
 * @property {string} contestTitle 집계 확인용 공모전 제목
 * @property {'up'|'down'} vote
 */

/**
 * @param {FeedbackPayload} payload
 */
export async function recordFeedback(payload) {
  const response = await fetch(`${API_BASE}/api/feedback`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`피드백 전송이 실패했어요. (HTTP ${response.status})`)
  }
  return response.json()
}

/**
 * @typedef {Object} AnalysisFeedbackPayload
 * @property {string} sessionId 브라우저별 익명 ID — 같은 아이디어 재평가 시 최신 표로 교체됨
 * @property {'up'|'down'} vote
 * @property {string} ideaTitle 분석한 아이디어 제목
 * @property {string} [category] 관심 분야 (선택)
 */

/**
 * 아이디어 분석 결과에 대한 👍/👎 평가를 백엔드(/api/feedback/analysis)에 기록합니다.
 * @param {AnalysisFeedbackPayload} payload
 */
export async function recordAnalysisFeedback(payload) {
  const response = await fetch(`${API_BASE}/api/feedback/analysis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`피드백 전송이 실패했어요. (HTTP ${response.status})`)
  }
  return response.json()
}
