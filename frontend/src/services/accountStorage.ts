const OWNER = 'gongmo-on:workspace-owner'
const SNAPSHOTS = 'gongmo-on:workspace:'
const USER = 'gongmo-on:user'
const TOKEN = 'gongmo-on:auth-token'
const AUTH = 'gongmo-on:auth-session'
const GUEST = 'guest'
const CHANGE = 'gongmo-on:account-change'

const isDataKey = (key: string) => key.startsWith('gongmo-on:') &&
  ![OWNER, USER, TOKEN, AUTH].includes(key) && !key.startsWith(SNAPSHOTS)
const snapshotKey = (owner: string) => `${SNAPSHOTS}${encodeURIComponent(owner)}`

function readActive(): Record<string, string> {
  const data: Record<string, string> = {}
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i)
    if (key && isDataKey(key)) data[key] = localStorage.getItem(key) ?? ''
  }
  return data
}

function replaceActive(data: Record<string, string>) {
  for (const key of Object.keys(readActive())) localStorage.removeItem(key)
  for (const [key, value] of Object.entries(data)) {
    if (isDataKey(key) && typeof value === 'string') localStorage.setItem(key, value)
  }
}

function readSnapshot(owner: string): Record<string, string> {
  const raw = localStorage.getItem(snapshotKey(owner))
  const data = raw ? JSON.parse(raw) : {}
  return data && typeof data === 'object' && !Array.isArray(data) ? data : {}
}

export function clearAccountSession() {
  const keys = Array.from({ length: sessionStorage.length }, (_, i) => sessionStorage.key(i))
  for (const key of keys) {
    if (key?.startsWith('gongmo-on:')) sessionStorage.removeItem(key)
  }
}

export function initializeAccountStorage() {
  try {
    const auth = JSON.parse(localStorage.getItem(AUTH) ?? 'null')
    const user = auth ? auth.user : JSON.parse(localStorage.getItem(USER) ?? 'null')
    const token = auth ? auth.token : localStorage.getItem(TOKEN)
    const knownUser = token && typeof user?.nickname === 'string'
    const owner = knownUser ? accountOwner(user) : GUEST
    if (localStorage.getItem(OWNER)) {
      if (localStorage.getItem(OWNER) !== owner) switchAccountStorage(knownUser ? user : null)
      return true
    }
    // Anonymous legacy data has no provable owner. Retain it separately, never
    // silently upload it into the next person's account on a shared computer.
    if (!knownUser && Object.keys(readActive()).length) {
      localStorage.setItem(snapshotKey('legacy-unassigned'), JSON.stringify(readActive()))
      replaceActive({})
      clearAccountSession()
    }
    localStorage.setItem(OWNER, owner)
    return true
  } catch {
    // Do not render another person's legacy data when migration cannot complete.
    return false
  }
}

type Account = { id?: string; joinedAt: string; nickname: string }
export const accountOwner = (user: Account) => `user:${user.id || user.joinedAt}`

export function switchAccountStorage(user: Account | null) {
  const previous = localStorage.getItem(OWNER) ?? GUEST
  const next = user === null ? GUEST : accountOwner(user)
  if (previous === next) return
  const saved = readActive()
  // Save before clearing; if quota is exhausted, abort without losing data.
  localStorage.setItem(snapshotKey(previous), JSON.stringify(saved))
  const incoming = readSnapshot(next)
  try {
    replaceActive(incoming)
    localStorage.setItem(OWNER, next)
    clearAccountSession()
  } catch (error) {
    replaceActive(saved)
    localStorage.setItem(OWNER, previous)
    throw error
  }
}

export function migrateAccountIdentity(previous: Account, next: Account) {
  if (previous.id || accountOwner(previous) === accountOwner(next) || previous.joinedAt !== next.joinedAt) return
  // An existing signed-in browser learns its immutable server ID on re-login.
  localStorage.setItem(snapshotKey(accountOwner(previous)), JSON.stringify(readActive()))
  localStorage.setItem(snapshotKey(accountOwner(next)), JSON.stringify(readActive()))
  localStorage.setItem(OWNER, accountOwner(next))
}

export function accountContext(): string {
  try {
    const raw = localStorage.getItem(AUTH)
    const token = raw ? JSON.parse(raw)?.token : localStorage.getItem(TOKEN)
    return `${localStorage.getItem(OWNER) ?? GUEST}|${token ?? ''}`
  }
  catch { return 'unavailable' }
}

export function discardActiveAccountStorage() {
  replaceActive({})
  localStorage.setItem(OWNER, GUEST)
  clearAccountSession()
}

export function notifyAccountChanged() {
  window.dispatchEvent(new Event(CHANGE))
}

let revision = 0
export const getAccountRevision = () => revision
export function subscribeAccountChanges(listener: () => void) {
  let timer: number | undefined
  const refresh = () => { clearAccountSession(); revision += 1; listener() }
  const storage = (event: StorageEvent) => {
    if (![OWNER, TOKEN, USER, AUTH, null].includes(event.key)) return
    window.clearTimeout(timer)
    timer = window.setTimeout(refresh, 50)
  }
  window.addEventListener(CHANGE, refresh)
  window.addEventListener('storage', storage)
  return () => {
    window.clearTimeout(timer)
    window.removeEventListener(CHANGE, refresh)
    window.removeEventListener('storage', storage)
  }
}
