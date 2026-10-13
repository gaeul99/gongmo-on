// 연습 노트 — 실제 응모 전에 심사 관점을 미리 연습해 두는 준비 노트.
// 노트마다 기획 의도·차별점·예상 심사 질문·답변을 적어 두고,
// 실제 기획서·발표·면담에서 그대로 쓸 수 있게 한다.
// 노트는 localStorage에 저장되고, 로그인 중이면 회고처럼 서버 백업에 함께 실립니다.
import { useState } from 'react'
import AppLink from '../components/AppLink'
import './PracticeNotePage.css'

const NOTES_STORAGE_KEY = 'gongmo-on:practice-notes'

type PracticeQA = { q: string; a: string }

type PracticeNote = {
  id: string
  title: string
  // 어떤 문제를, 누구를 위해 푸는지
  intent: string
  // 기존 방식·서비스와 다른 점
  diff: string
  // 예상 심사 질문과 내 답변
  qa: PracticeQA[]
  updatedAt: string
}

type Draft = {
  id: string | null
  title: string
  intent: string
  diff: string
  qa: PracticeQA[]
}

// 분석 결과 화면에서 노트를 만들 때 미리 채울 값 — Draft에서 id·qa를 뺀 형태
export type NotePrefill = {
  title: string
  intent: string
  diff: string
}

type Props = {
  // 서버 백업 복원 등으로 localStorage 노트가 갱신됐음을 알리는 횟수.
  // 값이 바뀌면 목록을 다시 읽어 최신 상태를 보여 줍니다.
  dataVersion: number
  // 노트를 저장·삭제했을 때 호출 — 앱이 서버 백업을 다시 실행합니다.
  onNotesChanged: () => void
  // 분석 결과의 '연습 노트 만들기'로 넘어올 때 채워 넣을 초안(없으면 null)
  initialDraft?: NotePrefill | null
  onBack: () => void
  // 연습한 아이디어를 곧바로 분석으로 옮겨 보는 입구
  onGoInput: () => void
}

function loadNotes(): PracticeNote[] {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as PracticeNote[]) : []
  } catch {
    return []
  }
}

function saveNotes(notes: PracticeNote[]) {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  } catch {
    // 저장에 실패해도 이 세션 안에서는 목록을 유지합니다.
  }
}

function emptyDraft(): Draft {
  return { id: null, title: '', intent: '', diff: '', qa: [{ q: '', a: '' }] }
}

// 답변까지 적힌 질문이 몇 개인지 — 목록 카드에서 준비 정도를 보여 줄 때 씁니다.
function answeredCount(qa: PracticeQA[]): number {
  return qa.filter((pair) => pair.a.trim() !== '').length
}

const PRACTICE_TIPS = [
  '심사위원은 보통 문제 정의 → 실현 가능성 → 차별점 → 기대효과 순서로 봅니다. 노트 칸도 같은 순서예요.',
  '예상 질문은 "비용은 어떻게 충당하나요?", "이미 있는 서비스와 뭐가 다른가요?", "팀이 감당 가능한가요?"부터 준비하세요.',
  '소리 내어 1분 발표를 연습하고 막힌 부분을 질문 칸에 옮겨 두면, 다음 연습 때 그 부분만 다듬으면 됩니다.',
]

