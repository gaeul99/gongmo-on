// ==========================================================
// 첫화면 광고 배너 — 접수 중인 공모전 포스터가 왼쪽으로 계속
// 흐르는 마키(strip). 카드를 누르면 앱 안의 공모전 상세 페이지로
// 이동하고(실제 사이트는 상세 화면의 버튼으로 접속), 포인터를
// 올리면 잠시 멈춘다. 좌우 화살표를 누르면 자동 흐름을 멈추고
// 카드를 직접 넘겨 보는 수동 모드로 바뀌는데, 이때 창은 가로
// 스크롤 컨테이너가 돼 트랙패드·터치 스와이프도 된다. Scroll Snap으로
// 어느 쪽으로 움직여도 카드 단위로 딱 맞아떨어진다(2026-10-14 사용자 요청).
// D-x 라벨은 utils/contestAlerts.js의 deadlineStatus 기준을 그대로 쓴다.
// ==========================================================
import { useEffect, useRef, useState } from 'react'
import AppLink from './AppLink'
import { useContestPool } from '../data/contestPool.js'
import { deadlineStatus, isApplicationOpen } from '../utils/contestAlerts.js'
import './ContestMarquee.css'

// 카드 폭 280px + 오른쪽 여백 16px(ContestMarquee.css의 .marquee-card) —
// 화살표 한 번에 스크롤하는 픽셀 기준. 정렬은 Scroll Snap이 보장하고,
// 이 값은 '한 번에 한 카드' 이동량으로만 쓴다.
const CARD_STEP = 296

// 마감 상태별 배지 이모지 (tone은 deadlineStatus 기준)
const TONE_EMOJI: Record<string, string> = {
  today: '🔥',
  urgent: '⏰',
  upcoming: '📅',
  closed: '📌',
}

type Props = {
  onOpenContest: (id: number) => void
}

function ContestMarquee({ onOpenContest }: Props) {
  // 목업 + 자동 등록이 합쳐진 공모전 풀
  const contests = useContestPool()
  const rows = contests
    .map((contest) => ({ contest, status: deadlineStatus(contest.deadline) }))
    .filter(
      (row) =>
        row.status.left !== null &&
        row.status.left >= 0 &&
        // 접수가 아직 시작되지 않은 공모전(접수 예정)은 '곧 시작되는 공모전' 박스가 담당한다
        isApplicationOpen(row.contest),
    )

  // 화살표를 누르기 전엔 끊김 없는 무한 흐름(같은 목록을 두 번 이어 붙임),
  // 누른 뒤엔 스와이프·화살표로 넘겨 보는 수동 모드(가로 스크롤+스냅)로 바뀐다.
  const [manual, setManual] = useState(false)
  const [visible, setVisible] = useState(1)
  // 현재 스크롤 위치와 끝 — 맨 앞/맨 뒤에서 화살표를 막는 판정에 쓴다
  const [scrollAt, setScrollAt] = useState({ left: 0, max: 0 })
  // 수동 모드로 막 진입한 첫 클릭도 한 장 이동으로 이어지게 — DOM이 커밋된 뒤
  // 실행해야 스크롤 컨테이너가 준비되므로 이동 요청을 상태(큐)로 넘긴다
  const [pendingSteps, setPendingSteps] = useState(0)
  const windowRef = useRef<HTMLDivElement | null>(null)

  // 창 폭에 한 번에 보이는 카드 수를 재고(자동 모드 화살표 판정), 스크롤 범위도 함께 갱신한다.
  useEffect(() => {
    const el = windowRef.current
    if (!el) return
    const measure = () => {
      setVisible(Math.max(1, Math.floor(el.clientWidth / CARD_STEP)))
      setScrollAt({ left: el.scrollLeft, max: el.scrollWidth - el.clientWidth })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // 수동 모드에서는 스크롤을 따라가 화살표 활성화를 갱신한다
  useEffect(() => {
    if (!manual) return
    const el = windowRef.current
    if (!el) return
    const onScroll = () =>
      setScrollAt({ left: el.scrollLeft, max: el.scrollWidth - el.clientWidth })
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [manual])

  // 큐에 쌓인 이동 요청(한 카드 단위)을 실제 스크롤로 실행한다 —
  // 정렬은 Scroll Snap이 맞추니 정확히 한 장씩 넘어간다
  useEffect(() => {
    if (!manual || pendingSteps === 0) return
    const el = windowRef.current
    if (!el) return
    el.scrollBy({ left: pendingSteps * CARD_STEP, behavior: 'smooth' })
    setPendingSteps(0)
  }, [manual, pendingSteps])

  const maxIndex = Math.max(0, rows.length - visible)

  const goPrev = () => {
    setManual(true)
    setPendingSteps((steps) => steps - 1)
  }

  const goNext = () => {
    setManual(true)
    setPendingSteps((steps) => steps + 1)
  }

  const cards = manual ? rows : [...rows, ...rows]

  return (
    <section className="contest-marquee" aria-label="접수 중인 공모전">
      <h2 className="marquee-title">접수 중인 공모전</h2>
      <div className="marquee-slider">
        <button
          type="button"
          className="marquee-arrow marquee-arrow-prev"
          onClick={goPrev}
          disabled={manual ? scrollAt.left <= 0 : true}
          aria-label="이전 공모전 보기"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M14.5 5 L8 12 L14.5 19"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <div
          ref={windowRef}
          className={manual ? 'marquee-window manual' : 'marquee-window'}
        >
          <ul
            className={manual ? 'marquee-track manual' : 'marquee-track'}
          >
            {cards.map(({ contest, status }, i) => {
              // 자동 흐름일 때 뒤쪽 절반(복제본)은 화면 낭독·탭 이동에서 제외
              const hidden = !manual && i >= rows.length
              return (
                <li
                  key={`${contest.id}-${i}`}
                  className="marquee-card"
                  aria-hidden={hidden || undefined}
                >
                  <AppLink
                    href={`/contest/${contest.id}`}
                    tabIndex={hidden ? -1 : undefined}
                    title={`${contest.title} 상세 보기`}
                    onNavigate={() => onOpenContest(contest.id)}
                  >
                    <span className="marquee-thumb">
                      <img
                        src={contest.image}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          // 자동 등록 공모전의 포스터는 원본 사이트 주소라 사라질 수 있다
                          const img = event.currentTarget
                          if (img.dataset.fallback) return
                          img.dataset.fallback = '1'
                          img.src = '/contest/ck/placeholder.svg'
                        }}
                      />
                      <span className={`marquee-badge tone-${status.tone}`}>
                        {TONE_EMOJI[status.tone] ?? '📌'} {status.label}
                      </span>
                    </span>
                    <span className="marquee-info">
                      <span className="marquee-name">{contest.title}</span>
                      <span className="marquee-org">{contest.organizer}</span>
                    </span>
                  </AppLink>
                </li>
              )
            })}
          </ul>
        </div>
        <button
          type="button"
          className="marquee-arrow marquee-arrow-next"
          onClick={goNext}
          disabled={manual ? scrollAt.left >= scrollAt.max - 1 : maxIndex === 0}
          aria-label="다음 공모전 보기"
        >
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
            <path
              d="M9.5 5 L16 12 L9.5 19"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
      </div>
    </section>
  )
}

export default ContestMarquee
