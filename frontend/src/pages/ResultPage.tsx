import { useEffect, useState } from 'react'
import { buildMockAnalysis } from '../services/mockAnalysis.js'
import { requestAiAnalysis } from '../services/aiAnalysis.js'
import { contests, referenceCases, winnerArchives } from '../data/mockData.js'
import type { IdeaInput } from './IdeaInputPage'
import type { AppliedContest, User, WishlistContest } from './MyPage'
import './ResultPage.css'

// 유사 사례(실제 공모전 데이터 + 분석 문구) 한 건
type SimilarCase = {
  id: number
  title: string
  organizer: string
  domain: string
  image: string
  url: string
  source: string
  similarity: number
  summary: string
  overlap: string[]
  difference: string
}

// 추천 공모전(실제 데이터 + 추천 문구) 한 건
type AnalyzedContest = {
  id: number
  title: string
  organizer: string
  field: string
  deadline: string
  eligibility: string
  image: string
  url: string
  matchReason: string
}

type Analysis = {
  source: 'ai' | 'demo'
  overallNotice: string
  differentiationTip: string
  similarCases: SimilarCase[]
  contests: AnalyzedContest[]
}

// 백엔드 AI 응답 (services/aiAnalysis.js는 JS라 타입을 여기서 정의합니다)
type AiAnalysisPayload = {
  overallNotice?: string
  differentiationTip?: string
  similarCases?: {
    id: number
    similarity: number
    summary: string
    overlap: string[]
    difference: string
  }[]
  contests?: {
    id: number
    matchScore: number
    matchReason: string
  }[]
}

const DEMO_NOTICE = '유사 사례를 참고해 차별화 요소를 검토하세요.'
const DEMO_TIP =
  "아래 유사 사례들의 '다른 점'을 참고해, 내 아이디어만의 차별화 포인트를 1~2개 문장으로 정리해 보세요. '왜 이 아이디어인지'가 명확할수록 공모전 심사에서 좋은 평가를 받습니다."

// 유사 아이디어는 이 유사도 이상인 사례만 보여 줍니다.
const SIMILAR_THRESHOLD = 90

// 제출 전 자가 점검 항목 — 응모 버튼을 누르기 전 확인용 체크리스트
const SUBMISSION_CHECKLIST = [
  '접수 자격 요건(대상·지역·학력)을 확인했어요',
  '주최 측 공고문의 평가 기준을 읽었어요',
  '제출 형식(파일 종류·용량·페이지 수)을 맞췄어요',
  '제목과 파일명에 팀명·작품명을 표기했어요',
  '폰트·이미지 출처 등 저작권을 점검했어요',
  '마감 시간(날짜·시각)을 다시 확인했어요',
  '동료나 친구에게 초안 피드백을 받았어요',
  '제출 증명(접수 확인 메일·화면)을 캡처했어요',
]

const CHECKLIST_KEY = 'idea-navigation:submission-checklist'

function loadChecklist(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(CHECKLIST_KEY)
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {}
  } catch {
    return {}
  }
}

function saveChecklist(checklist: Record<string, boolean>) {
  try {
    localStorage.setItem(CHECKLIST_KEY, JSON.stringify(checklist))
  } catch {
    // 저장 실패 시에도 화면 동작에는 지장 없습니다.
  }
}

// AI 분석 결과를 실제 데이터(제목·링크·이미지)에 덧씌웁니다.
// AI 응답에 빠진 항목은 목업 분석 값으로 채워 항상 목록이 완전하게 유지됩니다.
function mergeAnalysis(
  source: 'ai' | 'demo',
  aiData: AiAnalysisPayload | null,
  mock: ReturnType<typeof buildMockAnalysis>,
): Analysis {
  const similarCases = mock.similarCases.map((mockCase) => {
    const aiCase = aiData?.similarCases?.find((item) => item.id === mockCase.id)
    return {
      ...mockCase,
      similarity: aiCase ? aiCase.similarity : mockCase.similarity,
      summary: aiCase?.summary ?? mockCase.summary,
      overlap: aiCase ? aiCase.overlap : mockCase.overlap,
      difference: aiCase?.difference ?? mockCase.difference,
    }
  })

  const contestsMerged = mock.contests.map((mockContest) => {
    const aiContest = aiData?.contests?.find((item) => item.id === mockContest.id)
    return {
      ...mockContest,
      matchReason: aiContest?.matchReason ?? mockContest.matchReason,
    }
  })

  if (aiData) {
    // AI가 매긴 적합도 점수로 추천 공모전 순서를 다시 정합니다.
    const scoreById = new Map(
      (aiData.contests ?? []).map((item) => [item.id, item.matchScore] as const),
    )
    contestsMerged.sort((a, b) => (scoreById.get(b.id) ?? 0) - (scoreById.get(a.id) ?? 0))
  }

  return {
    source,
    overallNotice: aiData?.overallNotice ?? DEMO_NOTICE,
    differentiationTip: aiData?.differentiationTip ?? DEMO_TIP,
    similarCases,
    contests: contestsMerged,
  }
}

