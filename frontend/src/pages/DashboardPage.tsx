import { useMemo, useState } from 'react'
import type { KeyboardEvent } from 'react'
import AppLink from '../components/AppLink'
import Reveal from '../components/Reveal'
import { useContestPool } from '../data/contestPool.js'
import { pageItems } from '../utils/pagination'
import {
  DATA_AS_OF,
  buildActivityCounts,
  buildPortfolioModel,
  buildDeadlineRows,
  buildRoadmapCandidates,
} from '../data/dashboard.js'
import {
  buildRoadmap,
  loadRoadmapChecks,
  saveRoadmapChecks,
} from '../data/roadmap.js'
import { downloadPortfolioCard } from '../utils/portfolioCard.js'
import type { User } from './MyPage'
import './DashboardPage.css'

type DeadlineRow = ReturnType<typeof buildDeadlineRows>[number]
type RoadmapCandidate = ReturnType<typeof buildRoadmapCandidates>[number]

type Props = {
  onOpenContest: (id: number) => void
  user: User | null
  // 로그아웃 상태에서 로그인 화면(마이페이지)으로 보내는 콜백
  onGoLogin: () => void
  // 공모전 탐색 화면으로 보내는 콜백 — 마감 임박 패널·빈 상태에서 씁니다.
  onOpenExplore: () => void
  // 아이디어 분석 입력 화면으로 보내는 콜백 — 도전 히스토리 빈 상태에서 씁니다.
  onGoInput: () => void
  // '내 응모'·'내 관심'·'보관한 아이디어' KPI 카드 클릭 — 마이페이지의 해당 목록으로
  // 보내는 콜백(2026-10-15 사용자 요청). 주소의 ?section=이 목록 위치를 정한다.
  onGoMyContests: () => void
  onGoWishlist: () => void
  onGoArchive: () => void
}

const DEADLINE_PAGE_SIZE = 8

