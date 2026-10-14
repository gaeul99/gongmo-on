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
          {/* 2026-10-14 사용자 요청 '이 지그재그 설명란을 메뉴탭으로 이용해서 클릭하면
              바로 갈 수 있게' — 3개 설명을 바로가기 5개 메뉴로 바꾸고 각 항목을
              AppLink로 만들었다. 순서·목적지·NEW 표시는 하단 바 메뉴 팝업과 같다.
              번호 칩·카드 박스는 같은 날 이른 요청으로 이미 빠져 있다 */}
          <Reveal as="article" className="feature-item">
            <AppLink className="feature-card" href="/test" onNavigate={onTypeTest}>
              <h3>공모전 유형 검사</h3>
              <p>30문항으로 나의 공모전 성향을 찾고, 시작할 아이디어 방향을 정해요.</p>
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
              <p>성향·응모 기록·출품 로드맵을 한 화면에서 확인해요.</p>
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
          사용자가 이 사이트를 거치며 발전되는 흐름(아이디어→전략→도전→기록→
          자신감)을 보여 준다. 첫 항목 '막막함이 아이디어로'는 같은 날
          '이 문장은 지워줘' 요청으로 삭제했다. 섹션 제목은 같은 날 '글자 지워주고'
          요청으로 빼고 aria-label로만 남겼다. 큰 문장+한 줄 설명의 크기 대비 — 같은 날
          사용자 요청 '글자 크기 대비 효과를 더 극대화'. 배경은 섹션을 칠하지 않아
          회색 캔버스 그라데이션이 그대로 푸터까지 내려온다(2026-10-14 사용자 요청
          '연하늘빛 그레이 그라데이션이 푸터까지 내려오게' — 흰 전환은 푸터가 담당) */}
      <section className="strengths" aria-label="공모온이 특별한 이유">
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
    </div>
  )
}

export default HomePage