type Props = {
  idea: IdeaInput
  onRestart: () => void
  user: User | null
  appliedContestIds: number[]
  wishlistedContestIds: number[]
  ideaSaved: boolean
  onApplyContest: (target: Omit<AppliedContest, 'appliedAt'>) => void
  onToggleWish: (target: Omit<WishlistContest, 'addedAt'>) => void
  onSaveIdea: () => void
  onGoMyPage: () => void
}

function ResultPage({
  idea,
  onRestart,
  user,
  appliedContestIds,
  wishlistedContestIds,
  ideaSaved,
  onApplyContest,
  onToggleWish,
  onSaveIdea,
  onGoMyPage,
}: Props) {
  // 백엔드 AI 분석을 먼저 시도하고, 실패하면 목업 분석으로 대체합니다.
  // 분석이 끝나기 전(analysis === null)에는 '분석 중' 화면을 보여 줍니다.
  // 백엔드가 멈춰 있어도 요청이 실패한 뒤에는 항상 목업 결과로 표시됩니다.
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [checklist, setChecklist] = useState<Record<string, boolean>>(loadChecklist)
  const checkedCount = SUBMISSION_CHECKLIST.filter((item) => checklist[item]).length

  useEffect(() => {
    // 결과 화면은 아이디어가 바뀔 때마다 새로 마운트되므로 state는 항상 null에서 시작합니다.
    let cancelled = false

    const fallback = buildMockAnalysis(idea)

    requestAiAnalysis(idea, referenceCases, contests)
      .then((aiData) => {
        if (!cancelled) setAnalysis(mergeAnalysis('ai', aiData, fallback))
      })
      .catch(() => {
        // 서버 미실행·키 미설정·타임아웃 등 어떤 경우에도 목업 결과를 표시합니다.
        if (!cancelled) setAnalysis(mergeAnalysis('demo', null, fallback))
      })

    return () => {
      cancelled = true
    }
  }, [idea])

  return (
    <div className="result-page">
      <header className="result-header">
        {analysis === null ? (
          <p className="result-badge analyzing">분석 중…</p>
        ) : analysis.source === 'ai' ? (
          <p className="result-badge">AI 분석 결과</p>
        ) : (
          <p className="result-badge demo">데모 결과</p>
        )}
        <h1>분석 결과</h1>
        <p className="result-caption">
          {analysis === null
            ? '입력하신 아이디어를 분석하고 있어요. 잠시만 기다려 주세요.'
            : analysis.source === 'ai'
              ? 'AI가 입력하신 아이디어를 분석했습니다. 유사 사례·추천 공모전·수상작의 제목·링크 등은 2026년 10월 1일 기준 실제 자료이며, 유사도·추천 점수와 모든 분석 문구는 AI의 참고 의견이므로 제출 전 직접 검토가 필요합니다.'
              : '백엔드 서버에 연결하지 못해 예시 분석을 보여 드려요. 유사 사례·추천 공모전·수상작의 제목·링크 등은 2026년 10월 1일 기준 실제 자료이며, 유사도·추천 점수와 모든 분석 문구는 입력을 반영해 만든 참고 자료입니다.'}
        </p>
      </header>

      <section className="result-section" aria-labelledby="my-idea-title">
        <h2 id="my-idea-title">내 아이디어</h2>
        <div className="idea-card">
          <h3>{idea.title}</h3>
          <p className="idea-description">{idea.description}</p>
          <div className="idea-card-footer">
            {idea.category && (
              <span className="idea-category">관심 분야: {idea.category}</span>
            )}
            {ideaSaved ? (
              <span className="save-done">보관함에 저장됨 ✓</span>
            ) : (
              <button type="button" className="save-button" onClick={onSaveIdea}>
                ＋ 보관함에 저장
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="duplication-notice" role="note">
        <strong>전체 중복 가능성 안내</strong>
        <p>{analysis?.overallNotice ?? '아이디어의 중복 가능성을 분석하고 있어요…'}</p>
      </div>

      <section className="result-section" aria-labelledby="differentiation-title">
        <h2 id="differentiation-title">차별화 포인트 안내</h2>
        <p className="differentiation-text">
          {analysis?.differentiationTip ??
            "유사 사례들의 '다른 점'을 참고해 차별화 포인트를 정리하는 방법을 안내해 드릴게요."}
        </p>
      </section>

      <div className="similar-layout">
        <section className="result-section similar-main" aria-labelledby="similar-title">
          <h2 id="similar-title">유사 아이디어·수상작</h2>
          {analysis === null ? (
            <div className="analysis-loading" role="status">
              <span className="loading-spinner" aria-hidden="true" />
              <p>AI가 입력하신 아이디어와 실제 공모전 사례를 비교 분석하고 있어요…</p>
            </div>
          ) : analysis.similarCases.some((item) => item.similarity >= SIMILAR_THRESHOLD) ? (
            <div className="case-list">
              <p className="similar-threshold">
                유사도 {SIMILAR_THRESHOLD}% 이상인 사례만 표시해요.
              </p>
              {analysis.similarCases
                .filter((item) => item.similarity >= SIMILAR_THRESHOLD)
                .map((item) => (
                <article key={item.id} className="case-card">
                  <div className="case-top">
                    <h3>{item.title}</h3>
                    <span className="case-source">{item.source}</span>
                  </div>
                  <div className="case-body">
                    <div className="case-detail">
                      <div className="similarity">
                        <span className="similarity-label">유사도 {item.similarity}%</span>
                        <div className="similarity-bar">
                          <span style={{ width: `${item.similarity}%` }} />
                        </div>
                      </div>
                      <p className="case-summary">{item.summary}</p>
                      <div className="case-block">
                        <h4>겹치는 점</h4>
                        <ul>
                          {item.overlap.map((point) => (
                            <li key={point}>{point}</li>
                          ))}
                        </ul>
                      </div>
                      <div className="case-block">
                        <h4>다른 점</h4>
                        <p>{item.difference}</p>
                      </div>
                      <a className="detail-link" href={item.url} target="_blank" rel="noreferrer">
                        관련 사이트 보기 ↗
                      </a>
                    </div>
                    <img
                      className="case-image"
                      src={item.image}
                      alt={`${item.title} 공모전 포스터`}
                      loading="lazy"
                    />
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <div className="similar-empty" role="note">
              <strong>유사도 {SIMILAR_THRESHOLD}% 이상인 공개 사례가 없어요.</strong>
              <p>
                공개된 수상·공모 사례 중 지금 아이디어와 크게 겹치는 것이 없다는 뜻이에요. 옆의
                '지난 공모전 수상작'을 참고해 내 아이디어만의 차별화 포인트를 다듬어 보세요.
              </p>
            </div>
          )}
        </section>

        <aside className="result-section archive-side" aria-labelledby="archive-title">
          <h2 id="archive-title">지난 공모전 수상작 모아보기</h2>
          <ul className="archive-links">
            {winnerArchives.map((archive) => (
              <li key={archive.id}>
                <a href={archive.url} target="_blank" rel="noreferrer">
                  {archive.title}
                  <span className="archive-organizer">{archive.organizer}</span>
                </a>
              </li>
            ))}
          </ul>
        </aside>
      </div>

      <section className="result-section" aria-labelledby="contest-title">
        <h2 id="contest-title">추천 공모전</h2>
        {analysis === null ? (
          <div className="analysis-loading" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <p>아이디어와 잘 맞는 공모전을 고르고 있어요…</p>
          </div>
        ) : (
          <div className="case-list">
            {analysis.contests.map((contest) => (
            <article key={contest.id} className="case-card">
              <div className="case-top">
                <h3>{contest.title}</h3>
                <span className="case-source">{contest.field}</span>
              </div>
              <div className="case-body">
                <div className="case-detail">
                  <dl className="contest-info">
                    <div>
                      <dt>주최</dt>
                      <dd>{contest.organizer}</dd>
                    </div>
                    <div>
                      <dt>마감일</dt>
                      <dd>{contest.deadline}</dd>
                    </div>
                    <div>
                      <dt>참가 대상</dt>
                      <dd>{contest.eligibility}</dd>
                    </div>
                  </dl>
                  <p className="case-summary">{contest.matchReason}</p>
                  <a className="detail-link" href={contest.url} target="_blank" rel="noreferrer">
                    공모전 페이지 열기 ↗
                  </a>
                  <div className="contest-actions">
                    {appliedContestIds.includes(contest.id) ? (
                      <div className="apply-done">
                        <span>응모 완료 ✓</span>
                        <button type="button" onClick={onGoMyPage}>
                          마이페이지에서 보기 →
                        </button>
                      </div>
                    ) : user ? (
                      <button
                        type="button"
                        className="apply-button"
                        onClick={() =>
                          onApplyContest({
                            id: contest.id,
                            title: contest.title,
                            organizer: contest.organizer,
                            deadline: contest.deadline,
                            url: contest.url,
                          })
                        }
                      >
                        이 공모전 응모하기
                      </button>
                    ) : (
                      <button type="button" className="apply-button" onClick={onGoMyPage}>
                        로그인하고 응모하기
                      </button>
                    )}
                    <button
                      type="button"
                      className={
                        wishlistedContestIds.includes(contest.id)
                          ? 'wish-button active'
                          : 'wish-button'
                      }
                      onClick={() =>
                        onToggleWish({
                          id: contest.id,
                          title: contest.title,
                          organizer: contest.organizer,
                          deadline: contest.deadline,
                          url: contest.url,
                        })
                      }
                    >
                      {wishlistedContestIds.includes(contest.id)
                        ? '★ 관심 목록에 저장됨'
                        : '☆ 관심 목록에 추가'}
                    </button>
                  </div>
                </div>
                <img
                  className="case-image"
                  src={contest.image}
                  alt={`${contest.title} 공모전 포스터`}
                  loading="lazy"
                />
              </div>
            </article>
            ))}
          </div>
        )}
      </section>

      <section className="result-section checklist-section" aria-labelledby="checklist-title">
        <h2 id="checklist-title">제출 전 자가 점검</h2>
        <p className="checklist-caption">
          응모 버튼을 누르기 전에 하나씩 확인해 보세요. 체크 기록은 이 브라우저에 저장돼요.
        </p>
        <div
          className="checklist-progress"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={SUBMISSION_CHECKLIST.length}
          aria-valuenow={checkedCount}
          aria-label="자가 점검 진행률"
        >
          <div className="checklist-progress-track">
            <span style={{ width: `${(checkedCount / SUBMISSION_CHECKLIST.length) * 100}%` }} />
          </div>
          <span className="checklist-progress-label">
            {checkedCount}/{SUBMISSION_CHECKLIST.length}
          </span>
        </div>
        {checkedCount === SUBMISSION_CHECKLIST.length && (
          <p className="checklist-complete" role="status">
            제출 준비 완료! 마감 시간만 다시 한 번 확인하고 내세요.
          </p>
        )}
        <ul className="checklist">
          {SUBMISSION_CHECKLIST.map((item) => (
            <li key={item}>
              <label className={checklist[item] ? 'checked' : ''}>
                <input
                  type="checkbox"
                  checked={!!checklist[item]}
                  onChange={() => {
                    const next = { ...checklist, [item]: !checklist[item] }
                    setChecklist(next)
                    saveChecklist(next)
                  }}
                />
                {item}
              </label>
            </li>
          ))}
        </ul>
        {checkedCount > 0 && (
          <button
            type="button"
            className="checklist-reset"
            onClick={() => {
              setChecklist({})
              saveChecklist({})
            }}
          >
            점검 처음부터 다시 하기
          </button>
        )}
      </section>

      <div className="result-actions">
        <button type="button" className="restart-button" onClick={onRestart}>
          ← 아이디어 다시 입력하기
        </button>
      </div>
    </div>
  )
}

export default ResultPage
