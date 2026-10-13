// ==========================================================
// 문의 접수 컨트롤러 — 푸터 '문의하기' 창에서 온 요청을 받습니다.
// ==========================================================

import type { Request, Response } from 'express'
import { appendInquiry } from '../services/inquiryStore'
import { sendEmail, type SendResult } from '../services/notificationSenders'

// 문의를 받을 담당자 이메일. 배포 시 CONTACT_EMAIL 환경변수로 바꿀 수 있다.
const CONTACT_EMAIL = process.env.CONTACT_EMAIL ?? 'rkf111122@gmail.com'

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

// 프론트 ContactModal의 분류 선택지와 같은 순서·같은 값이다.
const CATEGORIES = ['서비스 이용', '버그 신고', '기능 제안', '기타'] as const

export async function postInquiry(req: Request, res: Response) {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : ''
  const category = typeof req.body?.category === 'string' ? req.body.category.trim() : ''
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : ''

  if (!CATEGORIES.includes(category as (typeof CATEGORIES)[number])) {
    res.status(400).json({ success: false, error: { code: 'INVALID_CATEGORY', message: '문의 분류를 골라 주세요.' } })
    return
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_EMAIL', message: '답변 받을 이메일 주소가 올바르지 않아요.' } })
    return
  }
  if (!content || content.length > 2000) {
    res.status(400).json({ success: false, error: { code: 'INVALID_CONTENT', message: '문의 내용은 1자 이상 2000자 이하로 적어 주세요.' } })
    return
  }

  const inquiry = appendInquiry({ email, category, content })

  // 담당자에게 알림 메일을 보낸다. SMTP가 없으면 로그·아웃박스에만 기록된다(데모 모드).
  const delivery: SendResult = await sendEmail(
    CONTACT_EMAIL,
    `[공모온] 새 문의가 접수됐어요 — ${category}`,
    [
      `분류: ${category}`,
      `답변 받을 이메일: ${email || '(없음)'}`,
      `접수 시각: ${inquiry.at}`,
      '',
      content,
    ].join('\n'),
  )

  res.json({ success: true, data: { id: inquiry.id, delivery } })
}
