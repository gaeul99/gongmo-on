import { useMemo, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import AppLink from '../components/AppLink'
import CategorySelect from '../components/CategorySelect'
import { CONTEST_TYPES } from '../data/contestTypeTest.js'
import { STORAGE_KEYS } from '../utils/storageKeys.js'
import type { SavedIdea } from './MyPage'
import './IdeaInputPage.css'

export type IdeaInput = {
  title: string
  description: string
  category: string
}

// 유형 검사 결과 '이 유형으로 아이디어 분석 시작'으로 넘어오는 유형 맞춤 힌트.
// examples는 설명란에 미리 채워 주는 예시 문장들이고, 화면 제출 값에는 포함되지 않습니다.
export type TypeIdeaHints = {
  typeName: string
  emoji: string
  examples: string[]
}

const CATEGORIES = ['환경', '교육', '안전', '복지', '교통', '생활', '기타']

type Props = {
  onBack: () => void
  onAnalyze: (idea: IdeaInput) => void
  // 유형 검사 결과 등, 화면이 열릴 때 미리 채워 넣을 값
  initialIdea?: IdeaInput | null
  // 유형 검사에서 넘어온 맞춤 힌트 (없으면 힌트 패널을 보여 주지 않음)
  typeHints?: TypeIdeaHints | null
  // 마이페이지와 공유하는 내 아이디어 보관함 — 입력 화면 아래에서 함께 보여 줍니다.
  savedIdeas?: SavedIdea[]
  // 보관함의 아이디어를 다시 열어 분석 결과 화면으로 이동합니다.
  onOpenIdea?: (idea: SavedIdea) => void
  onDeleteIdea?: (id: string) => void
  // 보관함 아이디어 수정 — 같은 내용의 아이디어가 이미 있으면 false를 돌려줍니다.
  onUpdateIdea?: (
    id: string,
    patch: { title: string; description: string; category: string },
  ) => boolean
  // 힌트가 없을 때 보여 주는 '유형 검사 하러 가기' 안내가 이동할 때 씁니다.
  onGoTypeTest: () => void
}

type FieldErrors = {
  title?: string
  description?: string
}

function IdeaInputPage({
  onBack,
  onAnalyze,
  initialIdea,
  typeHints,
  savedIdeas = [],
  onOpenIdea,
  onDeleteIdea,
  onUpdateIdea,
  onGoTypeTest,
}: Props) {
  // 백엔드 검증 한도(account/idea.controller)와 맞춘 길이 제한.
  // 대용량 텍스트가 그대로 AI 프롬프트로 전송되는 것을 막는다.
  const TITLE_MAX = 100
  const DESCRIPTION_MAX = 2000
  // 유형 검사를 마친 적이 있으면 저장된 결과로 힌트를 채운다 — 검사 화면을 거치지
  // 않고 입력 화면으로 바로 와도 '검사 결과는 아이디어 입력 화면의 힌트로 자동
  // 채워진다'(기획)를 지킨다. 검사 화면의 CTA로 넘어온 typeHints가 우선이다.
  const savedTypeHints = useMemo<TypeIdeaHints | null>(() => {
    if (typeHints) return null
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.typeTest)
      if (!raw) return null
      const parsed = JSON.parse(raw) as { typeId?: string }
      const typeId = parsed?.typeId
      if (!typeId || !Object.prototype.hasOwnProperty.call(CONTEST_TYPES, typeId)) return null
      const type = CONTEST_TYPES[typeId as keyof typeof CONTEST_TYPES]
      return { typeName: type.name, emoji: type.emoji, examples: type.ideaHints }
    } catch {
      return null
    }
  }, [typeHints])
  const activeHints = typeHints ?? savedTypeHints
  const hints = activeHints?.examples ?? []
  const [title, setTitle] = useState(initialIdea?.title ?? '')
  const [description, setDescription] = useState(
    // 설명란 자동 채움은 검사 화면의 CTA로 넘어온 경우에만 — 저장 결과 기준 힌트를
    // 몰래 채워 넣으면 예시 문장을 그대로 분석하는 실수를 부를 수 있다.
    () => initialIdea?.description || typeHints?.examples[0] || '',
  )
  const [category, setCategory] = useState(initialIdea?.category ?? '')
  const [errors, setErrors] = useState<FieldErrors>({})
  // 보관함 아이디어 수정 모드 — 폼을 해당 아이디어 값으로 채우고 버튼이 '수정 저장'으로 바뀝니다.
  const [editingIdea, setEditingIdea] = useState<SavedIdea | null>(null)
  const [editNotice, setEditNotice] = useState<string | null>(null)
  // 수정을 취소하면 '수정'을 누르기 전 폼 내용을 되돌려 줍니다.
  const formBeforeEdit = useRef<IdeaInput | null>(null)

  const startIdeaEdit = (idea: SavedIdea) => {
    formBeforeEdit.current = { title, description, category }
    setEditingIdea(idea)
    setEditNotice(null)
    setTitle(idea.title)
    setDescription(idea.description)
    setCategory(idea.category)
    setErrors({})
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const cancelIdeaEdit = () => {
    if (formBeforeEdit.current) {
      setTitle(formBeforeEdit.current.title)
      setDescription(formBeforeEdit.current.description)
      setCategory(formBeforeEdit.current.category)
    }
    formBeforeEdit.current = null
    setEditingIdea(null)
    setEditNotice(null)
    setErrors({})
  }

  const clearError = (field: keyof FieldErrors) => {
    setErrors((prev) => ({ ...prev, [field]: undefined }))
  }

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()

    const nextErrors: FieldErrors = {}
    if (title.trim() === '') {
      nextErrors.title = '아이디어 제목을 입력해 주세요.'
    }
    if (description.trim() === '') {
      nextErrors.description = '아이디어 설명을 입력해 주세요.'
    }

    setErrors(nextErrors)
    if (nextErrors.title || nextErrors.description) {
      return
    }

    // 수정 모드에서는 분석으로 넘어가지 않고 보관함의 아이디어를 곧장 고칩니다.
    // 저장에 성공해도 폼 값을 그대로 두어 '분석하기'로 새 분석을 바로 볼 수 있게 합니다.
    if (editingIdea) {
      const updated = onUpdateIdea?.(editingIdea.id, {
        title: title.trim(),
        description: description.trim(),
        category,
      })
      setEditNotice(updated ? '보관함의 아이디어를 수정했어요.' : '같은 제목·설명·분야의 아이디어가 이미 보관함에 있어요.')
      if (updated) {
        formBeforeEdit.current = null
        setEditingIdea(null)
        // 성공 안내는 수정 배너가 사라진 뒤에도 잠깐 보여 준다
        window.setTimeout(() => setEditNotice(null), 2500)
      }
      return
    }

    onAnalyze({ title: title.trim(), description: description.trim(), category })
  }

  return (
    <div className="input-page">
      <button type="button" className="back-button" onClick={onBack}>
        ← 시작 화면으로
      </button>

      <header className="input-header" data-reveal>
        <h1>아이디어 입력</h1>
        <p>분석할 아이디어를 알려주세요. 관심 분야는 선택 사항입니다.</p>
      </header>

      <form className="input-form" onSubmit={handleSubmit} noValidate data-reveal>
        <div className="field">
          <label htmlFor="idea-title">
            아이디어 제목 <span className="required" aria-hidden="true">*</span>
            <span className="char-count" aria-hidden="true">
              {title.length}/{TITLE_MAX}
            </span>
          </label>
          <input
            id="idea-title"
            type="text"
            value={title}
            maxLength={TITLE_MAX}
            onChange={(event) => {
              setTitle(event.target.value)
              clearError('title')
            }}
            placeholder="예: 재활용 인증 리워드 앱"
            aria-invalid={errors.title ? true : undefined}
          />
          {errors.title && (
            <p className="field-error" role="alert">
              {errors.title}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="idea-description">
            아이디어 설명 <span className="required" aria-hidden="true">*</span>
            <span className="char-count" aria-hidden="true">
              {description.length}/{DESCRIPTION_MAX}
            </span>
          </label>
          {activeHints && hints.length > 0 && (
            <div className="hint-panel">
              <p className="hint-panel-title">{activeHints.typeName} 맞춤 아이디어 힌트</p>
              <p className="hint-panel-caption">
                {typeHints
                  ? '검사 결과에 어울리는 예시예요. 눌러 넣거나 자유롭게 고쳐 쓰세요.'
                  : '전에 받은 검사 결과 기준이에요. 눌러 넣거나 자유롭게 고쳐 쓰세요.'}
              </p>
              <div className="hint-chips" role="group" aria-label="유형 맞춤 아이디어 힌트">
                {hints.map((hint, index) => (
                  <button
                    key={index}
                    type="button"
                    className="hint-chip"
                    onClick={() => {
                      setDescription(hint)
                      clearError('description')
                    }}
                  >
                    {hint}
                  </button>
                ))}
              </div>
            </div>
          )}
          {!activeHints && (
            <div className="hint-panel hint-panel--suggest">
              <p className="hint-panel-title">유형 검사를 하면 맞춤 힌트가 생겨요</p>
              <p className="hint-panel-caption">
                20문항 검사로 나의 준비 성향을 찾으면, 그에 어울리는 아이디어 예시가 이 자리에
                나타나요.
              </p>
              <AppLink className="hint-panel-link" href="/test" onNavigate={onGoTypeTest}>
                유형 검사 하러 가기 →
              </AppLink>
            </div>
          )}
          {/* 저장된 검사 결과 기준 힌트가 떠 있을 때도 안내를 남긴다(2026-10-19 사용자
              요청) — 검사 화면의 CTA로 막 넘어온 경우(typeHints)는 생략한다. 안내는
              테두리 없이 제목과 박스 버튼을 나란히 보여 준다(같은 날 사용자 요청) */}
          {!typeHints && savedTypeHints && (
            <div className="hint-panel hint-panel--retest">
              <p className="hint-panel-title">
                유형 검사를 다시 받으면 힌트가 새 결과 기준으로 바뀌어요
              </p>
              <AppLink className="hint-panel-link" href="/test" onNavigate={onGoTypeTest}>
                유형 검사 다시 하기 →
              </AppLink>
            </div>
          )}
          <textarea
            id="idea-description"
            value={description}
            maxLength={DESCRIPTION_MAX}
            onChange={(event) => {
              setDescription(event.target.value)
              clearError('description')
            }}
            placeholder="어떤 문제를 해결하는 아이디어인지, 누구를 위해 필요한지 자유롭게 적어주세요."
            rows={6}
            aria-invalid={errors.description ? true : undefined}
          />
          {errors.description && (
            <p className="field-error" role="alert">
              {errors.description}
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor="idea-category">
            관심 분야 <span className="optional">(선택)</span>
          </label>
          <CategorySelect id="idea-category" options={CATEGORIES} value={category} onChange={setCategory} />
        </div>

        <button type="submit" className="analyze-button">
          {editingIdea ? '수정 저장' : '분석하기'}
        </button>
        {editingIdea && (
          <div className="input-edit-banner" role="status">
            <p className="input-edit-banner-text">
              <strong>'{editingIdea.title}'</strong> 수정 중 · 내용을 바꾸면 저장된 분석 결과는
              지워지고, 다시 보기 때 새로 분석돼요.
            </p>
            {editNotice && <p className="input-edit-notice">{editNotice}</p>}
            <button type="button" className="input-edit-cancel" onClick={cancelIdeaEdit}>
              수정 취소
            </button>
          </div>
        )}
      </form>
      {!editingIdea && editNotice && (
        <p className="input-edit-notice input-edit-notice--done" role="status">
          {editNotice}
        </p>
      )}

      <section className="input-archive" aria-labelledby="input-archive-title" data-reveal>
        <h2 id="input-archive-title">
          내 아이디어 보관함 <span className="input-archive-count">{savedIdeas.length}개</span>
        </h2>
        <p className="input-archive-caption">
          '다시 보기'로 저장된 분석 결과를 그대로 볼 수 있어요.
        </p>
        {savedIdeas.length === 0 ? (
          <p className="input-archive-empty">
            저장된 아이디어가 없어요. 분석 결과 화면에서 '보관함에 저장'을 눌러 보세요.
          </p>
        ) : (
          <ul className="input-archive-list">
            {savedIdeas.map((idea) => (
              <li
                key={idea.id}
                className={
                  editingIdea?.id === idea.id
                    ? 'input-archive-item input-archive-item--editing'
                    : 'input-archive-item'
                }
              >
                <div className="input-archive-info">
                  <h3>{idea.title}</h3>
                  <p className="input-archive-meta">
                    {idea.category ? `${idea.category} · ` : ''}
                    {idea.savedAt} 저장
                  </p>
                </div>
                <div className="input-archive-actions">
                  <button
                    type="button"
                    className="input-archive-open"
                    onClick={() => onOpenIdea?.(idea)}
                  >
                    다시 보기
                  </button>
                  <button
                    type="button"
                    className="input-archive-edit"
                    onClick={() => startIdeaEdit(idea)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="input-archive-delete"
                    onClick={() => onDeleteIdea?.(idea.id)}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

export default IdeaInputPage
