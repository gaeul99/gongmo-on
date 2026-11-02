import { assetUrl } from '../utils/assetUrl.js'
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
import type { PointerEvent } from 'react'
import { flushSync } from 'react-dom'
import AppLink from './AppLink'
import { useContestPool } from '../data/contestPool.js'
import { deadlineStatus, isApplicationOpen } from '../utils/contestAlerts.js'
import './ContestMarquee.css'

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

  const [manual, setManual] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [canScroll, setCanScroll] = useState(false)
  const windowRef = useRef<HTMLDivElement | null>(null)
  const trackRef = useRef<HTMLUListElement | null>(null)
  const targetRef = useRef<number | null>(null)
  const suppressClickRef = useRef(false)
  const dragRef = useRef<{ pointerId: number; x: number; left: number; scale: number; moved: boolean } | null>(null)

  // Measure the real card pitch: mobile cards and browser zoom use different sizes.
  const geometry = () => {
    const track = trackRef.current
    const first = track?.children[0] as HTMLElement | undefined
    const second = track?.children[1] as HTMLElement | undefined
    const duplicate = track?.children[rows.length] as HTMLElement | undefined
    return {
      step: first && second ? second.offsetLeft - first.offsetLeft : 0,
      cycle: first && duplicate ? duplicate.offsetLeft - first.offsetLeft : 0,
    }
  }

  useEffect(() => {
    const el = windowRef.current
    const track = trackRef.current
    if (!el || !track) return
    const measure = () => setCanScroll(track.scrollWidth / 2 > el.clientWidth + 1)
    const observer = new ResizeObserver(measure)
    observer.observe(el)
    observer.observe(track)
    measure()
    return () => observer.disconnect()
  }, [rows.length])

  // Preserve the visible position when replacing the CSS animation with scrolling.
  // Keep both copies mounted so the list never shrinks or jumps back to card one.
  const enterManual = () => {
    const el = windowRef.current
    const track = trackRef.current
    if (!el || !track) return
    if (!manual) {
      const transform = getComputedStyle(track).transform
      const offset = el.scrollLeft + (transform === 'none' ? 0 : -new DOMMatrixReadOnly(transform).m41)
      flushSync(() => setManual(true))
      el.scrollLeft = offset
    }
  }

  const go = (direction: number) => {
    enterManual()
    const el = windowRef.current
    const { step, cycle } = geometry()
    if (!el || !step || !cycle) return
    let base = targetRef.current ?? el.scrollLeft
    if (base >= cycle) {
      el.scrollLeft = Math.max(0, el.scrollLeft - cycle)
      base -= cycle
    }
    if (base < step / 2 && direction < 0) {
      el.scrollLeft += cycle
      base += cycle
    }
    const target = Math.max(0, Math.round(base / step) * step + direction * step)
    targetRef.current = target
    el.scrollTo({ left: target, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
  }

  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0 || !canScroll) return
    suppressClickRef.current = false
    enterManual()
    targetRef.current = null
    if (event.pointerType !== 'mouse') return // touch uses native scrolling
    const el = event.currentTarget
    dragRef.current = {
      pointerId: event.pointerId, x: event.clientX, left: el.scrollLeft,
      scale: el.getBoundingClientRect().width / el.offsetWidth || 1, moved: false,
    }
  }

  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    const delta = (event.clientX - drag.x) / drag.scale
    if (!drag.moved && Math.abs(delta) < 6) return
    if (!drag.moved) {
      drag.moved = true
      suppressClickRef.current = true
      event.currentTarget.setPointerCapture(event.pointerId)
      flushSync(() => setDragging(true))
    }
    event.preventDefault()
    event.currentTarget.scrollLeft = drag.left - delta
  }

  const finishDrag = (event: PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== event.pointerId) return
    dragRef.current = null
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!drag.moved) return
    flushSync(() => setDragging(false))
    const { step } = geometry()
    if (step) {
      const target = Math.round(event.currentTarget.scrollLeft / step) * step
      targetRef.current = target
      event.currentTarget.scrollTo({ left: target, behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' })
    }
  }

  const cards = [...rows, ...rows]

  return (
    <section className="contest-marquee" aria-label="접수 중인 공모전">
      <h2 className="marquee-title">접수 중인 공모전</h2>
      <div className="marquee-slider">
        <button
          type="button"
          className="marquee-arrow marquee-arrow-prev"
          onClick={() => go(-1)}
          disabled={!canScroll}
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
          className={`marquee-window${manual ? ' manual' : ''}${dragging ? ' is-dragging' : ''}`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onLostPointerCapture={finishDrag}
          onDragStart={(event) => event.preventDefault()}
          onScroll={() => {
            const el = windowRef.current
            if (el && targetRef.current !== null && Math.abs(el.scrollLeft - targetRef.current) < 1) targetRef.current = null
          }}
          onClickCapture={(event) => {
            if (!suppressClickRef.current) return
            event.preventDefault()
            event.stopPropagation()
            suppressClickRef.current = false
          }}
        >
          <ul
            ref={trackRef}
            className={manual ? 'marquee-track manual' : 'marquee-track'}
          >
            {cards.map(({ contest, status }, i) => {
              // 자동 흐름일 때 뒤쪽 절반(복제본)은 화면 낭독·탭 이동에서 제외
              const hidden = i >= rows.length
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
                        src={assetUrl(contest.image)}
                        alt=""
                        loading="lazy"
                        onError={(event) => {
                          // 자동 등록 공모전의 포스터는 원본 사이트 주소라 사라질 수 있다
                          const img = event.currentTarget
                          if (img.dataset.fallback) return
                          img.dataset.fallback = '1'
                          img.src = assetUrl('/contest/ck/placeholder.svg')
                        }}
                      />
                      <span className={`marquee-badge tone-${status.tone}`}>{status.label}</span>
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
          onClick={() => go(1)}
          disabled={!canScroll}
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
