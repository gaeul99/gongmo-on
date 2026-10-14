import { useEffect, useMemo, useRef, useState } from 'react'
import { buildMockAnalysis } from '../services/mockAnalysis.js'
import { requestAiAnalysis } from '../services/aiAnalysis.js'
import { buildProposalDraft, proposalFileName, proposalToText } from '../services/proposalDraft.js'
import AppLink from '../components/AppLink'
import InlineAuthPanel from '../components/InlineAuthPanel'
import { referenceCases, winnerArchives } from '../data/mockData.js'
import { useContestPool } from '../data/contestPool.js'
import type { IdeaInput } from './IdeaInputPage'
import type { AppliedContest, AuthResult, User, WishlistContest } from './MyPage'
import type { Analysis, AiAnalysisPayload, AnalysisDetail } from '../types/analysis'
import './ResultPage.css'

const DEMO_NOTICE =
  '데모 결과는 중복 가능성을 계산하지 않아요.\nAI 분석에 성공하면 아이디어에 맞춘 중복 가능성을 알려 드려요.'
const DEMO_TIP =
  '아래 유사 사례 카드의 \'다른 점\'이 차별화 포인트의 재료예요.\n그중 하나를 골라 "비슷한 서비스가 있지만, 유일하게 ○○인 점은 우리만 있습니다" 형태의 한 문장으로 옮겨 보세요. 바로 아래 \'예시로 따라해 보기\'를 펼치면 실제 예시가 나옵니다.'

// 유사 아이디어는 이 유사도 이상인 사례만 보여 줍니다.
const SIMILAR_THRESHOLD = 90

// 추천 공모전은 아이디어와 가장 잘 맞는 순서대로 이 개수만 보여 줍니다.
const RECOMMEND_LIMIT = 4

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

const CHECKLIST_KEY = 'gongmo-on:submission-checklist'

// services/proposalDraft.js가 만드는 제안서 초안의 표시용 형태
type ProposalDraft = {
  title: string
  metaLines: string[]
  sections: Array<{ heading: string; lines: string[] }>
  note: string
}

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
      matchScore: aiContest ? aiContest.matchScore : mockContest.matchScore,
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

  const mockDetail = mock.detail
  const detail: AnalysisDetail = {
    ideaSummary: aiData?.detail?.ideaSummary ?? mockDetail.ideaSummary,
    targetUsers: aiData?.detail?.targetUsers?.length
      ? aiData.detail.targetUsers
      : mockDetail.targetUsers,
    strengths: aiData?.detail?.strengths?.length ? aiData.detail.strengths : mockDetail.strengths,
    improvements: aiData?.detail?.improvements?.length
      ? aiData.detail.improvements
      : mockDetail.improvements,
    judgePoints: aiData?.detail?.judgePoints?.length
      ? aiData.detail.judgePoints
      : mockDetail.judgePoints,
    extensionIdeas: aiData?.detail?.extensionIdeas?.length
      ? aiData.detail.extensionIdeas
      : mockDetail.extensionIdeas,
  }

  return {
    source,
    overallNotice: aiData?.overallNotice ?? DEMO_NOTICE,
    differentiationTip: aiData?.differentiationTip ?? DEMO_TIP,
    detail,
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
  /** 보관함 '다시 보기'로 복원한 분석 결과 스냅숏. 있으면 AI 재요청 없이 바로 표시합니다. */
  initialAnalysis?: Analysis | null
  /** 분석이 끝날 때(성공·데모 폴백 모두) 현재 결과를 넘겨 줍니다. 보관함 스냅숏 갱신에 사용합니다. */
  onAnalysisSettled?: (analysis: Analysis) => void
  onApplyContest: (target: Omit<AppliedContest, 'appliedAt'>) => void
  onToggleWish: (target: Omit<WishlistContest, 'addedAt'>) => void
  onSaveIdea: (analysis: Analysis | null) => void
  onGoMyPage: () => void
  // 앱 안의 공모전 상세 화면으로 이동 — 추천 공모전 카드에서 씁니다.
  onOpenContest: (id: number) => void
  // 이 아이디어로 연습 노트를 만들 때 초안을 넘겨 연습 노트 화면으로 이동합니다.
  onGoNotes: (draft: { title: string; intent: string; diff: string }) => void
  onSignIn: (nickname: string, password: string) => Promise<AuthResult>
  onSignUp: (nickname: string, password: string, email: string, phone: string) => Promise<AuthResult>
}

