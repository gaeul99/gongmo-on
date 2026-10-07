import { useEffect, useMemo, useState } from 'react'
import { contests } from '../data/mockData.js'
import {
  DATA_AS_OF,
  buildActivityCounts,
  buildChallengeHistory,
  buildDeadlineRows,
  buildRoadmapCandidates,
} from '../data/dashboard.js'
import {
  buildRoadmap,
  loadRoadmapChecks,
  saveRoadmapChecks,
} from '../data/roadmap.js'
import type { User } from './MyPage'
import './DashboardPage.css'

type DeadlineRow = ReturnType<typeof buildDeadlineRows>[number]
type RoadmapCandidate = ReturnType<typeof buildRoadmapCandidates>[number]

type Props = {
  onOpenContest: (id: number) => void
  user: User | null
  // 로그아웃 상태에서 로그인 화면(마이페이지)으로 보내는 콜백
  onGoLogin: () => void
}

const DEADLINE_PAGE_SIZE = 8

// 목록이 길어져 스크롤이 길어지지 않게 쓰는 최소 페이지 네비게이션. 한 쪽이면 아예 숨긴다.
function Pager({
  page,
  pages,
  onPage,
  label,
}: {
  page: number
  pages: number
  onPage: (next: number) => void
  label: string
}) {
  if (pages <= 1) return null
  return (
    <nav className="pager" aria-label={`${label} 페이지 넘김`}>
      <button
        type="button"
        className="pager-btn"
        disabled={page <= 1}
        onClick={() => onPage(page - 1)}
      >
        이전
      </button>
      {Array.from({ length: pages }, (_, index) => index + 1).map((num) => (
        <button
          key={num}
          type="button"
          className={`pager-btn pager-num${num === page ? ' is-on' : ''}`}
          aria-current={num === page ? 'page' : undefined}
          onClick={() => onPage(num)}
        >
          {num}
        </button>
      ))}
      <button
        type="button"
        className="pager-btn"
        disabled={page >= pages}
        onClick={() => onPage(page + 1)}
      >
        다음
      </button>
    </nav>
  )
}

