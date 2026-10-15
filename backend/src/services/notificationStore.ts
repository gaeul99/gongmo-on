// ==========================================================
// 알림 구독자·발송 기록 저장소 — PostgreSQL(gongmo-on-db 컨테이너).
// ==========================================================

import crypto from 'crypto'
import { getPool } from '../db/pool'

export type SubscriberContest = {
  id: number
  title: string
  deadline: string
  url?: string
}

export type Subscriber = {
  nickname: string
  email?: string | undefined
  ideaCategories: string[]
  contests: SubscriberContest[]
  optIn: boolean
  // 이미 마감 알림을 보낸 조합(공모전 id-D값-날짜) — 중복 발송 방지용
  sentKeys: string[]
  updatedAt: string
}

export type OutboxEntry = {
  id: string
  at: string
  channel: 'email'
  to: string
  subject?: string
  text: string
  // 실제 발송 여부 — 'smtp'는 실제 전송, 'log'는 설정 부재로 기록만
  via: string
}

const MAX_OUTBOX = 200

type SubscriberRow = {
  nickname: string
  email: string
  idea_categories: string[]
  contests: SubscriberContest[]
  opt_in: boolean
  sent_keys: string[]
  updated_at: Date
}

function toSubscriber(row: SubscriberRow): Subscriber {
  return {
    nickname: row.nickname,
    email: row.email,
    ideaCategories: row.idea_categories ?? [],
    contests: row.contests ?? [],
    optIn: row.opt_in,
    sentKeys: row.sent_keys ?? [],
    updatedAt: row.updated_at.toISOString(),
  }
}

export async function listSubscribers(): Promise<Subscriber[]> {
  const result = await getPool().query<SubscriberRow>(
    `SELECT nickname, email, idea_categories, contests, opt_in, sent_keys, updated_at
     FROM subscribers ORDER BY updated_at ASC`,
  )
  return result.rows.map(toSubscriber)
}

export async function upsertSubscriber(
  input: Omit<Subscriber, 'sentKeys' | 'updatedAt'>,
): Promise<Subscriber> {
  // 이미 보낸 알림 기록(sent_keys)은 구독 정보를 갱신해도 유지한다.
  const result = await getPool().query<SubscriberRow>(
    `INSERT INTO subscribers (nickname, email, idea_categories, contests, opt_in, sent_keys)
     VALUES ($1, $2, $3, $4, $5, '[]'::jsonb)
     ON CONFLICT (nickname) DO UPDATE SET
       email = EXCLUDED.email,
       idea_categories = EXCLUDED.idea_categories,
       contests = EXCLUDED.contests,
       opt_in = EXCLUDED.opt_in,
       updated_at = now()
     RETURNING nickname, email, idea_categories, contests, opt_in, sent_keys, updated_at`,
    [
      input.nickname,
      input.email ?? '',
      JSON.stringify(input.ideaCategories ?? []),
      JSON.stringify(input.contests ?? []),
      input.optIn,
    ],
  )
  return toSubscriber(result.rows[0]!)
}

export async function saveSubscriber(next: Subscriber): Promise<void> {
  await getPool().query(
    `INSERT INTO subscribers (nickname, email, idea_categories, contests, opt_in, sent_keys)
     VALUES ($1, $2, $3, $4, $5, $6)
     ON CONFLICT (nickname) DO UPDATE SET
       email = EXCLUDED.email,
       idea_categories = EXCLUDED.idea_categories,
       contests = EXCLUDED.contests,
       opt_in = EXCLUDED.opt_in,
       sent_keys = EXCLUDED.sent_keys,
       updated_at = now()`,
    [
      next.nickname,
      next.email ?? '',
      JSON.stringify(next.ideaCategories ?? []),
      JSON.stringify(next.contests ?? []),
      next.optIn,
      JSON.stringify(next.sentKeys ?? []),
    ],
  )
}

export async function appendOutbox(
  entry: Omit<OutboxEntry, 'id' | 'at'>,
): Promise<OutboxEntry> {
  const record: OutboxEntry = {
    ...entry,
    id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    at: new Date().toISOString(),
  }
  const pool = getPool()
  await pool.query(
    `INSERT INTO outbox (id, at, channel, to_addr, subject, body, via)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [record.id, record.at, record.channel, record.to, record.subject ?? null, record.text, record.via],
  )
  // 아웃박스는 최근 200건만 유지해 테이블이 커지지 않게 합니다.
  await pool.query(
    `DELETE FROM outbox WHERE id NOT IN (
       SELECT id FROM outbox ORDER BY at DESC, id DESC LIMIT ${MAX_OUTBOX}
     )`,
  )
  return record
}