// 목록이 길어져 스크롤이 길어지지 않게 쓰는 최소 페이지 네비게이션. 한 쪽이면 아예 숨긴다.
// 번호가 많으면 utils/pagination.ts가 양끝과 현재 주변만 남겨 준다(1 … 4 5 6 … 52).
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
      {pageItems(page, pages).map((item, index) =>
        item === 'gap' ? (
          <span key={`gap-${index}`} className="pager-gap" aria-hidden="true">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            className={`pager-btn pager-num${item === page ? ' is-on' : ''}`}
            aria-current={item === page ? 'page' : undefined}
            onClick={() => onPage(item)}
          >
            {item}
          </button>
        ),
      )}
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
  // 공모전별 체크를 메모리에 쌓아 둔다. 탭을 옮겨 다녀도 방금 고른 체크가 유지되고,
  // 처음 고른 공모전은 localStorage에 저장된 값을 그대로 쓴다.
  const [checksCache, setChecksCache] = useState<Record<string, Record<string, boolean>>>({})
  const selected = candidates.find((row) => String(row.id) === selectedId) ?? candidates[0]
  const checks = useMemo(
    () => checksCache[selectedId] ?? loadRoadmapChecks(selectedId),
    [checksCache, selectedId],
  )

  const roadmap = useMemo(() => buildRoadmap(selected, checks), [selected, checks])

  const toggleTask = (key: string) => {
    const next = { ...checks, [key]: !checks[key] }
    saveRoadmapChecks(selectedId, next)
    setChecksCache((cache) => ({ ...cache, [selectedId]: next }))
  }

  // 로드맵 탭은 role=tablist — 좌우 화살표로 후보 간 이동이 가능해야 한다(키보드 접근성).
  const handleTabKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
    event.preventDefault()
    const nextIndex =
      event.key === 'ArrowRight'
        ? (index + 1) % candidates.length
        : (index - 1 + candidates.length) % candidates.length
    setSelectedId(String(candidates[nextIndex].id))
  }

  return (
    <>
      <div className="archive-tabs" role="tablist" aria-label="로드맵 공모전 선택">
        {candidates.map((row, index) => (
          <button
            key={`${row.id}-${row.deadline}`}
            type="button"
            role="tab"
            aria-selected={String(row.id) === selectedId}
            tabIndex={String(row.id) === selectedId ? 0 : -1}
            className={`archive-tab${String(row.id) === selectedId ? ' is-on' : ''}`}
            onClick={() => setSelectedId(String(row.id))}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
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

function DashboardPage({
  onOpenContest,
  user,
  onGoLogin,
  onOpenExplore,
  onGoInput,
  onGoMyContests,
  onGoWishlist,
  onGoArchive,
}: Props) {
  // 로그인하면 계정에 저장된 기록(응모·관심·보관함·로드맵)이 복원되므로
  // 같은 대시보드라도 계정마다 다른 화면이 됩니다.
  const basis = user ? `${user.nickname}님 계정 기준` : '이 브라우저 기준'
  // 목업 + 백엔드 자동 등록이 합쳐진 공모전 풀 — 자동 등록분이 도착하면 패널들이 다시 계산된다.
  const contests = useContestPool()
  const deadlineRows = useMemo(() => buildDeadlineRows(new Date(), contests), [contests])
  // 수치 계산은 localStorage를 직접 읽는다 — useMemo로 묶어 두면 로그인 직후 서버
  // 복원처럼 화면에 머물러 일어난 기록 변화가 반영되지 않으므로, 데이터가 작은 만큼
  // 매 렌더 다시 계산한다(App.tsx의 알림 계산과 같은 패턴).
  const activity = buildActivityCounts()
  // 도전 히스토리 — 내 응모 기록을 수상·탈락·진행 중으로 요약한 '성장의 증거'.
  // 포트폴리오 카드(이미지) 재료까지 한 번에 만든다(2026-10-23).
  const portfolio = buildPortfolioModel(contests, user?.nickname)
  // 출품 로드맵 후보 — 내 응모·관심 중 아직 마감하지 않은 공모전
  const roadmapCandidates = buildRoadmapCandidates()
  const maxChallengeField = Math.max(...portfolio.fields.map((bar) => bar.count), 1)

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
      {/* 2026-10-14 사용자 요청으로 'OO님 계정 현황' 배지는 아예 뺐다 — 제목이
          개인 화면임을 이미 말해 준다 */}
      <header className="dashboard-header">
        <h1>{user ? `${user.nickname}님의 공모온` : '한눈에 보는 공모온'}</h1>
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
            <AppLink className="dash-login-cta" href="/mypage" onNavigate={onGoLogin}>
              로그인하고 내 기록 불러오기
            </AppLink>
          </>
        )}
      </header>

      <section className="kpi-row" aria-label="요약 수치">
        <div className="kpi-card kpi-hot" data-reveal>
          <p className="kpi-label">접수 중 공모전</p>
          <p className="kpi-num">{contests.length}</p>
          <p className="kpi-sub">{soonestLabel}</p>
        </div>
        {/* '내 응모'·'내 관심'·'보관한 아이디어' 카드는 마이페이지 해당 목록으로
            연결되는 링크다(2026-10-15 사용자 요청). Reveal 래퍼가 카드의 등장
            애니메이션을 지킨다 */}
        <Reveal delay={90}>
          <AppLink
            className="kpi-card"
            href="/mypage?section=applied"
            title="마이페이지 '내가 응모한 공모전'으로 이동"
            onNavigate={onGoMyContests}
          >
            <p className="kpi-label">내 응모</p>
            <p className="kpi-num">{activity.myContests}</p>
            <p className="kpi-sub">{basis}</p>
          </AppLink>
        </Reveal>
        <Reveal delay={180}>
          <AppLink
            className="kpi-card"
            href="/mypage?section=wishlist"
            title="마이페이지 '관심 공모전'으로 이동"
            onNavigate={onGoWishlist}
          >
            <p className="kpi-label">내 관심</p>
            <p className="kpi-num">{activity.wishlist}</p>
            <p className="kpi-sub">{basis}</p>
          </AppLink>
        </Reveal>
        <Reveal delay={270}>
          <AppLink
            className="kpi-card"
            href="/mypage?section=archive"
            title="마이페이지 '보관한 아이디어'로 이동"
            onNavigate={onGoArchive}
          >
            <p className="kpi-label">보관한 아이디어</p>
            <p className="kpi-num">{activity.savedIdeas}</p>
            <p className="kpi-sub">{basis}</p>
          </AppLink>
        </Reveal>
      </section>

      <section className="dash-panel" aria-label="마감 임박 공모전" data-reveal>
        <div className="panel-head">
          <h2>마감 임박 공모전</h2>
          <div className="panel-head-side">
            <span className="panel-hint">마감일 순 · 항목을 누르면 상세 정보</span>
            <AppLink className="panel-link" href="/contest" onNavigate={onOpenExplore}>
              공모전 탐색 →
            </AppLink>
          </div>
        </div>
          {deadlineRows.length === 0 ? (
            <p className="panel-empty">
              지금 표시할 공모전이 없어요. 공모전 데이터는 {DATA_AS_OF} 기준이니 데이터를 갱신해
              주세요.
            </p>
          ) : (
            <ul className="dash-deadline-list">
              {deadlineSlice.map((row: DeadlineRow) => (
                <li key={`${row.id}-${row.deadline}`}>
                  <AppLink
                    className={`deadline-row${row.status.tone === 'closed' ? ' deadline-closed' : ''}`}
                    href={`/contest/${row.id}`}
                    title="공모전 상세 보기"
                    onNavigate={() => onOpenContest(Number(row.id))}
                  >
                    <span className={`deadline-d tone-${row.status.tone}`}>{row.status.label}</span>
                    <span className="dash-deadline-info">
                      <span className="dash-deadline-title">{row.title}</span>
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
                  </AppLink>
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

      <section className="dash-panel" aria-label="도전 히스토리" data-reveal>
        <div className="panel-head">
          <h2>도전 히스토리</h2>
          <div className="panel-head-side">
            <span className="panel-hint">수상·탈락·진행 중은 마이페이지 응모 기록에서 바꿔요</span>
            {/* 포트폴리오 카드 — 도전 기록을 공유용 이미지(PNG)로 내려받는다(2026-10-23) */}
            {portfolio.total > 0 && (
              <button
                type="button"
                className="panel-link"
                onClick={() => downloadPortfolioCard(portfolio)}
                title="도전 기록을 SNS에 올릴 수 있는 이미지 카드(PNG)로 내려받아요"
              >
                포트폴리오 카드 저장 (PNG)
              </button>
            )}
          </div>
        </div>
        {portfolio.total === 0 ? (
          <div className="panel-empty-group">
            <p className="panel-empty">
              아직 응모 기록이 없어요. 분석 결과에서 공모전에 응모하면 도전 기록이 이곳에 쌓여요.
            </p>
            <AppLink className="panel-link" href="/input" onNavigate={onGoInput}>
              아이디어 분석으로 첫 도전 시작하기 →
            </AppLink>
          </div>
        ) : (
          <div className="challenge-layout">
            <div className="challenge-counts">
              <div className="challenge-count is-total">
                <span className="challenge-num">{portfolio.total}</span>
                <span className="challenge-label">누적 도전</span>
              </div>
              <div className="challenge-count is-progress">
                <span className="challenge-num">{portfolio.progress}</span>
                <span className="challenge-label">진행 중</span>
              </div>
              <div className="challenge-count is-won">
                <span className="challenge-num">{portfolio.won}</span>
                <span className="challenge-label">수상</span>
              </div>
              <div className="challenge-count is-lost">
                <span className="challenge-num">{portfolio.lost}</span>
                <span className="challenge-label">탈락</span>
              </div>
            </div>
            {portfolio.fields.length > 0 && (
              <div className="challenge-fields">
                <p className="challenge-fields-title">도전한 분야</p>
                {portfolio.fields.map((bar) => (
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

      <section className="dash-panel" aria-label="출품 로드맵" data-reveal>
        <div className="panel-head">
          <h2>출품 로드맵</h2>
          <span className="panel-hint">
            찜·응모 공모전의 5단계 경로 · 권장 기한은 마감까지 남은 기간 기준 · 체크는 이 브라우저에
            저장돼요
          </span>
        </div>
        {roadmapCandidates.length === 0 ? (
          <div className="panel-empty-group">
            <p className="panel-empty">
              아직 마감 전인 찜·응모 공모전이 없어요. 공모전을 찜하면 이곳에 출품 경로가 만들어져요.
            </p>
            <AppLink className="panel-link" href="/contest" onNavigate={onOpenExplore}>
              공모전 둘러보고 찜하기 →
            </AppLink>
          </div>
        ) : (
          <RoadmapPanel candidates={roadmapCandidates} />
        )}
      </section>
    </div>
  )
}

export default DashboardPage
