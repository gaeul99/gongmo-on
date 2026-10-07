// ==========================================================
// 회원가입·로그인·로그아웃 컨트롤러 — 검증과 에러 매핑을 담당합니다.
// 계정은 userStore(backend/data/accounts.json)에, 비밀번호는
// salt+scrypt 해시로만 저장합니다.
// ==========================================================

import type { Request, Response } from 'express'
import {
  createSession,
  deleteAccount,
  deleteSession,
  findAccount,
  getSessionUser,
  hashPassword,
  makeSalt,
  renameSessions,
  renameUserdata,
  saveAccount,
  verifyPassword,
  type Account,
} from '../services/userStore'

const NICKNAME_MAX = 20
const PASSWORD_MAX = 40
const EMAIL_MAX = 60
const PHONE_MAX = 20

type SignupBody = {
  nickname?: unknown
  password?: unknown
  email?: unknown
  phone?: unknown
}

function publicUser(account: Account) {
  return {
    nickname: account.nickname,
    joinedAt: account.createdAt,
    email: account.email,
    phone: account.phone,
  }
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value.trim() : ''
}

export function postSignUp(req: Request, res: Response) {
  const body = (req.body ?? {}) as SignupBody
  const nickname = readString(body.nickname)
  const password = typeof body.password === 'string' ? body.password : ''
  const email = readString(body.email)
  const phoneDigits = readString(body.phone).replace(/\D/g, '')

  if (!nickname || nickname.length > NICKNAME_MAX) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_NICKNAME', message: '아이디는 1~20자로 입력해 주세요.' },
    })
    return
  }
  if (password.length < 4 || password.length > PASSWORD_MAX) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_PASSWORD', message: '비밀번호는 4자 이상이어야 해요.' },
    })
    return
  }
  if (!/^\S+@\S+\.\S+$/.test(email) || email.length > EMAIL_MAX) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_EMAIL', message: '알림을 받을 이메일 주소를 입력해 주세요.' },
    })
    return
  }
  if (phoneDigits && (phoneDigits.length < 9 || phoneDigits.length > 12)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PHONE',
        message: '휴대폰 번호 형식이 올바르지 않아요. 숫자만 9~12자로 입력해 주세요.',
      },
    })
    return
  }
  if (findAccount(nickname)) {
    res.status(409).json({
      success: false,
      error: { code: 'NICKNAME_TAKEN', message: '이미 가입된 아이디예요. 다른 아이디를 사용해 주세요.' },
    })
    return
  }

  const salt = makeSalt()
  const account: Account = {
    nickname,
    salt,
    passwordHash: hashPassword(password, salt),
    email,
    phone: phoneDigits || undefined,
    createdAt: new Date().toISOString(),
  }
  saveAccount(account)
  const token = createSession(nickname)
  res.json({ success: true, data: { user: publicUser(account), token } })
}

export function postSignIn(req: Request, res: Response) {
  const body = (req.body ?? {}) as SignupBody
  const nickname = readString(body.nickname)
  const password = typeof body.password === 'string' ? body.password : ''

  const account = findAccount(nickname)
  if (!account) {
    res.status(404).json({
      success: false,
      error: { code: 'ACCOUNT_NOT_FOUND', message: '가입되지 않은 아이디예요. 회원가입부터 진행해 주세요.' },
    })
    return
  }
  if (!verifyPassword(account, password)) {
    res.status(401).json({
      success: false,
      error: { code: 'WRONG_PASSWORD', message: '비밀번호가 일치하지 않아요.' },
    })
    return
  }

  const token = createSession(nickname)
  res.json({ success: true, data: { user: publicUser(account), token } })
}

export function postLogout(req: Request, res: Response) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (token) deleteSession(token)
  res.json({ success: true })
}

// ---------- 회원정보 수정 ----------

type ProfileBody = {
  currentPassword?: unknown
  nickname?: unknown
  email?: unknown
  phone?: unknown
}

function readBearer(req: Request): string {
  const header = req.headers.authorization ?? ''
  return header.startsWith('Bearer ') ? header.slice(7) : ''
}

// 회원정보 수정 — 현재 비밀번호 확인 후 아이디(표시 이름)·이메일·휴대폰을 바꿉니다.
// 아이디는 로그인 ID이자 저장소 키라, 바꾸면 세션과 사용자 데이터 백업도
// 함께 옮겨 로그인 상태와 내역이 그대로 유지됩니다.
export function putProfile(req: Request, res: Response) {
  const token = readBearer(req)
  const current = token ? getSessionUser(token) : undefined
  if (!current) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: '로그인 후 이용해 주세요.' },
    })
    return
  }
  const account = findAccount(current)
  if (!account) {
    res.status(404).json({
      success: false,
      error: { code: 'ACCOUNT_NOT_FOUND', message: '계정을 찾을 수 없어요. 다시 로그인해 주세요.' },
    })
    return
  }

  const body = (req.body ?? {}) as ProfileBody
  const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
  if (!currentPassword || !verifyPassword(account, currentPassword)) {
    res.status(401).json({
      success: false,
      error: { code: 'WRONG_PASSWORD', message: '현재 비밀번호가 일치하지 않아요.' },
    })
    return
  }

  const nextNickname = readString(body.nickname) || account.nickname
  const nextEmail = readString(body.email) || account.email
  const phoneDigits = readString(body.phone).replace(/\D/g, '')

  if (!nextNickname || nextNickname.length > NICKNAME_MAX) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_NICKNAME', message: '아이디는 1~20자로 입력해 주세요.' },
    })
    return
  }
  if (!/^\S+@\S+\.\S+$/.test(nextEmail) || nextEmail.length > EMAIL_MAX) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_EMAIL', message: '알림을 받을 이메일 주소를 입력해 주세요.' },
    })
    return
  }
  if (phoneDigits && (phoneDigits.length < 9 || phoneDigits.length > 12)) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_PHONE',
        message: '휴대폰 번호 형식이 올바르지 않아요. 숫자만 9~12자로 입력해 주세요.',
      },
    })
    return
  }
  if (nextNickname !== account.nickname && findAccount(nextNickname)) {
    res.status(409).json({
      success: false,
      error: { code: 'NICKNAME_TAKEN', message: '이미 사용 중인 아이디예요. 다른 아이디를 사용해 주세요.' },
    })
    return
  }

  const updated: Account = {
    ...account,
    nickname: nextNickname,
    email: nextEmail,
    phone: phoneDigits || undefined,
  }
  if (nextNickname !== account.nickname) {
    deleteAccount(account.nickname)
    saveAccount(updated)
    renameSessions(account.nickname, nextNickname)
    renameUserdata(account.nickname, nextNickname)
  } else {
    saveAccount(updated)
  }
  res.json({ success: true, data: { user: publicUser(updated) } })
}
