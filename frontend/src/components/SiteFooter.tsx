import { useEffect, useRef, useState } from 'react'
import ContactModal from './ContactModal'
import './SiteFooter.css'

const CONTACT_EMAIL = 'kkgee115@gmail.com'

// 모든 화면 맨 아래에서 문의 이메일을 안내하는 공통 푸터입니다.
function SiteFooter() {
  // 이메일 주소를 누르면 클립보드에 복사하고, 눈으로 확인할 수 있게 토스트를 띄운다.
  const [copied, setCopied] = useState(false)
  const toastTimer = useRef<number | null>(null)
  // '문의하기'를 누르면 문의 접수 창(ContactModal)을 띄운다.
  const [contactOpen, setContactOpen] = useState(false)

  // 화면 이동으로 푸터가 내려가면 예약된 토스트 숨김 타이머를 정리한다.
  useEffect(
    () => () => {
      if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    },
    [],
  )

  const handleCopyEmail = async () => {
    const ok = await navigator.clipboard
      .writeText(CONTACT_EMAIL)
      .then(() => true)
      .catch(() => {
        // 클립보드 API를 못 쓰는 환경(비보안 컨텍스트 등) — 숨긴 textarea로 복사한다.
        const textarea = document.createElement('textarea')
        textarea.value = CONTACT_EMAIL
        textarea.setAttribute('readonly', '')
        textarea.style.position = 'fixed'
        textarea.style.opacity = '0'
        document.body.appendChild(textarea)
        textarea.select()
        const done = document.execCommand('copy')
        document.body.removeChild(textarea)
        return done
      })
    if (!ok) return
    // 연속 클릭 시 이전 타이머를 지워 토스트가 1.8초 유지되게 한다.
    if (toastTimer.current !== null) window.clearTimeout(toastTimer.current)
    setCopied(true)
    toastTimer.current = window.setTimeout(() => setCopied(false), 1800)
  }

  return (
    <footer className="site-footer" data-reveal>
      {/* 2026-10-14 사용자 요청 — 푸터 내용은 가운데에 모은다(같은 날
          '화면 중앙에 배치'). 잠깐 넣었던 인스타그램·블로그 표시는 같은 날
          '표시 지워줘' 요청으로 뺐다 */}
      <div className="site-footer-inner">
        <div className="site-footer-info">
          <div className="site-footer-actions">
            <button type="button" className="site-footer-mail-button" onClick={() => setContactOpen(true)}>
              문의하기
            </button>
            <button
              type="button"
              className="site-footer-email"
              onClick={handleCopyEmail}
              title="누르면 이메일 주소가 복사돼요"
            >
              {CONTACT_EMAIL}
            </button>
            {/* 복사 확인 토스트 — 이메일 버튼 위에 잠깐 떠오른다(role="status"로 스크린리더에도 알림) */}
            <span className={`site-footer-toast${copied ? ' is-visible' : ''}`} role="status">
              {copied ? '이메일 주소가 복사됐어요 ✓' : ''}
            </span>
          </div>
          <p className="site-footer-copy">© 2026 공모온 · 아이디어 분석과 공모전 추천</p>
        </div>
      </div>
      {/* 열림 여부로 조건부 마운트 — 열 때마다 폼이 새로 시작된다 */}
      {contactOpen && <ContactModal onClose={() => setContactOpen(false)} contactEmail={CONTACT_EMAIL} />}
    </footer>
  )
}

export default SiteFooter
