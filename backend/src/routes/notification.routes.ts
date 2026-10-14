import { Router } from 'express'
import {
  postRunCheck,
  postSubscribe,
  postWeeklyDigest,
} from '../controllers/notification.controller'
import { rateLimit, requireAdminToken } from '../middleware/security'

export const notificationRouter = Router()

notificationRouter.post('/subscribe', postSubscribe)
// 주간 다이제스트는 실제 이메일을 발송하므로 따로 더 타이트하게 제한한다.
notificationRouter.post(
  '/weekly',
  rateLimit({ windowMs: 10 * 60 * 1000, max: 5, name: 'weekly' }),
  postWeeklyDigest,
)
// 전체 구독자 대량 발송을 트리거하는 수동 점검은 관리자 토큰이 있어야 한다.
notificationRouter.post('/run', requireAdminToken, postRunCheck)
