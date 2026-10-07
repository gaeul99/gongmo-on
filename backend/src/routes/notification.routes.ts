import { Router } from 'express'
import {
  getStats,
  postRunCheck,
  postSubscribe,
  postWeeklyDigest,
} from '../controllers/notification.controller'

export const notificationRouter = Router()

notificationRouter.post('/subscribe', postSubscribe)
notificationRouter.post('/weekly', postWeeklyDigest)
notificationRouter.get('/stats', getStats)
notificationRouter.post('/run', postRunCheck)
