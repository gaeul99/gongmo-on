// ==========================================================
// 사용자 데이터(응모·찜·아이디어·회고 등) 컨트롤러
// 로그인 토큰으로 본인 데이터만 읽고 씁니다. 저장 형식은
// dataPortability.js 내보내기와 같은 구조라 로그인 복원이
// 파일 가져오기와 같은 병합 로직을 재사용할 수 있습니다.
// ==========================================================

import type { Request, Response } from 'express'
import { getSessionUser, getUserData, saveUserData, type UserData } from '../services/userStore'

// 목록·객체 크기 제한 — 비정상 요청이 저장 파일을 부풀리지 않게 합니다.
const MAX_LIST_ITEMS = 300
const MAX_MAP_ENTRIES = 500

export function resolveNickname(req: Request): string | undefined {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return undefined
  return getSessionUser(token)
}

function sanitizeList(value: unknown): unknown[] {
  return Array.isArray(value) ? value.slice(0, MAX_LIST_ITEMS) : []
}

function sanitizeMap(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, MAX_MAP_ENTRIES))
}

// 저장 전에 형태를 대략적으로 다듬습니다. 항목 내부 검증은 프론트가
// 이미 저장한 데이터라 느슨하게 통과시킵니다.
function sanitizeUserData(input: unknown): UserData {
  const body = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const typeTest = body.typeTest === undefined || body.typeTest === null ? null : body.typeTest
  return {
    myContests: sanitizeList(body.myContests),
    wishlist: sanitizeList(body.wishlist),
    savedIdeas: sanitizeList(body.savedIdeas),
    typeTest,
    checklist: sanitizeMap(body.checklist) as Record<string, boolean>,
    practiceNotes: sanitizeList(body.practiceNotes),
  }
}

export function getUserdata(req: Request, res: Response) {
  const nickname = resolveNickname(req)
  if (!nickname) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: '로그인이 필요해요. 다시 로그인해 주세요.' },
    })
    return
  }
  res.json({ success: true, data: getUserData(nickname) })
}

export function putUserdata(req: Request, res: Response) {
  const nickname = resolveNickname(req)
  if (!nickname) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: '로그인이 필요해요. 다시 로그인해 주세요.' },
    })
    return
  }
  const record = saveUserData(nickname, sanitizeUserData(req.body?.data))
  res.json({ success: true, data: { updatedAt: record.updatedAt } })
}
