import { Router } from 'express'
import { postInquiry } from '../controllers/inquiry.controller'
import { rateLimit } from '../middleware/security'

export const inquiryRouter = Router()

// 문의는 아무나 보낼 수 있고 담당자에게 메일을 보내므로 스팸 방지를 위해 타이트하게 제한한다.
inquiryRouter.post('/', rateLimit({ windowMs: 10 * 60 * 1000, max: 5, name: 'inquiries' }), postInquiry)
