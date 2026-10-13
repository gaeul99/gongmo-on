// ==========================================================
// 스크롤 등장 애니메이션 — data-reveal이 붙은 요소를 뷰포트에 들어올 때
// 스르륵 보여 준다. 화면을 벗어나면 다시 대기 상태로 되돌려서, 위로/아래로
// 몇 번을 지나가도 매 진입마다 등장 효과가 재생된다(2026-10-13 사용자 요청 —
// 예전엔 unobserve로 한 번만 재생돼 재차 지날 때 효과가 없었다).
// App이 마운트될 때 한 번 붙이고, 화면 전환·조건부 렌더로 새로 생긴
// 요소도 MutationObserver로 계속 관찰한다.
// ==========================================================

import { useEffect } from 'react'
import '../components/Reveal.css'

export function useScrollReveal() {
  useEffect(() => {
    // 아주 오래된 브라우저 폴백 — 애니메이션 없이 곧바로 보여 준다.
    if (typeof IntersectionObserver === 'undefined') {
      document.querySelectorAll('[data-reveal]').forEach((el) => el.classList.add('is-revealed'))
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const el = entry.target as HTMLElement
          if (entry.isIntersecting) {
            // 순차 등장 간격(ms) — data-reveal-delay로 요소별로 지정한다.
            if (el.dataset.revealDelay) {
              el.style.transitionDelay = `${el.dataset.revealDelay}ms`
            }
            el.classList.add('is-revealed')
          } else {
            // 화면을 벗어나면 대기 상태로 되돌린다 — 다음 진입 때 다시 재생.
            // 퇴장까지 순차 간격을 따르지 않게 지연도 함께 지운다.
            el.classList.remove('is-revealed')
            el.style.transitionDelay = ''
          }
        }
      },
      // 요소 상단이 화면 아래에서 조금 보이는 시점부터 시작한다.
      // 0을 함께 둬야 화면에서 완전히 벗어난 순간(isIntersecting false)의
      // 콜백도 받아 대기 상태로 되돌릴 수 있다.
      { threshold: [0, 0.1], rootMargin: '0px 0px -10% 0px' },
    )

    const observeAll = () => {
      document.querySelectorAll('[data-reveal]').forEach((el) => observer.observe(el))
    }
    observeAll()

    const mutation = new MutationObserver(observeAll)
    mutation.observe(document.body, { childList: true, subtree: true })

    return () => {
      observer.disconnect()
      mutation.disconnect()
    }
  }, [])
}
