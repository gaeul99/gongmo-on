// 공모전 탐색 — 앱이 소개하는 전체 공모전을 한 화면에서 검색·필터·정렬로
// 둘러보는 페이지. 카드를 누르면 공모전 상세 화면으로 이동하고, 카드에서
// 바로 관심 목록(찜)에 담을 수도 있다. 접수 중·곧 시작·마감 판정과 D-x
// 라벨은 utils/contestAlerts.js의 기준(deadlineStatus·isApplicationOpen)을 쓴다.
// 아이디어 분석을 한 사용자에게는 분석 스냅숏의 적합도 점수로 '적합도순'
// 정렬과 카드 뱃지가 생기고, 아직 분석 전이면 그 자리에 안내 한 줄이 보인다.
import { useEffect, useMemo, useState } from 'react'
import AppLink from '../components/AppLink'
import { useContestPool, getSyncedContestCount } from '../data/contestPool.js'
import { pageItems } from '../utils/pagination'
import { deadlineStatus, isApplicationOpen } from '../utils/contestAlerts.js'
import type { WishlistContest } from './MyPage'
import './ContestListPage.css'

type Props = {
  wishlistedContestIds: number[]
  onToggleWish: (target: Omit<WishlistContest, 'addedAt'>) => void
  onOpenContest: (id: number) => void
  onBack: () => void
  // 홈 '곧 시작되는 공모전' 전체 보기로 들어오면 'upcoming'이 초기값이 된다.
  initialStatusFilter?: StatusFilter
  // 결과 화면 '적합도순으로 전체 공모전 둘러보기'로 들어오면 'fit'이 초기값이 된다.
  // 점수표(fitScores)가 비어 있으면 정렬 옵션 자체가 없으므로 기본값으로 되돌린다.
  initialSort?: SortMode
  // 마지막 아이디어 분석의 공모전별 적합도 점수(App.tsx가 스냅숏에서 뽑아 준다).
  // 있으면 '적합도순' 정렬과 카드 점수 뱃지가 생긴다. null이면 아직 분석 전이다.
  fitScores?: Array<{ id: number; score: number }> | null
  // 분석 전 가이드 링크가 아이디어 입력 화면으로 이동할 때 쓴다.
  onGoInput: () => void
}

type ContestStatus = 'open' | 'upcoming' | 'closed'

// 데이터 풀(목업 + 자동 등록)의 공모전이 모두 갖춘 최소 형태 — 목업·자동 등록
// 어느 쪽이든 이 필드는 존재한다(startDate만 자동 등록 쪽에서도 없을 수 있다).
type ContestRow = {
  id: number
  title: string
  organizer: string
  field: string
  deadline: string
  startDate?: string
  ageGroups?: Array<'teen' | 'adult'>
  image: string
  url: string
  description: string
}

// '곧 시작되는 공모전' 전체 보기처럼 다른 화면에서 필터를 정해 두고 들어올 수 있게 내보낸다.
export type StatusFilter = 'all' | ContestStatus
export type SortMode = 'soon' | 'far' | 'fit'

// 연령 필터 — mockData의 ageGroups('teen'·'adult')를 기준으로 삼는다.
// '청소년'은 청소년(미성년)이 참여할 수 있는, '성인'은 성인이 참여할 수 있는
// 공모전을 가린다. 누구나 참여 가능한 공모전은 ageGroups에 둘 다 있어 두 칩에 모두 걸린다.
type AgeGroup = 'teen' | 'adult'
type AgeFilter = 'all' | AgeGroup

const AGE_FILTERS: Array<{ value: AgeFilter; label: string }> = [
  { value: 'all', label: '연령 전체' },
  { value: 'teen', label: '청소년' },
  { value: 'adult', label: '성인' },
]

const STATUS_FILTERS: Array<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'open', label: '접수 중' },
  { value: 'upcoming', label: '곧 시작' },
  { value: 'closed', label: '마감' },
]

// 한 페이지에 보여 줄 카드 수 — 전체 목록이 한 화면에 쌓이지 않게 페이지로 끊는다.
const PAGE_SIZE = 12

// 분야('기타 (아이디어·방송통신)')의 첫 단어만 떼는 헬퍼 — 대시보드와 같은 기준
function fieldFamily(field: string): string {
  return String(field ?? '').split(' ')[0] || '기타'
}

