// ==========================================================
// buildMockAnalysis(데모 분석기) 테스트 — Vitest
// 입력 설명의 수치 목표 유무 × 설명 길이 4가지 시나리오에서
// 강점·보완점·심사 포인트 문구가 어떻게 달라지는지 확인합니다.
// ==========================================================
import { describe, expect, it } from 'vitest'
import { buildMockAnalysis } from './mockAnalysis.js'

// 수치 있는 설명 — 60자 이상 / 60자 미만
const LONG_WITH_METRICS = {
  title: '공모 알림이',
  description:
    '공모전 정보를 매번 검색해야 하는 대학생 30만 명에게 관심 분야 마감 7일 전 알림을 보내 탐색 시간을 주당 3시간에서 30분으로 줄여 주는 앱입니다',
  category: '개발',
}
const SHORT_WITH_METRICS = {
  title: '공모 알림이',
  description: '대학생 30만 명에게 마감 알림을 보내 탐색 시간을 30분으로 줄이는 앱',
  category: '개발',
}
// 수치 없는 설명 — 60자 이상 / 60자 미만
const LONG_WITHOUT_METRICS = {
  title: '공모 알림이',
  description:
    '공모전 정보를 매번 검색해야 하는 대학생들에게 관심 분야의 새 공모전이 올라오면 알림을 보내 탐색 시간을 줄여 주는 앱입니다. 원하는 분야를 선택해 두면 됩니다',
  category: '개발',
}
const SHORT_WITHOUT_METRICS = {
  title: '공모 알림이',
  description: '관심 분야 공모전 알림 앱',
  category: '개발',
}

describe('buildMockAnalysis — 설명 수치 목표 반영', () => {
  it('수치 있음 + 설명 60자 이상: 강점·심사 포인트에 수치를 인용하고 보완점은 출처 지침이 된다', () => {
    const { detail } = buildMockAnalysis(LONG_WITH_METRICS)
    expect(detail.strengths[0]).toContain("'30만명'")
    expect(detail.strengths[0]).toContain('수치 목표')
    expect(detail.improvements[0]).toContain("'30만명'")
    expect(detail.improvements[0]).toContain('출처')
    expect(detail.judgePoints[2]).toMatch(/^기대 효과 — 설명에 적은 '30만명' 수치를/)
  })

  it('수치 없음 + 설명 60자 이상: 기존 문구를 유지하고 수치 인용이 생기지 않는다', () => {
    const { detail } = buildMockAnalysis(LONG_WITHOUT_METRICS)
    expect(detail.strengths.join(' ')).not.toContain('수치 목표')
    expect(detail.improvements[0]).toContain('구체적 사례나 수치')
    expect(detail.judgePoints[2]).not.toContain("설명에 적은")
  })

  it('수치 있음 + 설명 60자 미만: 강점·심사 포인트는 수치를 반영하고 보완점은 짧은 설명 안내를 유지한다', () => {
    const { detail } = buildMockAnalysis(SHORT_WITH_METRICS)
    expect(detail.strengths[0]).toContain("'30만명'")
    expect(detail.improvements[0]).toContain('설명이 아직 짧아요')
    expect(detail.judgePoints[2]).toMatch(/^기대 효과 — 설명에 적은 '30만명' 수치를/)
  })

  it('수치 없음 + 설명 60자 미만: 수치 인용이 전혀 생기지 않는다', () => {
    const { detail } = buildMockAnalysis(SHORT_WITHOUT_METRICS)
    expect(detail.strengths.join(' ')).not.toContain('수치 목표')
    expect(detail.judgePoints[2]).not.toContain("설명에 적은")
  })
})
