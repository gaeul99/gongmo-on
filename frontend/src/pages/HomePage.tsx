import AppLink from '../components/AppLink'
import { useEffect, useState } from 'react'
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
  // 기능 소개 5개 메뉴탭 — 하단 바 메뉴 팝업과 같은 목적지(2026-10-14).
  onTypeTest: () => void
  onStart: () => void
  onNotes: () => void
  onDashboard: () => void
}

function HomePage({
  onExplore,
  onExploreUpcoming,
  onOpenContest,
  onTypeTest,
  onStart,
  onNotes,
  onDashboard,
}: Props) {
  const { typed, done } = useTypewriter(TYPING_TEXT, 75)
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
          <h1 className="hero-title">공모ON</h1>
          <p className="tagline" aria-label={TYPING_TEXT}>
            막막한 아이디어에도 방향이 있습니다.
            <br />
            {typed}
            {!done && <span className="caret" aria-hidden="true" />}
          </p>
          <RotatingExample />
          {/* 히어로 첫 행동 CTA — 기획 흐름(유형 검사 → 아이디어 입력)의 시작을
              히어로에서 바로 연다(2026-10-19 화면 흐름 점검). 주 CTA는 검사,
              2026-10-26 사용자 요청으로 보조 링크는 공모전 탐색으로 바꿨다 */}
          <div className="hero-cta">
            <AppLink className="hero-cta-primary" href="/test" onNavigate={onTypeTest}>
              유형 검사로 시작하기
            </AppLink>
            <AppLink className="hero-cta-secondary" href="/contest" onNavigate={onExplore}>
              공모전 탐색 →
            </AppLink>
          </div>
        </div>
      </section>

      {/* 서비스 바로가기 탭은 메뉴바로 흡수됐다(2026-10-13) — 마키 다음은
          '이렇게 도와드립니다'(2026-10-14에 마키 앞으로 옮겼다가 2026-10-15
          사용자 요청으로 마키 뒤로 되돌림) */}
      {/* 섹션 제목('이렇게 도와드립니다')은 2026-10-14 사용자 요청 '글자 지워주고'로
          빼고 aria-label로만 남겼다 — 강점 섹션(.strengths)과 같은 처리다 */}
      <section className="features" aria-label="서비스 바로가기">
        <div className="home-section-heading"><span className="home-eyebrow">QUICK START</span><h2>필요한 기능부터 시작하세요</h2></div>
        <div className="feature-grid">
          {/* 2026-10-14 사용자 요청 '이 지그재그 설명란을 메뉴탭으로 이용해서 클릭하면
              바로 갈 수 있게' — 3개 설명을 바로가기 5개 메뉴로 바꾸고 각 항목을
              AppLink로 만들었다. 순서·목적지·NEW 표시는 하단 바 메뉴 팝업과 같다.
              번호 칩·카드 박스는 같은 날 이른 요청으로 이미 빠져 있다 */}
          <Reveal as="article" className="feature-item">
            <AppLink className="feature-card" href="/test" onNavigate={onTypeTest}>
              <h3>공모전 유형 검사</h3>
              <p>20문항으로 나의 공모전 성향을 찾고, 시작할 아이디어 방향을 정해요.</p>
            </AppLink>
          </Reveal>
          <Reveal as="article" className="feature-item" delay={90}>
            <AppLink className="feature-card" href="/input" onNavigate={onStart}>
              <h3>아이디어 분석</h3>
              <p>아이디어를 입력하면 강점·보완점과 어울리는 공모전까지 분석해 드려요.</p>
            </AppLink>
          </Reveal>
          <Reveal as="article" className="feature-item" delay={180}>
            <AppLink className="feature-card" href="/notes" onNavigate={onNotes}>
              <h3>
                연습 노트<span className="feature-card-new">NEW</span>
              </h3>
              <p>아이디어를 노트에 쌓아 가며 실전 전에 마음껏 연습해요.</p>
            </AppLink>
          </Reveal>
          <Reveal as="article" className="feature-item" delay={270}>
            <AppLink className="feature-card" href="/dashboard" onNavigate={onDashboard}>
              <h3>대시보드</h3>
              <p>응모 기록·출품 로드맵을 한 화면에서 확인해요.</p>
            </AppLink>
          </Reveal>
          <Reveal as="article" className="feature-item" delay={360}>
            <AppLink className="feature-card" href="/contest" onNavigate={onExplore}>
              <h3>공모전 탐색</h3>
              <p>분야·마감일 필터로 전체 공모전을 둘러보고 찜해요.</p>
            </AppLink>
          </Reveal>
        </div>
      </section>

      {/* 히어로 바로 다음은 '접수 중인 공모전' 마키 — 2026-10-15 사용자 요청으로
          기능 소개(.features) 앞으로 순서를 바꿨다. 히어로와 같은 흰 캔버스 위에
          마키 카드(흰)가 뜬다 */}
      <Reveal className="reveal--block home-marquee-band">
        <ContestMarquee onOpenContest={onOpenContest} />
      </Reveal>

      {/* 공모온 강점 — 공모전 일정 패널 위에 배치한다. */}
      <section className="strengths" aria-label="공모온이 특별한 이유">
        <div className="home-section-heading"><span className="home-eyebrow">HOW IT WORKS</span><h2>아이디어부터 다음 도전까지</h2></div>
        <div className="strengths-grid">
          <Reveal as="article" className="strength-item">
            <h3>아이디어가 전략으로</h3>
            <p>강점·보완점 분석으로 목표 공모전이 보여요.</p>
          </Reveal>
          <Reveal as="article" className="strength-item" delay={90}>
            <h3>도전이 기록으로</h3>
            <p>응모와 결과가 쌓여 나만의 히스토리가 돼요.</p>
          </Reveal>
          <Reveal as="article" className="strength-item" delay={180}>
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
