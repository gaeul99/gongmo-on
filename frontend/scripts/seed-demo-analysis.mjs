// 발표용 데모 데이터 — 보관함 아이디어에 AI 분석 스냅숏을 심는다.
// 브라우저의 mergeAnalysis(ResultPage)와 같은 방식으로 조립한다:
//   실제 데이터(mockData) + AI 응답 → 최종 Analysis
// contestPool.js는 import.meta.env를 읽어 node에서 로드되지 않으므로,
// 목업 후보 풀(mockData.contests)을 직접 쓴다 — 백엔드 자동 등록분이 빠진 것은
// 분석 스냅숏의 유사사례(id 1~3)·추천 후보로는 영향이 없다.
//
// 사전 준비: frontend/ai-analysis-response.json (git 제외, 임시 파일)
//   POST http://localhost:3000/api/ideas/analyze 에
//   { idea, referenceCases(mockData.referenceCases), contests(후보 5건) }를
//   보내 data 필드를 저장해 둔다. 파일이 없으면 ENOENT로 실패한다.
// 실행: node scripts/seed-demo-analysis.mjs  (frontend/에서)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const here = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(here, '..')
const dataDir = path.resolve(root, '../backend/src/data')

const mockData = await import(pathToFileURL(path.join(root, 'src/data/mockData.js')))
const { contests: staticContests, referenceCases } = mockData

const aiData = JSON.parse(
  fs.readFileSync(path.resolve(here, '../ai-analysis-response.json'), 'utf-8'),
)

const idea = {
  title: '도서관 책 위치 안내 앱',
  description:
    '도서관에서 책을 찾기 어려워하는 사람을 위한 위치 기반 책 위치 안내 앱. 검색하면 책이 꽂힌 책장을 지도로 보여 준다.',
  category: '생활',
}

// ---- buildMockAnalysis 재현 (mockAnalysis.js의 점수 규칙 동일) ----
function seedFrom(text) {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 9973
  }
  return hash
}
function scoreFrom(seed, index, min, max) {
  return min + ((seed + index * 17) % (max - min + 1))
}

const seed = seedFrom(idea.title + idea.category)
const fieldMatch = (contest) =>
  Boolean(idea.category) &&
  (contest.field === idea.category || contest.field.startsWith(`${idea.category} `))

const mockContests = [...staticContests]
  .sort((a, b) => Number(fieldMatch(b)) - Number(fieldMatch(a)))
  .map((contest) => {
    const isMatch = fieldMatch(contest)
    return {
      ...contest,
      matchScore: isMatch ? scoreFrom(seed, contest.id, 76, 92) : scoreFrom(seed, contest.id, 42, 68),
    }
  })

const mockSimilarCases = referenceCases.map((caseInfo, index) => ({
  ...caseInfo,
  source: '실제 공모전',
  similarity: index === 0 ? 99 : scoreFrom(seed, index + 1, index === 1 ? 64 : 50, index === 1 ? 76 : 62),
  summary: '',
  overlap: [],
  difference: '',
}))

// ---- mergeAnalysis 재현 (ResultPage.tsx와 동일) ----
const similarCases = mockSimilarCases.map((mockCase) => {
  const aiCase = aiData.similarCases?.find((item) => item.id === mockCase.id)
  return {
    ...mockCase,
    similarity: aiCase ? aiCase.similarity : mockCase.similarity,
    summary: aiCase?.summary ?? mockCase.summary,
    overlap: aiCase ? aiCase.overlap : mockCase.overlap,
    difference: aiCase?.difference ?? mockCase.difference,
  }
})

const contestsMerged = mockContests.map((mockContest) => {
  const aiContest = aiData.contests?.find((item) => item.id === mockContest.id)
  return {
    ...mockContest,
    matchScore: aiContest ? aiContest.matchScore : mockContest.matchScore,
    matchReason: aiContest?.matchReason ?? mockContest.matchReason,
  }
})

if (aiData.contests) {
  const scoreById = new Map(aiData.contests.map((item) => [item.id, item.matchScore]))
  contestsMerged.sort((a, b) => (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0))
}

const analysis = {
  source: 'ai',
  overallNotice: aiData.overallNotice,
  differentiationTip: aiData.differentiationTip,
  detail: {
    ideaSummary: aiData.detail?.ideaSummary,
    targetUsers: aiData.detail?.targetUsers,
    strengths: aiData.detail?.strengths,
    improvements: aiData.detail?.improvements,
    judgePoints: aiData.detail?.judgePoints,
    extensionIdeas: aiData.detail?.extensionIdeas,
  },
  similarCases,
  contests: contestsMerged,
}

// ---- userdata.json의 보관함 아이디어에 심는다 ----
const USERDATA_FILE = path.join(dataDir, 'userdata.json')
const store = JSON.parse(fs.readFileSync(USERDATA_FILE, 'utf-8'))
const record = store['김가을']
if (!record) throw new Error('김가을 계정이 userdata.json에 없다')

const target = record.data.savedIdeas.find(
  (saved) => saved.title === idea.title && saved.description === idea.description,
)
if (!target) throw new Error('시연 아이디어가 보관함에 없다')
target.analysis = analysis
record.updatedAt = new Date().toISOString()

fs.writeFileSync(USERDATA_FILE, JSON.stringify(store, null, 2) + '\n')
console.log('seeded analysis into savedIdeas:', target.title)
console.log(
  'analysis: source=ai, contests=%d, similarCases=%d',
  contestsMerged.length,
  similarCases.length,
)
