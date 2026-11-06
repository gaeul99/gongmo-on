import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

beforeEach(() => { vi.resetModules(); vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const ok = () => ({ ok: true, status: 200, json: async () => ({ success: true }) })

describe('cold backend connections', () => {
  it('shares one warm-up and starts mutation timeouts only after waking', async () => {
    const calls = []
    vi.stubGlobal('fetch', vi.fn((url) => {
      calls.push(url)
      return url.endsWith('/api/health') ? new Promise((resolve) => setTimeout(() => resolve(ok()), 45_000)) : Promise.resolve(ok())
    }))
    const { fetchBackend, getBackendConnecting } = await import('./backendConnection.js')
    const login = fetchBackend('/api/auth/login', { method: 'POST', timeoutMs: 15_000 })
    const data = fetchBackend('/api/userdata')
    await vi.advanceTimersByTimeAsync(44_000)
    expect(calls).toHaveLength(1)
    expect(getBackendConnecting()).toBe(true)
    await vi.advanceTimersByTimeAsync(1000)
    await Promise.all([login, data])
    expect(calls.filter((url) => url.endsWith('/api/health'))).toHaveLength(1)
    expect(calls.filter((url) => url.endsWith('/api/auth/login'))).toHaveLength(1)
    expect(getBackendConnecting()).toBe(false)
  })
  it('retries readiness failures but never replays a failed AI POST', async () => {
    let health = 0
    let ai = 0
    vi.stubGlobal('fetch', vi.fn(async (url) => {
      if (url.endsWith('/api/health')) {
        health += 1
        if (health === 1) throw new Error('waking')
        return ok()
      }
      ai += 1
      throw new Error('request timed out after sending')
    }))
    const { fetchBackend } = await import('./backendConnection.js')
    const result = expect(fetchBackend('/api/ideas/analyze', { method: 'POST' })).rejects.toThrow('timed out')
    await vi.advanceTimersByTimeAsync(2000)
    await result
    expect(health).toBe(2)
    expect(ai).toBe(1)
  })
})
