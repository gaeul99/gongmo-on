import { Router } from 'express'
import { getChatConfig, postChat } from '../controllers/chat.controller'

export const chatRouter = Router()

chatRouter.get('/config', getChatConfig)
chatRouter.post('/', postChat)
