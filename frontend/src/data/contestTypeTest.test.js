// ==========================================================
// calculateContestType(유형 검사 채점) 단위 테스트 — Vitest
// npm test (frontend/)로 실행합니다.
// ==========================================================
import { describe, expect, it } from 'vitest'
import {
  TYPE_TEST_QUESTIONS,
  calculateContestType,
  recommendContestsForType,
} from './contestTypeTest.js'

describe('calculateContestType', () => {
  it('문항 하나만 답해도 답한 문항 만점 기준으로 계산된다', () => {
    // 1번 문항 1번 선택지: solver 2점(만점) + civic 1점 → solver 100%, civic 50%
    const result = calculateContestType([0])
    expect(result.type.id).toBe('solver')
    expect(result.percentage).toBe(100)
    expect(result.distribution[0]).toEqual({ id: 'solver', score: 2, percent: 100 })
    expect(result.distribution[1]).toEqual({ id: 'civic', score: 1, percent: 50 })
  })

  it('비율은 유형별로 독립적이라 7개 유형의 합이 100%가 아니다', () => {
    const result = calculateContestType([0, 0])
    // 1·2번 문항 1번 선택지: solver 3점·civic 3점, 답한 2문항 만점은 4점 → 각 75%
    expect(result.distribution.map((row) => row.percent)).toEqual([75, 75, 0, 0, 0, 0, 0])
    expect(result.percentage).toBe(75)
  })

  it('한 유형이 응답한 모든 문항에서 만점을 받으면 100%가 된다', () => {
    // 1·3번 문항 1번 선택지: solver가 두 문항 모두 2점(만점) → solver 4/4 = 100%
    const result = calculateContestType([0, null, 0])
    expect(result.type.id).toBe('solver')
    expect(result.percentage).toBe(100)
    expect(result.distribution[0]).toEqual({ id: 'solver', score: 4, percent: 100 })
  })

  it('점수가 같으면 강한 신호(2점 선택)가 많은 유형이 앞선다', () => {
    // 1번 문항 3번 선택지(storyteller 2점·connector 1점) + 4번 문항 4번 선택지(civic 2점·connector 1점)
    // → storyteller·civic·connector가 모두 2점이지만 connector만 강한 신호가 없어 3위
    // 답한 2문항 만점은 4점이므로 일치율은 2/4 = 50%
    const result = calculateContestType([2, null, null, 3])
    expect(result.type.id).toBe('storyteller')
    expect(result.distribution.map((row) => row.id).slice(0, 3)).toEqual([
      'storyteller',
      'civic',
      'connector',
    ])
    expect(result.percentage).toBe(50)
  })

  it('답한 문항이 없으면 모든 비율은 0%다', () => {
    const result = calculateContestType([])
    expect(result.percentage).toBe(0)
    expect(result.distribution.every((row) => row.percent === 0 && row.score === 0)).toBe(true)
  })

  it('20문항 전체 응답에서도 만점(문항당 2점) 기준 일치율을 낸다', () => {
    const answers = TYPE_TEST_QUESTIONS.map(() => 0)
    const result = calculateContestType(answers)
    const totalScore = result.distribution.reduce((total, row) => total + row.score, 0)
    expect(totalScore).toBe(TYPE_TEST_QUESTIONS.length * 3)
    const maxScore = TYPE_TEST_QUESTIONS.length * 2
    result.distribution.forEach((row) => {
      expect(row.percent).toBe(Math.round((row.score / maxScore) * 100))
      expect(row.percent).toBeGreaterThanOrEqual(0)
      expect(row.percent).toBeLessThanOrEqual(100)
    })
    expect(result.percentage).toBe(result.distribution[0].percent)
  })
})

describe('recommendContestsForType', () => {
  // solver 유형 키워드: 아이디어·정책·서비스·생활. 1·2·3·6번은 키워드 일치,
  // 4·5번은 불일치(마감 보충용). 마감이 가까운 순으로 정렬된다.
  const NOW = new Date('2026-10-27T00:00:00')
  const POOL = [
    { id: 1, title: '아이디어 서비스 공모전', field: '서비스', deadline: '2026-11-10' },
    { id: 2, title: '정책 아이디어 공모전', field: '정책', deadline: '2026-11-05' },
    { id: 3, title: '생활 개선 서비스 공모전', field: '생활', deadline: '2026-11-20' },
    { id: 4, title: 'AI 데이터 공모전', field: '기술', deadline: '2026-11-08' },
    { id: 5, title: '디자인 공모전', field: '디자인', deadline: '2026-11-15' },
    { id: 6, title: '서비스 정책 신규 공모전', field: '정책', deadline: '2026-12-01' },
  ]

  it('키워드 일치 공모전을 마감이 가까운 순으로 limit개 추천한다', () => {
    expect(recommendContestsForType('solver', POOL, 3, NOW).map((c) => c.id)).toEqual([2, 1, 3])
  })

  it('이미 본 공모전을 제외하면 다음 순위를 채운다', () => {
    const next = recommendContestsForType('solver', POOL, 3, NOW, [2, 1, 3])
    // 남은 일치분 6번이 먼저, 부족분은 불일치분(마감 순) 4·5번으로 채운다.
    expect(next.map((c) => c.id)).toEqual([6, 4, 5])
  })

  it('제외할 공모전이 풀을 다 쓰면 제외를 풀고 처음부터 다시 추천한다', () => {
    const next = recommendContestsForType('solver', POOL, 3, NOW, [2, 1, 3, 6, 4, 5])
    expect(next.map((c) => c.id)).toEqual([2, 1, 3])
  })

  it('제외해도 남은 후보가 limit보다 많으면 제외분으로 되돌아오지 않는다', () => {
    const next = recommendContestsForType('solver', POOL, 3, NOW, [2, 1])
    expect(next.map((c) => c.id)).toEqual([3, 6, 4])
  })
})
