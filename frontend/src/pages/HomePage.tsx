import AppLink from '../components/AppLink'
import { useEffect, useState } from 'react'
import ContestMarquee from '../components/ContestMarquee'
import HeroDeadlines from '../components/HeroDeadlines'
import HeroUpcoming from '../components/HeroUpcoming'
import Reveal from '../components/Reveal'
import './HomePage.css'

type Props = {
  // '곧 마감되는 공모전'의 전체 보기 — 공모전 탐색 화면으로 보냅니다.
  onExplore: () => void
  // '곧 시작되는 공모전'의 전체 보기 — 탐색 화면을 '곧 시작' 필터로 엽니다.
  onExploreUpcoming: () => void
  onOpenContest: (id: number) => void
  onTypeTest: () => void
}

function HomePage({
  onExplore,
  onExploreUpcoming,
  onOpenContest,
  onTypeTest,
}: Props) {
  const [deadlineOpen, setDeadlineOpen] = useState(false)

  useEffect(() => {
    if (!deadlineOpen) return
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeadlineOpen(false)
    }
    window.addEventListener('keydown', onEscape)
    return () => window.removeEventListener('keydown', onEscape)
  }, [deadlineOpen])

  return (
    <div className="page home">
      <section className="hero">
        <div className="hero-stage">
        <div className="hero-copy" data-reveal>
          <p className="hero-title">공모<span>ON</span></p>
          <h1 className="hero-headline">당신의 아이디어에,<br /><span>다음 도전을 연결하다.</span></h1>
          <p className="tagline">나의 성향을 알아보고, 아이디어에 맞는 공모전을 찾아보세요.<br />막막했던 시작부터 차근차근 함께할게요.</p>
          {/* 히어로 첫 행동 CTA — 기획 흐름(유형 검사 → 아이디어 입력)의 시작을
              히어로에서 바로 연다(2026-10-19 화면 흐름 점검). 주 CTA는 검사,
              2026-10-26 사용자 요청으로 보조 링크는 공모전 탐색으로 바꿨다 */}
          <div className="hero-cta">
            <AppLink className="hero-cta-primary" href="/test" onNavigate={onTypeTest}>
              유형 검사로 시작하기
              <span aria-hidden="true"> ↗</span>
            </AppLink>
            <AppLink className="hero-cta-secondary" href="/contest" onNavigate={onExplore}>
              공모전 탐색 →
            </AppLink>
          </div>
        </div>
        </div>
        <ol className="hero-journey" aria-label="공모온 이용 순서" data-reveal data-reveal-delay="240">
          <li><span>01</span> 나의 성향 발견</li>
          <li><span>02</span> 아이디어 분석</li>
          <li><span>03</span> 공모전 도전</li>
        </ol>
      </section>

      {/* 히어로 바로 다음은 '접수 중인 공모전' 마키 — 히어로와 같은 흰 캔버스
          위에 마키 카드(흰)가 뜬다 */}
      <Reveal className="reveal--block home-marquee-band">
        <ContestMarquee onOpenContest={onOpenContest} />
      </Reveal>

      {/* 공모온 강점 — 공모전 일정 패널 위에 배치한다. */}
      <section className="strengths" aria-label="공모온이 특별한 이유">
        <div className="home-section-heading"><span className="home-eyebrow">HOW IT WORKS</span><h2>아이디어부터 다음 도전까지</h2></div>
        <div className="strengths-grid">
          <Reveal as="article" className="strength-item">
            <span className="strength-number">01</span>
            <h3>아이디어가 전략으로</h3>
            <p>강점·보완점 분석으로 목표 공모전이 보여요.</p>
          </Reveal>
          <Reveal as="article" className="strength-item" delay={90}>
            <span className="strength-number">02</span>
            <h3>도전이 기록으로</h3>
            <p>응모와 결과가 쌓여 나만의 히스토리가 돼요.</p>
          </Reveal>
          <Reveal as="article" className="strength-item" delay={180}>
            <span className="strength-number">03</span>
            <h3>기록이 자신감으로</h3>
            <p>쌓인 기록이 다음 도전을 가볍게 만들어요.</p>
          </Reveal>
        </div>
      </section>

      <button className="home-deadline-trigger" type="button" onClick={() => setDeadlineOpen(true)} aria-haspopup="dialog">
        <span className="home-deadline-trigger-dot" aria-hidden="true" />
        곧 마감되는 공모전
      </button>
      {deadlineOpen && (
        <div className="home-deadline-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setDeadlineOpen(false) }}>
          <div className="home-deadline-dialog" role="dialog" aria-modal="true" aria-label="곧 마감되는 공모전">
            <button className="home-deadline-close" type="button" aria-label="팝업 닫기" onClick={() => setDeadlineOpen(false)}>×</button>
            <HeroDeadlines
              onOpenExplore={() => { setDeadlineOpen(false); onExplore() }}
              onOpenContest={(id) => { setDeadlineOpen(false); onOpenContest(id) }}
            />
          </div>
        </div>
      )}

      {/* 공모온 강점 다음은 '곧 마감'·'곧 시작' 두 패널 — '접수 중인 공모전' 마키는
          2026-10-15 사용자 요청으로 히어로 다음으로 옮겨 갔다 */}
      <Reveal className="reveal--block">
        <div className="home-deadlines">
          <HeroUpcoming onOpenExplore={onExploreUpcoming} onOpenContest={onOpenContest} />
        </div>
      </Reveal>


    </div>
  )
}

export default HomePage
