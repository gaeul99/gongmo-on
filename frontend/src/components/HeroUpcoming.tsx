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
import { useContestPool } from '../data/contestPool.js'
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
  // 목업 + 자동 등록이 합쳐진 공모전 풀
  const contests = useContestPool()
  const all = useMemo(
    () =>
      contests
        .map((contest) => ({
          contest,
          untilStart: contest.startDate ? daysUntilStart(contest.startDate) : null,
        }))
        .filter((row) => row.untilStart !== null && row.untilStart >= 0)
        .sort((a, b) => (a.untilStart ?? 0) - (b.untilStart ?? 0)),
    [contests],
  )

  // 박스 높이를 '곧 마감' 박스와 맞추려 최근 시작 순 일부만 보여 준다.
  const rows = all.slice(0, SHOW_LIMIT)

  // 보여 줄 접수 예정 공모전이 없으면 박스를 통째로 숨긴다.
  if (rows.length === 0) return null

  return (
    <div className="hero-panel-col">
      {/* 제목 행은 카드 밖 위에 둔다 — 마키 '접수 중인 공모전'과 같은 섹션 제목
          언어(2026-10-14 사용자 요청 '카드 위에 제목') */}
      <div className="upcoming-head">
        <h2>곧 시작되는 공모전</h2>
        <AppLink
          className="deadline-more"
          href="/contest?status=upcoming"
          onNavigate={onOpenExplore}
        >
          전체 보기
        </AppLink>
      </div>
      <aside className="hero-upcoming" aria-label="곧 시작되는 공모전">
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
      </aside>
    </div>
  )
}

export default HeroUpcoming
