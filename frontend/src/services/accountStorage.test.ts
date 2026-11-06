import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { initializeAccountStorage, switchAccountStorage, accountContext, migrateAccountIdentity } from './accountStorage'

class MemoryStorage implements Storage {
  private data = new Map<string, string>()
  get length() { return this.data.size }
  key(index: number) { return [...this.data.keys()][index] ?? null }
  getItem(key: string) { return this.data.get(key) ?? null }
  setItem(key: string, value: string) { this.data.set(key, value) }
  removeItem(key: string) { this.data.delete(key) }
  clear() { this.data.clear() }
}
const alice = { id: 'immutable-a', nickname: 'alice', joinedAt: '2026-01-01' }
const bob = { id: 'immutable-b', nickname: 'bob', joinedAt: '2026-01-02' }
const notes = 'gongmo-on:practice-notes'

beforeEach(() => {
  vi.stubGlobal('localStorage', new MemoryStorage())
  vi.stubGlobal('sessionStorage', new MemoryStorage())
})
afterEach(() => vi.unstubAllGlobals())

describe('account workspace isolation', () => {
  it('never transfers guest or another account records and restores each owner', () => {
    initializeAccountStorage()
    localStorage.setItem(notes, 'guest notes')
    switchAccountStorage(alice)
    expect(localStorage.getItem(notes)).toBeNull()
    localStorage.setItem(notes, 'alice notes')
    sessionStorage.setItem('gongmo-on:analysis', 'private analysis')
    switchAccountStorage(null)
    expect(localStorage.getItem(notes)).toBe('guest notes')
    expect(sessionStorage.getItem('gongmo-on:analysis')).toBeNull()
    switchAccountStorage(bob)
    expect(localStorage.getItem(notes)).toBeNull()
    localStorage.setItem(notes, 'bob notes')
    switchAccountStorage(alice)
    expect(localStorage.getItem(notes)).toBe('alice notes')
  })
  it('does not give a reused nickname access to its previous owner records', () => {
    initializeAccountStorage()
    switchAccountStorage(alice)
    localStorage.setItem(notes, 'private')
    switchAccountStorage({ ...bob, nickname: 'alice' })
    expect(localStorage.getItem(notes)).toBeNull()
  })
  it('isolates anonymous legacy records while preserving them for recovery', () => {
    localStorage.setItem(notes, 'unknown owner')
    expect(initializeAccountStorage()).toBe(true)
    expect(localStorage.getItem(notes)).toBeNull()
    expect(localStorage.getItem('gongmo-on:workspace:legacy-unassigned')).toContain('unknown owner')
  })
  it('retains known signed-in legacy records and migrates to an immutable ID', () => {
    const legacy = { nickname: 'alice', joinedAt: alice.joinedAt }
    localStorage.setItem('gongmo-on:user', JSON.stringify(legacy))
    localStorage.setItem('gongmo-on:auth-token', 'token-a')
    localStorage.setItem(notes, 'existing record')
    initializeAccountStorage()
    migrateAccountIdentity(legacy, alice)
    switchAccountStorage(alice)
    expect(localStorage.getItem(notes)).toBe('existing record')
  })
  it('reconciles a reload halfway through an identity change using the atomic auth envelope', () => {
    initializeAccountStorage()
    switchAccountStorage(alice)
    localStorage.setItem('gongmo-on:auth-session', JSON.stringify({ token: 'token-a', user: alice }))
    localStorage.setItem(notes, 'alice notes')
    const context = accountContext()
    switchAccountStorage(bob) // simulate closing the tab before auth commit
    expect(accountContext()).not.toBe(context)
    initializeAccountStorage()
    expect(localStorage.getItem(notes)).toBe('alice notes')
  })
  it('does not clear existing records if saving the previous workspace fails', () => {
    initializeAccountStorage()
    switchAccountStorage(alice)
    localStorage.setItem(notes, 'keep me')
    vi.spyOn(localStorage, 'setItem').mockImplementation(() => { throw new Error('quota') })
    expect(() => switchAccountStorage(bob)).toThrow('quota')
    expect(localStorage.getItem(notes)).toBe('keep me')
  })
})
