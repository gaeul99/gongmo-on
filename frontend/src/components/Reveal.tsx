import type { ReactNode } from 'react'
import './Reveal.css'

type RevealTag = 'div' | 'section' | 'article' | 'footer'

type RevealProps = {
  // 감싸지 않고 요소 자체를 reveal로 바꾼다 — 그리드·플렉스 자리가 그대로 유지된다
  as?: RevealTag
  className?: string
  // 함께 화면에 들어온 요소들이 순서대로 떠오르게 하는 간격(ms)
  delay?: number
  ariaLabel?: string
  ariaLabelledBy?: string
  children?: ReactNode
}

// 스크롤 등장 래퍼 — 요소에 data-reveal 표시만 남긴다.
// 실제 관찰·등장 처리는 App이 한 번 붙이는 useScrollReveal 훅(utils/scrollReveal.ts)이 담당한다.
function Reveal({ as = 'div', className = '', delay = 0, ariaLabel, ariaLabelledBy, children }: RevealProps) {
  // div 외 태그(section·article·footer)도 props 구조가 같아 TS 편의상 div로 본다.
  const Tag = as as 'div'

  return (
    <Tag
      data-reveal=""
      data-reveal-delay={delay > 0 ? String(delay) : undefined}
      className={className || undefined}
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
    >
      {children}
    </Tag>
  )
}

export default Reveal
