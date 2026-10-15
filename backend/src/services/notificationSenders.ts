// ==========================================================
// 이메일 발송기
// SMTP(SMTP_HOST 등) 설정이 있으면 nodemailer로 실제 발송하고,
// 설정이 없으면 콘솔에 기록하고 아웃박스에만 남깁니다(데모 모드).
// ==========================================================

import nodemailer from 'nodemailer'
import { appendOutbox } from './notificationStore'

const SMTP_HOST = process.env.SMTP_HOST ?? ''
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587)
const SMTP_USER = process.env.SMTP_USER ?? ''
const SMTP_PASS = process.env.SMTP_PASS ?? ''
const MAIL_FROM = process.env.MAIL_FROM ?? '공모온 <no-reply@gongmo-on.app>'

export type SendResult = 'sent' | 'log' | 'skipped' | 'failed'

export function emailConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)
}

export async function sendEmail(to: string, subject: string, text: string): Promise<SendResult> {
  if (!to) return 'skipped'

  let via = 'log'
  if (emailConfigured()) {
    try {
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465,
        auth: { user: SMTP_USER, pass: SMTP_PASS },
      })
      await transporter.sendMail({ from: MAIL_FROM, to, subject, text })
      via = 'smtp'
    } catch (error) {
      console.error('[알림] 이메일 발송 실패 — 아웃박스에만 기록합니다.', error)
      via = 'failed'
    }
  }

  await appendOutbox({ channel: 'email', to, subject, text, via })
  if (via === 'log') {
    console.log(`[알림·로그 모드] 이메일 → ${to} | ${subject}\n${text}`)
  }
  return via === 'smtp' ? 'sent' : via === 'failed' ? 'failed' : 'log'
}
