// ==========================================================
// calculateContestType(유형 검사 채점) 단위 테스트 — Vitest
// npm test (frontend/)로 실행합니다.
// ==========================================================
import { describe, expect, it } from 'vitest'
import { TYPE_TEST_QUESTIONS, calculateContestType } from './contestTypeTest.js'

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

  it('30문항 전체 응답에서도 만점(문항당 2점) 기준 일치율을 낸다', () => {
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
