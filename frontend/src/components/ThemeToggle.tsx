// ==========================================================
// 라이트/다크 모드 선택 — 해·달 아이콘 버튼, 나비 챗봇 버튼 바로 위.
// 선택은 <html>의 data-theme 속성으로 전 화면에 적용되고
// localStorage('gongnabi:theme')에 저장된다. 최초 방문 시의
// 초기값(시스템 설정 포함)은 main.tsx가 정해 둔다.
// ==========================================================
import { useState } from 'react'
import './ThemeToggle.css'

const THEME_KEY = 'gongnabi:theme'

type Theme = 'light' | 'dark'

function readTheme(): Theme {
  return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'
}

function persistTheme(theme: Theme) {
  try {
    localStorage.setItem(THEME_KEY, theme)
  } catch {
    // 저장이 막힌 환경에서는 이 세션 안에서만 유지된다.
  }
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="4.4" fill="currentColor" />
      <g stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
        <line x1="12" y1="2.5" x2="12" y2="5" />
        <line x1="12" y1="19" x2="12" y2="21.5" />
        <line x1="2.5" y1="12" x2="5" y2="12" />
        <line x1="19" y1="12" x2="21.5" y2="12" />
        <line x1="5.3" y1="5.3" x2="7" y2="7" />
        <line x1="17" y1="17" x2="18.7" y2="18.7" />
        <line x1="18.7" y1="5.3" x2="17" y2="7" />
        <line x1="7" y1="17" x2="5.3" y2="18.7" />
      </g>
    </svg>
  )
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path
        d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinejoin="round"
      />
    </svg>
  )
}

function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(readTheme)

  const pick = (next: Theme) => {
    document.documentElement.dataset.theme = next
    persistTheme(next)
    setTheme(next)
  }

  return (
    <div className="theme-toggle" role="group" aria-label="화면 모드 선택">
      <button
        type="button"
        className={`theme-option${theme === 'light' ? ' is-on' : ''}`}
        aria-pressed={theme === 'light'}
        aria-label="라이트 모드"
        title="라이트 모드"
        onClick={() => pick('light')}
      >
        <SunIcon />
      </button>
      <button
        type="button"
        className={`theme-option${theme === 'dark' ? ' is-on' : ''}`}
        aria-pressed={theme === 'dark'}
        aria-label="다크 모드"
        title="다크 모드"
        onClick={() => pick('dark')}
      >
        <MoonIcon />
      </button>
    </div>
  )
}

export default ThemeToggle