// 접수 중(오늘 마감 포함)·곧 시작·마감을 한 번에 판정합니다.
function contestStatus(contest: ContestRow): ContestStatus {
  if (deadlineStatus(contest.deadline).tone === 'closed') return 'closed'
  return isApplicationOpen(contest) ? 'open' : 'upcoming'
}

// 카드 배지 문구 — 접수 중이면 남은 일수(D-x), 곧 시작이면 시작일까지 남은 일수
function badgeText(contest: ContestRow, status: ContestStatus): string {
  if (status === 'closed') return '마감'
  if (status === 'upcoming') return '곧 시작'
  return `접수 중 · ${deadlineStatus(contest.deadline).label}`
}

// 자동 등록 공모전의 포스터는 원본 사이트 주소를 그대로 걸므로(핫링크) 사라질 수 있다.
// 이때 준비해 둔 placeholder로 바꿔 카드 레이아웃이 무너지지 않게 한다.
function handleImageError(event: React.SyntheticEvent<HTMLImageElement>) {
  const img = event.currentTarget
  if (img.dataset.fallback) return
  img.dataset.fallback = '1'
  img.src = '/contest/ck/placeholder.svg'
}

function ContestListPage({
  wishlistedContestIds,
  onToggleWish,
  onOpenContest,
  onBack,
  initialStatusFilter = 'all',
  initialSort,
  fitScores = null,
  onGoInput,
}: Props) {
  const [query, setQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(initialStatusFilter)
  const [fieldFilter, setFieldFilter] = useState('all')
  const [ageFilter, setAgeFilter] = useState<AgeFilter>('all')
  const [sort, setSort] = useState<SortMode>(() =>
    initialSort === 'fit' && (fitScores ?? []).length === 0 ? 'soon' : initialSort ?? 'soon',
  )
  // 현재 페이지(1부터). 검색어·필터·정렬이 바뀌면 항상 1페이지로 되돌린다.
  const [page, setPage] = useState(1)

  // 검색어를 입력창(query)과 목록 계산(appliedQuery)으로 나눠 둔다. 입력 글자는
  // 즉시 반영하되 목록 필터는 입력이 멈춘 뒤 한 번만 다시 계산한다 — 매 글자마다
  // 카드 목록·페이지네이션·푸터가 재배치돼 검색 입력 중 화면이 계속 움직이는
  // 문제를 막는다(2026-10-19 사용자 지적).
  const [appliedQuery, setAppliedQuery] = useState('')
  useEffect(() => {
    const timer = setTimeout(() => setAppliedQuery(query), 220)
    return () => clearTimeout(timer)
  }, [query])

  // 목업 + 백엔드 자동 등록이 합쳐진 공모전 풀. 자동 등록분은 앱 시작 직후 도착하며,
  // 도착하면 이 화면이 다시 그려져 목록에 합쳐져 보인다.
  const contests = useContestPool()

  // 아이디어 분석의 적합도 점수표 — 카드 뱃지와 '적합도순' 정렬이 함께 쓴다.
  const fitScoreById = useMemo(() => {
    const map = new Map<number, number>()
    for (const item of fitScores ?? []) map.set(item.id, item.score)
    return map
  }, [fitScores])
  const hasFitScores = fitScoreById.size > 0

  // 분야 칩은 데이터에서 직접 뽑아 많은 순으로 보여 줍니다(건수 표시는 정렬에만 사용).
  const fieldOptions = useMemo(() => {
    const counts = new Map<string, number>()
    for (const contest of contests) {
      const family = fieldFamily(contest.field)
      counts.set(family, (counts.get(family) ?? 0) + 1)
    }
    return [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
  }, [contests])

  const filtered = useMemo(() => {
    const q = appliedQuery.trim()
    return contests
      .map((contest) => ({ contest, status: contestStatus(contest) }))
      .filter(({ status }) => statusFilter === 'all' || status === statusFilter)
      .filter(({ contest }) => fieldFilter === 'all' || fieldFamily(contest.field) === fieldFilter)
      .filter(({ contest }) => ageFilter === 'all' || contest.ageGroups?.includes(ageFilter))
      .filter(({ contest }) => {
        if (!q) return true
        return `${contest.title} ${contest.organizer} ${contest.field} ${contest.description}`.includes(q)
      })
  }, [contests, appliedQuery, statusFilter, fieldFilter, ageFilter])

  // 마감 임박순(기본)은 접수 중·곧 시작을 마감일 가까운 순으로, 마감된 공모전은
  // 맨 뒤에 최근에 닫힌 순으로 보낸다. 마감 여유순은 그 반대. 적합도순은 아이디어
  // 분석 점수가 높은 순이며, 점수가 같으면 마감이 가까운 쪽을 앞으로 보낸다.
  const rows = useMemo(() => {
    const closed = (status: ContestStatus) => (status === 'closed' ? 1 : 0)
    return [...filtered].sort((a, b) => {
      const closedDiff = closed(a.status) - closed(b.status)
      if (closedDiff !== 0) return closedDiff
      if (sort === 'fit') {
        const fitDiff =
          (fitScoreById.get(b.contest.id) ?? -1) - (fitScoreById.get(a.contest.id) ?? -1)
        if (fitDiff !== 0) return fitDiff
      }
      const [front, back] = sort === 'far' ? [b, a] : [a, b]
      return String(front.contest.deadline).localeCompare(String(back.contest.deadline))
    })
  }, [filtered, sort, fitScoreById])

  const hasFilters =
    appliedQuery.trim() !== '' ||
    statusFilter !== 'all' ||
    fieldFilter !== 'all' ||
    ageFilter !== 'all'

  // 페이지 수와 현재 페이지가 보여 줄 카드 묶음. 필터 변경 시 page를 1로 되돌리므로
  // 범위를 벗어나는 일은 없지만, 안전하게 상한으로 잘라 둔다.
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE))
  const safePage = Math.min(page, totalPages)
  const pagedRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)

  const resetFilters = () => {
    setQuery('')
    setAppliedQuery('')
    setStatusFilter('all')
    setFieldFilter('all')
    setAgeFilter('all')
    setPage(1)
  }

  return (
    <div className="page">
      <div className="explore-inner">
        <button type="button" className="back-button" onClick={onBack}>
          ← 돌아가기
        </button>

        <header className="explore-header" data-reveal>
          <h1>공모전 탐색</h1>
          <p className="explore-caption">
            앱에 등록된 공모전 {contests.length}건을 검색과 필터로 둘러보세요.
            {getSyncedContestCount() > 0 &&
              ` 이 중 ${getSyncedContestCount()}건은 위비티·콘테스트코리아에서 자동으로 수집한 최신 공모전이에요.`}{' '}
            카드를 누르면 상세 정보에서 바로 응모할 수 있어요.
          </p>
        </header>

        <div className="explore-toolbar" data-reveal>
          <div className="explore-search-row">
            <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="6" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <line x1="15" y1="15" x2="20" y2="20" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value)
                setPage(1)
              }}
              placeholder="공모전명·주최·주제로 검색"
              aria-label="공모전 검색"
              maxLength={40}
            />
            {/* 지우기 버튼 자리를 늘 확보한다 — 첫 글자를 입력할 때 버튼이
                생기며 입력칸이 좁아져 글자가 밀리는 움직임을 막는다 */}
            <button
              type="button"
              className="explore-search-clear"
              onClick={() => {
                setQuery('')
                setAppliedQuery('')
                setPage(1)
              }}
              aria-label="검색어 지우기"
              style={{ visibility: query ? 'visible' : 'hidden' }}
            >
              ×
            </button>
          </div>

          <div className="explore-chip-row" role="group" aria-label="접수 상태 필터">
            {STATUS_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`explore-chip${statusFilter === option.value ? ' is-on' : ''}`}
                aria-pressed={statusFilter === option.value}
                onClick={() => {
                  setStatusFilter(option.value)
                  setPage(1)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="explore-chip-row" role="group" aria-label="분야 필터">
            <button
              type="button"
              className={`explore-chip${fieldFilter === 'all' ? ' is-on' : ''}`}
              aria-pressed={fieldFilter === 'all'}
              onClick={() => {
                setFieldFilter('all')
                setPage(1)
              }}
            >
              분야 전체
            </button>
            {fieldOptions.map((option) => (
              <button
                key={option.name}
                type="button"
                className={`explore-chip${fieldFilter === option.name ? ' is-on' : ''}`}
                aria-pressed={fieldFilter === option.name}
                onClick={() => {
                  setFieldFilter(option.name)
                  setPage(1)
                }}
              >
                {option.name}
              </button>
            ))}
          </div>

          <div className="explore-chip-row" role="group" aria-label="연령 필터">
            {AGE_FILTERS.map((option) => (
              <button
                key={option.value}
                type="button"
                className={`explore-chip${ageFilter === option.value ? ' is-on' : ''}`}
                aria-pressed={ageFilter === option.value}
                onClick={() => {
                  setAgeFilter(option.value)
                  setPage(1)
                }}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="explore-result-bar">
            <p className="explore-count" role="status">
              {rows.length}건{hasFilters ? ' (필터 적용)' : ''}
            </p>
            <label className="explore-sort">
              정렬
              <select
                value={sort}
                onChange={(event) => {
                  setSort(event.target.value as SortMode)
                  setPage(1)
                }}
              >
                <option value="soon">마감 임박순</option>
                <option value="far">마감 여유순</option>
                {hasFitScores && <option value="fit">적합도순</option>}
              </select>
            </label>
          </div>
        </div>

        {!hasFitScores && (
          <p className="explore-fit-guide" data-reveal>
            <AppLink
              href="/input"
              title="아이디어 분석 시작하기"
              onNavigate={onGoInput}
            >
              아이디어를 분석하면 이 화면도 내 아이디어에 맞춰 정렬돼요 →
            </AppLink>
          </p>
        )}

        {rows.length === 0 ? (
          <div className="explore-empty" data-reveal>
            <p>조건에 맞는 공모전이 없어요. 검색어나 필터를 바꿔 보세요.</p>
            {hasFilters && (
              <button type="button" className="explore-reset" onClick={resetFilters}>
                필터 초기화
              </button>
            )}
          </div>
        ) : (
          <>
          <ul className="explore-grid" data-reveal>
            {pagedRows.map(({ contest, status }) => {
              const wished = wishlistedContestIds.includes(contest.id)
              return (
                <li key={contest.id} className="explore-card">
                  <AppLink
                    className="explore-card-main"
                    href={`/contest/${contest.id}`}
                    title={`${contest.title} 상세 보기`}
                    onNavigate={() => onOpenContest(contest.id)}
                  >
                    <span className="explore-thumb">
                      <img
                        src={contest.image}
                        alt=""
                        loading="lazy"
                        onError={handleImageError}
                      />
                      <span className={`explore-badge tone-${status}`}>
                        {badgeText(contest, status)}
                      </span>
                    </span>
                    <span className="explore-info">
                      <span className="explore-name">{contest.title}</span>
                      {fitScoreById.has(contest.id) && (
                        <span className="explore-fit">
                          적합도 {fitScoreById.get(contest.id)}%
                        </span>
                      )}
                      <span className="explore-meta">{contest.organizer}</span>
                      <span className="explore-meta">
                        {status === 'upcoming' && contest.startDate
                          ? `접수 시작 ${contest.startDate} · `
                          : ''}
                        마감 {contest.deadline} · {fieldFamily(contest.field)}
                      </span>
                    </span>
                  </AppLink>
                  <button
                    type="button"
                    className={wished ? 'explore-wish active' : 'explore-wish'}
                    aria-label={`${contest.title} 관심 목록 ${wished ? '해제' : '추가'}`}
                    title={
                      wished
                        ? '관심 목록에서 해제'
                        : '관심 목록에 추가 (마이페이지에서 볼 수 있어요)'
                    }
                    onClick={() =>
                      onToggleWish({
                        id: contest.id,
                        title: contest.title,
                        organizer: contest.organizer,
                        deadline: contest.deadline,
                        url: contest.url,
                      })
                    }
                  >
                    {wished ? '★' : '☆'}
                  </button>
                </li>
              )
            })}
          </ul>
          {rows.length > PAGE_SIZE && (
            <nav className="contest-pagination" aria-label="공모전 페이지 넘김" data-reveal>
              <p className="contest-pagination-info">
                총 {rows.length}개 중 {(safePage - 1) * PAGE_SIZE + 1}–
                {Math.min(safePage * PAGE_SIZE, rows.length)}번째 표시 중
              </p>
              <div className="contest-pagination-buttons">
                <button
                  type="button"
                  disabled={safePage === 1}
                  onClick={() => setPage((current) => Math.max(1, current - 1))}
                >
                  ‹ 이전
                </button>
                {pageItems(safePage, totalPages).map((item, index) =>
                  item === 'gap' ? (
                    <span key={`gap-${index}`} className="pager-gap" aria-hidden="true">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      className={item === safePage ? 'active' : ''}
                      aria-current={item === safePage ? 'page' : undefined}
                      onClick={() => setPage(item)}
                    >
                      {item}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  disabled={safePage === totalPages}
                  onClick={() => setPage((current) => Math.min(totalPages, current + 1))}
                >
                  다음 ›
                </button>
              </div>
            </nav>
          )}
          </>
        )}
      </div>
    </div>
  )
}

export default ContestListPage
