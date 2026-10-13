// ==========================================================
// 제안서 초안 생성기
// 분석 결과(Analysis)와 입력 아이디어를 출품용 기획서 양식으로 옮겨 담는
// 순수 함수. AI·데모 분석 어느 쪽 결과든 같은 형태로 동작합니다.
// 섹션별 재료 매핑 — 문제 정의: 입력 설명+타깃 / 해결 방안: 요약 /
// 차별점: 유사 사례의 '다른 점' / 기대 효과: 강점+입력 수치(정량 목표) /
// 실현 계획: 보완 지침+확장 / 심사 대응: 심사 포인트 — 분석 필드가 겹치지 않게 한 번씩만 씁니다.
// ==========================================================

import { josa } from '../utils/korean.js'
import { extractMetrics } from '../utils/metrics.js'

function pickLines(list, limit) {
  return Array.isArray(list) ? list.filter((item) => typeof item === 'string' && item.trim()).slice(0, limit) : []
}

export function buildProposalDraft({ idea, analysis }) {
  const detail = analysis?.detail ?? {}
  const topContest = analysis?.contests?.[0] ?? null

  const metaLines = [
    topContest
      ? `응모 대상 — ${topContest.title} · ${topContest.organizer} · 마감 ${topContest.deadline}`
      : '응모 대상 — 추천 공모전 중 하나를 골라 적어 주세요.',
  ]

  const problemLines = []
  const description = String(idea?.description ?? '').trim()
  if (description) problemLines.push(description)
  const [target] = pickLines(detail.targetUsers, 1)
  if (target) {
    // 분석 문구의 '핵심 사용자 — ···' 접두어는 초안에서는 이중 표기라 뗍니다.
    problemLines.push(`주요 대상 — ${target.replace(/^(핵심 사용자|확장 대상) — /, '')}`)
  }

  const solutionLines = pickLines([detail.ideaSummary], 1)

  // 차별점은 유사 사례의 '다른 점'이 재료(결과 화면의 차별화 안내와 같은 재료) —
  // 유사 사례가 없을 때만 강점 첫 줄로 대체합니다.
  const diffLines = (analysis?.similarCases ?? [])
    .filter((item) => item.difference)
    .slice(0, 2)
    .map((item) => `유사 사례 대비 — ${item.difference} ('${item.title}'${josa(item.title, '과와')} 비교)`)
  if (diffLines.length === 0) diffLines.push(...pickLines(detail.strengths, 1))

  const effectLines = pickLines(detail.strengths, 3)
  // 입력 설명에 적은 수치 목표는 기대 효과의 재료가 아니라 심사위원이 확인할
  // '정량 목표' 그 자체라 강점 위에 첫 줄로 인용합니다.
  const metrics = extractMetrics(description)
  if (metrics.length > 0) {
    effectLines.unshift(`정량 목표 — 입력 설명에 적은 수치: ${metrics.join(' · ')}`)
  }

  const planLines = pickLines(detail.improvements, 3).map(
    (line, index) => `${index + 1}단계 — ${line}`,
  )
  const [extension] = pickLines(detail.extensionIdeas, 1)
  if (extension) planLines.push(`향후 확장 — ${extension}`)

  const sections = [
    { heading: '문제 정의', lines: problemLines },
    { heading: '해결 방안', lines: solutionLines },
    { heading: '차별점', lines: diffLines },
    { heading: '기대 효과', lines: effectLines },
    { heading: '실현 계획', lines: planLines },
    { heading: '심사 대응', lines: pickLines(detail.judgePoints, 3) },
  ].filter((section) => section.lines.length > 0)

  return {
    title: String(idea?.title ?? '').trim() || '제목 없는 아이디어',
    metaLines,
    sections,
    note: '이 초안은 공모온 분석 결과를 옮겨 담은 것입니다. 제출 전 공고의 기획서 양식과 분량에 맞게 다듬으세요.',
  }
}

// 클립보드 복사·TXT 내려받기에서 쓸 평문 형태
export function proposalToText(draft) {
  const lines = [`[제안서 초안] ${draft.title}`, ...draft.metaLines, '']
  draft.sections.forEach((section, index) => {
    lines.push(`${index + 1}. ${section.heading}`)
    section.lines.forEach((line) => lines.push(`  - ${line}`))
    lines.push('')
  })
  lines.push(draft.note)
  return lines.join('\n')
}
