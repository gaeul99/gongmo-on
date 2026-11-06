const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'
let warming = null
let readyUntil = 0
let connecting = false
const listeners = new Set()
const publish = (value) => { connecting = value; for (const listener of listeners) listener() }
export const getBackendConnecting = () => connecting
export const subscribeBackendConnection = (listener) => { listeners.add(listener); return () => listeners.delete(listener) }

// Only readiness GETs retry. Never replay signup, AI or save POSTs after a timeout.
export async function ensureBackendReady() {
  if (Date.now() < readyUntil) return
  if (warming) return warming
  warming = (async () => {
    const notice = setTimeout(() => publish(true), 1800)
    const deadline = Date.now() + 75_000
    try {
      while (Date.now() < deadline) {
        try {
          const response = await fetch(`${API_BASE}/api/health`, {
            signal: AbortSignal.timeout(Math.min(20_000, deadline - Date.now())), cache: 'no-store',
          })
          if (response.ok && (await response.json())?.success) { readyUntil = Date.now() + 60_000; return }
        } catch { /* idle servers may take around a minute to wake up */ }
        if (Date.now() + 1500 < deadline) await new Promise((resolve) => setTimeout(resolve, 1500))
      }
      throw new Error('서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.')
    } finally { clearTimeout(notice); publish(false) }
  })().finally(() => { warming = null })
  return warming
}

export async function fetchBackend(path, { timeoutMs = 15_000, ...options } = {}) {
  await ensureBackendReady()
  const send = () => fetch(`${API_BASE}${path}`, { ...options, signal: AbortSignal.timeout(timeoutMs) })
  const safe = !options.method || options.method.toUpperCase() === 'GET'
  let response
  try { response = await send() }
  catch (error) {
    if (!safe) throw error
    readyUntil = 0
    await ensureBackendReady()
    return send()
  }
  if ([502, 503, 504].includes(response.status)) {
    readyUntil = 0
    if (safe) { await ensureBackendReady(); return send() }
  }
  return response
}

export async function apiError(response, fallback) {
  const payload = await response.json().catch(() => null)
  return new Error(payload?.error?.message ?? fallback)
}
