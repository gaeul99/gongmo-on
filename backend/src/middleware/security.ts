// ==========================================================
// 공통 보안 미들웨어
// 의존성을 늘리지 않기 위해 express-rate-limit·helmet 대신
// 데모 규모(단일 프로세스)에 맞는 초경량 구현을 쓴다.
// ==========================================================

import crypto from 'crypto'
import type { NextFunction, Request, Response } from 'express'
import { getSessionUser } from '../services/userStore'

// ---------- Rate limiting ----------

type Bucket = { count: number; resetAt: number }
const buckets = new Map<string, Bucket>()
let lastSweep = Date.now()

/**
 * IP별 요청 수 제한. 윈도우가 지나면 카운트가 초기화되고, 초과하면 429를 돌려준다.
 * @param name 버킷을 구분하는 이름(엔드포인트별로 다르게)
 */
export function rateLimit(options: { windowMs: number; max: number; name: string }) {
  const { windowMs, max, name } = options
  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now()
    // 10분마다 만료된 버킷을 비워 맵이 무한히 자라지 않게 한다.
    if (now - lastSweep > 600_000) {
      for (const [key, bucket] of buckets) {
        if (bucket.resetAt <= now) buckets.delete(key)
      }
      lastSweep = now
    }
    const key = `${name}:${req.ip ?? 'unknown'}`
    const bucket = buckets.get(key)
    if (!bucket || bucket.resetAt <= now) {
      buckets.set(key, { count: 1, resetAt: now + windowMs })
      next()
      return
    }
    bucket.count += 1
    if (bucket.count > max) {
      res.status(429).json({
        success: false,
        error: {
          code: 'TOO_MANY_REQUESTS',
          message: '요청이 너무 많아요. 잠시 후에 다시 시도해 주세요.',
        },
      })
      return
    }
    next()
  }
}

// ---------- 인증·권한 ----------

function timingSafeEqualStr(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf-8')
  const right = Buffer.from(b, 'utf-8')
  return left.length === right.length && crypto.timingSafeEqual(left, right)
}

/** 수동 마감 점검(POST /api/notifications/run)처럼 관리 전용 동작을 보호한다. */
export function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ADMIN_TOKEN ?? ''
  const provided = req.headers['x-admin-token']
  const providedText = typeof provided === 'string' ? provided : ''
  if (!expected || !timingSafeEqualStr(providedText, expected)) {
    res.status(403).json({
      success: false,
      error: { code: 'FORBIDDEN', message: '관리자 토큰이 필요해요.' },
    })
    return
  }
  next()
}

/** 발송 통계처럼 로그인한 사용자만 봐야 하는 정보를 보호한다. */
export function requireSession(req: Request, res: Response, next: NextFunction) {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7) : ''
  const nickname = token ? getSessionUser(token) : undefined
  if (!nickname) {
    res.status(401).json({
      success: false,
      error: { code: 'UNAUTHORIZED', message: '로그인이 필요한 정보예요.' },
    })
    return
  }
  next()
}

// ---------- 보안 헤더 ----------

/** helmet 없이 최소한의 응답 헤더를 채운다. */
export function securityHeaders(_req: Request, res: Response, next: NextFunction) {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('X-Frame-Options', 'DENY')
  res.setHeader('Referrer-Policy', 'no-referrer')
  next()
}
