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
// 항목 하나·데이터 전체의 JSON 문자 길이 상한. 분석 스냅숏이 들어 있는
// 보관 아이디어도 넉넉히 수용하는 크기이며, 전체 상한이 저장 파일의 부풀림을 막는다.
const MAX_ITEM_CHARS = 64_000
const MAX_TOTAL_CHARS = 1_000_000

export function resolveNickname(req: Request): string | undefined {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  if (!token) return undefined
  return getSessionUser(token)
}

function sanitizeList(value: unknown): unknown[] {
  if (!Array.isArray(value)) return []
  return value
    .slice(0, MAX_LIST_ITEMS)
    .filter(
      (item) =>
        item !== null && item !== undefined && JSON.stringify(item ?? null).length <= MAX_ITEM_CHARS,
    )
}

function sanitizeMap(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .slice(0, MAX_MAP_ENTRIES)
      .filter(([key, item]) => key.length <= 100 && typeof item === 'boolean'),
  )
}

// 유형 검사 결과 — TypeTestPage가 저장하는 형태(typeId+백분율)만 통과시킨다.
// 임의의 거대 JSON이 그대로 저장되지 않게 검증한다.
function sanitizeTypeTest(value: unknown): unknown {
  if (value === undefined || value === null) return null
  if (typeof value !== 'object' || Array.isArray(value)) return null
  const input = value as Record<string, unknown>
  if (typeof input.typeId !== 'string' || input.typeId.length > 40) return null
  if (
    input.percentage !== undefined &&
    (typeof input.percentage !== 'number' || !Number.isFinite(input.percentage))
  ) {
    return null
  }
  if (typeof input.savedAt !== 'string' || input.savedAt.length > 40) return null
  let distribution: unknown = undefined
  if (Array.isArray(input.distribution)) {
    distribution = input.distribution
      .slice(0, 10)
      .filter(
        (row) =>
          typeof row === 'object' &&
          row !== null &&
          typeof (row as Record<string, unknown>).id === 'string' &&
          ((row as Record<string, unknown>).id as string).length <= 40 &&
          typeof (row as Record<string, unknown>).percent === 'number',
      )
  }
  return {
    typeId: input.typeId,
    percentage: typeof input.percentage === 'number' ? input.percentage : undefined,
    savedAt: input.savedAt,
    ...(distribution !== undefined ? { distribution } : {}),
  }
}

// 로드맵 체크 — roadmap.js 저장 형태({ [공모전id]: { checked, updatedAt } })만
// 통과시킨다. 출품 로드맵 체크가 서버 백업에 빠지지 않게 하는 필드다.
function sanitizeRoadmaps(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  const input = value as Record<string, unknown>
  const result: Record<string, unknown> = {}
  for (const [contestId, entry] of Object.entries(input).slice(0, 200)) {
    if (contestId.length > 40 || typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      continue
    }
    const raw = entry as Record<string, unknown>
    const checked = sanitizeMap(raw.checked)
    const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt.slice(0, 40) : undefined
    result[contestId] = {
      checked,
      ...(updatedAt !== undefined ? { updatedAt } : {}),
    }
  }
  return result
}

// 저장 전에 형태를 다듬는다. 항목 내부 필드까지 검증하지는 않지만(프론트가
// 쓴 데이터라), 각 항목의 크기와 전체 크기는 상한 안으로 묶어 저장 파일이
// 비정상적으로 커지지 않게 한다.
function sanitizeUserData(input: unknown): UserData | null {
  const body = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const sanitized: UserData = {
    myContests: sanitizeList(body.myContests),
    wishlist: sanitizeList(body.wishlist),
    savedIdeas: sanitizeList(body.savedIdeas),
    typeTest: sanitizeTypeTest(body.typeTest),
    checklist: sanitizeMap(body.checklist) as Record<string, boolean>,
    roadmaps: sanitizeRoadmaps(body.roadmaps),
    practiceNotes: sanitizeList(body.practiceNotes),
  }
  if (JSON.stringify(sanitized).length > MAX_TOTAL_CHARS) return null
  return sanitized
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
  const sanitized = sanitizeUserData(req.body?.data)
  if (!sanitized) {
    res.status(400).json({
      success: false,
      error: { code: 'DATA_TOO_LARGE', message: '저장하려는 데이터가 너무 커요. 일부를 정리한 뒤 다시 시도해 주세요.' },
    })
    return
  }
  const record = saveUserData(nickname, sanitized)
  res.json({ success: true, data: { updatedAt: record.updatedAt } })
}
