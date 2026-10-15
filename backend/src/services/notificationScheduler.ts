// ==========================================================
// 공모전 마감 알림 스케줄러
// 30분마다 구독자의 응모·관심 공모전 마감일을 확인해
// D-7·D-3·당일에 이메일로 알립니다.
// 같은 알림을 하루에 여러 번 보내지 않도록 sentKeys로 기록합니다.
// ==========================================================

import type { Subscriber } from './notificationStore'
import { listSubscribers, saveSubscriber } from './notificationStore'
import { sendEmail } from './notificationSenders'

const CHECK_INTERVAL_MS = 30 * 60 * 1000
const REMIND_DAYS_BEFORE = [7, 3, 0]

function todayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// 마감일(자정)과 오늘(자정)의 날짜 차이. 당일이면 0, 하루 남으면 1.
function daysUntil(deadline: string, now = new Date()): number | null {
  const deadlineDate = new Date(`${deadline}T00:00:00`)
  if (Number.isNaN(deadlineDate.getTime())) return null
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((deadlineDate.getTime() - today.getTime()) / (24 * 60 * 60 * 1000))
}

async function notifySubscriber(subscriber: Subscriber, now = new Date()): Promise<number> {
  if (!subscriber.optIn || !subscriber.email) return 0

  const today = todayKey(now)
  const seen = new Set(subscriber.sentKeys)
  let sentCount = 0

  for (const contest of subscriber.contests) {
    const left = daysUntil(contest.deadline, now)
    if (left === null || !REMIND_DAYS_BEFORE.includes(left)) continue

    const key = `${contest.id}-d${left}-${today}`
    if (seen.has(key)) continue
    seen.add(key)

    const when = left === 0 ? '오늘 마감' : `마감 ${left}일 전`
    const emailSubject = `[공모온] '${contest.title}' ${when}`
    const emailText = [
      `${subscriber.nickname}님, 공모전 마감이 다가왔어요.`,
      '',
      `· 공모전: ${contest.title}`,
      `· 마감일: ${contest.deadline} (${when})`,
      contest.url ? `· 바로 가기: ${contest.url}` : '',
      '',
      '공모온 — 아이디어에서 공모전까지, 가장 빠른 길',
    ]
      .filter(Boolean)
      .join('\n')

    if (subscriber.email) await sendEmail(subscriber.email, emailSubject, emailText)
    sentCount += 1
  }

  // sentKeys는 최근 200개만 유지해 테이블이 커지지 않게 합니다.
  subscriber.sentKeys = [...seen].slice(-200)
  await saveSubscriber(subscriber)
  return sentCount
}

export async function runDeadlineCheck(now = new Date()): Promise<number> {
  const subscribers = await listSubscribers()
  let total = 0
  for (const subscriber of subscribers) {
    total += await notifySubscriber(subscriber, now)
  }
  return total
}

export function startNotificationScheduler(): void {
  // 시작 5초 뒤 1회 실행해 서버 재시작 사이에 밀린 알림도 보냅니다.
  setTimeout(() => {
    runDeadlineCheck()
      .then((count) => {
        if (count > 0) console.log(`[알림] 시작 시 마감 알림 ${count}건을 발송했습니다.`)
      })
      .catch((error) => console.error('[알림] 시작 시 확인 실패', error))
  }, 5000)

  setInterval(() => {
    runDeadlineCheck().catch((error) => console.error('[알림] 마감 확인 실패', error))
  }, CHECK_INTERVAL_MS)
}
