import { useState } from 'react'
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

    onAnalyze({ title: title.trim(), description: description.trim(), category })
  }

  return (
    <div className="input-page">
      <button type="button" className="back-button" onClick={onBack}>
        ← 시작 화면으로
      </button>

      <header className="input-header">
        <h1>아이디어 입력</h1>
        <p>분석할 아이디어를 알려주세요. 관심 분야는 선택 사항입니다.</p>
      </header>

      <form className="input-form" onSubmit={handleSubmit} noValidate>
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
          분석하기
        </button>
      </form>

      <section className="input-archive" aria-labelledby="input-archive-title">
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
              <li key={idea.id} className="input-archive-item">
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
