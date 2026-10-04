import { useEffect, useMemo, useState } from 'react'
import { contestArchive, contests, referenceCases, winnerArchives } from '../data/mockData.js'
import { CONTEST_TYPES } from '../data/contestTypeTest.js'
import {
  DATA_AS_OF,
  buildActivityCounts,
  buildDeadlineRows,
  buildFieldBreakdown,
} from '../data/dashboard.js'
import './DashboardPage.css'

// 알림 기록 통계(GET /api/notifications/stats)의 응답 형태
type NotifChannelStat = { total: number; real: number }
type NotifRecentEntry = {
  id: string
  at: string
  channel: 'email' | 'sms'
  subject?: string
  text: string
  via: string
}
type NotifStats = {
  subscribers: number
  byChannel: { email: NotifChannelStat; sms: NotifChannelStat }
  recent: NotifRecentEntry[]
}

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000'

// 유형 검사 추천 피드백(GET /api/feedback/stats)의 응답 형태
type FeedbackTally = { total: number; up: number; down: number; accuracy: number | null }
type FeedbackStats = FeedbackTally & {
  byType: Record<string, FeedbackTally>
  recent: unknown[]
}

// 백엔드에서 온 유형 id를 화면용 이름으로 바꿉니다. 모르는 id면 그대로 보여 줍니다.
function typeName(typeId: string): string {
  return Object.prototype.hasOwnProperty.call(CONTEST_TYPES, typeId)
    ? CONTEST_TYPES[typeId as keyof typeof CONTEST_TYPES].name
    : typeId
}

type DeadlineRow = ReturnType<typeof buildDeadlineRows>[number]

type Props = {
  onOpenContest: (id: number) => void
}