function PracticeNotePage({ dataVersion, onNotesChanged, initialDraft = null, onBack, onGoInput }: Props) {
  // 분석 결과에서 넘어오면 초안(title·intent)이 채워진 작성 화면으로 바로 시작합니다.
  const [notes, setNotes] = useState<PracticeNote[]>(loadNotes)
  // null이면 목록 화면, 값이면 작성·수정 화면입니다.
  const [draft, setDraft] = useState<Draft | null>(() =>
    initialDraft ? { ...emptyDraft(), ...initialDraft } : null,
  )
  const [error, setError] = useState<string | null>(null)

  // 서버 복원으로 localStorage 노트가 갱신되면(dataVersion 증가) 목록을 다시 읽습니다.
  const [loadedVersion, setLoadedVersion] = useState(dataVersion)
  if (loadedVersion !== dataVersion) {
    setLoadedVersion(dataVersion)
    setNotes(loadNotes())
  }

  const updateDraft = (patch: Partial<Draft>) => {
    setDraft((prev) => (prev ? { ...prev, ...patch } : prev))
  }

  const updateQA = (index: number, patch: Partial<PracticeQA>) => {
    setDraft((prev) => {
      if (!prev) return prev
      return { ...prev, qa: prev.qa.map((pair, i) => (i === index ? { ...pair, ...patch } : pair)) }
    })
  }

  const openNew = () => {
    setError(null)
    setDraft(emptyDraft())
  }

  const openNote = (note: PracticeNote) => {
    setError(null)
    setDraft({
      id: note.id,
      title: note.title,
      intent: note.intent,
      diff: note.diff,
      qa: note.qa.length > 0 ? note.qa : [{ q: '', a: '' }],
    })
  }

  const handleSave = () => {
    if (!draft) return
    const title = draft.title.trim()
    if (!title) {
      setError('노트 제목을 적어 주세요. 공모전명이나 아이디어 이름이면 충분해요.')
      return
    }
    // 질문과 답변이 모두 비어 있는 칸은 저장하지 않습니다.
    const qa = draft.qa.filter((pair) => pair.q.trim() !== '' || pair.a.trim() !== '')
    const updatedAt = new Date().toISOString().slice(0, 10)
    let next: PracticeNote[]
    if (draft.id) {
      next = notes.map((note) =>
        note.id === draft.id ? { ...note, title, intent: draft.intent, diff: draft.diff, qa, updatedAt } : note,
      )
    } else {
      const entry: PracticeNote = {
        id: `${Date.now()}`,
        title,
        intent: draft.intent,
        diff: draft.diff,
        qa,
        updatedAt,
      }
      next = [entry, ...notes]
    }
    setNotes(next)
    saveNotes(next)
    setDraft(null)
    setError(null)
    onNotesChanged()
  }

  const handleDelete = (id: string) => {
    const target = notes.find((note) => note.id === id)
    // 삭제는 되돌릴 수 없다 — 실수 클릭을 막으려 한 번 확인한다.
    if (!window.confirm(`'${target?.title ?? '노트'}' 노트를 삭제할까요? 삭제하면 복구할 수 없어요.`)) {
      return
    }
    const next = notes.filter((note) => note.id !== id)
    setNotes(next)
    saveNotes(next)
    onNotesChanged()
  }

  if (draft) {
    return (
      <div className="notes-page">
        <button type="button" className="back-button" onClick={() => setDraft(null)}>
          ← 노트 목록으로
        </button>

        <form
          className="note-editor"
          data-reveal
          onSubmit={(event) => {
            event.preventDefault()
            handleSave()
          }}
        >
          <h1>{draft.id ? '노트 수정' : '새 연습 노트'}</h1>
          <p className="note-editor-lead">
            심사위원의 눈으로 미리 답해 둡니다. 여기에 적은 문장이 실제 기획서와 발표의 뼈대가 돼요.
          </p>

          <div className="note-field">
            <label htmlFor="note-title">
              노트 제목 <span className="note-required">*</span>
            </label>
            <input
              id="note-title"
              type="text"
              value={draft.title}
              onChange={(event) => updateDraft({ title: event.target.value })}
              placeholder="예: 2026 대학생 창업 아이디어 공모전 — 학습 복습 도우미"
              aria-invalid={error ? true : undefined}
            />
            {error && <p className="note-error">{error}</p>}
          </div>

          <div className="note-field">
            <label htmlFor="note-intent">
              기획 의도 <span className="note-optional">어떤 문제를, 누구를 위해 푸나요?</span>
            </label>
            <textarea
              id="note-intent"
              value={draft.intent}
              onChange={(event) => updateDraft({ intent: event.target.value })}
              placeholder="예: 대학생은 필기를 하지만 다시 꺼내 보지 않아 학습이 끊깁니다. 시험 기간이 가장 큰 시점에 복습을 습관으로 만들어 줍니다."
              rows={4}
            />
          </div>

          <div className="note-field">
            <label htmlFor="note-diff">
              차별점 <span className="note-optional">기존 방식·서비스와 다른 점</span>
            </label>
            <textarea
              id="note-diff"
              value={draft.diff}
              onChange={(event) => updateDraft({ diff: event.target.value })}
              placeholder="예: 요약·플래시카드 앱은 사용자가 직접 만들어야 합니다. 우리는 강의 노트를 올리면 문제가 자동 생성된다는 차이가 있습니다."
              rows={4}
            />
          </div>

          <fieldset className="note-qa">
            <legend>예상 심사 질문 · 내 답변</legend>
            <p className="note-qa-lead">
              심사에서 실제로 나올 만한 질문을 미리 적고 답을 준비해 두세요.
            </p>
            {draft.qa.map((pair, index) => (
              <div className="note-qa-row" key={index}>
                <input
                  type="text"
                  value={pair.q}
                  onChange={(event) => updateQA(index, { q: event.target.value })}
                  placeholder={`질문 ${index + 1} — 예: 수익 모델은 무엇인가요?`}
                  aria-label={`예상 질문 ${index + 1}`}
                />
                <textarea
                  value={pair.a}
                  onChange={(event) => updateQA(index, { a: event.target.value })}
                  placeholder="내 답변을 미리 연습해 적어 둡니다."
                  rows={3}
                  aria-label={`질문 ${index + 1}에 대한 답변`}
                />
                {draft.qa.length > 1 && (
                  <button
                    type="button"
                    className="note-qa-remove"
                    onClick={() =>
                      updateDraft({ qa: draft.qa.filter((_, i) => i !== index) })
                    }
                  >
                    이 질문 지우기
                  </button>
                )}
              </div>
            ))}
            <button
              type="button"
              className="note-qa-add"
              onClick={() => updateDraft({ qa: [...draft.qa, { q: '', a: '' }] })}
            >
              + 질문 추가
            </button>
          </fieldset>

          <div className="note-editor-actions">
            <button type="submit" className="note-save-button">
              노트 저장
            </button>
            <button type="button" className="note-cancel-button" onClick={() => setDraft(null)}>
              취소
            </button>
          </div>
        </form>
      </div>
    )
  }

  return (
    <div className="notes-page">
      <button type="button" className="back-button" onClick={onBack}>
        ← 돌아가기
      </button>

      <header className="notes-header" data-reveal>
        <h1>연습 노트</h1>
        <p>
          실제 응모 전에 미리 연습해 두는 준비 노트예요. 기획 의도·차별점·예상 질문을
          노트로 만들어 두면 기획서 작성과 발표, 심사 면담에서 그대로 쓸 수 있습니다.
        </p>
      </header>

      <div className="notes-toolbar" data-reveal>
        <button type="button" className="notes-new-button" onClick={openNew}>
          + 새 노트 만들기
        </button>
        <AppLink className="notes-to-input" href="/input" onNavigate={onGoInput}>
          연습할 아이디어를 AI 분석해 보고 싶다면 →
        </AppLink>
      </div>

      {notes.length === 0 ? (
        <div className="notes-empty" data-reveal>
          <p>아직 연습 노트가 없어요.</p>
          <p className="notes-empty-sub">
            도전하고 싶은 공모전을 하나 정하고, 새 노트로 심사 관점을 미리 연습해 보세요.
          </p>
          <button type="button" className="notes-empty-button" onClick={openNew}>
            첫 노트 만들기
          </button>
        </div>
      ) : (
        <ul className="notes-list" data-reveal>
          {notes.map((note) => (
            <li key={note.id} className="note-card">
              <button
                type="button"
                className="note-card-main"
                onClick={() => openNote(note)}
                aria-label={`${note.title} 노트 열기`}
              >
                <span className="note-card-title">{note.title}</span>
                <span className="note-card-meta">
                  {note.updatedAt} 수정 · 예상 질문 {answeredCount(note.qa)}개 답변 준비
                </span>
              </button>
              <button
                type="button"
                className="note-card-delete"
                onClick={() => handleDelete(note.id)}
                aria-label={`${note.title} 노트 삭제`}
              >
                삭제
              </button>
            </li>
          ))}
        </ul>
      )}

      <section className="notes-tips prose" aria-labelledby="notes-tips-title" data-reveal>
        <h2 id="notes-tips-title">실전에서 통하는 연습 팁</h2>
        <ul>
          {PRACTICE_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default PracticeNotePage
