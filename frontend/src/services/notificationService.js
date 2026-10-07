// ==========================================================
// 백엔드 알림 구독 동기화
// 로그인 사용자의 이메일과 응모·관심 공모전 목록을
// 백엔드(/api/notifications/subscribe)에 등록합니다.
// 백엔드가 꺼져 있어도 조용히 건너뛰고, 다음 변경 때 다시 시도합니다.
// ==========================================================

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

/**
 * @typedef {Object} SubscriptionPayload
 * @property {string} nickname
 * @property {string} [email]
 * @property {string[]} ideaCategories
 * @property {{ id: number, title: string, deadline: string, url?: string }[]} contests
 * @property {boolean} optIn
 */

/**
 * @param {SubscriptionPayload} payload
 */
export async function syncNotificationSubscription(payload) {
  const response = await fetch(`${API_BASE}/api/notifications/subscribe`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`알림 구독 요청이 실패했어요. (HTTP ${response.status})`)
  }
  return response.json()
}

/**
 * 주간 새 공모전 다이제스트를 이메일로 발송합니다(POST /api/notifications/weekly).
 * @param {{ nickname?: string, email: string, fields: string[], contests: Array<{ id: number, title: string, field: string, deadline: string, url?: string }> }} payload
 */
export async function sendWeeklyDigest(payload) {
  const response = await fetch(`${API_BASE}/api/notifications/weekly`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`주간 소식 발송이 실패했어요. (HTTP ${response.status})`)
  }
  return response.json()
}
