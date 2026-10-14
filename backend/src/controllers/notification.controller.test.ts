// ==========================================================
// 주간 새 공모전 다이제스트(postWeeklyDigest) 테스트 — Vitest
// 접수 시작일(startDate) 표시와 후보 검증 규칙을 확인합니다.
// 실제 이메일 발송은 sendEmail을 모킹해 막습니다.
// ==========================================================
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('../services/notificationSenders', () => ({
  sendEmail: vi.fn(async () => 'log'),
}))

vi.mock('../services/notificationStore', () => ({
  getNotificationStats: vi.fn(() => ({})),
  upsertSubscriber: vi.fn(),
}))

vi.mock('../services/notificationScheduler', () => ({
  runDeadlineCheck: vi.fn(async () => 0),
}))

import { sendEmail } from '../services/notificationSenders'
import { postWeeklyDigest } from './notification.controller'

type JsonBody = Record<string, unknown>

function fakeRes() {
  return {
    statusCode: 200,
    body: null as JsonBody | null,
    status(code: number) {
      this.statusCode = code
      return this
    },
    json(payload: JsonBody) {
      this.body = payload
      return this
    },
  }
}

// 고정된 '오늘' 기준으로 상대 날짜를 만든다 — 컨트롤러가 new Date()를 쓰므로
// 테스트도 실행 시점 기준으로 후보 날짜를 계산한다.
function dateOffset(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

function contest(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    title: '테스트 공모전',
    field: '개발',
    deadline: dateOffset(14),
    ...overrides,
  }
}

describe('postWeeklyDigest — 접수 시작일 표시', () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockClear()
  })

  it('아직 접수가 시작되지 않은 공모전은 접수 시작일을 본문에 표시한다', async () => {
    const res = fakeRes() as never as { body: JsonBody | null }
    await postWeeklyDigest(
      {
        body: {
          nickname: '테스터',
          email: 'tester@example.com',
          fields: [],
          contests: [contest({ startDate: dateOffset(3) })],
        },
      } as never,
      res,
    )

    expect(res.body?.success).toBe(true)
    expect(vi.mocked(sendEmail)).toHaveBeenCalledTimes(1)
    const text = vi.mocked(sendEmail).mock.calls[0][2]
    expect(text).toContain(`접수 시작 ${dateOffset(3)}`)
  })

  it('이미 접수 중인 공모전(startDate가 과거·오늘)은 접수 시작일을 표시하지 않는다', async () => {
    const res = fakeRes() as never as { body: JsonBody | null }
    await postWeeklyDigest(
      {
        body: {
          nickname: '테스터',
          email: 'tester@example.com',
          fields: [],
          contests: [contest({ startDate: dateOffset(-5) }), contest({ id: 2, title: '오늘 시작', startDate: dateOffset(0) })],
        },
      } as never,
      res,
    )

    const text = vi.mocked(sendEmail).mock.calls[0][2]
    expect(text).not.toContain('접수 시작')
  })

  it('startDate 형식이 틀리면 항목을 버리지 않고 값만 무시한다', async () => {
    const res = fakeRes() as never as { body: JsonBody | null }
    await postWeeklyDigest(
      {
        body: {
          nickname: '테스터',
          email: 'tester@example.com',
          fields: [],
          contests: [contest({ startDate: '내일쯤' })],
        },
      } as never,
      res,
    )

    expect(res.body?.data).toMatchObject({ matched: 1 })
    const text = vi.mocked(sendEmail).mock.calls[0][2]
    expect(text).toContain('테스트 공모전')
    expect(text).not.toContain('접수 시작')
  })

  it('마감 기한이 지나거나 4주를 넘은 공모전은 후보에서 뺀다', async () => {
    const res = fakeRes() as never as { body: JsonBody | null }
    await postWeeklyDigest(
      {
        body: {
          nickname: '테스터',
          email: 'tester@example.com',
          fields: [],
          contests: [
            contest({ id: 1, title: '지난 공모전', deadline: dateOffset(-1) }),
            contest({ id: 2, title: '먼 공모전', deadline: dateOffset(40) }),
            contest({ id: 3, title: '알맞은 공모전' }),
          ],
        },
      } as never,
      res,
    )

    expect(res.body?.data).toMatchObject({ matched: 1 })
    const text = vi.mocked(sendEmail).mock.calls[0][2]
    expect(text).toContain('알맞은 공모전')
    expect(text).not.toContain('지난 공모전')
    expect(text).not.toContain('먼 공모전')
  })

  it('후보가 없으면 발송하지 않고 안내 메시지를 돌려준다', async () => {
    const res = fakeRes() as never as { body: JsonBody | null }
    await postWeeklyDigest(
      {
        body: { nickname: '테스터', email: 'tester@example.com', fields: [], contests: [] },
      } as never,
      res,
    )

    expect(res.body?.data).toMatchObject({ matched: 0, delivery: 'skipped' })
    expect(vi.mocked(sendEmail)).not.toHaveBeenCalled()
  })
})
