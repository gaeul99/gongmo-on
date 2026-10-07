// ==========================================================
// 계정·세션·사용자 데이터 저장소
// DB가 없는 데모 프로젝트라 notificationStore.ts처럼 backend/data/
// 아래 JSON 파일로 보관합니다. 브라우저를 정리해도 서버의 이 파일에
// 계정과 내역이 남아, 다시 로그인하면 복원됩니다.
// ==========================================================

import crypto from 'crypto'
import fs from 'fs'
import path from 'path'

export type Account = {
  nickname: string
  salt: string
  passwordHash: string
  email: string
  phone?: string | undefined
  createdAt: string
}

// 프론트 dataPortability.js의 내보내기 형식과 같은 구조 — 로그인 복원이
// 파일 가져오기와 같은 병합 경로를 타게 하기 위해서입니다.
export type UserData = {
  myContests: unknown[]
  wishlist: unknown[]
  savedIdeas: unknown[]
  typeTest: unknown
  checklist: Record<string, boolean>
  practiceNotes: unknown[]
}

export type UserDataRecord = {
  data: UserData
  updatedAt: string
}

const DATA_DIR = path.resolve(__dirname, '..', 'data')
const ACCOUNTS_FILE = path.join(DATA_DIR, 'accounts.json')
const USERDATA_FILE = path.join(DATA_DIR, 'userdata.json')
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json')
const SESSION_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 30 // 30일

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readJson<T>(file: string, fallback: T): T {
  try {
    const raw = fs.readFileSync(file, 'utf-8')
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeJson(file: string, value: unknown) {
  ensureDataDir()
  fs.writeFileSync(file, JSON.stringify(value, null, 2), 'utf-8')
}

// ---------- 비밀번호 해시 (salt + scrypt, 평문 저장 없음) ----------

export function hashPassword(password: string, salt: string): string {
  return crypto.scryptSync(password, salt, 64).toString('hex')
}

export function makeSalt(): string {
  return crypto.randomBytes(16).toString('hex')
}

export function verifyPassword(account: Account, password: string): boolean {
  const candidate = hashPassword(password, account.salt)
  const a = Buffer.from(candidate, 'hex')
  const b = Buffer.from(account.passwordHash, 'hex')
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

// ---------- 계정 ----------

export function listAccounts(): Account[] {
  return readJson<Account[]>(ACCOUNTS_FILE, [])
}

export function findAccount(nickname: string): Account | undefined {
  return listAccounts().find((item) => item.nickname === nickname)
}

export function saveAccount(account: Account) {
  const accounts = listAccounts()
  const updated = accounts.some((item) => item.nickname === account.nickname)
    ? accounts.map((item) => (item.nickname === account.nickname ? account : item))
    : [...accounts, account]
  writeJson(ACCOUNTS_FILE, updated)
}

export function deleteAccount(nickname: string) {
  writeJson(ACCOUNTS_FILE, listAccounts().filter((item) => item.nickname !== nickname))
}

// ---------- 세션 ----------

function readSessions(): Record<string, { nickname: string; createdAt: string }> {
  return readJson(SESSIONS_FILE, {})
}

export function createSession(nickname: string): string {
  const token = crypto.randomBytes(32).toString('hex')
  const sessions = readSessions()
  sessions[token] = { nickname, createdAt: new Date().toISOString() }
  writeJson(SESSIONS_FILE, sessions)
  return token
}

export function getSessionUser(token: string): string | undefined {
  const session = readSessions()[token]
  if (!session) return undefined
  if (Date.now() - new Date(session.createdAt).getTime() > SESSION_MAX_AGE_MS) {
    deleteSession(token)
    return undefined
  }
  return session.nickname
}

export function deleteSession(token: string) {
  const sessions = readSessions()
  if (token in sessions) {
    delete sessions[token]
    writeJson(SESSIONS_FILE, sessions)
  }
}

// 아이디 변경 — 이 아이디의 모든 세션을 새 아이디로 옮겨 로그인 상태를 유지합니다.
export function renameSessions(oldNickname: string, newNickname: string) {
  const sessions = readSessions()
  let changed = false
  for (const session of Object.values(sessions)) {
    if (session.nickname === oldNickname) {
      session.nickname = newNickname
      changed = true
    }
  }
  if (changed) writeJson(SESSIONS_FILE, sessions)
}

// 서버 시작 때 만료된 세션을 한 번 정리합니다.
export function pruneExpiredSessions() {
  const sessions = readSessions()
  const now = Date.now()
  let changed = false
  for (const [token, session] of Object.entries(sessions)) {
    if (now - new Date(session.createdAt).getTime() > SESSION_MAX_AGE_MS) {
      delete sessions[token]
      changed = true
    }
  }
  if (changed) writeJson(SESSIONS_FILE, sessions)
}

// ---------- 사용자 데이터 ----------

function emptyUserData(): UserData {
  return {
    myContests: [],
    wishlist: [],
    savedIdeas: [],
    typeTest: null,
    checklist: {},
    practiceNotes: [],
  }
}

export function getUserData(nickname: string): UserData {
  const store = readJson<Record<string, UserDataRecord>>(USERDATA_FILE, {})
  return store[nickname]?.data ?? emptyUserData()
}

export function saveUserData(nickname: string, data: UserData): UserDataRecord {
  const store = readJson<Record<string, UserDataRecord>>(USERDATA_FILE, {})
  const record: UserDataRecord = { data, updatedAt: new Date().toISOString() }
  store[nickname] = record
  writeJson(USERDATA_FILE, store)
  return record
}

// 아이디 변경 — 사용자 데이터 백업 키도 새 아이디로 옮깁니다.
export function renameUserdata(oldNickname: string, newNickname: string) {
  const store = readJson<Record<string, UserDataRecord>>(USERDATA_FILE, {})
  const record = store[oldNickname]
  if (!record) return
  store[newNickname] = record
  delete store[oldNickname]
  writeJson(USERDATA_FILE, store)
}
