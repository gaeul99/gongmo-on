import { useEffect, useState } from 'react'
import ContestMarquee from '../components/ContestMarquee'
import HeroDeadlines from '../components/HeroDeadlines'
import HeroUpcoming from '../components/HeroUpcoming'
import { IDEA_EXAMPLES } from '../data/ideaSparks.js'
import Reveal from '../components/Reveal'
import './HomePage.css'

const TYPING_TEXT = '아이디어에서 공모전까지, 가장 빠른 지름길로 안내해 드립니다.'

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

  return (
    <div className="page">
      <div className="home-bg" aria-hidden="true">
        <span className="home-glow glow-a" />
        <span className="home-glow glow-b" />
        <span className="home-glow glow-c" />
      </div>

      {/* 시작 히어로 — 노트북 장식 없이 배지·워드마크·타이핑 문구·예시만 가운데 쌓는다.
          h1이 사는 실제 콘텐츠라 aria-hidden을 쓰지 않는다 */}
      <section className="hero">
        <div className="hero-copy">
          <p className="badge">AI 아이디어 분석 서비스</p>
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

      {/* 서비스 바로가기 탭은 메뉴바로 흡수됐다(2026-10-13) — 히어로 다음은 마키다 */}

      <Reveal className="reveal--block">
        <ContestMarquee onOpenContest={onOpenContest} />
      </Reveal>

      <Reveal className="reveal--block">
        <div className="home-deadlines">
          <HeroDeadlines onOpenExplore={onExplore} onOpenContest={onOpenContest} />
          <HeroUpcoming onOpenExplore={onExploreUpcoming} onOpenContest={onOpenContest} />
        </div>
      </Reveal>

      <section className="features" aria-labelledby="features-title">
        <h2 id="features-title">이렇게 도와드립니다</h2>
        <div className="feature-grid">
          <Reveal as="article" className="feature-card">
            <span className="feature-number">1</span>
            <h3>공모전 유형 검사</h3>
            <p>아직 아이디어가 없어도 괜찮아요. 30문항 검사로 나의 공모전 성향과 어울리는 공모전을 찾아 드립니다.</p>
          </Reveal>
          <Reveal as="article" className="feature-card" delay={90}>
            <span className="feature-number">2</span>
            <h3>유사 사례 비교</h3>
            <p>내 아이디어와 비슷한 국내외 서비스와 사례를 찾아 나란히 비교해 드립니다.</p>
          </Reveal>
          <Reveal as="article" className="feature-card" delay={180}>
            <span className="feature-number">3</span>
            <h3>강점과 차별점 분석</h3>
            <p>유사 사례와 비교해 내 아이디어만의 강점과 보완하면 좋은 점을 짚어 드립니다.</p>
          </Reveal>
          <Reveal as="article" className="feature-card" delay={270}>
            <span className="feature-number">4</span>
            <h3>공모전 추천</h3>
            <p>아이디어의 주제와 성격에 맞는 공모전을 찾아 추천해 드립니다.</p>
          </Reveal>
        </div>
      </section>
    </div>
  )
}

export default HomePage
