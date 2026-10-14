// ==========================================================
// 공모전 자동 등록 라우트
// GET /api/contests        — 자동 수집된 공모전 목록(마감 지난 것도 기록으로 포함 —
//                            마감 60일 경과분만 동기화 때 제거된다)
// POST /api/contests/sync  — 즉시 동기화 실행(수동 점검용)
// ==========================================================

import { Router } from 'express'
import type { Request, Response } from 'express'
import { requireAdminToken } from '../middleware/security'
import { getContests, syncContests, type SyncedContest } from '../services/contestSync'

export const contestRouter = Router()

contestRouter.get('/', (_req: Request, res: Response) => {
  const contests: SyncedContest[] = getContests()
  res.json({ success: true, count: contests.length, contests })
})

// 수동 동기화는 외부 사이트에 부하를 주므로 마감 점검과 같은 관리자 토큰으로 보호한다
contestRouter.post('/sync', requireAdminToken, (req: Request, res: Response) => {
  const force = req.query.force !== '0'
  syncContests({ force })
    .then((summary) => res.json({ success: true, summary }))
    .catch((error: unknown) => {
      console.error('[contest.routes] 동기화 실패:', error)
      res.status(500).json({
        success: false,
        error: { code: 'SYNC_FAILED', message: '공모전 동기화에 실패했어요. 잠시 후 다시 시도해 주세요.' },
      })
    })
})