// 출품 로드맵 — 찜·응모한 공모전 하나를 골라 5단계 경로를 체크하며 나아갑니다.
function RoadmapPanel({ candidates }: { candidates: RoadmapCandidate[] }) {
  const [selectedId, setSelectedId] = useState<string>(String(candidates[0].id))
  const [checks, setChecks] = useState<Record<string, boolean>>({})
  const selected = candidates.find((row) => String(row.id) === selectedId) ?? candidates[0]

  // 공모전을 바꾸면 그 공모전의 저장된 체크를 불러옵니다.
  useEffect(() => {
    setChecks(loadRoadmapChecks(selectedId))
  }, [selectedId])

  const roadmap = useMemo(() => buildRoadmap(selected, checks), [selected, checks])

  const toggleTask = (key: string) => {
    setChecks((prev) => {
      const next = { ...prev, [key]: !prev[key] }
      saveRoadmapChecks(selectedId, next)
      return next
    })
  }

  return (
    <>
      <div className="archive-tabs" role="tablist" aria-label="로드맵 공모전 선택">
        {candidates.map((row) => (
          <button
            key={`${row.id}-${row.deadline}`}
            type="button"
            role="tab"
            aria-selected={String(row.id) === selectedId}
            className={`archive-tab${String(row.id) === selectedId ? ' is-on' : ''}`}
            onClick={() => setSelectedId(String(row.id))}
          >
            {row.title} · {row.status.label}
          </button>
        ))}
      </div>
      <div className="roadmap-summary">
        <p className="roadmap-next" role="status">
          지금 할 일 ·{' '}
          <b>
            {roadmap.next
              ? `${roadmap.next.stageLabel} — ${roadmap.next.text}`
              : '5단계 모두 완료! 제출 준비가 끝났어요'}
          </b>
        </p>
        <span className="roadmap-percent">{roadmap.percent}%</span>
      </div>
      <div className="roadmap-progress" aria-hidden="true">
        <span className="roadmap-progress-fill" style={{ width: `${roadmap.percent}%` }} />
      </div>
      <ol className="roadmap-stages">
        {roadmap.stages.map((stage) => (
          <li
            key={stage.id}
            className={[
              'roadmap-stage',
              stage.stageDone ? 'is-done' : '',
              !stage.stageDone && roadmap.next?.stageLabel === stage.label ? 'is-active' : '',
              stage.overdue ? 'is-over' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <div className="roadmap-stage-head">
              <span className="roadmap-stage-label">{stage.label}</span>
              {stage.dueLabel && <span className="roadmap-due">{stage.dueLabel}까지</span>}
            </div>
            <ul className="roadmap-tasks">
              {stage.tasks.map((task) => (
                <li key={task.key}>
                  <label className={task.done ? 'is-checked' : ''}>
                    <input type="checkbox" checked={task.done} onChange={() => toggleTask(task.key)} />
                    <span>{task.text}</span>
                  </label>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </>
  )
}

function DashboardPage({ onOpenContest, user, onGoLogin }: Props) {
  // 로그인하면 계정에 저장된 기록(응모·관심·보관함·로드맵)이 복원되므로
  // 같은 대시보드라도 계정마다 다른 화면이 됩니다.
  const basis = user ? `${user.nickname}님 계정 기준` : '이 브라우저 기준'
  const deadlineRows = useMemo(() => buildDeadlineRows(), [])
  const activity = useMemo(() => buildActivityCounts(), [])
  // 도전 히스토리 — 내 응모 기록을 수상·탈락·진행 중으로 요약한 '성장의 증거'
  const challenge = useMemo(() => buildChallengeHistory(), [])
  // 출품 로드맵 후보 — 내 응모·관심 중 아직 마감하지 않은 공모전
  const roadmapCandidates = useMemo(() => buildRoadmapCandidates(), [])
  const maxChallengeField = Math.max(...challenge.fields.map((bar) => bar.count), 1)

  // 아직 마감하지 않은 공모전 중 가장 빠른 마감일 (KPI 보조 문구용)
  const soonest = deadlineRows.find((row) => row.status.tone !== 'closed' && row.status.left !== null)
  const soonestLabel =
    soonest && soonest.status.left !== null && soonest.status.left > 0
      ? `가장 임박 ${soonest.status.label}`
      : soonest
        ? '오늘 마감 있는 날'
        : '마감 데이터 없음'

  // 마감 임박 목록 페이징. 데이터가 줄어도 현재 쪽이 비지 않게 쪽수를 보정한다.
  const [deadlinePageRaw, setDeadlinePage] = useState(1)
  const deadlinePages = Math.max(1, Math.ceil(deadlineRows.length / DEADLINE_PAGE_SIZE))
  const deadlinePage = Math.min(deadlinePageRaw, deadlinePages)
  const deadlineSlice = deadlineRows.slice(
    (deadlinePage - 1) * DEADLINE_PAGE_SIZE,
    deadlinePage * DEADLINE_PAGE_SIZE,
  )

  return (
    <div className="dashboard-page">
      <header className={`dashboard-header${user ? ' is-personal' : ''}`}>
        <p className="dashboard-badge">{user ? `${user.nickname}님 계정 현황` : '현황 대시보드'}</p>
        <h1>{user ? `${user.nickname}님의 공내비` : '한눈에 보는 공내비'}</h1>
        {user ? (
          <p className="dashboard-caption">
            공모전 데이터는 {DATA_AS_OF} 기준이에요. 응모·관심·보관함·로드맵 수치는{' '}
            {user.nickname}님 계정에 저장된 기록이라, 다른 기기에서 로그인하면 같은 대시보드가
            복원돼요.
          </p>
        ) : (
          <>
            <p className="dashboard-caption">
              공모전 데이터는 {DATA_AS_OF} 기준이에요. 지금 수치는 이 브라우저에 저장된 기록이며,
              로그인하면 계정에 저장돼 사람마다 각자의 대시보드가 보여요.
            </p>
            <button type="button" className="dash-login-cta" onClick={onGoLogin}>
              로그인하고 내 기록 불러오기
            </button>
          </>
        )}
      </header>

      <section className="kpi-row" aria-label="요약 수치">
        <div className="kpi-card kpi-hot">
          <p className="kpi-label">접수 중 공모전</p>
          <p className="kpi-num">{contests.length}</p>
          <p className="kpi-sub">{soonestLabel}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">내 응모</p>
          <p className="kpi-num">{activity.myContests}</p>
          <p className="kpi-sub">{basis}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">내 관심</p>
          <p className="kpi-num">{activity.wishlist}</p>
          <p className="kpi-sub">{basis}</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">보관한 아이디어</p>
          <p className="kpi-num">{activity.savedIdeas}</p>
          <p className="kpi-sub">{basis}</p>
        </div>
      </section>

      <section className="dash-panel" aria-label="마감 임박 공모전">
        <div className="panel-head">
          <h2>마감 임박 공모전</h2>
          <span className="panel-hint">마감일 순 · 항목을 누르면 상세 정보</span>
        </div>
          {deadlineRows.length === 0 ? (
            <p className="panel-empty">
              지금 표시할 공모전이 없어요. 공모전 데이터는 {DATA_AS_OF} 기준이니 데이터를 갱신해
              주세요.
            </p>
          ) : (
            <ul className="deadline-list">
              {deadlineSlice.map((row: DeadlineRow) => (
                <li
                  key={`${row.id}-${row.deadline}`}
                  className={`deadline-row${row.status.tone === 'closed' ? ' deadline-closed' : ''}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenContest(Number(row.id))}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      onOpenContest(Number(row.id))
                    }
                  }}
                  title="공모전 상세 보기"
                >
                  <span className={`deadline-d tone-${row.status.tone}`}>{row.status.label}</span>
                  <span className="deadline-info">
                    <span className="deadline-title">{row.title}</span>
                    <span className="deadline-sub">
                      {row.organizer}
                      <span className="deadline-kinds">
                        {row.kinds.map((kind) => (
                          <span key={kind} className="deadline-kind">
                            {kind}
                          </span>
                        ))}
                      </span>
                    </span>
                  </span>
                  <span className="deadline-date">{row.deadline.slice(5).replace('-', '.')}</span>
                </li>
              ))}
            </ul>
          )}
          <Pager
            page={deadlinePage}
            pages={deadlinePages}
            onPage={setDeadlinePage}
            label="마감 임박 목록"
          />
      </section>

      <section className="dash-panel" aria-label="도전 히스토리">
        <div className="panel-head">
          <h2>도전 히스토리</h2>
          <span className="panel-hint">수상·탈락·진행 중은 마이페이지 응모 기록에서 바꿔요</span>
        </div>
        {challenge.total === 0 ? (
          <p className="panel-empty">
            아직 응모 기록이 없어요. 분석 결과에서 공모전에 응모하면 도전 기록이 이곳에 쌓여요.
          </p>
        ) : (
          <div className="challenge-layout">
            <div className="challenge-counts">
              <div className="challenge-count is-total">
                <span className="challenge-num">{challenge.total}</span>
                <span className="challenge-label">누적 도전</span>
              </div>
              <div className="challenge-count is-progress">
                <span className="challenge-num">{challenge.progress}</span>
                <span className="challenge-label">진행 중</span>
              </div>
              <div className="challenge-count is-won">
                <span className="challenge-num">{challenge.won}</span>
                <span className="challenge-label">수상</span>
              </div>
              <div className="challenge-count is-lost">
                <span className="challenge-num">{challenge.lost}</span>
                <span className="challenge-label">탈락</span>
              </div>
            </div>
            {challenge.fields.length > 0 && (
              <div className="challenge-fields">
                <p className="challenge-fields-title">도전한 분야</p>
                {challenge.fields.map((bar) => (
                  <div key={bar.name} className="field-row">
                    <span className="field-name">{bar.name}</span>
                    <span className="field-track">
                      <span
                        className="field-fill"
                        style={{
                          width: `${Math.round((bar.count / maxChallengeField) * 100)}%`,
                        }}
                      />
                    </span>
                    <span className="field-count">{bar.count}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </section>

      <section className="dash-panel" aria-label="출품 로드맵">
        <div className="panel-head">
          <h2>출품 로드맵</h2>
          <span className="panel-hint">
            찜·응모 공모전의 5단계 경로 · 권장 기한은 마감까지 남은 기간 기준 · 체크는 이 브라우저에
            저장돼요
          </span>
        </div>
        {roadmapCandidates.length === 0 ? (
          <p className="panel-empty">
            아직 마감 전인 찜·응모 공모전이 없어요. 공모전을 찜하면 이곳에 출품 경로가 만들어져요.
          </p>
        ) : (
          <RoadmapPanel candidates={roadmapCandidates} />
        )}
      </section>
    </div>
  )
}

export default DashboardPage
