import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion'
import type { ReactNode } from 'react'

type ScrollFadeInTag = 'div' | 'section' | 'article' | 'footer'

type ScrollFadeInProps = Omit<HTMLMotionProps<'div'>, 'as'> & {
  // 감싸지 않고 요소 자체를 애니메이션 태그로 바꾼다 — 그리드·플렉스 자리가 그대로 유지된다
  as?: ScrollFadeInTag
  // 함께 화면에 들어온 요소들이 순서대로 떠오르게 하는 간격(ms) —
  // framer-motion의 transition.delay는 초 단위라 1000으로 나눠 넘긴다
  delay?: number
  children: ReactNode
}

// 스크롤로 뷰포트에 들어오면 아래에서 위로(y 50 → 0) 떠오르며 페이드인한다.
// damping 20은 stiffness 100의 임계감쇠라 튕기지 않고 딱 멈춘다(토스식 쫀쫀함),
// once 옵션으로 진입 시 딱 한 번만 재생된다. 움직임을 줄이겠다고 설정한
// 사용자에겐 애니메이션 없이 곧바로 보여 준다.
// initial·whileInView·viewport·transition은 props로 덮어써 개별 조정할 수 있다.
function ScrollFadeIn({ as = 'div', delay = 0, children, ...rest }: ScrollFadeInProps) {
  const reduceMotion = useReducedMotion()
  // div 외 태그(section·article·footer)도 props 구조가 같아 TS 편의상 div로 본다.
  const Tag = motion[as] as typeof motion.div

  return (
    <Tag
      initial={reduceMotion ? false : { opacity: 0, y: 50 }}
      whileInView={reduceMotion ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ type: 'spring', stiffness: 100, damping: 20, ...(delay > 0 ? { delay: delay / 1000 } : {}) }}
      {...rest}
    >
      {children}
    </Tag>
  )
}

export default ScrollFadeIn
