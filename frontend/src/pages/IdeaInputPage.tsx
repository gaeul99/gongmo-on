import { useState } from 'react'
import type { FormEvent } from 'react'
import CategorySelect from '../components/CategorySelect'
import './IdeaInputPage.css'

export type IdeaInput = {
  title: string
  description: string
  category: string
}

const CATEGORIES = ['환경', '교육', '안전', '복지', '교통', '생활', '기타']

type Props = {
  onBack: () => void
  onAnalyze: (idea: IdeaInput) => void
  // 유형 검사 결과 등, 화면이 열릴 때 미리 채워 넣을 값
  initialIdea?: IdeaInput | null
}

type FieldErrors = {
  title?: string
  description?: string
}

function IdeaInputPage({ onBack, onAnalyze, initialIdea }: Props) {
  const [title, setTitle] = useState(initialIdea?.title ?? '')
  const [description, setDescription] = useState(initialIdea?.description ?? '')
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
          </label>
          <input
            id="idea-title"
            type="text"
            value={title}
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
          </label>
          <textarea
            id="idea-description"
            value={description}
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
    </div>
  )
}

export default IdeaInputPage
