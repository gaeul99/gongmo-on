// ==========================================================
// 백엔드 AI 분석 API 호출
// 백엔드(http://localhost:3000)의 /api/ideas/analyze를 호출합니다.
// 서버가 꺼져 있거나 오류가 나면 호출한 쪽(ResultPage)이
// 목업 분석(buildMockAnalysis)으로 대체합니다.
// ==========================================================

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

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
  const cacheKey = cacheKeyFor(idea, referenceCases, contests)
  if (cache.has(cacheKey)) {
    return cache.get(cacheKey)
  }

  const response = await fetch(`${API_BASE}/api/ideas/analyze`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea, referenceCases, contests }),
    signal: AbortSignal.timeout(45000),
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
