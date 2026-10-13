// ==========================================================
// 첫화면 오른쪽 패널 — 접수 중인 공모전 중 마감이 가장 가까운
// 3건을 마감일순으로 보여준다. 목록은 조사 기준일의 실제 데이터
// (data/mockData.js contests)이고, D-x 라벨은 utils/contestAlerts.js의
// deadlineStatus가 오늘 날짜로 계산한다. 항목은 공모전 상세 화면,
// 전체 보기는 공모전 탐색 화면으로 이동.
// ==========================================================
import { useMemo } from 'react'
import AppLink from './AppLink'
import { useContestPool } from '../data/contestPool.js'
import { deadlineStatus, isApplicationOpen } from '../utils/contestAlerts.js'
import { getNewContests } from '../utils/contestOpenAlerts.js'
import './HeroDeadlines.css'

type Props = {
  onOpenExplore: () => void
  onOpenContest: (id: number) => void
}

const SHOW_LIMIT = 3

function HeroDeadlines({ onOpenExplore, onOpenContest }: Props) {
  // 목업 + 자동 등록이 합쳐진 공모전 풀
  const contests = useContestPool()
  // 이번 데이터 갱신에서 새로 접수가 시작된 공모전 id (NEW 배지 표시용)
  const newIds = useMemo(
    () => new Set(getNewContests(contests).map((contest) => contest.id)),
    [contests],
  )

  const rows = contests
    .map((contest) => ({ contest, status: deadlineStatus(contest.deadline) }))
    .filter(
      (row) =>
        row.status.left !== null &&
        row.status.left >= 0 &&
        // 접수가 아직 시작되지 않은 공모전(접수 예정)은 '곧 시작되는 공모전' 박스가 담당한다
        isApplicationOpen(row.contest),
    )
    .sort((a, b) => (a.status.left ?? 0) - (b.status.left ?? 0))
    .slice(0, SHOW_LIMIT)

  return (
    <aside className="hero-deadlines" aria-label="곧 마감되는 공모전">
      <div className="deadline-head">
        <h2>곧 마감되는 공모전</h2>
        <span className="deadline-emoji" aria-hidden="true">
          ⏰
        </span>
        <AppLink className="deadline-more" href="/contest" onNavigate={onOpenExplore}>
          전체 보기
        </AppLink>
      </div>

      <ul className="deadline-list">
        {rows.map(({ contest, status }) => (
          <li key={contest.id}>
            <AppLink
              className="deadline-item"
              href={`/contest/${contest.id}`}
              title="공모전 상세 보기"
              onNavigate={() => onOpenContest(contest.id)}
            >
              <span className={`deadline-badge tone-${status.tone}`}>{status.label}</span>
              <span className="deadline-info">
                <span className="deadline-title">
                  {contest.title}
                  {newIds.has(contest.id) && <i className="deadline-new">NEW</i>}
                </span>
                <span className="deadline-meta">
                  {contest.organizer} · {contest.field}
                </span>
              </span>
            </AppLink>
          </li>
        ))}
      </ul>

      <p className="deadline-note">
        지금 접수 중인 공모전 · 항목을 누르면 상세 정보를 볼 수 있어요.
      </p>
    </aside>
  )
}

export default HeroDeadlines
