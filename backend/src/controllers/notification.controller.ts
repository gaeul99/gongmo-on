// ==========================================================
// 알림 구독 컨트롤러 — 검증과 에러 매핑을 담당합니다.
// ==========================================================

import type { Request, Response } from 'express'
import type { Subscriber, SubscriberContest } from '../services/notificationStore'
import { getNotificationStats, upsertSubscriber } from '../services/notificationStore'
import { sendEmail, type SendResult } from '../services/notificationSenders'
import { runDeadlineCheck } from '../services/notificationScheduler'

const EMAIL_PATTERN = /^\S+@\S+\.\S+$/

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

  if (!nickname || nickname.length > 20) {
    res.status(400).json({ success: false, error: { code: 'INVALID_NICKNAME', message: '아이디가 올바르지 않아요.' } })
    return
  }
  if (!email || !EMAIL_PATTERN.test(email)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_EMAIL', message: '알림을 받을 이메일 주소가 필요해요.' } })
    return
  }

  const subscriber = upsertSubscriber({
    nickname,
    email,
    ideaCategories: parseCategories(req.body?.ideaCategories),
    contests: parseContests(req.body?.contests),
    optIn: req.body?.optIn !== false,
  })

  // 구독(또는 정보 갱신) 직후 환영 메시지를 보내 발송 경로를 바로 확인할 수 있게 합니다.
  let delivery: 'skipped' | SendResult = 'skipped'
  if (subscriber.optIn) {
    delivery = await sendEmail(
      email,
      '[공모온] 알림 구독이 시작됐어요',
      [
        `${subscriber.nickname}님, 공모온 알림 구독이 완료됐습니다!`,
        '',
        `· 등록한 이메일: ${subscriber.email}`,
        `· 알림 대상 공모전: ${subscriber.contests.length}개`,
        '',
        '응모·관심 공모전의 마감이 다가오면(D-7·D-3·당일) 알려 드릴게요.',
      ].join('\n'),
    )
  }

  res.json({ success: true, data: { subscriber: subscriber.nickname, delivery } })
}

// 챗봇 근거용: 구독자 수와 채널별 발송 현황을 한 번에 돌려줍니다.
export function getStats(_req: Request, res: Response) {
  res.json({ success: true, data: getNotificationStats() })
}

// 데모·테스트용: 스케줄러 확인을 수동으로 1회 실행합니다.
export async function postRunCheck(req: Request, res: Response) {
  const sent = await runDeadlineCheck()
  res.json({ success: true, data: { notifiedContests: sent } })
}

// 주간 새 공모전 소식 — 프론트가 공모전 후보 목록(실제 공모전 DB)과 관심 분야를
// 보내면 마감이 남은 공모전을 골라 이메일 다이제스트로 발송합니다.
// 콘텐츠 DB는 프론트(mockData.js)가 소유하므로, /api/ideas/analyze처럼
// 후보 목록을 요청 본문으로 받는 기존 패턴을 그대로 따릅니다.
export async function postWeeklyDigest(req: Request, res: Response) {
  const nickname = typeof req.body?.nickname === 'string' ? req.body.nickname.trim() : ''
  const email = typeof req.body?.email === 'string' ? req.body.email.trim() : ''

  if (!email || !EMAIL_PATTERN.test(email)) {
    res.status(400).json({ success: false, error: { code: 'INVALID_EMAIL', message: '이메일 형식이 올바르지 않아요.' } })
    return
  }

  type WeeklyContest = {
    id: number
    title: string
    field: string
    deadline: string
    startDate?: string
    url?: string
  }

  const contests: WeeklyContest[] = Array.isArray(req.body?.contests)
    ? (req.body.contests as unknown[])
        .filter(
          (item): item is WeeklyContest =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as WeeklyContest).id === 'number' &&
            typeof (item as WeeklyContest).title === 'string' &&
            typeof (item as WeeklyContest).field === 'string' &&
            /^\d{4}-\d{2}-\d{2}$/.test(String((item as WeeklyContest).deadline ?? '')),
        )
        .slice(0, 100)
    : []

  const fields = parseCategories(req.body?.fields)
  const today = new Date()
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const inFourWeeks = new Date(todayMidnight.getTime() + 28 * 24 * 60 * 60 * 1000)

  const firstToken = (field: string): string => field.trim().split(' ')[0] ?? ''
  const wanted = new Set(fields.map(firstToken).filter(Boolean))

  const matched = contests
    .filter((item) => {
      const deadline = new Date(`${item.deadline}T00:00:00`)
      if (Number.isNaN(deadline.getTime()) || deadline < todayMidnight || deadline > inFourWeeks) {
        return false
      }
      // 관심 분야가 비어 있으면 전체 분야를 보냅니다(신규 가입자 대비).
      return wanted.size === 0 || wanted.has(firstToken(item.field))
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
    .slice(0, 10)

  if (matched.length === 0) {
    res.json({
      success: true,
      data: { matched: 0, delivery: 'skipped', message: '이번 주에 도착한 새 공모전이 없어요.' },
    })
    return
  }

  const lines: string[] = [
    `${nickname || '공모온 이용자'}님, 이번 주 공모온 새 공모전 소식이에요.`,
    '',
  ]
  for (const item of matched) {
    lines.push(`· ${item.title} (${item.field})`)
    lines.push(`  마감 ${item.deadline}${item.url ? ` · ${item.url}` : ''}`)
  }
  lines.push('')
  lines.push(
    wanted.size > 0
      ? `관심 분야: ${[...wanted].join(', ')}`
      : '관심 분야를 정하면 내 분야의 공모전만 모아 보내 드려요.',
  )
  lines.push('공모온 — 아이디어에서 공모전까지, 가장 빠른 길')

  const delivery = await sendEmail(
    email,
    `[공모온] 이번 주 새 공모전 소식 (${matched.length}건)`,
    lines.join('\n'),
  )

  res.json({ success: true, data: { matched: matched.length, delivery } })
}

export type { Subscriber }
