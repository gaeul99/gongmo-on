import { afterEach, beforeEach, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ fetchBackend: vi.fn() }))
vi.mock('./backendConnection.js', () => ({ fetchBackend: mocks.fetchBackend }))
beforeEach(() => { vi.resetModules(); mocks.fetchBackend.mockReset() })
afterEach(() => vi.unstubAllGlobals())

it('does not reactivate a late login after the active account changes', async () => {
  const values = new Map()
  vi.stubGlobal('localStorage', {
    getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  })
  let finish
  mocks.fetchBackend.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
  const { signIn } = await import('./auth.js')
  const pending = signIn('old', 'password')
  const newer = JSON.stringify({ token: 'newer-session', user: { id: 'newer' } })
  values.set('gongmo-on:auth-session', newer)
  finish({ ok: true, json: async () => ({ success: true, data: { token: 'old-session', user: { id: 'old' } } }) })
  expect((await pending).ok).toBe(false)
  expect(values.get('gongmo-on:auth-session')).toBe(newer)
})
