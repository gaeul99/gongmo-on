import { useEffect, useState } from 'react'
import AppLink from '../components/AppLink'
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
  // '곧 마감되는 공모전'의 전체 보기 — 공모전 탐색 화면으로 보냅니다.
  onExplore: () => void
  // '곧 시작되는 공모전'의 전체 보기 — 탐색 화면을 '곧 시작' 필터로 엽니다.
  onExploreUpcoming: () => void
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

function HomePage({
  onStart,
  onDashboard,
  onTypeTest,
  onNotes,
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

      <NewContestBanner onOpenContest={onOpenContest} />

      {/* 서비스 바로가기 탭 — 히어로 위 첫 섹션. 아이디어 분석이 첫 탭이다. */}
      <section className="service-tabs" aria-label="서비스 바로가기">
        <div className="service-tab-row">
          <AppLink className="service-tab service-tab--input" href="/input" onNavigate={onStart}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <path
                d="M8.8 13.8 a5 5 0 1 1 6.4 0 c-.8 .6 -1.2 1.4 -1.3 2.3 h-3.8 c-.1 -.9 -.5 -1.7 -1.3 -2.3 Z"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              <path d="M10.2 19.5 h3.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="service-tab-text">
              <span className="service-tab-title">아이디어 분석</span>
              <span className="service-tab-sub">AI 분석으로 공모전 추천까지</span>
            </span>
          </AppLink>
          <AppLink className="service-tab service-tab--test" href="/test" onNavigate={onTypeTest}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <rect x="4.5" y="3.5" width="15" height="17" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M8.5 9 h7 M8.5 13 h7 M8.5 17 h4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="service-tab-text">
              <span className="service-tab-title">유형 검사</span>
              <span className="service-tab-sub">30문항 성향 검사로 시작</span>
            </span>
          </AppLink>
          <AppLink className="service-tab service-tab--dashboard" href="/dashboard" onNavigate={onDashboard}>
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
          </AppLink>
          <AppLink className="service-tab service-tab--notes" href="/notes" onNavigate={onNotes}>
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
          </AppLink>
          <AppLink className="service-tab service-tab--explore" href="/contest" onNavigate={onExplore}>
            <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">
              <circle cx="10.5" cy="10.5" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.8" />
              <path d="M14.7 14.7 L19.5 19.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              <path d="M8 10.5 h5 M10.5 8 v5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            <span className="service-tab-text">
              <span className="service-tab-title">공모전 탐색</span>
              <span className="service-tab-sub">전체 공모전 검색·필터</span>
            </span>
          </AppLink>
        </div>
      </section>

      <header className="hero">
        <div className="hero-copy">
          <div className="hero-brand">
            <p className="badge">AI 아이디어 분석 서비스</p>
          </div>
          <div className="hero-title-row">
            <svg
              className="hero-title-mark"
              viewBox="0 0 24 24"
              aria-hidden="true"
              focusable="false"
            >
              <circle
                cx="12"
                cy="12"
                r="9.2"
                fill="none"
                stroke="#000"
                strokeWidth="1.8"
              />
              {/* 바늘 — 내비 로고와 같은 나침반. 북동쪽 절반은 진하게, 남서쪽 절반은 옅게 */}
              <path d="M16.2 7.8 L14.1 14.1 L9.9 9.9 Z" fill="#000" />
              <path
                d="M7.8 16.2 L9.9 9.9 L14.1 14.1 Z"
                fill="#000"
                opacity="0.45"
              />
            </svg>
            <h1 className="hero-title">공내비</h1>
          </div>
          <p className="tagline" aria-label={TYPING_TEXT}>
            막막한 아이디어에도 방향이 있습니다.
            <br />
            {typed}
            {!done && <span className="caret" aria-hidden="true" />}
          </p>
          <RotatingExample />
        </div>
      </header>

      <ContestMarquee onOpenContest={onOpenContest} />

      <div className="home-deadlines">
        <HeroDeadlines onOpenExplore={onExplore} onOpenContest={onOpenContest} />
        <HeroUpcoming onOpenExplore={onExploreUpcoming} onOpenContest={onOpenContest} />
      </div>

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
    </div>
  )
}

export default HomePage
