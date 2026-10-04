import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'

// 다크/라이트 모드를 첫 화면이 그려지기 전에 <html>에 적용한다(깜빡임 방지).
// 저장된 선택이 없으면 시스템 설정을 따르고, 바꾸는 건 홈 화면의 토글이 담당한다.
const THEME_KEY = 'gongnabi:theme'
const storedTheme = (() => {
  try {
    return localStorage.getItem(THEME_KEY)
  } catch {
    return null
  }
})()
document.documentElement.dataset.theme =
  storedTheme === 'dark' || storedTheme === 'light'
    ? storedTheme
    : window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
