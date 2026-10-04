import { useEffect, useState } from 'react'
import ContestMarquee from '../components/ContestMarquee'
import HeroDeadlines from '../components/HeroDeadlines'
import NewContestBanner from '../components/NewContestBanner'
import { IDEA_EXAMPLES } from '../data/ideaSparks.js'
import './HomePage.css'

type Props = {
  onStart: () => void
  onDashboard: () => void
  onTypeTest: () => void
  onOpenContest: (id: number) => void
}

const TYPING_TEXT = '아이디어에서 공모전까지, 가장 빠른 길을 안내해 드립니다.'

function useTypewriter(text: string, speed = 40) {
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

function HomePage({ onStart, onDashboard, onTypeTest, onOpenContest }: Props) {
  const { typed, done } = useTypewriter(TYPING_TEXT, 75)

  return (
    <div className="page">
      <div className="home-bg" aria-hidden="true">
        <span className="home-glow glow-a" />
        <span className="home-glow glow-b" />
        <span className="home-glow glow-c" />
      </div>

      <NewContestBanner />

      <header className="hero">
        <div className="hero-copy">
          <div className="hero-brand">
            <p className="badge">AI 아이디어 분석 서비스</p>
            <h1>공내비</h1>
          </div>
          <p className="tagline" aria-label={TYPING_TEXT}>
            막막한 아이디어에도 방향이 있습니다.
            <br />
            {typed}
            {!done && <span className="caret" aria-hidden="true" />}
          </p>
          <p className="description">
            공내비는 여러분의 아이디어를 국내외 유사 사례와 비교 분석하고,
            그 결과를 바탕으로 아이디어와 잘 맞는 공모전을 추천해 드립니다.
          </p>
        </div>
      </header>

      <ContestMarquee />

      <div className="home-start">
        <button type="button" className="start-button" onClick={onStart}>
          아이디어 분석 시작
        </button>
        <button type="button" className="type-test-link" onClick={onTypeTest}>
          아직 아이디어가 없나요? 2분 유형 검사로 시작하기 →
        </button>
        <RotatingExample />
      </div>

      <div className="home-deadlines">
        <HeroDeadlines onOpenDashboard={onDashboard} onOpenContest={onOpenContest} />
      </div>

      <section className="features" aria-labelledby="features-title">
        <h2 id="features-title">이렇게 도와드립니다</h2>
        <div className="feature-grid">
          <article className="feature-card">
            <span className="feature-number">1</span>
            <h3>공모전 유형 검사</h3>
            <p>아직 아이디어가 없어도 괜찮아요. 24문항 검사로 나의 공모전 성향과 어울리는 공모전을 찾아 드립니다.</p>
          </article>
          <article className="feature-card">
            <span className="feature-number">2</span>
            <h3>유사 사례 비교</h3>
            <p>내 아이디어와 비슷한 국내외 서비스와 사례를 찾아 나란히 비교해 드립니다.</p>
          </article>
          <article className="feature-card">
            <span className="feature-number">3</span>
            <h3>강점과 차별점 분석</h3>
            <p>유사 사례와 비교해 내 아이디어만의 강점과 보완하면 좋은 점을 짚어 드립니다.</p>
          </article>
          <article className="feature-card">
            <span className="feature-number">4</span>
            <h3>공모전 추천</h3>
            <p>아이디어의 주제와 성격에 맞는 공모전을 찾아 추천해 드립니다.</p>
          </article>
        </div>
      </section>

      <footer className="footer">
        <p>© 2026 공내비</p>
      </footer>
    </div>
  )
}

export default HomePage
