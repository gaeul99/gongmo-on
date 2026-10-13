// ==========================================================
// 정량 지표 추출기
// 입력 설명 문장에서 '숫자+단위' 형태의 정량 표현을 원문 그대로 뽑아 냅니다.
// 예: "대학생 1,000명의 30분짜리 작업을 5분으로" → ["1,000명", "30분", "5분"]
// 제안서 초안(기대 효과)과 데모 분석에서 사용자가 적은 수치 목표를
// 그대로 인용해 반영하기 위해 씁니다.
// ==========================================================

// 기획서의 기대 효과에서 실제로 쓰이는 수량·비율·시간·금액 단위만 화이트리스트.
// 숫자와 단위 사이의 만·천·억 배수(10만 명, 3천 건)도 함께 잡고, 단위 없는
// 숫자는 문맥을 알 수 없어 뽑지 않습니다.
const METRIC_RE = /\d[\d,]*(?:\.\d+)?[천만억조]?\s*(?:%|퍼센트|명|시간|분|초|일|주|개월|달|년|건|원|배|회|대|곳|개|점|위)/g

export function extractMetrics(text, limit = 4) {
  const seen = new Set()
  const metrics = []
  for (const match of String(text ?? '').matchAll(METRIC_RE)) {
    // '3월 1일' 같은 날짜 표기의 '1일'은 목표 수치가 아니므로 건너뜁니다.
    const before = String(text ?? '').slice(Math.max(0, match.index - 4), match.index)
    if (/\d{1,2}월\s*$/.test(before)) continue
    const metric = match[0].replace(/\s+/g, '')
    // 4자리 연도(2026년)는 기간이 아니라 날짜 표기라 제외합니다.
    if (/^(?:19|20)\d{2}년$/.test(metric)) continue
    if (seen.has(metric)) continue
    seen.add(metric)
    metrics.push(metric)
    if (metrics.length >= limit) break
  }
  return metrics
}
