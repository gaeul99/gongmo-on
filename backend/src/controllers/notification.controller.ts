// ==========================================================
// 알림 구독 컨트롤러 — 검증과 에러 매핑을 담당합니다.
// ==========================================================

import type { Request, Response } from 'express'
import type { Subscriber, SubscriberContest } from '../services/notificationStore'
import { getSubscriber, getNotificationStats, listOutbox, upsertSubscriber } from '../services/notificationStore'
import { emailConfigured, sendEmail, sendSms, smsConfigured } from '../services/notificationSenders'
import { runDeadlineCheck } from '../services/notificationScheduler'

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

function normalizePhone(input: unknown): string | undefined {
  if (typeof input !== 'string') return undefined
  const digits = input.replace(/\D/g, '')
  return digits.length >= 9 && digits.length <= 12 ? digits : undefined
}

function parseContests(input: unknown): SubscriberContest[] {
  if (!Array.isArray(input)) return []
  return input
    .filter(
      (item): item is SubscriberContest =>
        typeof item === 'object' &&
        item !== null &&
        typeof (item as SubscriberContest).id === 'number' &&
        typeof (item as SubscriberContest).title === 'string' &&
        /^\d{4}-\d{2}-\d{2}$/.test(String((item as SubscriberContest).deadline ?? '')),
    )
    .slice(0, 50)
}

function parseCategories(input: unknown): string[] {
  if (!Array.isArray(input)) return []
  return input.filter((item): item is string => typeof item === 'string' && item.length > 0).slice(0, 20)
}

export async function postSubscribe(req: Request, res: Response) {
  const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim() : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : ''
  const phone = normalizePhone(req.body?.phone)

  if (!nickname || nickname.length > 20) {
    res.status(400).json({ success: false, error: { code: 'INVALID_NICKNAME', message: '아이디가 올바르지 않아요.' } })
    return
  }
  if (email && !EMAIL_PATTERN.test(email)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_EMAIL', message: '이메일 형식이 올바르지 않아요.' } })
    return
  }
  if (!email && !phone) {
    res.status(400).json({ success: false, error: { code: 'CONTACT_REQUIRED', message: '이메일 또는 휴대폰 번호가 필요해요.' } })
    return
  }

  const subscriber = upsertSubscriber({
    nickname,
    email: email || undefined,
    phone,
    ideaCategories: parseCategories(req.body?.ideaCategories),
    contests: parseContests(req.body?.contests),
    optIn: req.body?.optIn !== false,
  })

  // 구독(또는 정보 갱신) 직후 환영 메시지를 보내 발송 경로를 바로 확인할 수 있게 합니다.
  const delivery = { email: 'skipped' as string, sms: 'skipped' as string }
  if (subscriber.optIn) {
    if (subscriber.email) {
      delivery.email = await sendEmail(
        subscriber.email,
        '[공내비] 알림 구독이 시작됐어요',
        [
          `${subscriber.nickname}님, 공내비 알림 구독이 완료됐습니다!`,
          '',
          `· 등록한 이메일: ${subscriber.email}`,
          subscriber.phone ? `· 등록한 휴대폰: ${subscriber.phone}` : '',
          `· 알림 대상 공모전: ${subscriber.contests.length}개`,
          '',
          '응모·관심 공모전의 마감이 다가오면(D-7·D-3·당일) 알려 드릴게요.',
        ]
          .filter(Boolean)
          .join('\n'),
      )
    }
    if (subscriber.phone) {
      delivery.sms = await sendSms(
        subscriber.phone,
        `[공내비] ${subscriber.nickname}님, 알림 구독 완료! 응모·관심 공모전 마감일에 문자로 알려 드릴게요.`,
      )
    }
  }

  res.json({ success: true, data: { subscriber: subscriber.nickname, delivery } })
}

export function getOutbox(req: Request, res: Response) {
  const limit = Number(req.query.limit ?? 50)
  res.json({ success: true, data: listOutbox(Number.isFinite(limit) ? Math.min(Math.max(limit, 1), 200) : 50) })
}

// 대시보드용: 구독자 수와 채널별 발송 현황을 한 번에 돌려줍니다.
export function getStats(_req: Request, res: Response) {
  res.json({ success: true, data: getNotificationStats() })
}

// 데모·테스트용: 스케줄러 확인을 수동으로 1회 실행합니다.
export async function postRunCheck(req: Request, res: Response) {
  const sent = await runDeadlineCheck()
  res.json({ success: true, data: { notifiedContests: sent } })
}

export function getChannelStatus(req: Request, res: Response) {
  res.json({
    success: true,
    data: {
      email: emailConfigured() ? 'smtp' : 'log',
      sms: smsConfigured() ? 'solapi' : 'log',
      subscribed: getSubscriber(String(req.query.nickname ?? '')) !== undefined,
    },
  })
}

export type { Subscriber }
