// ==========================================================
// extractMetrics(정량 지표 추출기) 단위 테스트 — Vitest
// npm test (frontend/)로 실행합니다.
// ==========================================================
import { describe, expect, it } from 'vitest'
import { extractMetrics } from './metrics.js'

describe('extractMetrics', () => {
  it('숫자+단위 정량 표현을 원문 그대로, 등장 순서대로 뽑는다', () => {
    expect(extractMetrics('대학생 1,000명의 30분짜리 작업을 5분으로 줄인다')).toEqual([
      '1,000명',
      '30분',
      '5분',
    ])
  })

  it('만·천·억 배수가 붙은 수치도 뽑는다', () => {
    expect(extractMetrics('이용자 10만 명, 3천 건 처리, 5억 원 절감')).toEqual([
      '10만명',
      '3천건',
      '5억원',
    ])
  })

  it('소수·퍼센트·점수 표현을 뽑는다', () => {
    expect(extractMetrics('만족도 4.5점, 점유율 50% 달성')).toEqual(['4.5점', '50%'])
  })

  it('연도 표기(4자리+년)는 목표 수치가 아니므로 제외한다', () => {
    expect(extractMetrics('2026년까지 완성한다')).toEqual([])
    expect(extractMetrics('2026년 출시 목표, 사용자 1만 명')).toEqual(['1만명'])
  })

  it("'N월 M일' 날짜 표기의 일수는 제외하고 다른 수치는 남긴다", () => {
    expect(extractMetrics('3월 1일에 50% 달성')).toEqual(['50%'])
  })

  it('중복 수치는 한 번만 남기고, limit을 넘으면 앞에서부터 자른다', () => {
    expect(extractMetrics('10명이 10명을 돕는다, 20분과 30분과 40분')).toEqual([
      '10명',
      '20분',
      '30분',
      '40분',
    ])
    expect(extractMetrics('1명 2명 3명 4명 5명', 3)).toEqual(['1명', '2명', '3명'])
  })

  it('단위 없는 숫자는 건너뛴다', () => {
    expect(extractMetrics('조각 50개 중 50을 고른다')).toEqual(['50개'])
  })

  it('수치가 전혀 없으면 빈 배열을 돌려준다', () => {
    expect(extractMetrics('숫자가 전혀 없는 설명입니다')).toEqual([])
    expect(extractMetrics('')).toEqual([])
    expect(extractMetrics(null)).toEqual([])
  })
})
