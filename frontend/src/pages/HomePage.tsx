import { useEffect, useRef, useState } from 'react'
import ContestMarquee from '../components/ContestMarquee'
import HeroDeadlines from '../components/HeroDeadlines'
import HeroUpcoming from '../components/HeroUpcoming'
import { IDEA_EXAMPLES } from '../data/ideaSparks.js'
import Reveal from '../components/Reveal'
import './HomePage.css'

const TYPING_TEXT = '아이디어에서 공모전까지, 가장 빠른 길로.'

function useTypewriter(text: string, speed = 75) {
  const [typedLength, setTypedLength] = useState(0)

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTypedLength((prev) => {
        if (prev >= text.length) {
          window.clearInterval(timer)
          return prev
        }
        return prev + 1
      })
    }, speed)
    return () => window.clearInterval(timer)
  }, [text, speed])

  return { typed: text.slice(0, typedLength), done: typedLength >= text.length }
}

// 랜덤 아이디어 예시가 일정 간격으로 순환 표시됩니다.
function RotatingExample() {
  const [index, setIndex] = useState(() => Math.floor(Math.random() * IDEA_EXAMPLES.length))

  useEffect(() => {
    const timer = window.setInterval(() => {
      setIndex((prev) => (prev + 1) % IDEA_EXAMPLES.length)
    }, 3500)
    return () => window.clearInterval(timer)
  }, [])

  return (
    <p className="idea-example" key={index}>
      <span className="idea-example-label">예시</span>
      {IDEA_EXAMPLES[index]}
    </p>
  )
}

type Props = {
  // '곧 마감되는 공모전'의 전체 보기 — 공모전 탐색 화면으로 보냅니다.
  onExplore: () => void
  // '곧 시작되는 공모전'의 전체 보기 — 탐색 화면을 '곧 시작' 필터로 엽니다.
  onExploreUpcoming: () => void
  onOpenContest: (id: number) => void
}

