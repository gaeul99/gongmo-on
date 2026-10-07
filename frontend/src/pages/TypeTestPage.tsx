import { useMemo, useState } from 'react'
import {
  CONTEST_TYPES,
  TYPE_TEST_QUESTIONS,
  calculateContestType,
  recommendContestsForType,
} from '../data/contestTypeTest.js'
import { contests } from '../data/mockData.js'
import { deadlineStatus } from '../utils/contestAlerts.js'
import type { TypeIdeaHints } from './IdeaInputPage'
import './TypeTestPage.css'

const LAST_RESULT_KEY = 'gongnabi:type-test'

type LastResult = {
  typeId: string
  percentage?: number
  savedAt: string
  distribution?: ScoreRow[]
}

type ScoreRow = { id: string; percent: number }

type TestResult = {
  type: ContestType
  percentage: number
  distribution: ScoreRow[]
}

function loadLastResult(): LastResult | null {
  try {
    const raw = localStorage.getItem(LAST_RESULT_KEY)
    return raw ? (JSON.parse(raw) as LastResult) : null
  } catch {
    return null
  }
}

function saveLastResult(result: LastResult) {
  try {
    localStorage.setItem(LAST_RESULT_KEY, JSON.stringify(result))
  } catch {
    // 저장에 실패해도 결과 화면 표시에는 지장이 없습니다.
  }
}

type Props = {
  onBack: () => void
  // 결과 유형의 관심 분야와 맞춤 힌트를 입력 화면에 미리 채우면서 분석을 시작합니다.
  onGoInput: (category: string, hints: TypeIdeaHints) => void
}

type Stage = 'intro' | 'quiz' | 'result'

type ContestType = (typeof CONTEST_TYPES)[keyof typeof CONTEST_TYPES]

// localStorage 등 외부에서 온 문자열로 객체를 조회하므로, 유형이 없으면 null을 돌려줍니다.
function getTypeById(typeId: string | null): ContestType | null {
  if (!typeId) return null
  return Object.prototype.hasOwnProperty.call(CONTEST_TYPES, typeId)
    ? CONTEST_TYPES[typeId as keyof typeof CONTEST_TYPES]
    : null
}