function formatRecordTime(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('ko-KR', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

const DEADLINE_PAGE_SIZE = 8
const ARCHIVE_PAGE_SIZE = 8

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

function DashboardPage({ onOpenContest }: Props) {
  const deadlineRows = useMemo(() => buildDeadlineRows(), [])
  const fieldBars = useMemo(() => buildFieldBreakdown(), [])
  const activity = useMemo(() => buildActivityCounts(), [])

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

  // 백엔드 알림 기록. 꺼져 있어도 나머지 패널은 정적 데이터라 정상 동작합니다.
  const [notifStats, setNotifStats] = useState<NotifStats | null>(null)
  const [notifFailed, setNotifFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/notifications/stats`, { signal: AbortSignal.timeout(5000) })
      .then(async (response) => {
        const payload = (await response.json()) as { success: boolean; data?: NotifStats }
        if (!payload.success || !payload.data) throw new Error('bad payload')
        return payload.data
      })
      .then((data) => {
        if (!cancelled) setNotifStats(data)
      })
      .catch(() => {
        if (!cancelled) setNotifFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const maxFieldCount = Math.max(...fieldBars.map((bar) => bar.count), 1)

  // 유형 검사 추천 피드백 집계. 꺼져 있어도 다른 패널은 정상 동작합니다.
  const [feedbackStats, setFeedbackStats] = useState<FeedbackStats | null>(null)
  const [feedbackFailed, setFeedbackFailed] = useState(false)

  useEffect(() => {
    let cancelled = false
    fetch(`${API_BASE}/api/feedback/stats`, { signal: AbortSignal.timeout(5000) })
      .then(async (response) => {
        const payload = (await response.json()) as { success: boolean; data?: FeedbackStats }
        if (!payload.success || !payload.data) throw new Error('bad payload')
        return payload.data
      })
      .then((data) => {
        if (!cancelled) setFeedbackStats(data)
      })
      .catch(() => {
        if (!cancelled) setFeedbackFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 유형별 막대는 CONTEST_TYPES 선언 순서대로, 기록이 있는 유형만 표시합니다.
  const feedbackRows = useMemo(() => {
    if (!feedbackStats) return []
    const order = Object.keys(CONTEST_TYPES)
    return Object.entries(feedbackStats.byType)
      .sort(([a], [b]) => order.indexOf(a) - order.indexOf(b))
      .map(([typeId, stat]) => ({ typeId, ...stat }))
  }, [feedbackStats])

  // 지난 공모전 아카이브: 연도 탭으로 걸러 보기 (전체는 최신 마감순)
  const archiveYears = useMemo(
    () => [...new Set(contestArchive.map((item) => item.year))].sort((a, b) => b - a),
    [],
  )
  const [archiveTab, setArchiveTab] = useState<number | 'all'>('all')
  const [archivePageRaw, setArchivePage] = useState(1)
  const archiveRows = useMemo(() => {
    const picked = archiveTab === 'all' ? contestArchive : contestArchive.filter((item) => item.year === archiveTab)
    return [...picked].sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))
  }, [archiveTab])
  const archivePages = Math.max(1, Math.ceil(archiveRows.length / ARCHIVE_PAGE_SIZE))
  const archivePage = Math.min(archivePageRaw, archivePages)
  const archiveSlice = archiveRows.slice(
    (archivePage - 1) * ARCHIVE_PAGE_SIZE,
    archivePage * ARCHIVE_PAGE_SIZE,
  )

  const changeArchiveTab = (tab: number | 'all') => {
    setArchiveTab(tab)
    setArchivePage(1)
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-header">
        <p className="dashboard-badge">현황 대시보드</p>
        <h1>한눈에 보는 공내비</h1>
        <p className="dashboard-caption">
          공모전·참고 자료는 {DATA_AS_OF} 기준이에요. 응모·관심·보관함 수치는 이 브라우저에 저장된
          기록이며, 계정마다 공유되지 않아요.
        </p>
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
          <p className="kpi-sub">이 브라우저 기준</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">내 관심</p>
          <p className="kpi-num">{activity.wishlist}</p>
          <p className="kpi-sub">이 브라우저 기준</p>
        </div>
        <div className="kpi-card">
          <p className="kpi-label">보관한 아이디어</p>
          <p className="kpi-num">{activity.savedIdeas}</p>
          <p className="kpi-sub">이 브라우저 기준</p>
        </div>
      </section>

      <section className="dashboard-duo" aria-label="마감과 분야 현황">
        <div className="dash-panel dash-panel-wide">
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
        </div>

        {fieldBars.length > 0 && (
          <div className="dash-panel">
            <div className="panel-head">
              <h2>분야별 분포</h2>
              <span className="panel-hint">접수 중 {contests.length}건</span>
            </div>
            <div className="field-list">
              {fieldBars.map((bar) => (
                <div key={bar.name} className="field-row">
                  <span className="field-name">{bar.name}</span>
                  <span className="field-track">
                    <span
                      className="field-fill"
                      style={{ width: `${Math.round((bar.count / maxFieldCount) * 100)}%` }}
                    />
                  </span>
                  <span className="field-count">{bar.count}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="dashboard-duo" aria-label="알림과 스파크 현황">
        <div className="dash-panel">
          <div className="panel-head">
            <h2>알림 발송 현황</h2>
            <span className="panel-hint">백엔드 기록 기준</span>
          </div>
          {notifFailed ? (
            <p className="panel-empty">
              백엔드가 꺼져 있어 알림 기록을 표시할 수 없어요. 다른 패널은 정상 동작해요.
            </p>
          ) : notifStats === null ? (
            <p className="panel-empty">알림 기록을 불러오는 중…</p>
          ) : (
            <>
              <div className="notif-summary">
                <span className="notif-subscribers">
                  구독자 <b>{notifStats.subscribers}</b>명
                </span>
                <span className="notif-channels">
                  <span className="notif-channel">
                    이메일 {notifStats.byChannel.email.total}건
                    <em className="notif-via">
                      {notifStats.byChannel.email.total > 0
                        ? `실발송 ${notifStats.byChannel.email.real} · log ${notifStats.byChannel.email.total - notifStats.byChannel.email.real}`
                        : '기록 없음'}
                    </em>
                  </span>
                  <span className="notif-channel">
                    문자 {notifStats.byChannel.sms.total}건
                    <em className="notif-via">
                      {notifStats.byChannel.sms.total > 0
                        ? `실발송 ${notifStats.byChannel.sms.real} · log ${notifStats.byChannel.sms.total - notifStats.byChannel.sms.real}`
                        : '기록 없음'}
                    </em>
                  </span>
                </span>
              </div>
              {notifStats.recent.length > 0 ? (
                <ul className="notif-recent">
                  {notifStats.recent.map((entry) => (
                    <li key={entry.id} className="notif-recent-row">
                      <span className="notif-recent-channel">
                        {entry.channel === 'email' ? '이메일' : '문자'} ·{' '}
                        {entry.via === 'log' ? 'log' : '실발송'}
                      </span>
                      <span className="notif-recent-text">
                        {entry.subject ?? entry.text}
                      </span>
                      <span className="notif-recent-time">{formatRecordTime(entry.at)}</span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="panel-empty">
                  아직 발송 기록이 없어요. 구독하면 환영 메시지가 바로 기록돼요.
                </p>
              )}
            </>
          )}
        </div>
      </section>

      <section className="dash-panel" aria-label="유형 검사 추천 피드백">
        <div className="panel-head">
          <h2>유형 검사 추천 피드백</h2>
          <span className="panel-hint">결과 화면 👍/👎 집계 · 정확도 지수 = 👍 비율</span>
        </div>
        {feedbackFailed ? (
          <p className="panel-empty">
            백엔드가 꺼져 있어 피드백 집계를 표시할 수 없어요. 다른 패널은 정상 동작해요.
          </p>
        ) : feedbackStats === null ? (
          <p className="panel-empty">피드백 집계를 불러오는 중…</p>
        ) : feedbackStats.total === 0 ? (
          <p className="panel-empty">
            아직 평가가 없어요. 유형 검사 결과 화면에서 추천 공모전에 👍/👎을 남기면 이곳에 모여요.
          </p>
        ) : (
          <>
            <div className="notif-summary">
              <span className="notif-subscribers">
                전체 <b>{feedbackStats.total}</b>표 · 👍 {feedbackStats.up} / 👎{' '}
                {feedbackStats.down}
              </span>
              <span className="notif-channels">
                <span className="notif-channel">
                  전체 정확도 지수
                  <em className="notif-via">
                    {feedbackStats.accuracy !== null
                      ? `${Math.round(feedbackStats.accuracy * 100)}%`
                      : '측정 전'}
                  </em>
                </span>
              </span>
            </div>
            <div className="field-list">
              {feedbackRows.map((row) => (
                <div key={row.typeId} className="field-row">
                  <span className="field-name">{typeName(row.typeId)}</span>
                  <span className="field-track">
                    <span
                      className="field-fill"
                      style={{ width: `${Math.round((row.accuracy ?? 0) * 100)}%` }}
                    />
                  </span>
                  <span className="field-count">
                    {row.accuracy !== null
                      ? `${Math.round(row.accuracy * 100)}% (${row.up}/${row.total})`
                      : '—'}
                  </span>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section className="dash-panel" aria-label="참고 자료">
        <div className="panel-head">
          <h2>참고 자료</h2>
          <span className="panel-hint">
            유사 사례 {referenceCases.length} · 수상작 {winnerArchives.length} · {DATA_AS_OF} 기준
          </span>
        </div>
        <ul className="ref-list">
          {[...referenceCases, ...winnerArchives].map((item) => (
            <li key={item.url}>
              <a href={item.url} target="_blank" rel="noreferrer">
                <span className="ref-title">{item.title}</span>
                <span className="ref-sub">
                  {item.organizer}
                  <span className="ref-arrow">열기 ↗</span>
                </span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      <section className="dash-panel" aria-label="지난 공모전 아카이브">
        <div className="panel-head">
          <h2>지난 공모전 아카이브</h2>
          <span className="panel-hint">
            2023~2026 실제 개최 {contestArchive.length}건 · 마감이라 응모는 불가
          </span>
        </div>
          <div className="archive-tabs" role="tablist" aria-label="아카이브 연도 선택">
            <button
              type="button"
              role="tab"
              aria-selected={archiveTab === 'all'}
              className={`archive-tab${archiveTab === 'all' ? ' is-on' : ''}`}
              onClick={() => changeArchiveTab('all')}
            >
              전체 {contestArchive.length}
            </button>
            {archiveYears.map((year) => {
              const count = contestArchive.filter((item) => item.year === year).length
              return (
                <button
                  key={year}
                  type="button"
                  role="tab"
                  aria-selected={archiveTab === year}
                  className={`archive-tab${archiveTab === year ? ' is-on' : ''}`}
                  onClick={() => changeArchiveTab(year)}
                >
                  {year} {count}
                </button>
              )
            })}
          </div>
          <p className="archive-note">
            작년에 어떤 공모전이 열렸는지 보고 올해 비슷한 주제를 미리 준비해 보세요. 아이디어 갈피를
            찾는 용도로만 활용해 주세요.
          </p>
          <ul className="archive-list">
            {archiveSlice.map((item) => (
              <li key={item.id} className="archive-row">
                <span className="archive-year">{item.year}</span>
                <div className="archive-main">
                  <a href={item.url} target="_blank" rel="noreferrer" className="archive-title">
                    {item.title}
                  </a>
                  <span className="archive-meta">
                    {item.organizer} · {item.field} · {item.period}
                  </span>
                  <span className="archive-elig">대상 {item.eligibility}</span>
                </div>
                <span className="archive-arrow" aria-hidden="true">
                  ↗
                </span>
              </li>
            ))}
          </ul>
          <Pager
            page={archivePage}
            pages={archivePages}
            onPage={setArchivePage}
            label="지난 공모전 아카이브"
          />
        </section>
    </div>
  )
}

export default DashboardPage
