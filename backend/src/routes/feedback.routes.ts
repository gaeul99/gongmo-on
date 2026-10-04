import { Router } from 'express'
import { getFeedbackOverview, postFeedback } from '../controllers/feedback.controller'

export const feedbackRouter = Router()

feedbackRouter.post('/', postFeedback)
feedbackRouter.get('/stats', getFeedbackOverview)
