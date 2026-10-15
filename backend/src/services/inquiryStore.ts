// ==========================================================
// 문의 접수 저장소 — PostgreSQL(gongmo-on-db 컨테이너).
// 이메일 발송(SMTP)이 실패하거나 로그 모드여도 접수 내역은 DB에 남습니다.
// ==========================================================

import crypto from 'crypto'
import { getPool } from '../db/pool'

export type Inquiry = {
  id: string
  at: string
  // 답변을 받을 이메일 — 입력하지 않은 문의도 받는다(빈 문자열).
  email: string
  category: string
  content: string
}

const MAX_INQUIRIES = 500

export async function appendInquiry(
  input: Omit<Inquiry, 'id' | 'at'>,
): Promise<Inquiry> {
  const record: Inquiry = {
    ...input,
    id: `${Date.now()}-${crypto.randomBytes(4).toString('hex')}`,
    at: new Date().toISOString(),
  }
  const pool = getPool()
  await pool.query(
    'INSERT INTO inquiries (id, at, email, category, content) VALUES ($1, $2, $3, $4, $5)',
    [record.id, record.at, record.email, record.category, record.content],
  )
  // 오래된 문의부터 잘라낸다 — 최근 500건이면 데모 용도로 충분하다.
  await pool.query(
    `DELETE FROM inquiries WHERE id NOT IN (
       SELECT id FROM inquiries ORDER BY at DESC, id DESC LIMIT ${MAX_INQUIRIES}
     )`,
  )
  return record
}
