// ==========================================================
// 사용자 데이터 동기화 — 서버(/api/userdata)를 백업 저장소로 씁니다.
// localStorage는 여전히 1차 저장소(캐시) 역할을 하므로 대시보드 등
// localStorage를 직접 읽는 기존 로직은 그대로 동작합니다.
// 백엔드가 꺼져 있으면 조용히 건너뛰고, 다음 변경·로그인 때 다시 시도합니다.
// ==========================================================

import { getAuthToken } from './auth.js'

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
// 서버가 멈춰 있을 때 동기화 대기가 길어지지 않게 한다. 실패해도 다음 변경 때 재시도된다.
const REQUEST_TIMEOUT_MS = 15_000

function authHeaders() {
  const token = getAuthToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

/**
 * 서버에 저장된 내 데이터를 불러옵니다.
 * @returns {Promise<{ ok: true, data: any } | { ok: false }>} ok:false는 미로그인·세션 만료·서버 오류 모두 포함
 */
export async function pullUserData() {
  if (!getAuthToken()) return { ok: false }
  const response = await fetch(`${API_BASE}/api/userdata`, {
    headers: authHeaders(),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) return { ok: false }
  const payload = await response.json()
  if (!payload?.success) return { ok: false }
  return { ok: true, data: payload.data }
}

/**
 * 현재 목록 전체를 서버에 저장합니다(전체 교체 방식).
 * @param {{ myContests: unknown[], wishlist: unknown[], savedIdeas: unknown[], typeTest: unknown, checklist: object, roadmaps: object, practiceNotes: unknown[] }} data
 * @returns {Promise<{ ok: boolean }>}
 */
export async function pushUserData(data) {
  if (!getAuthToken()) return { ok: false }
  const response = await fetch(`${API_BASE}/api/userdata`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ data }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  })
  if (!response.ok) return { ok: false }
  const payload = await response.json()
  return { ok: payload?.success === true }
}