function HomePage({
  onExplore,
  onExploreUpcoming,
  onOpenContest,
}: Props) {
  const { typed, done } = useTypewriter(TYPING_TEXT, 75)
  const strengthsRef = useRef<HTMLElement>(null)

  // '공모온이 특별한 이유' 화면 전환 — 섹션이 뷰포트에 들어오면(is-screen-on)
  // 배경이 회색 캔버스에서 흰 표면으로 스르륵 바뀌고, 벗어나면 되돌아간다.
  // 실제 전환 모양은 HomePage.css .strengths가 담당. 위로 다시 지나가도 매번 재생되게
  // 뷰포트 이탈 시 되돌리는 건 utils/scrollReveal.ts의 Reveal과 같은 원리다.
  useEffect(() => {
    const el = strengthsRef.current
    if (!el) return
    // 아주 오래된 브라우저 폴백 — 애니메이션 없이 곧바로 흰 표면.
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-screen-on')
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          el.classList.toggle('is-screen-on', entry.isIntersecting)
        }
      },
      // Reveal과 같은 시작점 — 섹션 상단이 화면 아래에서 조금 보이는 시점부터.
      // 0을 함께 둬야 완전히 벗어난 순간의 콜백도 받아 되돌릴 수 있다.
      { threshold: [0, 0.1], rootMargin: '0px 0px -10% 0px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  return (
    <div className="page home">
      <div className="home-bg" aria-hidden="true">
        <span className="home-glow glow-a" />
        <span className="home-glow glow-b" />
        <span className="home-glow glow-c" />
      </div>

      {/* 시작 히어로 — 노트북 장식 없이 워드마크·타이핑 문구·예시만 가운데 쌓는다.
          서비스 설명 배지는 2026-10-14 사용자 요청으로 뺐다.
          data-reveal — 탐색 화면처럼 화면 진입 때 스르륵 떠오르는 효과(홈 버튼도 같은 효과) */}
      <section className="hero">
        <div className="hero-copy" data-reveal>
          <h1 className="hero-title">공모온</h1>
          <p className="tagline" aria-label={TYPING_TEXT}>
            막막한 아이디어에도 방향이 있습니다.
            <br />
            {typed}
            {!done && <span className="caret" aria-hidden="true" />}
          </p>
          <RotatingExample />
        </div>
      </section>

      {/* 서비스 바로가기 탭은 메뉴바로 흡수됐다(2026-10-13) — 히어로 다음은
          '이렇게 도와드립니다'(2026-10-14 사용자 요청으로 마키 앞으로 옮김) */}
      {/* 섹션 제목('이렇게 도와드립니다')은 2026-10-14 사용자 요청 '글자 지워주고'로
          빼고 aria-label로만 남겼다 — 강점 섹션(.strengths)과 같은 처리다 */}
      <section className="features" aria-label="이렇게 도와드립니다">
        <div className="feature-grid">
          {/* 2026-10-14 사용자 요청으로 번호 칩과 카드 박스를 빼고 문장만 남겼다.
              '유사 사례 비교' 항목은 같은 날 '이 부분 삭제해줘' 요청으로 뺐다(3개) */}
          <Reveal as="article" className="feature-card">
            <h3>공모전 유형 검사</h3>
            <p>아직 아이디어가 없어도 괜찮아요. 30문항으로 나의 공모전 성향을 찾아 드려요.</p>
          </Reveal>
          <Reveal as="article" className="feature-card" delay={90}>
            <h3>강점과 차별점 분석</h3>
            <p>내 아이디어만의 강점과 보완할 점을 짚어 드려요.</p>
          </Reveal>
          <Reveal as="article" className="feature-card" delay={180}>
            <h3>공모전 추천</h3>
            <p>아이디어 주제에 맞는 공모전을 찾아 추천해 드려요.</p>
          </Reveal>
        </div>
      </section>

      {/* 기능 소개(흰) 다음은 '접수 중인 공모전' 마키 — 같은 흰 밴드로 이어진다 */}
      <Reveal className="reveal--block home-marquee-band">
        <ContestMarquee onOpenContest={onOpenContest} />
      </Reveal>

      <Reveal className="reveal--block">
        <div className="home-deadlines">
          <HeroDeadlines onOpenExplore={onExplore} onOpenContest={onOpenContest} />
          <HeroUpcoming onOpenExplore={onExploreUpcoming} onOpenContest={onOpenContest} />
        </div>
      </Reveal>

      {/* 공모온 강점 — 푸터 바로 위(2026-10-14 사용자 요청). 기능 소개가 아니라
          사용자가 이 사이트를 거치며 발전되는 흐름(막막함→아이디어→전략→도전→
          기록→자신감)을 보여 준다. 섹션 제목은 같은 날 '글자 지워주고' 요청으로
          빼고 aria-label로만 남겼다. 큰 문장+한 줄 설명의 크기 대비 — 같은 날
          사용자 요청 '글자 크기 대비 효과를 더 극대화'. 스크롤로 진입하면 배경이
          점차 밝아진다(위 useEffect + HomePage.css .strengths) */}
      <section ref={strengthsRef} className="strengths" aria-label="공모온이 특별한 이유">
        <div className="strengths-grid">
          <Reveal as="article" className="strength-item">
            <h3>막막함이 아이디어로</h3>
            <p>성향 검사와 예시 아이디어로 첫 문장을 시작해요.</p>
          </Reveal>
          <Reveal as="article" className="strength-item" delay={90}>
            <h3>아이디어가 전략으로</h3>
            <p>강점·보완점 분석으로 목표 공모전이 보여요.</p>
          </Reveal>
          <Reveal as="article" className="strength-item" delay={180}>
            <h3>도전이 기록으로</h3>
            <p>응모와 결과가 쌓여 나만의 히스토리가 돼요.</p>
          </Reveal>
          <Reveal as="article" className="strength-item" delay={270}>
            <h3>기록이 자신감으로</h3>
            <p>쌓인 기록이 다음 도전을 가볍게 만들어요.</p>
          </Reveal>
        </div>
      </section>
    </div>
  )
}

export default HomePage
