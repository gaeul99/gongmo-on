// ==========================================================
// 이메일·문자 발송기
// SMTP(SMTP_HOST 등) 설정이 있으면 nodemailer로 실제 발송하고,
// Solapi 키가 있으면 문자를 실제 발송합니다. 설정이 없으면
// 콘솔에 기록하고 아웃박스에만 남깁니다(데모 모드).
// ==========================================================

import crypto from 'crypto'
import nodemailer from 'nodemailer'
import { appendOutbox } from './notificationStore'

const SMTP_HOST = process.env.SMTP_HOST ?? ''
const SMTP_PORT = Number(process.env.SMTP_PORT ?? 587)
const SMTP_USER = process.env.SMTP_USER ?? ''
const SMTP_PASS = process.env.SMTP_PASS ?? ''
const MAIL_FROM = process.env.MAIL_FROM ?? '공내비 <no-reply@gongnabi.app>'

const SOLAPI_API_KEY = process.env.SOLAPI_API_KEY ?? ''
const SOLAPI_API_SECRET = process.env.SOLAPI_API_SECRET ?? ''
const SOLAPI_FROM = process.env.SOLAPI_FROM ?? ''

export type SendResult = 'sent' | 'log' | 'skipped' | 'failed'

export function emailConfigured(): boolean {
  return Boolean(SMTP_HOST && SMTP_USER && SMTP_PASS)
}

export function smsConfigured(): boolean {
  return Boolean(SOLAPI_API_KEY && SOLAPI_API_SECRET && SOLAPI_FROM)
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

  appendOutbox({ channel: 'email', to, subject, text, via })
  if (via === 'log') {
    console.log(`[알림·로그 모드] 이메일 → ${to} | ${subject}\n${text}`)
  }
  return via === 'smtp' ? 'sent' : via === 'failed' ? 'failed' : 'log'
}

export async function sendSms(to: string, text: string): Promise<SendResult> {
  if (!to) return 'skipped'

  let via = 'log'
  if (smsConfigured()) {
    try {
      via = await sendSolapiMessage(to, text)
    } catch (error) {
      console.error('[알림] 문자 발송 실패 — 아웃박스에만 기록합니다.', error)
      via = 'failed'
    }
  }

  appendOutbox({ channel: 'sms', to, text, via })
  if (via === 'log') {
    console.log(`[알림·로그 모드] 문자 → ${to} | ${text}`)
  }
  return via === 'solapi' ? 'sent' : via === 'failed' ? 'failed' : 'log'
}

// Solapi(https://solapi.com) REST API v4로 문자를 보냅니다.
async function sendSolapiMessage(to: string, text: string): Promise<'solapi'> {
  const date = new Date().toISOString()
  const salt = crypto.randomBytes(8).toString('hex')
  const signature = crypto
    .createHmac('sha256', SOLAPI_API_SECRET)
    .update(date + salt)
    .digest('base64')

  const response = await fetch('https://api.solapi.com/v4/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `HMAC-SHA256 apiKey=${SOLAPI_API_KEY}, date=${date}, salt=${salt}, signature=${signature}`,
    },
    body: JSON.stringify({
      message: { to, from: SOLAPI_FROM, text },
    }),
  })

  if (!response.ok) {
    throw new Error(`Solapi 응답 오류 (HTTP ${response.status})`)
  }
  return 'solapi'
}
