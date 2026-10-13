// ==========================================================
// buildProposalDraft(제안서 초안 생성기) 테스트 — Vitest
// 입력 설명의 수치 목표가 '기대 효과' 섹션의 정량 목표 줄로 반영되는지 확인합니다.
// ==========================================================
import { describe, expect, it } from 'vitest'
import { buildProposalDraft, proposalToText } from './proposalDraft.js'

const baseAnalysis = {
  detail: {
    ideaSummary: '대학생이 공모전을 빠르게 찾게 도와주는 앱입니다.',
    targetUsers: ['핵심 사용자 — 공모전을 준비하는 대학생'],
    strengths: ['문제 의식이 명확해 공감대가 높습니다.', '입력 구조가 완성형 기획안에 적합합니다.'],
    improvements: ['핵심 사용자의 구체적 사례나 수치를 덧붙이세요.'],
    judgePoints: ['주제 적합성 — 공모전 주제 문구와 문제 정의를 맞추세요.'],
    extensionIdeas: ['같은 방식을 다른 분야에 적용한 확장판을 제시해 보세요.'],
  },
  similarCases: [],
  contests: [
    {
      id: 1,
      title: '테스트 공모전',
      organizer: '테스트 주최사',
      field: '개발',
      deadline: '2026-11-30',
      matchScore: 90,
      matchReason: '주제가 직접 연결됩니다.',
    },
  ],
}

const SECTION_HEADINGS = ['문제 정의', '해결 방안', '차별점', '기대 효과', '실현 계획', '심사 대응']

describe('buildProposalDraft — 정량 목표 반영', () => {
  it('설명에 수치 목표가 있으면 기대 효과 첫 줄에 정량 목표로 인용한다', () => {
    const idea = {
      title: '공모 알림이',
      description:
        '공모전 정보를 매번 검색해야 하는 대학생 30만 명에게 관심 분야 마감 7일 전 알림을 보내 탐색 시간을 주당 3시간에서 30분으로 줄여 주는 앱입니다',
      category: '개발',
    }
    const draft = buildProposalDraft({ idea, analysis: baseAnalysis })

    const effect = draft.sections.find((section) => section.heading === '기대 효과')
    expect(effect).toBeDefined()
    expect(effect.lines[0]).toBe('정량 목표 — 입력 설명에 적은 수치: 30만명 · 7일 · 3시간 · 30분')
    // 정량 목표 다음에 강점 줄들이 그대로 이어진다
    expect(effect.lines.slice(1)).toEqual(baseAnalysis.detail.strengths)
  })

  it('설명에 수치가 없으면 정량 목표 줄을 넣지 않는다', () => {
    const idea = {
      title: '공모 알림이',
      description: '공모전 정보를 매번 검색해야 하는 대학생들에게 관심 분야의 새 공모전을 알려 주는 앱입니다',
      category: '개발',
    }
    const draft = buildProposalDraft({ idea, analysis: baseAnalysis })

    const effect = draft.sections.find((section) => section.heading === '기대 효과')
    expect(effect.lines[0]).toBe(baseAnalysis.detail.strengths[0])
    expect(draft.sections.some((section) => section.lines.some((line) => line.startsWith('정량 목표')))).toBe(false)
  })

  it('정량 목표 줄은 TXT 평문(복사·내려받기)에도 포함된다', () => {
    const idea = {
      title: '공모 알림이',
      description: '대학생 30만 명에게 마감 알림을 보내 탐색 시간을 30분으로 줄이는 앱',
      category: '개발',
    }
    const draft = buildProposalDraft({ idea, analysis: baseAnalysis })
    expect(proposalToText(draft)).toContain('정량 목표 — 입력 설명에 적은 수치: 30만명 · 30분')
  })

  it('6섹션 기획서 목차 구조는 그대로 유지된다', () => {
    const idea = {
      title: '공모 알림이',
      description: '대학생 30만 명에게 마감 알림을 보내는 앱',
      category: '개발',
    }
    const draft = buildProposalDraft({ idea, analysis: baseAnalysis })
    expect(draft.sections.map((section) => section.heading)).toEqual(SECTION_HEADINGS)
  })
})
