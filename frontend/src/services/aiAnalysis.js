// ==========================================================
// 백엔드 AI 분석 API 호출
// 백엔드(http://localhost:3000)의 /api/ideas/analyze를 호출합니다.
// 서버가 꺼져 있거나 오류가 나면 호출한 쪽(ResultPage)이
// 목업 분석(buildMockAnalysis)으로 대체합니다.
// ==========================================================

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

// AI 프롬프트에 넣을 공모전 후보 수. 후보 전부(350여 건)를 보내면 프롬프트·응답이
// 토큰 한도를 넘어 분석이 실패하고, 후보가 많을수록 응답 JSON도 길어져 30초 예산을
// 넘긴다. 관련도가 높은 상위 몇 건만 추려 보내고, AI 점수가 없는 나머지 공모전은
// 목업 점수를 그대로 쓴다(ResultPage의 mergeAnalysis).
const AI_CONTEST_LIMIT = 16

// 분석 요청 전체의 상한(초). 이 안에 끝나지 않으면 호출한 쪽이 목업 분석으로
// 대체한다 — '분석은 30초 안에 답을 준다'가 서비스 약속이므로 백엔드 상한(25초)보다 살짝 크게.
const AI_TIMEOUT_MS = 30_000

const fieldFamilyOf = (field) => String(field ?? '').split(' ')[0]

// 아이디어 제목·설명에서 키워드 토큰을 뽑는다(2자 이상, 최대 12개).
const tokensOf = (text) =>
  String(text ?? '')
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((token) => token.length >= 2)
    .slice(0, 12)

// AI에게 보낼 후보 공모전을 고른다. 접수 중·접수 예정만 남기고
// 관심 분야 일치 > 아이디어 키워드 겹침 > 마감 임박 순으로 상위 AI_CONTEST_LIMIT건을 택한다.
export function pickAiCandidates(idea, contests) {
  const today = new Date().toISOString().slice(0, 10)
  const ideaTokens = [...new Set([...tokensOf(idea.title), ...tokensOf(idea.description)])]
  return contests
    .filter((contest) => (contest.startDate && contest.startDate > today) || contest.deadline >= today)
    .map((contest) => {
      const haystack = `${contest.title} ${contest.field} ${contest.description ?? ''}`.toLowerCase()
      const keywordHits = ideaTokens.filter((token) => haystack.includes(token)).length
      const fieldBonus = idea.category && fieldFamilyOf(contest.field) === idea.category ? 100 : 0
      const daysLeft = Math.max(0, Math.round((new Date(contest.deadline) - new Date(today)) / 86400000))
      return { contest, score: fieldBonus + keywordHits * 50 - daysLeft }
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, AI_CONTEST_LIMIT)
    .map((row) => row.contest)
}

// 같은 아이디어를 다시 열 때(보관함 '다시 보기' 등) AI 호출을 아끼기 위한 세션 캐시입니다.
const cache = new Map()

function cacheKeyFor(idea, referenceCases, contests) {
  return JSON.stringify([
    idea.title,
    idea.description,
    idea.category,
    referenceCases.map((item) => item.id),
    contests.map((item) => item.id),
  ])
}

export async function requestAiAnalysis(idea, referenceCases, contests) {
  const aiContests = pickAiCandidates(idea, contests)
  const cacheKey = cacheKeyFor(idea, referenceCases, aiContests)
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }

  const response = await fetch(`${API_BASE}/api/ideas/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea, referenceCases, contests: aiContests }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`AI 분석 요청이 실패했어요. (HTTP ${response.status})`)
  }

  const payload = await response.json()
  if (!payload?.success || !payload.data) {
    throw new Error('AI 분석 응답 형식이 올바르지 않아요.')
  }

  cache.set(cacheKey, payload.data)
  return payload.data
}

// '다른 공모전 추천받기' — 분석 본문을 다시 만들지 않고 공모전 적합도만 새로 매깁니다.
// 이미 보여 준 추천(excludeIds)은 후보 풀에서 빼고, 남은 후보 중 관련도 상위 16건을
// 새로 점수 매겨 돌려받습니다. 호출한 쪽(ResultPage)은 실패 시 기존 점수의
// 다음 순위로 대체하므로 여기서는 목업 대체를 하지 않습니다.
export async function requestContestRecommendation(idea, contests, excludeIds = []) {
  const excluded = new Set(excludeIds)
  const pool = contests.filter((contest) => !excluded.has(contest.id))
  const aiContests = pickAiCandidates(idea, pool)
  if (aiContests.length === 0) {
    throw new Error('새로 추천받을 공모전 후보가 남아 있지 않아요.')
  }

  const response = await fetch(`${API_BASE}/api/ideas/recommend`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea, contests: aiContests }),
    signal: AbortSignal.timeout(AI_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`공모전 추천 요청이 실패했어요. (HTTP ${response.status})`)
  }

  const payload = await response.json()
  if (!payload?.success || !Array.isArray(payload.data?.contests)) {
    throw new Error('공모전 추천 응답 형식이 올바르지 않아요.')
  }

  return payload.data.contests
}