function ResultPage({
  idea,
  onRestart,
  user,
  appliedContestIds,
  wishlistedContestIds,
  ideaSaved,
  initialAnalysis = null,
  onAnalysisSettled,
  onApplyContest,
  onToggleWish,
  onSaveIdea,
  onGoMyPage,
  onOpenContest,
  onGoNotes,
  onSignIn,
  onSignUp,
}: Props) {
  // 백엔드 AI 분석을 먼저 시도하고, 실패하면 목업 분석으로 대체합니다.
  // 분석이 끝나기 전(analysis === null)에는 '분석 중' 화면을 보여 줍니다.
  // 백엔드가 멈춰 있어도 요청이 실패한 뒤에는 항상 목업 결과로 표시됩니다.
  const [analysis, setAnalysis] = useState<Analysis | null>(initialAnalysis)
  // 보관함 스냅숏을 복원했을 때는 AI를 다시 요청하지 않습니다. '다시 분석하기'를 누르면 재요청합니다.
  const [restored, setRestored] = useState(initialAnalysis !== null)
  // AI 요청 실패 후 사용자가 다시 시도하면 1씩 올라가며 분석을 다시 실행합니다.
  const [attempt, setAttempt] = useState(0)
  // 자동으로 다시 시도할 남은 횟수 — 데모 배너의 자동 재시도 안내에 씁니다.
  const [autoRetriesLeft, setAutoRetriesLeft] = useState(0)
  // 실제 응모 안내(2단계)를 보여 주는 추천 공모전 id. 확정·취소하면 null로 돌아갑니다.
  const [confirmingApplyId, setConfirmingApplyId] = useState<number | null>(null)
  // 차별화 포인트 '예시로 따라해 보기' 패널 펼침 상태
  const [showDiffExample, setShowDiffExample] = useState(false)
  // 인라인 로그인 패널을 보여 주는 추천 공모전 id. 로그인 성공 후 응모 확인으로 이어갑니다.
  const [inlineAuthFor, setInlineAuthFor] = useState<number | null>(null)
  const [checklist, setChecklist] = useState<Record<string, boolean>>(loadChecklist)
  // 추천 후보 풀 — 목업 + 백엔드 자동 등록 공모전. 자동 등록분이 도착하면
  // 분석을 다시 요청해 후보에 합쳐진다.
  const contests = useContestPool()
  // 분석 완료 콜백은 ref로 읽어 의존성 배열에서 뺍니다. 콜백이 바뀔 때마다 분석을
  // 다시 요청하는 무한 반복을 막기 위해서입니다.
  const settledRef = useRef(onAnalysisSettled)
  useEffect(() => {
    settledRef.current = onAnalysisSettled
  })
  const checkedCount = SUBMISSION_CHECKLIST.filter((item) => checklist[item]).length
  // 추천 공모전 — 점수순으로 정렬된 목록에서 가장 잘 맞는 상위 RECOMMEND_LIMIT개만 노출합니다.
  const recommendedContests = analysis ? analysis.contests.slice(0, RECOMMEND_LIMIT) : []

  // 제안서 초안 — 분석이 끝나면 출품용 기획서 양식(문제 정의·기대 효과·실현 계획…)으로 변환
  // proposalDraft.js는 JS 모듈이라 화면 쪽에서 표시용 형태를 타입으로 고정합니다.
  const [proposalOpen, setProposalOpen] = useState(false)
  const [proposalCopied, setProposalCopied] = useState(false)
  const proposalDraft = useMemo<ProposalDraft | null>(
    () => (analysis ? (buildProposalDraft({ idea, analysis }) as ProposalDraft) : null),
    [idea, analysis],
  )

  const handleCopyProposal = async () => {
    if (!proposalDraft) return
    const text = proposalToText(proposalDraft)
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      // 클립보드 API가 막힌 환경(파일로 열기 등)에서는 임시 영역으로 복사합니다.
      const area = document.createElement('textarea')
      area.value = text
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      document.execCommand('copy')
      document.body.removeChild(area)
    }
    setProposalCopied(true)
    window.setTimeout(() => setProposalCopied(false), 2500)
  }

  const handleDownloadProposal = () => {
    if (!proposalDraft) return
    const blob = new Blob([proposalToText(proposalDraft)], { type: 'text/plain;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = proposalFileName(proposalDraft)
    link.click()
    URL.revokeObjectURL(url)
  }

  // 이 아이디어로 연습 노트 만들기 — 기획 의도(입력 설명)를 채워 초안으로 넘깁니다.
  // 차별점은 사용자가 직접 다듬어 적도록 비워 둡니다.
  const handleCreateNote = () => {
    onGoNotes({
      title: idea.title,
      intent: idea.description,
      diff: '',
    })
  }

  useEffect(() => {
    // 보관함 스냅숏을 복원한 경우 AI를 다시 호출하지 않습니다.
    if (restored) return
    let cancelled = false

    const fallback = buildMockAnalysis(idea)

    // 새 분석 결과로 갈아끼웁니다.
    const apply = (merged: Analysis) => {
      setAnalysis(merged)
      settledRef.current?.(merged)
    }

    // 첫 실패로 데모 결과를 보여 준 뒤에도 포기하지 않고 백그라운드에서 두 번 더
    // 시도한다 — 서버 재시작·게이트웨이 순단 같은 일시적 오류는 이 자동 재시도로
    // 회복되고, 성공하면 데모 결과가 AI 결과로 조용히 교체된다. 모두 실패하면
    // 수동 'AI 분석 다시 시도' 버튼에 맡긴다.
    const RETRY_DELAYS_MS = [2_500, 8_000]
    const timers: number[] = []
    let demoShown = false

    const runRequest = (retryIndex: number) => {
      requestAiAnalysis(idea, referenceCases, contests)
        .then((aiData) => {
          if (!cancelled) {
            apply(mergeAnalysis('ai', aiData, fallback))
          }
        })
        .catch(() => {
          if (cancelled) return
          // 서버 미실행·키 미설정·타임아웃 등 어떤 경우에도 목업 결과를 표시합니다.
          if (!demoShown) {
            demoShown = true
            apply(mergeAnalysis('demo', null, fallback))
          }
          const delay = RETRY_DELAYS_MS[retryIndex]
          if (delay !== undefined) {
            setAutoRetriesLeft(RETRY_DELAYS_MS.length - retryIndex)
            timers.push(
              window.setTimeout(() => {
                if (!cancelled) runRequest(retryIndex + 1)
              }, delay),
            )
          } else {
            setAutoRetriesLeft(0)
          }
        })
    }
    runRequest(0)

    return () => {
      cancelled = true
      for (const timer of timers) window.clearTimeout(timer)
    }
    // contests(후보 풀)가 의존성에 있다 — 자동 등록 공모전이 늦게 도착하면
    // 후보에 합쳐진 상태로 분석을 다시 요청한다.
  }, [idea, attempt, restored, contests])

  // 데모 결과로 떨어졌을 때 AI 분석을 다시 요청합니다.
  const retryAnalysis = () => {
    setAnalysis(null)
    setConfirmingApplyId(null)
    setAttempt((n) => n + 1)
  }

  // 보관함 스냅숏을 버리고 AI 분석을 새로 요청합니다.
  const reanalyze = () => {
    setRestored(false)
    setAnalysis(null)
    setConfirmingApplyId(null)
    setAttempt((n) => n + 1)
  }

  return (
    <div className="result-page">
      <header className="result-header" data-reveal>
        {analysis === null ? (
          <p className="result-badge analyzing">분석 중…</p>
        ) : analysis.source === 'ai' ? (
          <p className="result-badge">{restored ? '저장된 AI 분석 결과' : 'AI 분석 결과'}</p>
        ) : (
          <p className="result-badge demo">{restored ? '저장된 데모 결과' : '데모 결과'}</p>
        )}
        <h1>분석 결과</h1>
        <p className="result-caption">
          {analysis === null
            ? '입력하신 아이디어를 분석하고 있어요. 잠시만 기다려 주세요.'
            : analysis.source === 'ai'
              ? 'AI가 입력하신 아이디어를 분석했습니다. 유사 사례·추천 공모전·수상작의 제목·링크 등은 2026년 10월 1일 기준 실제 자료이며, 유사도·추천 점수와 모든 분석 문구는 AI의 참고 의견이므로 제출 전 직접 검토가 필요합니다.'
              : '유사 사례·추천 공모전·수상작의 제목·링크 등은 2026년 10월 1일 기준 실제 자료이며, 유사도·추천 점수와 모든 분석 문구는 입력을 반영해 만든 참고 자료입니다.'}
        </p>
        {analysis === null && (
          <p className="result-loading-hint">
            AI 분석은 최대 30초가 걸릴 수 있어요. 실패하면 데모 결과를 보여 드린 뒤 자동으로 다시 시도해요.
          </p>
        )}
        {analysis?.source === 'demo' && (
          <div className="analysis-retry" role="alert">
            <p className="analysis-retry-title">AI 분석 요청이 실패했어요.</p>
            <p className="analysis-retry-desc">
              백엔드 서버가 꺼져 있거나 일시적인 오류일 수 있어요. 지금은 데모 결과를 보여 드리고
              있어요.
              {autoRetriesLeft > 0 &&
                ` 잠시 뒤 ${autoRetriesLeft}번 더 자동으로 시도하고, 성공하면 AI 결과로 바꿔 드려요.`}
            </p>
            <div className="analysis-retry-actions">
              <button type="button" className="retry-analysis-button" onClick={retryAnalysis}>
                AI 분석 다시 시도
              </button>
              {attempt > 0 && (
                <span className="analysis-retry-count">재시도 {attempt}회</span>
              )}
            </div>
          </div>
        )}
        {analysis !== null && restored && (
          <div className="analysis-retry">
            <p className="analysis-retry-title">저장된 분석 결과를 보여 드리고 있어요.</p>
            <p className="analysis-retry-desc">
              저장해 둔 시점의 결과예요. 최신 상태로 다시 분석하려면 아래 버튼을 눌러 주세요.
            </p>
            <div className="analysis-retry-actions">
              <button type="button" className="retry-analysis-button" onClick={reanalyze}>
                AI로 다시 분석하기
              </button>
            </div>
          </div>
        )}
      </header>

      <section className="result-section" aria-labelledby="my-idea-title" data-reveal>
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
              <button
                type="button"
                className="save-button"
                onClick={() => onSaveIdea(analysis)}
              >
                ＋ 보관함에 저장
              </button>
            )}
          </div>
        </div>
      </section>

      <div className="duplication-notice" role="note" data-reveal>
        <strong>전체 중복 가능성 안내</strong>
        <p>{analysis?.overallNotice ?? '아이디어의 중복 가능성을 분석하고 있어요…'}</p>
      </div>

      <section className="result-section" aria-labelledby="differentiation-title" data-reveal>
        <h2 id="differentiation-title">차별화 포인트 안내</h2>
        <p className="differentiation-text">
          {analysis?.differentiationTip ??
            "유사 사례들의 '다른 점'을 참고해 차별화 포인트를 정리하는 방법을 안내해 드릴게요."}
        </p>
        <button
          type="button"
          className={showDiffExample ? 'diff-example-toggle is-open' : 'diff-example-toggle'}
          onClick={() => setShowDiffExample((open) => !open)}
          aria-expanded={showDiffExample}
        >
          📖 예시로 따라해 보기 {showDiffExample ? '▲' : '▼'}
        </button>
        {showDiffExample && (
          <div className="diff-example">
            <ol className="diff-example-steps">
              <li>
                <strong>예시 아이디어를 정한다</strong>
                <p>반려동물 동반 카페 지도</p>
              </li>
              <li>
                <strong>유사 사례의 '겹치는 점'을 확인한다</strong>
                <p>
                  주변 카페를 검색하는 지도 앱 — 카페 위치·영업시간·리뷰 검색은 이미 있어요.
                </p>
              </li>
              <li>
                <strong>유사 사례의 '다른 점'을 찾는다</strong>
                <p>
                  동반 가능 여부는 리뷰를 하나씩 읽어야 알 수 있어요 → 지도에서 바로 필터로 보여
                  주면 달라집니다.
                </p>
              </li>
              <li>
                <strong>문장 틀에 넣는다</strong>
                <p>비슷한 (서비스)가 있지만, 유일하게 (다른 점)인 점은 우리만 있습니다.</p>
              </li>
              <li>
                <strong>완성!</strong>
                <p className="diff-example-final">
                  "비슷한 카페 검색 앱이 있지만, 반려동물 동반 가능 여부를 리뷰가 아니라 지도에서
                  바로 필터로 확인할 수 있는 점은 저희 서비스만 있습니다."
                </p>
              </li>
            </ol>
            <div className="diff-example-compare">
              <p className="diff-bad">
                ✕ 피해야 할 문장: "저희 앱은 더 편리하고 정확한 정보를 제공합니다." — 무엇이 어떻게
                다른지 없어 심사위원에게 와닿지 않아요.
              </p>
              <p className="diff-good">
                ✓ 위 문장은 '무엇과 비교해 + 무엇이 다른지'가 한눈에 보여 심사에서 힘이 셉니다.
              </p>
            </div>
            <p className="diff-example-note">
              이렇게 정리한 문장은 '연습 노트'의 차별점 칸에 그대로 써 두면 응모 전 심사 연습에도
              쓸 수 있어요.
            </p>
          </div>
        )}
      </section>

      <section className="result-section" aria-labelledby="detail-title" data-reveal>
        <h2 id="detail-title">아이디어 상세 분석</h2>
        {analysis === null ? (
          <div className="analysis-loading" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <p>아이디어를 여러 각도에서 살펴보고 있어요…</p>
          </div>
        ) : (
          <div className="detail-panel">
            <p className="detail-summary">
              <span className="detail-summary-label">한 줄 요약</span>
              {analysis.detail.ideaSummary}
            </p>
            <div className="detail-target">
              <h4>예상 타깃 사용자</h4>
              <ul className="target-chips">
                {analysis.detail.targetUsers.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
            <div className="detail-grid">
              <div className="detail-block">
                <h4>강점</h4>
                <ul>
                  {analysis.detail.strengths.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="detail-block">
                <h4>보완하면 좋은 점</h4>
                <ul>
                  {analysis.detail.improvements.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="detail-block">
                <h4>심사에서 어필할 포인트</h4>
                <ul>
                  {analysis.detail.judgePoints.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="detail-block">
                <h4>확장 아이디어</h4>
                <ul>
                  {analysis.detail.extensionIdeas.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            </div>
            <p className="detail-note">
              분석 문구는 입력 내용을 바탕으로 만든 참고 의견이에요. 제출 전에는 공고 원문을 꼭
              직접 확인하세요.
            </p>
          </div>
        )}
      </section>

      <div className="note-cta" data-reveal>
        <button type="button" className="note-cta-button" onClick={handleCreateNote}>
          🗒️ 이 아이디어로 연습 노트 만들기 →
        </button>
        <p className="note-cta-hint">기획 의도가 채워진 채로 시작돼요.</p>
      </div>

      <section className="result-section proposal-section" aria-labelledby="proposal-title" data-reveal>
        <h2 id="proposal-title">제안서 초안 만들기</h2>
        <p className="proposal-intro">
          <strong>💡 기획서 쓰기가 막막할 때의 초안이에요.</strong> 분석 결과를
          출품용 기획서 목차에 맞춰 뽑아 드려요.
        </p>
        {analysis === null || proposalDraft === null ? (
          <p className="proposal-waiting">분석이 끝나는 대로 분석 내용을 기획서 초안으로 정리해 드릴게요.</p>
        ) : (
          <>
            <p className="proposal-intro">
              미리보기로 확인하고 복사·TXT 내려받기로 가져가, 공고의 양식과
              분량에 맞게 다듬어 제출하세요.
            </p>
            <div className="proposal-actions">
              <button type="button" className="proposal-copy" onClick={handleCopyProposal}>
                {proposalCopied ? '복사 완료!' : '초안 복사하기'}
              </button>
              <button type="button" className="proposal-download" onClick={handleDownloadProposal}>
                TXT 내려받기
              </button>
              <button
                type="button"
                className={proposalOpen ? 'proposal-toggle is-open' : 'proposal-toggle'}
                onClick={() => setProposalOpen((open) => !open)}
                aria-expanded={proposalOpen}
              >
                미리보기 {proposalOpen ? '▲' : '▼'}
              </button>
            </div>
            {proposalOpen && (
              <div className="proposal-preview">
                <p className="proposal-title-line">[제안서 초안] {proposalDraft.title}</p>
                {proposalDraft.metaLines.map((line) => (
                  <p key={line} className="proposal-meta-line">
                    {line}
                  </p>
                ))}
                {proposalDraft.sections.map((section, index) => (
                  <div key={section.heading} className="proposal-block">
                    <h4>
                      {index + 1}. {section.heading}
                    </h4>
                    <ul>
                      {section.lines.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
                <p className="proposal-note">{proposalDraft.note}</p>
              </div>
            )}
          </>
        )}
      </section>

      <div className="similar-layout">
        <section className="result-section similar-main" aria-labelledby="similar-title" data-reveal>
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

      <section className="result-section" aria-labelledby="contest-title" data-reveal>
        <h2 id="contest-title">추천 공모전</h2>
        <p className="contest-subtitle">
          아이디어와 가장 잘 맞는 순서대로 상위 {RECOMMEND_LIMIT}개만 골라 보여 줘요.
        </p>
        {analysis === null ? (
          <div className="analysis-loading" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <p>아이디어와 잘 맞는 공모전을 고르고 있어요…</p>
          </div>
        ) : (
          <>
          <div className="case-list">
            {recommendedContests.map((contest, index) => (
            <article key={contest.id} className="case-card">
              <div className="case-top">
                <div className="case-title-wrap">
                  <span className="case-rank">{index + 1}</span>
                  <h3>{contest.title}</h3>
                </div>
                <span className="case-source">{contest.field}</span>
              </div>
              <div className="case-body">
                <div className="case-detail">
                  <div className="similarity">
                    <span className="similarity-label">적합도 {contest.matchScore}%</span>
                    <div className="similarity-bar">
                      <span style={{ width: `${contest.matchScore}%` }} />
                    </div>
                  </div>
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
                  <div className="case-links">
                    <AppLink
                      className="detail-link detail-link-button"
                      href={`/contest/${contest.id}`}
                      onNavigate={() => onOpenContest(contest.id)}
                    >
                      상세 정보 보기 →
                    </AppLink>
                    <a className="detail-link" href={contest.url} target="_blank" rel="noreferrer">
                      공모전 사이트 ↗
                    </a>
                  </div>
                  <div className="contest-actions">
                    {appliedContestIds.includes(contest.id) ? (
                      <div className="apply-done">
                        <span>응모 완료 ✓</span>
                        <a
                          className="apply-done-site"
                          href={contest.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          실제 제출 확인하기 ↗
                        </a>
                        <AppLink href="/mypage" onNavigate={onGoMyPage}>
                          마이페이지에서 보기 →
                        </AppLink>
                        <p className="apply-done-note">
                          위 기록은 앱 안의 응모 목록 표시예요. 실제 접수 여부는 공모전
                          사이트에서 확인하세요.
                        </p>
                      </div>
                    ) : user && confirmingApplyId === contest.id ? (
                      <div className="apply-confirm" role="group" aria-label="응모 확인">
                        <p className="apply-confirm-title">
                          실제 응모는 공모전 사이트에서 제출해요.
                        </p>
                        <ol className="apply-confirm-steps">
                          <li>먼저 공모전 사이트에 접속해 제출을 마쳐 주세요.</li>
                          <li>
                            제출이 끝나면 '제출했어요'를 눌러 내 응모 목록에 기록하세요.
                          </li>
                        </ol>
                        <div className="apply-confirm-actions">
                          <a
                            className="apply-confirm-site"
                            href={contest.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            공모전 사이트 열기 ↗
                          </a>
                          <button
                            type="button"
                            className="apply-button"
                            onClick={() => {
                              onApplyContest({
                                id: contest.id,
                                title: contest.title,
                                organizer: contest.organizer,
                                deadline: contest.deadline,
                                url: contest.url,
                              })
                              setConfirmingApplyId(null)
                            }}
                          >
                            제출했어요 — 완료로 표시
                          </button>
                          <button
                            type="button"
                            className="apply-confirm-cancel"
                            onClick={() => setConfirmingApplyId(null)}
                          >
                            취소
                          </button>
                        </div>
                      </div>
                    ) : user ? (
                      <button
                        type="button"
                        className="apply-button"
                        onClick={() => setConfirmingApplyId(contest.id)}
                      >
                        이 공모전 응모하기
                      </button>
                    ) : inlineAuthFor === contest.id ? (
                      <InlineAuthPanel
                        onSignIn={onSignIn}
                        onSignUp={onSignUp}
                        contextNote="응모하려면 로그인이 필요해요."
                        onAuthed={() => {
                          setInlineAuthFor(null)
                          setConfirmingApplyId(contest.id)
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="apply-button"
                        onClick={() => setInlineAuthFor(contest.id)}
                      >
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
          </>
        )}
      </section>

      <section className="result-section checklist-section" aria-labelledby="checklist-title" data-reveal>
        <h2 id="checklist-title">제출 전 자가 점검</h2>
        <p className="checklist-caption">
          제출 전 하나씩 확인해 보세요. 기록은 이 브라우저에만 저장돼요.
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

      <div className="result-actions" data-reveal>
        <button type="button" className="restart-button" onClick={onRestart}>
          ← 아이디어 다시 입력하기
        </button>
      </div>
    </div>
  )
}

export default ResultPage
