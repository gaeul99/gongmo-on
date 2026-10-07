import { useEffect, useState } from 'react'
import ContestMarquee from '../components/ContestMarquee'
import HeroDeadlines from '../components/HeroDeadlines'
import HeroUpcoming from '../components/HeroUpcoming'
import NewContestBanner from '../components/NewContestBanner'
import { IDEA_EXAMPLES } from '../data/ideaSparks.js'
import './HomePage.css'

type Props = {
  onStart: () => void
  onDashboard: () => void
  onTypeTest: () => void
  onNotes: () => void
  onOpenContest: (id: number) => void
}

const TYPING_TEXT = '아이디어에서 공모전까지, 가장 빠른 지름길로 안내해 드립니다.'

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

function HomePage({ onStart, onDashboard, onTypeTest, onNotes, onOpenContest }: Props) {
  const { typed, done } = useTypewriter(TYPING_TEXT, 75)

  return (
    <div className="page">
      <div className="home-bg" aria-hidden="true">
        <span className="home-glow glow-a" />
        <span className="home-glow glow-b" />
        <span className="home-glow glow-c" />
      </div>

      <NewContestBanner onOpenContest={onOpenContest} />

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
        </div>
      </header>

      <section className="service-tabs" aria-label="서비스 바로가기">
        <p className="service-tabs-label">🧭 서비스 바로가기</p>
        <div className="service-tab-row">
          <button type="button" className="service-tab" onClick={onTypeTest}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8.5 9 h7 M8.5 13 h7 M8.5 17 h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="service-tab-text">
              <span className="service-tab-title">유형 검사</span>
              <span className="service-tab-sub">30문항 성향 검사로 시작</span>
            </span>
          </button>
          <button type="button" className="service-tab" onClick={onDashboard}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path d="M6.5 19 V12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M12 19 V5.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M17.5 19 V9.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <line x1="4" y1="19.4" x2="20" y2="19.4" stroke="currentColor" strokeWidth="1.8" />
            </svg>
            <span className="service-tab-text">
              <span className="service-tab-title">대시보드</span>
              <span className="service-tab-sub">마감·통계 한눈에</span>
            </span>
          </button>
          <button type="button" className="service-tab" onClick={onNotes}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path
                d="M5 4.5 h11 l3 3 v12 a1 1 0 0 1 -1 1 H6 a1 1 0 0 1 -1 -1 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M8.5 9.5 h7 M8.5 13 h7 M8.5 16.5 h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="service-tab-text">
              <span className="service-tab-title">
                연습 노트<span className="service-tab-new">NEW</span>
              </span>
              <span className="service-tab-sub">응모 전 심사 연습 노트</span>
            </span>
          </button>
        </div>
      </section>

      <div className="home-start">
        <button type="button" className="start-button" onClick={onStart}>
          아이디어 분석 시작
        </button>
        <RotatingExample />
      </div>

      <ContestMarquee onOpenContest={onOpenContest} />

      <section className="features" aria-labelledby="features-title">
        <h2 id="features-title">이렇게 도와드립니다</h2>
        <div className="feature-grid">
          <article className="feature-card">
            <span className="feature-number">1</span>
            <h3>공모전 유형 검사</h3>
            <p>아직 아이디어가 없어도 괜찮아요. 30문항 검사로 나의 공모전 성향과 어울리는 공모전을 찾아 드립니다.</p>
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

      <div className="home-deadlines">
        <HeroDeadlines onOpenDashboard={onDashboard} onOpenContest={onOpenContest} />
        <HeroUpcoming onOpenContest={onOpenContest} />
      </div>
    </div>
  )
}

export default HomePage
