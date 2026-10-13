import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import CategorySelect from '../components/CategorySelect'
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
}: Props) {
  // 백엔드 검증 한도(account/idea.controller)와 맞춘 길이 제한.
  // 대용량 텍스트가 그대로 AI 프롬프트로 전송되는 것을 막는다.
  const TITLE_MAX = 100
  const DESCRIPTION_MAX = 2000
  const hints = typeHints?.examples ?? []
  const [title, setTitle] = useState(initialIdea?.title ?? '')
  const [description, setDescription] = useState(
    () => initialIdea?.description || hints[0] || '',
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
          {typeHints && hints.length > 0 && (
            <div className="hint-panel">
              <p className="hint-panel-title">
                <span aria-hidden="true">{typeHints.emoji}</span> {typeHints.typeName} 맞춤 아이디어
                힌트
              </p>
              <p className="hint-panel-caption">
                검사 결과에 어울리는 예시예요. 눌러 넣거나 자유롭게 고쳐 쓰세요.
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
          '다시 보기'를 누르면 저장된 분석 결과를 그대로 보여 드려요.
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
