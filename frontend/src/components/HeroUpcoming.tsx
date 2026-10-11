// ==========================================================
// 첫화면 '곧 마감되는 공모전' 박스 오른쪽 패널 — 접수가 곧
// 시작되는 공모전을 시작일 가까운 순으로 보여준다. 데이터는
// mockData.js contests 중 startDate가 오늘 이후인 항목(접수 예정)이고,
// D-x 라벨은 접수 시작일까지 남은 일수를 오늘 날짜로 계산한다.
// 항목을 누르면 공모전 상세 화면, 전체 보기는 '곧 시작' 필터가
// 걸린 공모전 탐색 화면으로 이동한다.
// ==========================================================
import { useMemo } from 'react'
import AppLink from './AppLink'
import { contests } from '../data/mockData.js'
import './HeroUpcoming.css'

type Props = {
  onOpenContest: (id: number) => void
  onOpenExplore: () => void
}

const SHOW_LIMIT = 3

// 접수 시작일까지 남은 일수(오늘 0시 기준). 날짜 계산 방식은
// utils/contestAlerts.js의 daysUntil과 같다.
function daysUntilStart(startDate: string, now = new Date()): number | null {
  const start = new Date(`${startDate}T00:00:00`)
  if (Number.isNaN(start.getTime())) return null
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((start.getTime() - startOfToday.getTime()) / 86400000)
}

function HeroUpcoming({ onOpenContest, onOpenExplore }: Props) {
  const all = useMemo(
    () =>
      contests
        .map((contest) => ({
          contest,
          untilStart: contest.startDate ? daysUntilStart(contest.startDate) : null,
        }))
        .filter((row) => row.untilStart !== null && row.untilStart >= 0)
        .sort((a, b) => (a.untilStart ?? 0) - (b.untilStart ?? 0)),
    [],
  )

  // 박스 높이를 '곧 마감' 박스와 맞추려 최근 시작 순 일부만 보여 주고, 총 건수는 안내 문구에 표시한다.
  const rows = all.slice(0, SHOW_LIMIT)
  const total = all.length

  // 보여 줄 접수 예정 공모전이 없으면 박스를 통째로 숨긴다.
  if (rows.length === 0) return null

  return (
    <aside className="hero-upcoming" aria-label="곧 시작되는 공모전">
      <div className="upcoming-head">
        <h2>곧 시작되는 공모전</h2>
        <span className="upcoming-emoji" aria-hidden="true">
          🚀
        </span>
        <AppLink
          className="deadline-more"
          href="/contest?status=upcoming"
          onNavigate={onOpenExplore}
        >
          전체 보기
        </AppLink>
      </div>

      <ul className="upcoming-list">
        {rows.map(({ contest, untilStart }) => (
          <li key={contest.id}>
            <AppLink
              className="upcoming-item"
              href={`/contest/${contest.id}`}
              title="공모전 상세 보기"
              onNavigate={() => onOpenContest(contest.id)}
            >
              <span className={`upcoming-badge tone-${untilStart === 0 ? 'today' : 'soon'}`}>
                {untilStart === 0 ? '오늘 시작' : `D-${untilStart} 시작`}
              </span>
              <span className="upcoming-info">
                <span className="upcoming-title">{contest.title}</span>
                <span className="upcoming-meta">
                  {contest.organizer} · {contest.field}
                </span>
              </span>
            </AppLink>
          </li>
        ))}
      </ul>

      <p className="upcoming-note">
        접수 예정 {total}건 · 곧 시작하는 순으로 {rows.length}건을 보여드려요.
      </p>
    </aside>
  )
}

export default HeroUpcoming
