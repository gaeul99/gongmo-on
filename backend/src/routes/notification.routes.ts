import { Router } from 'express'
import {
  getChannelStatus,
  getOutbox,
  getStats,
  postRunCheck,
  postSubscribe,
} from '../controllers/notification.controller'

export const notificationRouter = Router()

notificationRouter.post('/subscribe', postSubscribe)
notificationRouter.get('/outbox', getOutbox)
notificationRouter.get('/channels', getChannelStatus)
notificationRouter.get('/stats', getStats)
notificationRouter.post('/run', postRunCheck)
