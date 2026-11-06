import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ fetchBackend: vi.fn() }))
vi.mock('./backendConnection.js', () => ({ fetchBackend: mocks.fetchBackend, apiError: async () => new Error('failed') }))
beforeEach(() => { vi.resetModules(); mocks.fetchBackend.mockReset() })
afterEach(() => vi.unstubAllGlobals())

describe('AI request isolation and deduplication', () => {
  it('coalesces two render attempts into one billable request', async () => {
    vi.stubGlobal('localStorage', { getItem: () => null })
    let finish
    mocks.fetchBackend.mockImplementation(() => new Promise((resolve) => { finish = resolve }))
    const { requestAiAnalysis } = await import('./aiAnalysis.js')
    const idea = { title: 'test', description: 'test idea', category: '' }
    const first = requestAiAnalysis(idea, [], [])
    const second = requestAiAnalysis(idea, [], [])
    expect(mocks.fetchBackend).toHaveBeenCalledTimes(1)
    finish({ ok: true, json: async () => ({ success: true, data: { owner: 'a' } }) })
    expect(await first).toEqual(await second)
  })
  it('does not share a cached private analysis across account sessions', async () => {
    let token = 'a'
    vi.stubGlobal('localStorage', { getItem: (key) => key === 'gongmo-on:auth-session' ? JSON.stringify({ token }) : null })
    mocks.fetchBackend.mockImplementation(async () => ({ ok: true, json: async () => ({ success: true, data: { owner: token } }) }))
    const { requestAiAnalysis } = await import('./aiAnalysis.js')
    const idea = { title: 'same title', description: 'same input', category: '' }
    expect((await requestAiAnalysis(idea, [], [])).owner).toBe('a')
    token = 'b'
    expect((await requestAiAnalysis(idea, [], [])).owner).toBe('b')
    expect(mocks.fetchBackend).toHaveBeenCalledTimes(2)
  })
})
