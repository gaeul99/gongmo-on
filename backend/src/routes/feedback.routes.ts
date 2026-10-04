import { Router } from 'express'
import {
  getFeedbackOverview,
  postAnalysisFeedback,
  postFeedback,
} from '../controllers/feedback.controller'

export const feedbackRouter = Router()

feedbackRouter.post('/', postFeedback)
feedbackRouter.post('/analysis', postAnalysisFeedback)
feedbackRouter.get('/stats', getFeedbackOverview)
