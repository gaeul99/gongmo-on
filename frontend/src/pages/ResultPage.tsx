import { useEffect, useMemo, useRef, useState } from 'react'
import { buildMockAnalysis } from '../services/mockAnalysis.js'
import { requestAiAnalysis } from '../services/aiAnalysis.js'
import { buildProposalDraft, proposalToText } from '../services/proposalDraft.js'
import AppLink from '../components/AppLink'
import InlineAuthPanel from '../components/InlineAuthPanel'
import { contests, referenceCases, winnerArchives } from '../data/mockData.js'
import type { IdeaInput } from './IdeaInputPage'
import type { AppliedContest, AuthResult, User, WishlistContest } from './MyPage'
import type { Analysis, AiAnalysisPayload, AnalysisDetail } from '../types/analysis'
import './ResultPage.css'

const DEMO_NOTICE =
  '데모 결과는 중복 가능성을 수치로 계산하지 않아요. 아래 유사 사례들과 겹치는 부분이 많은지 직접 확인해 보세요.\nAI 분석에 성공하면 입력한 아이디어에 맞춘 중복 가능성을 알려 드려요.'
const DEMO_TIP =
  '아래 유사 사례 카드의 \'다른 점\'이 차별화 포인트의 재료예요.\n그중 하나를 골라 "비슷한 서비스가 있지만, 유일하게 ○○인 점은 우리만 있습니다" 형태의 한 문장으로 옮겨 보세요. 바로 아래 \'예시로 따라해 보기\'를 펼치면 실제 예시가 나옵니다.'

// 유사 아이디어는 이 유사도 이상인 사례만 보여 줍니다.
const SIMILAR_THRESHOLD = 90

