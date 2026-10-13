import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
// 옛 'gongnabi:'/'idea-navigation:' 접두사 키 값을 렌더보다 먼저 새 키로 옮긴다 — 화면 어디로
// 직접 들어와도(예: /test) 복원·이어하기가 옮겨진 값을 바로 읽을 수 있게.
import { migrateLegacyKeys } from './utils/storageKeys.js'
import App from './App.tsx'

migrateLegacyKeys()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
