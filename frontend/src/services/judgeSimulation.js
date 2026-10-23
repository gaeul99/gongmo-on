// ==========================================================
// AI 심사 시뮬레이션 API 호출
// 백엔드(http://localhost:3000)의 /api/ideas/judge를 호출해
// 제안서 초안을 분석 화면의 심사 기준별로 채점합니다.
// 서버가 꺼져 있거나 오류가 나면 호출한 쪽(ResultPage)이
// 데모 채점(buildMockJudging)으로 대체합니다 — aiAnalysis.js와 같은 규칙.
// ==========================================================

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

// 채점은 기준 3~6개 × 한 문장 코멘트라 분석보다 훨씬 짧다. 그래도 게이트웨이
// 사정을 고려해 분석과 같은 30초 상한을 쓴다.
const JUDGE_TIMEOUT_MS = 30_000

export async function requestJudgeSimulation({ proposal, judgePoints, contestTitle = '', ideaTitle = '' }) {
  const response = await fetch(`${API_BASE}/api/ideas/judge`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ proposal, judgePoints, contestTitle, ideaTitle }),
    signal: AbortSignal.timeout(JUDGE_TIMEOUT_MS),
  })

  if (!response.ok) {
    throw new Error(`심사 시뮬레이션 요청이 실패했어요. (HTTP ${response.status})`)
  }

  const payload = await response.json()
  if (!payload?.success || !payload.data) {
    throw new Error('심사 시뮬레이션 응답 형식이 올바르지 않아요.')
  }
  return payload.data
}

// mockAnalysis.js와 같은 문자열 해시 — 같은 제안서·기준이면 같은 점수가 나온다.
function hashOf(text) {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 9973
  }
  return hash
}

// 데모 채점 — 제안서 길이와 기준 문장 해시로 점수를 정하고,
// 점수 구간에 맞는 코멘트를 붙여 AI 응답과 같은 형태로 돌려준다.
export function buildMockJudging({ proposal, judgePoints }) {
  const text = String(proposal ?? '')
  // 제안서가 길수록(충실할수록) 점수가 오르는 경향을 주되, 0.5~1.5배 랜덤 없이
  // 해시 기반으로만 흔든다 — 같은 입력엔 같은 결과.
  const lengthBonus = Math.min(20, Math.floor(text.length / 100) * 2)
  const items = judgePoints.map((point) => {
    const score = Math.min(94, 52 + (hashOf(`${text}|${point}`) % 28) + lengthBonus)
    const comment =
      score >= 85
        ? '제안서에서 이 기준을 뒷받침하는 내용이 잘 드러나요.'
        : score >= 70
          ? '이 기준의 근거와 수치를 한 문장 더 보강하면 강해져요.'
          : '이 기준에 맞는 내용이 부족해요. 근거를 채워 넣으세요.'
    return { point, score, comment }
  })
  const total = items.length
    ? Math.round(items.reduce((sum, item) => sum + item.score, 0) / items.length)
    : 0
  const verdict =
    total >= 85
      ? '전반적으로 균형 잡힌 초안이에요. 가장 약한 기준의 코멘트만 채우면 제출할 수 있어요.'
      : total >= 70
        ? '뼈대는 갖췄어요. 점수가 낮은 기준의 보완 문장을 먼저 채워 보세요.'
        : '아직 근거가 부족한 기준이 있어요. 점수가 낮은 기준부터 채워 넣으세요.'
  return { total, verdict, items }
}