// 추천 공모전이 많을 때 한 페이지에 보여 줄 카드 수
const CONTESTS_PER_PAGE = 6

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
  // 실제 응모 안내(2단계)를 보여 주는 추천 공모전 id. 확정·취소하면 null로 돌아갑니다.
  const [confirmingApplyId, setConfirmingApplyId] = useState<number | null>(null)
  // 차별화 포인트 '예시로 따라해 보기' 패널 펼침 상태
  const [showDiffExample, setShowDiffExample] = useState(false)
  // 인라인 로그인 패널을 보여 주는 추천 공모전 id. 로그인 성공 후 응모 확인으로 이어갑니다.
  const [inlineAuthFor, setInlineAuthFor] = useState<number | null>(null)
  const [checklist, setChecklist] = useState<Record<string, boolean>>(loadChecklist)
  // 분석 완료 콜백은 ref로 읽어 의존성 배열에서 뺍니다. 콜백이 바뀔 때마다 분석을
  // 다시 요청하는 무한 반복을 막기 위해서입니다.
  const settledRef = useRef(onAnalysisSettled)
  useEffect(() => {
    settledRef.current = onAnalysisSettled
  })
  // 추천 공모전 페이지네이션 — 현재 보고 있는 페이지(1부터 시작)
  const [contestPage, setContestPage] = useState(1)
  const checkedCount = SUBMISSION_CHECKLIST.filter((item) => checklist[item]).length
  // 현재 페이지에 보여 줄 추천 공모전 목록
  const pagedContests = analysis
    ? analysis.contests.slice(
        (contestPage - 1) * CONTESTS_PER_PAGE,
        contestPage * CONTESTS_PER_PAGE,
      )
    : []
  const contestTotalPages = analysis
    ? Math.max(1, Math.ceil(analysis.contests.length / CONTESTS_PER_PAGE))
    : 1

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
    link.download = `${proposalDraft.title}-제안서-초안.txt`
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

    // 새 분석 결과로 갈아끼울 때 추천 공모전 목록도 바뀌므로 페이지를 1로 되돌립니다.
    const apply = (merged: Analysis) => {
      setContestPage(1)
      setAnalysis(merged)
      settledRef.current?.(merged)
    }

    requestAiAnalysis(idea, referenceCases, contests)
      .then((aiData) => {
        if (!cancelled) {
          apply(mergeAnalysis('ai', aiData, fallback))
        }
      })
      .catch(() => {
        // 서버 미실행·키 미설정·타임아웃 등 어떤 경우에도 목업 결과를 표시합니다.
        if (!cancelled) {
          apply(mergeAnalysis('demo', null, fallback))
        }
      })

    return () => {
      cancelled = true
    }
  }, [idea, attempt, restored])

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
      <header className="result-header">
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
            AI 분석은 최대 45초가 걸릴 수 있어요. 기다려도 실패하면 데모 결과로 자동 표시됩니다.
          </p>
        )}
        {analysis?.source === 'demo' && (
          <div className="analysis-retry" role="alert">
            <p className="analysis-retry-title">AI 분석 요청이 실패했어요.</p>
            <p className="analysis-retry-desc">
              백엔드 서버가 꺼져 있거나 일시적인 오류일 수 있어요. 지금은 데모 결과를 보여 드리고
              있어요.
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
        <button
          type="button"
          className={showDiffExample ? 'diff-example-toggle is-open' : 'diff-example-toggle'}
          onClick={() => setShowDiffExample((open) => !open)}
          aria-expanded={showDiffExample}
        >
          📖 예시로 따라해 보기 {showDiffExample ? '▲' : '▼'}
        </button>
        <div className="note-cta">
          <button type="button" className="note-cta-button" onClick={handleCreateNote}>
            🗒️ 이 아이디어로 연습 노트 만들기 →
          </button>
          <p className="note-cta-hint">
            기획 의도가 채워진 채로 시작돼요. 차별점과 예상 질문은 노트에서 직접
            다듬어 보세요.
          </p>
        </div>
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

      <section className="result-section" aria-labelledby="detail-title">
        <h2 id="detail-title">아이디어 상세 분석</h2>
        {analysis === null ? (
          <div className="analysis-loading" role="status">
            <span className="loading-spinner" aria-hidden="true" />
            <p>아이디어를 여러 각도에서 살펴보고 있어요…</p>
          </div>
        ) : (
          <div className="detail-panel">
            <p className="detail-summary">{analysis.detail.ideaSummary}</p>
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

      <section className="result-section proposal-section" aria-labelledby="proposal-title">
        <h2 id="proposal-title">제안서 초안 만들기</h2>
        {analysis === null || proposalDraft === null ? (
          <p className="proposal-waiting">분석이 끝나면 이 결과를 출품용 기획서 양식으로 옮겨 드려요.</p>
        ) : (
          <>
            <p className="proposal-intro">
              문제 정의 → 차별점 → 기대 효과 → 실현 계획 순서로 출품용 기획서 초안을 만들었어요.
              복사해 그대로 다듬어 쓰세요.
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
          <>
          <div className="case-list">
            {pagedContests.map((contest) => (
            <article key={contest.id} className="case-card">
              <div className="case-top">
                <h3>{contest.title}</h3>
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
          {analysis.contests.length > CONTESTS_PER_PAGE && (
            <nav className="contest-pagination" aria-label="추천 공모전 페이지 넘김">
              <p className="contest-pagination-info">
                총 {analysis.contests.length}개 중 {(contestPage - 1) * CONTESTS_PER_PAGE + 1}–
                {Math.min(contestPage * CONTESTS_PER_PAGE, analysis.contests.length)}번째 표시 중
              </p>
              <div className="contest-pagination-buttons">
                <button
                  type="button"
                  disabled={contestPage === 1}
                  onClick={() => setContestPage((page) => Math.max(1, page - 1))}
                >
                  ‹ 이전
                </button>
                {Array.from({ length: contestTotalPages }, (_, index) => index + 1).map((page) => (
                  <button
                    key={page}
                    type="button"
                    className={page === contestPage ? 'active' : ''}
                    aria-current={page === contestPage ? 'page' : undefined}
                    onClick={() => setContestPage(page)}
                  >
                    {page}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={contestPage === contestTotalPages}
                  onClick={() => setContestPage((page) => Math.min(contestTotalPages, page + 1))}
                >
                  다음 ›
                </button>
              </div>
            </nav>
          )}
          </>
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
