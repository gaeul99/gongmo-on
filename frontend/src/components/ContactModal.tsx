import { useEffect, useRef, useState } from 'react'
import { sendInquiry } from '../services/inquiryService'
import './ContactModal.css'

const CATEGORIES = ['서비스 이용', '버그 신고', '기능 제안', '기타']

type Status = 'idle' | 'sending' | 'done'

// 푸터 '문의하기'를 누르면 열리는 문의 접수 모달.
// 부모가 열림 여부에 따라 조건부 마운트하므로 열 때마다 폼이 새로 시작된다.
// 제출하면 POST /api/inquiries로 접수되고, 답변은 적은 이메일로 받는다.
function ContactModal({ onClose, contactEmail }: { onClose: () => void; contactEmail: string }) {
  const [category, setCategory] = useState(CATEGORIES[0])
  const [email, setEmail] = useState('')
  const [content, setContent] = useState('')
  const [status, setStatus] = useState<Status>('idle')
  const [error, setError] = useState('')
  const firstFieldRef = useRef<HTMLSelectElement | null>(null)

  useEffect(() => {
    firstFieldRef.current?.focus()
  }, [])

  // Esc로 닫는다 — 발송 중에는 실수로 닫지 않게 막는다.
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && status !== 'sending') onClose()
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [onClose, status])

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (status === 'sending') return
    if (content.trim().length === 0) {
      setError('문의 내용을 적어 주세요.')
      return
    }
    setStatus('sending')
    setError('')
    try {
      await sendInquiry({ email: email.trim(), category, content: content.trim() })
      setStatus('done')
    } catch {
      setStatus('idle')
      setError('보내는 중에 문제가 생겼어요. 잠시 후 다시 시도해 주세요.')
    }
  }

  return (
    <div className="contact-overlay" onClick={status === 'sending' ? undefined : onClose}>
      <div
        className="contact-panel"
        role="dialog"
        aria-modal="true"
        aria-label="문의하기"
        onClick={(event) => event.stopPropagation()}
      >
        {status === 'done' ? (
          <div className="contact-done">
            <p className="contact-done-icon" aria-hidden="true">✓</p>
            <p className="contact-done-title">문의가 접수됐어요</p>
            <p className="contact-done-lead">
              소중한 의견 감사해요.{email.trim() ? ` ${email.trim()}으로 답해 드릴게요.` : ' 답변이 필요하면 이메일을 남겨 주세요.'}
            </p>
            <button type="button" className="contact-submit" onClick={onClose}>
              닫기
            </button>
          </div>
        ) : (
          <form className="contact-form" onSubmit={handleSubmit} noValidate>
            <div className="contact-head">
              <p className="contact-title">문의하기</p>
              <button
                type="button"
                className="contact-close"
                onClick={onClose}
                disabled={status === 'sending'}
                aria-label="문의 창 닫기"
              >
                ×
              </button>
            </div>
            <p className="contact-lead">
              궁금한 점이나 불편한 점을 남겨 주세요. 직접 보내고 싶으면{' '}
              <span className="contact-mail">{contactEmail}</span>로도 받고 있어요.
            </p>

            <label className="contact-field">
              <span className="contact-label">분류</span>
              <select
                ref={firstFieldRef}
                className="contact-input"
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                {CATEGORIES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </label>

            <label className="contact-field">
              <span className="contact-label">
                답변 받을 이메일 <em className="contact-optional">(선택)</em>
              </span>
              <input
                className="contact-input"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="답변을 받을 이메일 주소"
                autoComplete="email"
              />
            </label>

            <label className="contact-field">
              <span className="contact-label">문의 내용</span>
              <textarea
                className="contact-input contact-textarea"
                value={content}
                onChange={(event) => setContent(event.target.value)}
                placeholder="궁금한 점이나 불편한 점을 자유롭게 적어 주세요."
                rows={6}
                maxLength={2000}
              />
              <span className="contact-count">{content.length}/2000</span>
            </label>

            {error && (
              <p className="contact-error" role="alert">
                {error}
              </p>
            )}

            <button type="submit" className="contact-submit" disabled={status === 'sending'}>
              {status === 'sending' ? '보내는 중…' : '문의 보내기'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

export default ContactModal
