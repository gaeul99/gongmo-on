import { Router } from 'express'
import { postIdeaAnalysis, postIdeaJudging } from '../controllers/idea.controller'

export const ideaRouter = Router()

ideaRouter.post('/analyze', postIdeaAnalysis)
ideaRouter.post('/judge', postIdeaJudging)
