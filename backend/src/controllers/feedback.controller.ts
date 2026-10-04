// ==========================================================
// 유형 검사 추천 피드백 컨트롤러 — 검증과 에러 매핑을 담당합니다.
// ==========================================================

import type { Request, Response } from 'express'
import { getFeedbackStats, upsertFeedback } from '../services/feedbackStore'

export function postFeedback(req: Request, res: Response) {
  const sessionId = typeof req.body?.sessionId === 'string' ? req.body.sessionId.trim() : ''
  const typeId = typeof req.body?.typeId === 'string' ? req.body.typeId.trim() : ''
  const contestTitle =
    typeof req.body?.contestTitle === 'string' ? req.body.contestTitle.trim() : ''
  const contestId = Number(req.body?.contestId)
  const vote = req.body?.vote

  if (!sessionId || sessionId.length > 64) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_SESSION', message: '세션 정보가 올바르지 않아요.' },
    })
    return
  }
  if (!typeId || typeId.length > 30) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_TYPE', message: '유형 정보가 올바르지 않아요.' },
    })
    return
  }
  if (!Number.isInteger(contestId) || contestId <= 0) {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_CONTEST', message: '공모전 정보가 올바르지 않아요.' },
    })
    return
  }
  if (vote !== 'up' && vote !== 'down') {
    res.status(400).json({
      success: false,
      error: { code: 'INVALID_VOTE', message: '평가 값은 up 또는 down이어야 해요.' },
    })
    return
  }

  const entry = upsertFeedback({
    sessionId,
    typeId,
    contestId,
    contestTitle: contestTitle.slice(0, 120),
    vote,
  })
  res.json({ success: true, data: entry })
}

export function getFeedbackOverview(_req: Request, res: Response) {
  res.json({ success: true, data: getFeedbackStats() })
}