function TypeTestPage({ onBack, onGoInput }: Props) {
  const [stage, setStage] = useState<Stage>('intro')
  const [answers, setAnswers] = useState<(number | null)[]>(() =>
    TYPE_TEST_QUESTIONS.map(() => null),
  )
  const [result, setResult] = useState<TestResult | null>(null)
  const [lastResult, setLastResult] = useState<LastResult | null>(loadLastResult)
  const [copyMessage, setCopyMessage] = useState<string | null>(null)

  // 답하지 않은 첫 문항이 현재 문항입니다. 전부 답했으면 마지막 문항을 가리킵니다.
  const firstEmpty = answers.findIndex((answer) => answer === null)
  const current = firstEmpty === -1 ? TYPE_TEST_QUESTIONS.length - 1 : firstEmpty
  const progress = answers.filter((answer) => answer !== null).length

  const resultType = result?.type ?? null
  const resultTypeId = result?.type.id ?? null
  const synergyType = result ? getTypeById(result.type.synergy.typeId) : null
  const lastType = lastResult ? getTypeById(lastResult.typeId) : null
  const recommendations = useMemo(
    () => (resultTypeId ? recommendContestsForType(resultTypeId, contests, 3) : []),
    [resultTypeId],
  )

  const startQuiz = () => {
    setAnswers(TYPE_TEST_QUESTIONS.map(() => null))
    setResult(null)
    setCopyMessage(null)
    setStage('quiz')
  }

  const chooseOption = (optionIndex: number) => {
    const next = [...answers]
    next[current] = optionIndex
    setAnswers(next)
    if (next.every((answer) => answer !== null)) {
      const { type, percentage, distribution } = calculateContestType(next as number[])
      const record: LastResult = {
        typeId: type.id,
        percentage,
        savedAt: new Date().toISOString().slice(0, 10),
        distribution: distribution.map(({ id, percent }) => ({ id, percent })),
      }
      saveLastResult(record)
      setLastResult(record)
      setResult({ type, percentage, distribution })
      setStage('result')
    }
  }

  const goPrev = () => {
    if (current === 0) return
    const next = [...answers]
    next[current - 1] = null
    setAnswers(next)
  }

  const viewLastResult = () => {
    if (!lastResult) return
    const type = getTypeById(lastResult.typeId)
    if (!type) return
    setCopyMessage(null)
    setResult({
      type,
      percentage: lastResult.percentage ?? 0,
      distribution: lastResult.distribution ?? [],
    })
    setStage('result')
  }

  const copyResult = async () => {
    if (!resultType) return
    const text = `나의 공내비 공모전 유형은 ${resultType.emoji} ${resultType.name}!\n"${resultType.tagline}"\n${resultType.description}\n\n나에게 맞는 공모전이 궁금하다면 공내비에서 유형 검사를 해 보세요.`
    try {
      await navigator.clipboard.writeText(text)
      setCopyMessage('결과를 복사했어요. 원하는 곳에 붙여 넣어 보세요!')
    } catch {
      setCopyMessage('복사에 실패했어요. 브라우저 설정을 확인해 주세요.')
    }
  }

  return (
    <div className="type-test-page">
      {stage !== 'quiz' && (
        <button type="button" className="back-button" onClick={onBack}>
          ← 홈으로
        </button>
      )}

      {stage === 'intro' && (
        <>
          <header className="type-test-header">
            <p className="type-test-badge">공모전 유형 검사</p>
            <h1>나는 어떤 공모전 유형?</h1>
            <p className="type-test-caption">
              아직 아이디어가 없어도 괜찮아요. 나의 공모전 스타일을 알아보고,
              지금 접수 중인 공모전 중 어울리는 곳을 추천받아 보세요.
            </p>
          </header>
          <section className="type-test-panel type-test-intro">
            <ul className="type-test-points">
              <li>총 {TYPE_TEST_QUESTIONS.length}문항 · 약 3분</li>
              <li>결과는 7가지 공내비 유형 중 하나 + 성향 일치율</li>
              <li>결과 화면에서 접수 중인 공모전 3곳을 추천</li>
            </ul>
            {lastType && lastResult && (
              <button
                type="button"
                className="type-test-last-result"
                onClick={viewLastResult}
              >
                지난 결과 보기 · {lastType.emoji} {lastType.name} ({lastResult.savedAt})
              </button>
            )}
            <button type="button" className="type-test-start" onClick={startQuiz}>
              검사 시작하기
            </button>
          </section>
        </>
      )}

      {stage === 'quiz' && (
        <>
          <div className="type-test-progress">
            <div className="type-test-progress-bar" aria-hidden="true">
              <span
                style={{ width: `${(progress / TYPE_TEST_QUESTIONS.length) * 100}%` }}
              />
            </div>
            <p className="type-test-progress-text">
              {current + 1} / {TYPE_TEST_QUESTIONS.length}
            </p>
          </div>
          <div className="type-test-panel type-test-question" key={TYPE_TEST_QUESTIONS[current].id}>
            <p className="type-test-question-text">{TYPE_TEST_QUESTIONS[current].question}</p>
            <div className="type-test-options">
              {TYPE_TEST_QUESTIONS[current].options.map((option, index) => (
                <button
                  type="button"
                  key={option.text}
                  className="type-test-option"
                  onClick={() => chooseOption(index)}
                >
                  <span className="type-test-option-index">{index + 1}</span>
                  {option.text}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="type-test-prev"
              onClick={goPrev}
              disabled={current === 0}
            >
              ← 이전 문항
            </button>
          </div>
        </>
      )}

      {stage === 'result' && result && (
        <>
          <header className="type-test-header">
            <p className="type-test-badge">나의 공내비 유형</p>
          </header>
          <section className="type-test-result-card">
            <p className="type-test-result-emoji" aria-hidden="true">
              {result.type.emoji}
            </p>
            <h1 className="type-test-result-name">{result.type.name}</h1>
            <p className="type-test-result-tagline">{result.type.tagline}</p>
            {result.percentage > 0 && (
              <p className="type-test-result-percent">
                성향 일치율 <b>{result.percentage}%</b>
              </p>
            )}
            <p className="type-test-result-description">{result.type.description}</p>
          </section>
          {result.distribution.length > 0 && (
            <section className="type-test-panel">
              <h2 className="type-test-panel-title">나의 유형 분포</h2>
              <p className="type-test-panel-caption">
                응답 점수를 100%로 환산한 성향 비율이에요. 점수가 낮게 나와도 응답 중 가장 가까운
                유형이 결과예요.
              </p>
              <div className="type-test-score-list">
                {result.distribution.map((row) => {
                  const rowType = getTypeById(row.id)
                  return (
                    <div
                      key={row.id}
                      className={`type-test-score-row${
                        row.id === result.type.id ? ' is-top' : ''
                      }`}
                    >
                      <span className="type-test-score-name">
                        {rowType ? `${rowType.emoji} ${rowType.name}` : row.id}
                      </span>
                      <span className="type-test-score-track">
                        <span style={{ width: `${row.percent}%` }} />
                      </span>
                      <span className="type-test-score-pct">{row.percent}%</span>
                    </div>
                  )
                })}
              </div>
            </section>
          )}
          <section className="type-test-panel">
            <h2 className="type-test-panel-title">상세 분석</h2>
            <div className="type-test-analysis">
              <div className="type-test-analysis-block is-strength">
                <h3>이런 강점이 있어요</h3>
                <ul>
                  {result.type.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="type-test-analysis-block is-watchout">
                <h3>이건 조심하세요</h3>
                <ul>
                  {result.type.watchouts.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <p className="type-test-role">
                <span>팀에서의 역할</span>
                {result.type.teamRole}
              </p>
            </div>
          </section>
          <section className="type-test-panel">
            <h2 className="type-test-panel-title">이 유형의 준비 로드맵</h2>
            <p className="type-test-panel-caption">출품 전에 이 순서대로만 따라가 봐요.</p>
            <ol className="type-test-roadmap">
              {result.type.roadmap.map((step, index) => (
                <li key={step}>
                  <span className="type-test-roadmap-step">{index + 1}</span>
                  {step}
                </li>
              ))}
            </ol>
          </section>
          {synergyType && (
            <section className="type-test-panel">
              <h2 className="type-test-panel-title">잘 맞는 유형</h2>
              <div className="type-test-synergy">
                <span className="type-test-synergy-emoji" aria-hidden="true">
                  {synergyType.emoji}
                </span>
                <div>
                  <b>{synergyType.name}</b>
                  <p>{result.type.synergy.reason}</p>
                </div>
              </div>
            </section>
          )}
          <section className="type-test-panel">
            <h2 className="type-test-panel-title">공모전 당첨 팁</h2>
            <p className="type-test-tip-text">{result.type.tip}</p>
          </section>
          <section className="type-test-panel">
            <h2 className="type-test-panel-title">이 유형에게 추천하는 공모전</h2>
            <p className="type-test-panel-caption">
              지금 접수 중인 공모전 중에서 골랐어요. 마감일을 확인해 보세요.
            </p>
            <ul className="type-test-contest-list">
              {recommendations.map((contest) => {
                const status = deadlineStatus(contest.deadline)
                return (
                  <li key={contest.id} className="type-test-contest-item">
                    <span className={`type-test-deadline tone-${status.tone}`}>
                      {status.label}
                    </span>
                    <div className="type-test-contest-info">
                      <a href={contest.url} target="_blank" rel="noreferrer">
                        {contest.title} ↗
                      </a>
                      <p>
                        {contest.organizer} · 마감 {contest.deadline}
                      </p>
                    </div>
                  </li>
                )
              })}
            </ul>
          </section>
            <div className="type-test-actions">
              <button
                type="button"
                className="type-test-analyze"
                onClick={() =>
                  onGoInput(result.type.primaryCategory, {
                    typeName: result.type.name,
                    emoji: result.type.emoji,
                    examples: result.type.ideaHints,
                  })
                }
              >
              이 유형으로 아이디어 분석 시작
            </button>
            <div className="type-test-actions-row">
              <button type="button" className="type-test-retry" onClick={startQuiz}>
                다시 검사하기
              </button>
              <button type="button" className="type-test-copy" onClick={copyResult}>
                결과 복사
              </button>
            </div>
          </div>
          {copyMessage && (
            <p className="type-test-copy-message" role="status">
              {copyMessage}
            </p>
          )}
        </>
      )}
    </div>
  )
}

export default TypeTestPage
