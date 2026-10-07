// ==========================================================
// 분석 결과 스냅숏의 공용 타입
// ResultPage가 분석 결과를 생성·표시할 때 사용하고,
// MyPage의 SavedIdea(보관함)가 분석 결과를 함께 저장·복원할 때도
// 동일한 타입을 사용합니다.
// ==========================================================

// 유사 사례(실제 공모전 데이터 + 분석 문구) 한 건
export type SimilarCase = {
  id: number
  title: string
  organizer: string
  domain: string
  image: string
  url: string
  source: string
  similarity: number
  summary: string
  overlap: string[]
  difference: string
}

// 추천 공모전(실제 데이터 + 추천 문구) 한 건
export type AnalyzedContest = {
  id: number
  title: string
  organizer: string
  field: string
  deadline: string
  eligibility: string
  image: string
  url: string
  matchScore: number
  matchReason: string
}

// 상세 분석 — 아이디어 요약과 여러 각도의 참고 의견
export type AnalysisDetail = {
  ideaSummary: string
  targetUsers: string[]
  strengths: string[]
  improvements: string[]
  judgePoints: string[]
  extensionIdeas: string[]
}

export type Analysis = {
  source: 'ai' | 'demo'
  overallNotice: string
  differentiationTip: string
  detail: AnalysisDetail
  similarCases: SimilarCase[]
  contests: AnalyzedContest[]
}

// 백엔드 AI 응답의 원본 형태. 빠진 필드는 목업 분석 값으로 채워집니다.
export type AiAnalysisPayload = {
  overallNotice?: string
  differentiationTip?: string
  detail?: Partial<AnalysisDetail>
  similarCases?: Array<{
    id: number
    similarity: number
    summary: string
    overlap: string[]
    difference: string
  }>
  contests?: Array<{ id: number; matchScore: number; matchReason: string }>
}
