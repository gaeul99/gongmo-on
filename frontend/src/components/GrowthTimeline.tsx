// ==========================================================
// 성장 타임라인 — 공모전 준비 여정을 5걸음 체크로 보여 주는 진행 트래커.
// (아이디어 분석 → 유형 검사 → 공모전 응모 → 결과 기록 → 수상)
// 도전 히스토리가 '결과의 요약'이라면 이 컴포넌트는 '과정의 체크'다.
// 지금 서 있는 걸음을 표시해 다음에 뭘 하면 되는지 한눈에 알려 준다.
// 유형 검사 결과는 localStorage('gongmo-on:type-test')를 렌더 때마다 다시 읽어
// 로그인 직후 서버 복원으로 갱신된 값도 곧바로 반영한다.
// ==========================================================
import type { AppliedContest, SavedIdea } from '../pages/MyPage'
import { CONTEST_TYPES } from '../data/contestTypeTest.js'
import { STORAGE_KEYS } from '../utils/storageKeys.js'
import './GrowthTimeline.css'

type Props = {
  myContests: AppliedContest[]
  savedIdeas: SavedIdea[]
}

// TypeTestPage가 저장하는 실제 스키마(typeId + 백분율)와 맞춘다.
// 유형 이름·이모지는 CONTEST_TYPES에서 typeId로 되찾는다.
type TypeTestSaved = {
  typeId: string
  percentage?: number
  savedAt: string
}

function readTypeTest(): (TypeTestSaved & { emoji: string; name: string }) | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEYS.typeTest)
    if (!raw) return null
    const parsed = JSON.parse(raw) as TypeTestSaved
    if (!parsed?.typeId) return null
    if (!Object.prototype.hasOwnProperty.call(CONTEST_TYPES, parsed.typeId)) return null
    const meta = CONTEST_TYPES[parsed.typeId as keyof typeof CONTEST_TYPES]
    if (!meta?.name) return null
    return { ...parsed, emoji: meta.emoji, name: meta.name }
  } catch {
    return null
  }
}

function GrowthTimeline({ myContests, savedIdeas }: Props) {
  const typeTest = readTypeTest()
  const recorded = myContests.filter((contest) => contest.resultAt)
  const won = myContests.some((contest) => contest.result === 'won')
  const progress = myContests.filter((contest) => contest.result !== 'lost').length
  const latest = myContests[0]

  const steps = [
    {
      id: 'idea',
      label: '아이디어 분석',
      done: savedIdeas.length > 0,
      status:
        savedIdeas.length > 0
          ? `보관한 아이디어 ${savedIdeas.length}개`
          : '분석 결과를 보관하면 첫 걸음이 기록돼요',
    },
    {
      id: 'type',
      label: '유형 검사',
      done: typeTest !== null,
      status:
        typeTest !== null
          ? `${typeTest.emoji} ${typeTest.name} · ${typeTest.savedAt}`
          : '30초 만에 나의 공모전 유형을 찾아 보세요',
    },
    {
      id: 'apply',
      label: '공모전 응모',
      done: myContests.length > 0,
      status:
        myContests.length > 0
          ? `응모 ${myContests.length}개${latest ? ` · 최근 ${latest.appliedAt}` : ''}`
          : '분석 결과나 추천에서 마음에 드는 공모전에 응모해 보세요',
    },
    {
      id: 'result',
      label: '결과 기록',
      done: recorded.length > 0,
      status:
        recorded.length > 0
          ? `${recorded.length}/${myContests.length} 기록 완료`
          : myContests.length > 0
            ? '마이페이지 응모 카드에서 결과를 기록해 보세요'
            : '응모 후 결과를 기록하면 도전 히스토리에 쌓여요',
    },
    {
      id: 'won',
      label: '수상 경험',
      done: won,
      status: won ? '수상을 축하해요! 다음 도전도 응원해요' : '첫 수상을 노려 보세요',
    },
  ]

  // 아직 못 밟은 첫 걸음이 '지금 할 일'이 됩니다.
  const activeIndex = steps.findIndex((step) => !step.done)

  return (
    <section className="growth-timeline" aria-label="성장 타임라인">
      <div className="panel-head">
        <h2>성장 타임라인</h2>
        <span className="panel-hint">공모전 준비 5걸음 · 지금 어디쯤 왔는지 체크해 보세요</span>
      </div>
      <ol className="growth-steps">
        {steps.map((step, index) => (
          <li
            key={step.id}
            className={[
              'growth-step',
              step.done ? 'is-done' : '',
              index === activeIndex ? 'is-active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
          >
            <span className="growth-marker" aria-hidden="true">
              {step.done ? '✓' : index + 1}
            </span>
            <div className="growth-body">
              <p className="growth-label">
                {step.label}
                {index === activeIndex && <span className="growth-now">지금 할 일</span>}
              </p>
              <p className="growth-status">{step.status}</p>
            </div>
          </li>
        ))}
      </ol>
      <p className="growth-summary">
        {myContests.length > 0
          ? `도전 중 ${progress} · 완료 ${steps.filter((step) => step.done).length}/5 걸음`
          : `완료 ${steps.filter((step) => step.done).length}/5 걸음 · 다음 걸음으로 가볼까요?`}
      </p>
    </section>
  )
}

export default GrowthTimeline
