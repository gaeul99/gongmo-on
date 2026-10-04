// 응모·관심 목록의 공모전 마감일을 기준으로 알림을 만듭니다.
// deadline은 'YYYY-MM-DD' 형태의 문자열입니다(마감일 하루 끝까지를 마감으로 봅니다).
const DAY_MS = 24 * 60 * 60 * 1000

function daysUntil(deadline, now = new Date()) {
  const start = new Date(`${deadline}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  // 오늘 0시와 마감일 0시의 날짜 차이: 마감일이 오늘이면 0(오늘 마감), 내일이면 1.
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((start.getTime() - startOfToday.getTime()) / DAY_MS)
}

// 응모 목록과 관심 목록을 합쳐 마감일이 가까운 순으로 정렬한 알림 배열을 돌려줍니다.
// tone: today(오늘 마감) · urgent(7일 이내) · upcoming(8일 이상) · closed(마감 지남)
export function buildContestAlerts(applied = [], wishlist = []) {
  const tracked = [
    ...applied.map((contest) => ({ ...contest, kindLabel: '응모' })),
    ...wishlist.map((contest) => ({ ...contest, kindLabel: '관심' })),
  ]

  return tracked
    .map((contest) => ({ contest, left: daysUntil(contest.deadline) }))
    .filter((item) => item.left !== null)
    .map(({ contest, left }) => {
      let tone = 'upcoming'
      let message = `마감까지 ${left}일 남았어요`
      if (left < 0) {
        tone = 'closed'
        message = '마감되었어요'
      } else if (left === 0) {
        tone = 'today'
        message = '오늘 마감이에요!'
      } else if (left <= 7) {
        tone = 'urgent'
        message = `마감 임박! ${left}일 남았어요`
      }

      return {
        id: `${contest.kindLabel}-${contest.id}`,
        title: contest.title,
        kindLabel: contest.kindLabel,
        deadline: contest.deadline,
        left,
        tone,
        message,
      }
    })
    .sort((a, b) => a.deadline.localeCompare(b.deadline))
}

// 내비게이션 배지에 표시할 '지금 확인이 필요한' 알림 개수 (오늘 마감 + 마감 임박).
export function urgentAlertCount(alerts = []) {
  return alerts.filter((alert) => alert.tone === 'today' || alert.tone === 'urgent').length
}

// 마감일 하나의 남은 일 수와 상태를 한 번에 계산합니다.
// 대시보드처럼 목록 형태가 아닌 화면에서도 buildContestAlerts와 같은 기준을 쓰게 하기 위해 분리했습니다.
// tone: today(오늘 마감) · urgent(7일 이내) · upcoming(8일 이상) · closed(마감 지남·일정 없음)
export function deadlineStatus(deadline, now = new Date()) {
  const left = daysUntil(deadline, now)
  if (left === null) {
    return { left: null, tone: 'closed', label: '일정 확인 필요' }
  }
  if (left < 0) return { left, tone: 'closed', label: '마감' }
  if (left === 0) return { left, tone: 'today', label: 'D-day' }
  return {
    left,
    tone: left <= 7 ? 'urgent' : 'upcoming',
    label: `D-${left}`,
  }
}
