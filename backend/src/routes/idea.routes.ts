import { Router } from 'express'
import { postIdeaAnalysis } from '../controllers/idea.controller'

export const ideaRouter = Router()

ideaRouter.post('/analyze', postIdeaAnalysis)
