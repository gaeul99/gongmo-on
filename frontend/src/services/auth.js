import { switchAccountStorage, migrateAccountIdentity, accountContext } from './accountStorage'
import { fetchBackend } from './backendConnection.js'
// ==========================================================
// 계정 인증 — 백엔드(/api/auth)에 계정을 저장합니다.
// 비밀번호는 서버에서 salt+scrypt 해시로만 보관되고 평문은 저장되지
// 않습니다. 브라우저 데이터를 정리해도 서버에 계정이 남아 다시
// 로그인하면 그대로 사용할 수 있습니다.
// 로그인에 성공하면 세션 토큰을 이 브라우저에만 보관해 이후
// /api/userdata 요청에 함께 보냅니다.
// ==========================================================

const TOKEN_KEY = 'gongmo-on:auth-token'
const SESSION_KEY = 'gongmo-on:auth-session'
// 백엔드가 멈춰 있을 때 로그인 폼이 영원히 '처리 중'에 걸리지 않게 한다.
const REQUEST_TIMEOUT_MS = 15_000

export function getAuthToken() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw)?.token ?? null : localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function clearAuthToken() {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token: null, user: null }))
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    // 정리에 실패해도 로그인 흐름에는 지장 없습니다.
  }
}

export function getAuthUser() {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    return raw ? JSON.parse(raw)?.user ?? null : JSON.parse(localStorage.getItem('gongmo-on:user') ?? 'null')
  } catch { return null }
}

export function saveAuthSession(token, user) {
  const previous = getAuthUser()
  try {
    if (previous && previous.joinedAt === user.joinedAt) migrateAccountIdentity(previous, user)
    switchAccountStorage(user)
    // Token and user identity commit together. A reload between workspace writes
    // always reconciles against this one authoritative session envelope.
    localStorage.setItem(SESSION_KEY, JSON.stringify({ token, user }))
    localStorage.removeItem(TOKEN_KEY)
  } catch (error) {
    switchAccountStorage(previous)
    throw error
  }
}

async function postAuth(path, body) {
  const response = await fetchBackend(`/api/auth/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    timeoutMs: REQUEST_TIMEOUT_MS,
  })
  let payload = null
  try {
    payload = await response.json()
  } catch {
    // 서버 오류로 JSON이 아니면 아래에서 공통 메시지로 처리됩니다.
  }
  return { ok: response.ok && payload?.success === true, payload }
}

function failMessage(payload) {
  return payload?.error?.message ?? '서버에 연결할 수 없어요. 백엔드가 실행 중인지 확인해 주세요.'
}

// 성공 시 { ok: true, user }, 실패 시 { ok: false, error }를 돌려줍니다.
// email은 필수, phone은 선택 — 알림(이메일·문자) 발송에 사용됩니다.
export async function signUp(nickname, password, email, phone) {
  const context = accountContext()
  try {
    const { ok, payload } = await postAuth('signup', { nickname, password, email, phone })
    if (!ok) return { ok: false, error: failMessage(payload) }
    if (context !== accountContext()) return { ok: false, error: '로그인 상태가 변경됐어요. 다시 시도해 주세요.' }
    saveAuthSession(payload.data.token, payload.data.user)
    return { ok: true, user: payload.data.user }
  } catch {
    return { ok: false, error: failMessage(null) }
  }
}

export async function signIn(nickname, password) {
  const context = accountContext()
  try {
    const { ok, payload } = await postAuth('login', { nickname, password })
    if (!ok) return { ok: false, error: failMessage(payload) }
    if (context !== accountContext()) return { ok: false, error: '로그인 상태가 변경됐어요. 다시 시도해 주세요.' }
    saveAuthSession(payload.data.token, payload.data.user)
    return { ok: true, user: payload.data.user }
  } catch {
    return { ok: false, error: failMessage(null) }
  }
}

// 로그아웃 — 서버 세션을 지우고 이 브라우저의 토큰도 버립니다.
// 서버 연결에 실패해도 브라우저 쪽 로그아웃은 계속 진행됩니다.
export async function requestLogout() {
  const token = getAuthToken()
  clearAuthToken()
  try {
    await fetchBackend(`/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token ?? ''}` },
      timeoutMs: REQUEST_TIMEOUT_MS,
    })
  } catch {
    // 세션은 30일 뒤 자동 만료되므로 실패해도 그대로 둡니다.
  }
}

// 회원정보 수정 — 현재 비밀번호 확인 후 아이디(표시 이름)·이메일·휴대폰을 바꿉니다.
// 성공 시 바뀐 user를 돌려주고, 서버는 세션·내역을 새 아이디로 옮겨
// 로그인 상태가 그대로 유지됩니다.
export async function updateProfile({ currentPassword, nickname, email, phone }) {
  const context = accountContext()
  const token = getAuthToken()
  try {
    const response = await fetchBackend(`/api/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token ?? ''}`,
      },
      body: JSON.stringify({ currentPassword, nickname, email, phone }),
      timeoutMs: REQUEST_TIMEOUT_MS,
    })
    let payload = null
    try {
      payload = await response.json()
    } catch {
      // 서버 오류로 JSON이 아니면 아래 공통 메시지로 처리됩니다.
    }
    if (!(response.ok && payload?.success === true)) {
      return { ok: false, error: failMessage(payload) }
    }
    if (context !== accountContext()) return { ok: false, error: '로그인 상태가 변경됐어요. 다시 로그인해 주세요.' }
    return { ok: true, user: payload.data.user }
  } catch {
    return { ok: false, error: failMessage(null) }
  }
}
