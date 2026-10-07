// ==========================================================
// 첫화면 광고 배너 — 접수 중인 공모전 포스터가 왼쪽으로 계속
// 흐르는 마키(strip). 카드를 누르면 앱 안의 공모전 상세 페이지로
// 이동하고(실제 사이트는 상세 화면의 버튼으로 접속), 포인터를
// 올리면 잠시 멈춘다. 좌우 화살표를 누르면 자동 흐름을 멈추고
// 한 장씩 옮겨 가며 고를 수 있다. D-x 라벨은 utils/contestAlerts.js의
// deadlineStatus 기준을 그대로 쓴다.
// ==========================================================
import { useEffect, useRef, useState } from 'react'
import { contests } from '../data/mockData.js'
import { deadlineStatus, isApplicationOpen } from '../utils/contestAlerts.js'
import './ContestMarquee.css'

// 카드 폭 280px + 오른쪽 여백 16px(ContestMarquee.css의 .marquee-card) —
// 화살표 한 번에 이동하는 픽셀 기준. 카드 실제 폭과 맞아야 수동 모드에서
// 카드가 정확히 한 장씩 정렬된다.
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
  // 누른 뒤엔 한 장씩 옮기는 수동 모드로 바뀐다.
  const [manual, setManual] = useState(false)
  const [index, setIndex] = useState(0)
  const windowRef = useRef<HTMLDivElement | null>(null)
  const [visible, setVisible] = useState(1)

  // 창 폭에 한 번에 보이는 카드 수를 재서 화살표 이동 범위를 정한다.
  useEffect(() => {
    const el = windowRef.current
    if (!el) return
    const measure = () =>
      setVisible(Math.max(1, Math.floor(el.clientWidth / CARD_STEP)))
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  const maxIndex = Math.max(0, rows.length - visible)

  // 창이 넓어져 이동 여유가 사라지면 index를 범위 안으로 되돌린다.
  useEffect(() => {
    setIndex((current) => Math.min(current, maxIndex))
  }, [maxIndex])

  const goPrev = () => {
    setManual(true)
    setIndex((current) => Math.max(0, current - 1))
  }

  const goNext = () => {
    setManual(true)
    setIndex((current) => Math.min(maxIndex, current + 1))
  }

  const cards = manual ? rows : [...rows, ...rows]

  return (
    <section className="contest-marquee" aria-label="접수 중인 공모전 배너">
      <p className="marquee-heading">📢 접수 중인 공모전</p>
      <p className="marquee-sub">포스터를 누르면 상세 정보로 이동해요</p>
      <div className="marquee-slider">
        <button
          type="button"
          className="marquee-arrow marquee-arrow-prev"
          onClick={goPrev}
          disabled={manual ? index === 0 : true}
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
            style={
              manual
                ? { transform: `translateX(-${index * CARD_STEP}px)` }
                : undefined
            }
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
                  <button
                    type="button"
                    tabIndex={hidden ? -1 : undefined}
                    title={`${contest.title} 상세 보기`}
                    onClick={() => onOpenContest(contest.id)}
                  >
                    <span className="marquee-thumb">
                      <img src={contest.image} alt="" loading="lazy" />
                      <span className={`marquee-badge tone-${status.tone}`}>
                        {TONE_EMOJI[status.tone] ?? '📌'} {status.label}
                      </span>
                    </span>
                    <span className="marquee-info">
                      <span className="marquee-name">{contest.title}</span>
                      <span className="marquee-org">{contest.organizer}</span>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
        <button
          type="button"
          className="marquee-arrow marquee-arrow-next"
          onClick={goNext}
          disabled={manual ? index >= maxIndex : maxIndex === 0}
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
