// ==========================================================
// 인라인 로그인·회원가입 패널
// 결과 화면·공모전 상세 화면에서 화면 이동 없이 로그인할 수 있게
// 마이페이지의 로그인 폼을 축소해 재사용합니다.
// 로그인에 성공하면 onAuthed 콜백으로 직전 작업(응모 확인 등)을 이어갑니다.
// ==========================================================
import { useState } from 'react'
import type { AuthResult } from '../pages/MyPage'
import './InlineAuthPanel.css'

type Props = {
  onSignIn: (nickname: string, password: string) => Promise<AuthResult>
  onSignUp: (nickname: string, password: string, email: string, phone: string) => Promise<AuthResult>
  /** 로그인 성공 직후 호출 — 직전 작업(응모 확인 열기 등)을 이어갑니다. */
  onAuthed: () => void
  /** 패널 상단에 보여 줄 안내 문구 (예: "응모하려면 로그인이 필요해요.") */
  contextNote?: string
}

function InlineAuthPanel({ onSignIn, onSignUp, onAuthed, contextNote }: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (pending) return
    setError(null)
    // 마이페이지 폼과 같은 기준의 1차 검증 — 빈 값·짧은 비밀번호를 서버까지 보내지 않는다.
    const trimmedNickname = nickname.trim()
    if (!trimmedNickname) {
      setError('아이디를 입력해 주세요.')
      return
    }
    if (!password) {
      setError('비밀번호를 입력해 주세요.')
      return
    }
    if (mode === 'signup' && password.length < 8) {
      setError('비밀번호는 8자 이상이어야 해요.')
      return
    }
    if (mode === 'signup' && password !== passwordConfirm) {
      setError('비밀번호가 서로 일치하지 않아요.')
      return
    }
    const trimmedEmail = email.trim()
    if (mode === 'signup' && !/^\S+@\S+\.\S+$/.test(trimmedEmail)) {
      setError('알림을 받을 이메일 주소를 입력해 주세요.')
      return
    }
    setPending(true)
    try {
      const result =
        mode === 'login'
          ? await onSignIn(trimmedNickname, password)
          : await onSignUp(trimmedNickname, password, trimmedEmail, phone)
      if (result.ok) {
        onAuthed()
      } else {
        setError(result.error)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <form
      className="inline-auth"
      onSubmit={(event) => {
        void handleSubmit(event)
      }}
    >
      {contextNote && <p className="inline-auth-context">{contextNote}</p>}
      <div className="inline-auth-tabs" role="tablist" aria-label="로그인·회원가입 전환">
        <button
          type="button"
          className={mode === 'login' ? 'inline-auth-tab active' : 'inline-auth-tab'}
          aria-pressed={mode === 'login'}
          onClick={() => {
            setMode('login')
            setError(null)
          }}
        >
          로그인
        </button>
        <button
          type="button"
          className={mode === 'signup' ? 'inline-auth-tab active' : 'inline-auth-tab'}
          aria-pressed={mode === 'signup'}
          onClick={() => {
            setMode('signup')
            setError(null)
          }}
        >
          회원가입
        </button>
      </div>
      <input
        type="text"
        value={nickname}
        onChange={(event) => setNickname(event.target.value)}
        placeholder="아이디"
        aria-label="아이디"
        maxLength={20}
      />
      <input
        type="password"
        value={password}
        onChange={(event) => setPassword(event.target.value)}
        placeholder={mode === 'signup' ? '비밀번호 (8자 이상)' : '비밀번호'}
        aria-label="비밀번호"
        maxLength={40}
      />
      {mode === 'signup' && (
        <input
          type="password"
          value={passwordConfirm}
          onChange={(event) => setPasswordConfirm(event.target.value)}
          placeholder="비밀번호 확인"
          aria-label="비밀번호 확인"
          maxLength={40}
        />
      )}
      {mode === 'signup' && (
        <input
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="이메일 (마감 알림 수신용)"
          aria-label="이메일"
          maxLength={60}
        />
      )}
      {mode === 'signup' && (
        <input
          type="tel"
          value={phone}
          onChange={(event) => setPhone(event.target.value)}
          placeholder="휴대폰 번호 (선택)"
          aria-label="휴대폰 번호"
          maxLength={20}
        />
      )}
      {error && (
        <p className="inline-auth-error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="inline-auth-submit" disabled={pending}>
        {pending ? '처리 중...' : mode === 'login' ? '로그인' : '가입하고 계속하기'}
      </button>
    </form>
  )
}

export default InlineAuthPanel
