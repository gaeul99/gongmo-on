import { useEffect, useRef } from 'react'
import './MobileScrollPill.css'

/* 모바일 스크롤바 알약 — 폰·브라우저 기기 모드에서는 스크롤바가 오버레이로
   그려져(레이아웃 공간을 쓰지 않아) PC의 진회색 알약(index.css
   ::-webkit-scrollbar)이 보이지 않는다(2026-10-19 사용자 요청 '스크롤바 알약으로
   PC버전과 동일하게'). 화면 오른쪽 끝에 같은 색 알약을 직접 그려 스크롤
   위치를 알려 준다. 손가락 동작은 가로채지 않는다(pointer-events: none) */
export default function MobileScrollPill() {
  const thumbRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const thumb = thumbRef.current
    if (!thumb) return

    let raf = 0

    const update = () => {
      raf = 0
      const doc = document.documentElement
      /* 네이티브 스크롤바가 레이아웃 공간을 차지하는 환경(데스크톱)에서는
         커스텀 알약이 이미 그려지므로 이 요소는 숨긴다. 폰의 오버레이
         스크롤바는 공간을 쓰지 않아 두 폭이 같다 */
      if (doc.clientWidth < window.innerWidth) {
        thumb.style.opacity = '0'
        return
      }

      const scrollable = doc.scrollHeight - window.innerHeight
      if (scrollable <= 1) {
        thumb.style.opacity = '0'
        return
      }

      /* 손가락을 튕겨 스크롤이 음수·끝을 넘는 순간에도 알약이 레일을
         벗어나지 않게 값을 잘라 둔다. 크기·위치는 트랙에 대한 백분율로
         정한다 — 트랙이 CSS로 뷰포트에 고정돼 있어 축척(zoom)과 무관하게
         화면에 딱 맞는다 */
      const y = Math.min(Math.max(window.scrollY, 0), scrollable)
      const visibleRatio = Math.min(window.innerHeight / doc.scrollHeight, 1)
      const heightPct = Math.max(visibleRatio * 100, 5)
      const topPct = (y / scrollable) * (100 - heightPct)

      thumb.style.height = `${heightPct}%`
      thumb.style.top = `${topPct}%`
      thumb.style.opacity = '1'
    }

    const schedule = () => {
      if (!raf) raf = window.requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', schedule, { passive: true })
    window.addEventListener('resize', schedule)
    /* iOS 주소창 접힘처럼 resize 이벤트가 빠지는 뷰포트 변화도 놓치지 않는다 */
    window.visualViewport?.addEventListener('resize', schedule)

    return () => {
      window.removeEventListener('scroll', schedule)
      window.removeEventListener('resize', schedule)
      window.visualViewport?.removeEventListener('resize', schedule)
      if (raf) window.cancelAnimationFrame(raf)
    }
  }, [])

  return (
    <div className="mobile-scroll-pill" aria-hidden="true">
      <div className="mobile-scroll-pill-track" />
      <div ref={thumbRef} className="mobile-scroll-pill-thumb" />
    </div>
  )
}
