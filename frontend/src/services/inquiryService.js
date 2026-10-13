// ==========================================================
// 푸터 '문의하기' 창 → 백엔드 문의 접수 API 전송
// POST /api/inquiries — 접수에 성공하면 { success: true, data: { id, delivery } }
// ==========================================================

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

/**
 * @param {{ email?: string, category: string, content: string }} payload
 */
export async function sendInquiry(payload) {
  const response = await fetch(`${API_BASE}/api/inquiries`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })
  if (!response.ok) {
    throw new Error(`문의 접수가 실패했어요. (HTTP ${response.status})`)
  }
  return response.json()
}
