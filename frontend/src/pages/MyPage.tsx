import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import CategorySelect from '../components/CategorySelect'
import GrowthTimeline from '../components/GrowthTimeline'
import MyContestCalendar from '../components/MyContestCalendar'
import { contests } from '../data/mockData.js'
import {
  isNewContestOptIn,
  resetSeenForPreview,
  setNewContestOptIn,
} from '../utils/contestOpenAlerts.js'
import { deleteRetro, loadRetros, saveRetro } from '../utils/retroNotes.js'
import type { RetroNote } from '../utils/retroNotes.js'
import './MyPage.css'

// 로그인 사용자와 응모 기록은 이 브라우저(localStorage)에만 저장되는 데모 계정입니다.
// email·phone은 공모전 알림(이메일·문자) 발송에 사용됩니다.
export type User = {
  nickname: string
  joinedAt: string
  email?: string
  phone?: string
}

// 결과 화면에서 응모한 공모전의 스냅숏. 공모전 데이터가 갱신돼도 목록이 유지됩니다.
export type AppliedContest = {
  id: number
  title: string
  organizer: string
  deadline: string
  url: string
  appliedAt: string
}

// 나중에 응모할 공모전을 모아 두는 관심 목록 스냅숏. 응모와 달리 로그인 없이도 저장됩니다.
export type WishlistContest = {
  id: number
  title: string
  organizer: string
  deadline: string
  url: string
  addedAt: string
}

// 보관함에 저장한 아이디어. 분석 결과 화면에서 다시 열 수 있습니다.
export type SavedIdea = {
  id: string
  title: string
  description: string
  category: string
  savedAt: string
}

// utils/contestAlerts.js가 만드는 마감 알림 한 건.
export type ContestAlert = {
  id: string
  title: string
  kindLabel: string
  deadline: string
  left: number
  tone: 'today' | 'urgent' | 'upcoming' | 'closed'
  message: string
}

export type AuthResult = { ok: true; user: User } | { ok: false; error: string }

type Props = {
  user: User | null
  myContests: AppliedContest[]
  wishlist: WishlistContest[]
  savedIdeas: SavedIdea[]
  alerts: ContestAlert[]
  onLogin: (nickname: string, password: string) => Promise<AuthResult>
  onSignup: (nickname: string, password: string, email: string, phone: string) => Promise<AuthResult>
  onLogout: () => void
  notifOptIn: boolean
  onToggleNotifOptIn: (next: boolean) => void
  onCancelApply: (id: number) => void
  onApplyWish: (target: Omit<WishlistContest, 'addedAt'>) => void
  onRemoveWish: (id: number) => void
  onOpenIdea: (idea: SavedIdea) => void
  onDeleteIdea: (id: string) => void
  onAddIdea: (target: Omit<SavedIdea, 'id' | 'savedAt'>) => boolean
  onBack: () => void
  onGoInput: () => void
}

const ALERT_BADGE_TEXT: Record<ContestAlert['tone'], string> = {
  today: '오늘 마감',
  urgent: '임박',
  upcoming: '예정',
  closed: '마감',
}

// 입력 화면과 같은 관심 분야 목록
const CATEGORIES = ['환경', '교육', '안전', '복지', '교통', '생활', '기타']

function MyPage({
  user,
  myContests,
  wishlist,
  savedIdeas,
  alerts,
  onLogin,
  onSignup,
  onLogout,
  notifOptIn,
  onToggleNotifOptIn,
  onCancelApply,
  onApplyWish,
  onRemoveWish,
  onOpenIdea,
  onDeleteIdea,
  onAddIdea,
  onBack,
  onGoInput,
}: Props) {
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [nickname, setNickname] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [email, setEmail] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [pending, setPending] = useState(false)

  // 보관함에 아이디어를 직접 기록하는 폼 상태
  const [ideaTitle, setIdeaTitle] = useState('')
  const [ideaDescription, setIdeaDescription] = useState('')
  const [ideaCategory, setIdeaCategory] = useState('')
  const [ideaFormMessage, setIdeaFormMessage] = useState<string | null>(null)
  const [ideaFormOpen, setIdeaFormOpen] = useState(false)
  // 신규 공모전 오픈 알림은 로그인과 무관하게 이 브라우저 설정으로 동작합니다.
  const [newContestAlert, setNewContestAlert] = useState(isNewContestOptIn)
  const [previewReady, setPreviewReady] = useState(false)

  // 회고 노트: 응모한 공모전마다 하나씩 남기는 활동 회고(별점 + 잘한 점 + 다음 계획)
  const [retros, setRetros] = useState<Record<string, RetroNote>>(loadRetros)
  const [retroContestId, setRetroContestId] = useState<number | null>(null)
  const [retroRating, setRetroRating] = useState(0)
  const [retroKeep, setRetroKeep] = useState('')
  const [retroNext, setRetroNext] = useState('')
  const [retroMessage, setRetroMessage] = useState<string | null>(null)

  // 응모를 취소한 공모전의 회고는 남기지 않는다 — 목록과 회고를 항상 맞춘다.
  useEffect(() => {
    const alive = new Set(myContests.map((contest) => String(contest.id)))
    const orphans = Object.keys(retros).filter((key) => !alive.has(key))
    if (orphans.length === 0) return
    let next = retros
    for (const key of orphans) {
      next = deleteRetro(Number(key))
    }
    setRetros(next)
  }, [myContests, retros])

  const openRetroForm = (contest: AppliedContest) => {
    const existing = retros[String(contest.id)]
    setRetroContestId(contest.id)
    setRetroRating(existing ? existing.rating : 0)
    setRetroKeep(existing ? existing.keep : '')
    setRetroNext(existing ? existing.next : '')
    setRetroMessage(null)
  }

  const closeRetroForm = () => {
    setRetroContestId(null)
    setRetroMessage(null)
  }

  const handleRetroSubmit = (contest: AppliedContest) => {
    if (retroRating < 1) {
      setRetroMessage('만족도를 선택해 주세요.')
      return
    }
    const next = saveRetro({
      contestId: contest.id,
      contestTitle: contest.title,
      organizer: contest.organizer,
      deadline: contest.deadline,
      rating: retroRating,
      keep: retroKeep.trim(),
      next: retroNext.trim(),
    })
    setRetros(next)
    closeRetroForm()
  }

  const handleRetroDelete = (contest: AppliedContest) => {
    setRetros(deleteRetro(contest.id))
    closeRetroForm()
  }

  const handleIdeaSubmit = (event: FormEvent) => {
    event.preventDefault()
    const title = ideaTitle.trim()
    if (!title) {
      setIdeaFormMessage('제목을 입력해 주세요.')
      return
    }
    const added = onAddIdea({
      title,
      description: ideaDescription.trim(),
      category: ideaCategory,
    })
    if (added) {
      setIdeaTitle('')
      setIdeaDescription('')
      setIdeaCategory('')
      setIdeaFormMessage('보관함에 기록했어요.')
    } else {
      setIdeaFormMessage('제목·설명·분야가 같은 아이디어가 이미 보관함에 있어요.')
    }
  }

  const switchMode = () => {
    setMode(mode === 'login' ? 'signup' : 'login')
    setError(null)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (pending) return

    const trimmed = nickname.trim()
    if (!trimmed) {
      setError('아이디를 입력해 주세요.')
      return
    }
    if (!password) {
      setError('비밀번호를 입력해 주세요.')
      return
    }
    if (mode === 'signup' && password !== passwordConfirm) {
      setError('비밀번호가 서로 일치하지 않아요.')
      return
    }
    if (mode === 'signup' && !email.trim()) {
      setError('알림을 받을 이메일 주소를 입력해 주세요.')
      return
    }

    setPending(true)
    setError(null)
    const result =
      mode === 'login'
        ? await onLogin(trimmed, password)
        : await onSignup(trimmed, password, email.trim(), phone.trim())
    setPending(false)

    if (!result.ok) {
      setError(result.error)
      return
    }
    setPassword('')
    setPasswordConfirm('')
    setEmail('')
    setPhone('')
  }

  return (
    <div className="page mypage-page">
      <div className="mypage-inner">
        <button type="button" className="back-button" onClick={onBack}>
          ← 홈으로
        </button>

        <header className="mypage-header">
          <p className="mypage-badge">마이페이지</p>
          <h1>내 공모전</h1>
        </header>

        {user ? (
          <>
            <div className="profile-card">
              <span className="profile-avatar" aria-hidden="true">
                {user.nickname.slice(0, 1)}
              </span>
              <div className="profile-text">
                <p className="profile-name">{user.nickname}님, 안녕하세요!</p>
                <p className="profile-since">{user.joinedAt.slice(0, 10)}부터 함께하는 중</p>
              </div>
              <button type="button" className="logout-button" onClick={onLogout}>
                로그아웃
              </button>
            </div>

            <section aria-labelledby="my-contest-title">
              <h2 id="my-contest-title">
                내가 응모한 공모전 <span className="contest-count">{myContests.length}개</span>
              </h2>
              {myContests.length === 0 ? (
                <div className="empty-state">
                  <p>
                    아직 응모한 공모전이 없어요.
                    <br />
                    분석 결과에서 마음에 드는 공모전을 응모하면 이곳에 모입니다.
                  </p>
                  <button type="button" className="empty-button" onClick={onGoInput}>
                    아이디어 분석 시작하기
                  </button>
                </div>
              ) : (
                <ul className="my-contest-list">
                  {myContests.map((contest) => {
                    const existingRetro = retros[String(contest.id)]
                    return (
                      <li key={contest.id} className="my-contest-item">
                        <div className="my-contest-info">
                          <h3>{contest.title}</h3>
                          <p className="my-contest-meta">
                            {contest.organizer} · 마감 {contest.deadline}
                          </p>
                          <p className="my-contest-applied">
                            {contest.appliedAt} 응모
                            {existingRetro && (
                              <span className="retro-done"> · 회고 ★{existingRetro.rating}</span>
                            )}
                          </p>
                        </div>
                        <div className="my-contest-actions">
                          <a href={contest.url} target="_blank" rel="noreferrer">
                            공모전 페이지 ↗
                          </a>
                          <button
                            type="button"
                            className="apply-from-wish-button"
                            onClick={() =>
                              retroContestId === contest.id
                                ? closeRetroForm()
                                : openRetroForm(contest)
                            }
                          >
                            {retroContestId === contest.id
                              ? '회고 닫기'
                              : existingRetro
                                ? '회고 보기'
                                : '회고 쓰기'}
                          </button>
                          <button
                            type="button"
                            className="cancel-apply-button"
                            onClick={() => onCancelApply(contest.id)}
                          >
                            응모 취소
                          </button>
                        </div>
                        {retroContestId === contest.id && (
                          <form
                            className="retro-form"
                            onSubmit={(event) => {
                              event.preventDefault()
                              handleRetroSubmit(contest)
                            }}
                          >
                            <p className="retro-form-title">회고 노트 — {contest.title}</p>
                            <div className="retro-rating" role="group" aria-label="만족도 선택">
                              {[1, 2, 3, 4, 5].map((score) => (
                                <button
                                  key={score}
                                  type="button"
                                  aria-pressed={retroRating === score}
                                  aria-label={`만족도 ${score}점`}
                                  className={score <= retroRating ? 'retro-star on' : 'retro-star'}
                                  onClick={() => {
                                    setRetroRating(score)
                                    setRetroMessage(null)
                                  }}
                                >
                                  ★
                                </button>
                              ))}
                            </div>
                            <textarea
                              value={retroKeep}
                              onChange={(event) => {
                                setRetroKeep(event.target.value)
                                setRetroMessage(null)
                              }}
                              placeholder="잘한 점이나 기억에 남은 점 (선택)"
                              aria-label="잘한 점"
                              rows={2}
                              maxLength={300}
                            />
                            <textarea
                              value={retroNext}
                              onChange={(event) => {
                                setRetroNext(event.target.value)
                                setRetroMessage(null)
                              }}
                              placeholder="다음에 시도해 볼 것 (선택)"
                              aria-label="다음에 시도할 것"
                              rows={2}
                              maxLength={300}
                            />
                            {retroMessage && (
                              <p className="idea-form-message" role="alert">
                                {retroMessage}
                              </p>
                            )}
                            <div className="retro-form-actions">
                              <button type="submit" className="idea-form-submit">
                                회고 저장하기
                              </button>
                              {existingRetro && (
                                <button
                                  type="button"
                                  className="cancel-apply-button"
                                  onClick={() => handleRetroDelete(contest)}
                                >
                                  회고 삭제
                                </button>
                              )}
                            </div>
                            {existingRetro && (
                              <p className="retro-form-note">
                                마지막 수정 {existingRetro.updatedAt} · 등록 {existingRetro.createdAt}
                              </p>
                            )}
                          </form>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <form className="login-card" onSubmit={handleSubmit}>
            {mode === 'login' ? (
              <>
                <p className="login-title">로그인</p>
                <p className="login-desc">
                  가입한 계정으로 로그인하면 공모전에 응모하고 내 목록을 저장할 수 있어요.
                </p>
              </>
            ) : (
              <>
                <p className="login-title">회원가입</p>
                <p className="login-desc">
                  아이디와 비밀번호로 가입하고, 이메일·문자로 공모전 마감 알림을 받아 보세요.
                </p>
              </>
            )}
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
              placeholder={mode === 'signup' ? '비밀번호 (4자 이상)' : '비밀번호'}
              aria-label="비밀번호"
              maxLength={40}
            />
            {mode === 'signup' && (
              <>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  placeholder="비밀번호 확인"
                  aria-label="비밀번호 확인"
                  maxLength={40}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="이메일 (마감 알림 수신용)"
                  aria-label="이메일"
                  maxLength={60}
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="휴대폰 번호 (선택 — 문자 알림)"
                  aria-label="휴대폰 번호"
                  maxLength={20}
                />
              </>
            )}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="login-button" disabled={pending}>
              {pending ? '처리 중...' : mode === 'login' ? '로그인' : '가입하고 시작하기'}
            </button>
            <button type="button" className="switch-mode-button" onClick={switchMode}>
              {mode === 'login' ? '처음이신가요? 회원가입하기' : '이미 계정이 있나요? 로그인'}
            </button>
            <p className="login-note">가입한 계정 정보는 이 브라우저에만 저장됩니다.</p>
          </form>
        )}

        <GrowthTimeline
          myContests={myContests}
          wishlist={wishlist}
          savedIdeas={savedIdeas}
          retros={retros}
        />

        <section className="alert-section" aria-labelledby="alert-title">
          <h2 id="alert-title">공모전 알림</h2>
          <div className="notif-setting">
            <label className="notif-toggle">
              <input
                type="checkbox"
                checked={newContestAlert}
                onChange={(event) => {
                  setNewContestOptIn(event.target.checked)
                  setNewContestAlert(event.target.checked)
                }}
              />
              신규 공모전 오픈 알림 받기
            </label>
                  <p className="notif-hint">
                    접수가 새로 시작된 공모전이 생기면 첫화면 위에서 알려 드려요.{' '}
                    <button
                      type="button"
                      className="notif-preview"
                      onClick={() => {
                        setNewContestOptIn(true)
                        setNewContestAlert(true)
                        resetSeenForPreview(contests)
                        setPreviewReady(true)
                      }}
                    >
                      알림 미리보기
                    </button>
                  </p>
                  {previewReady && (
                    <p className="notif-preview-ready" role="status">
                      미리보기 준비 완료! 상단 메뉴에서 홈(첫화면)을 열면 배너가 나타나요.
                    </p>
                  )}
          </div>
          {user && (
            <div className="notif-setting">
              <label className="notif-toggle">
                <input
                  type="checkbox"
                  checked={notifOptIn}
                  onChange={(event) => onToggleNotifOptIn(event.target.checked)}
                />
                이메일·문자로도 마감 알림 받기
              </label>
              <p className="notif-hint">
                {user.email || user.phone
                  ? `응모·관심 공모전 마감 7일 전·3일 전·당일에 ${
                      user.email ? '이메일' : ''
                    }${user.email && user.phone ? '과 ' : ''}${user.phone ? '문자' : ''}로 알려 드려요.`
                  : '문자 알림을 받으려면 회원가입 때 휴대폰 번호를 입력해 주세요.'}
              </p>
            </div>
          )}
          {alerts.length === 0 ? (
            <p className="alert-empty">
              응모·관심 공모전의 마감일이 가까워지면 이곳에 알려 드려요.
            </p>
          ) : (
            <ul className="alert-list">
              {alerts.map((alert) => (
                <li key={alert.id} className="alert-item">
                  <span className={`alert-badge tone-${alert.tone}`}>
                    {ALERT_BADGE_TEXT[alert.tone]}
                  </span>
                  <div className="alert-text">
                    <p className="alert-title">{alert.title}</p>
                    <p className="alert-meta">
                      {alert.kindLabel} · 마감 {alert.deadline} · {alert.message}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <MyContestCalendar myContests={myContests} wishlist={wishlist} />

        <section aria-labelledby="wishlist-title">
          <h2 id="wishlist-title">
            관심 공모전 <span className="contest-count">{wishlist.length}개</span>
          </h2>
          {wishlist.length === 0 ? (
            <p className="wishlist-empty">
              아직 관심 공모전이 없어요. 분석 결과에서 '☆ 관심 목록에 추가'를 눌러 저장해 보세요.
            </p>
          ) : (
            <ul className="my-contest-list">
              {wishlist.map((contest) => (
                <li key={contest.id} className="my-contest-item">
                  <div className="my-contest-info">
                    <h3>{contest.title}</h3>
                    <p className="my-contest-meta">
                      {contest.organizer} · 마감 {contest.deadline}
                    </p>
                    <p className="my-contest-applied">{contest.addedAt} 관심 추가</p>
                  </div>
                  <div className="my-contest-actions">
                    <a href={contest.url} target="_blank" rel="noreferrer">
                      공모전 페이지 ↗
                    </a>
                    {user ? (
                      <button
                        type="button"
                        className="apply-from-wish-button"
                        onClick={() =>
                          onApplyWish({
                            id: contest.id,
                            title: contest.title,
                            organizer: contest.organizer,
                            deadline: contest.deadline,
                            url: contest.url,
                          })
                        }
                      >
                        응모하기
                      </button>
                    ) : (
                      <span className="wish-login-hint">로그인하면 응모할 수 있어요</span>
                    )}
                    <button
                      type="button"
                      className="cancel-apply-button"
                      onClick={() => onRemoveWish(contest.id)}
                    >
                      관심 해제
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="archive-title">
          <div className="archive-header">
            <div className="archive-title-group">
              <h2 id="archive-title">
                아이디어 보관함 <span className="contest-count">{savedIdeas.length}개</span>
              </h2>
              <button
                type="button"
                className="idea-add-button"
                aria-expanded={ideaFormOpen}
                aria-controls="idea-record-form"
                aria-label={ideaFormOpen ? '아이디어 기록 폼 닫기' : '아이디어 직접 기록하기'}
                onClick={() => setIdeaFormOpen((open) => !open)}
              >
                +
              </button>
            </div>
          </div>
          <form
            className={ideaFormOpen ? 'idea-form' : 'idea-form idea-form-hidden'}
            id="idea-record-form"
            onSubmit={handleIdeaSubmit}
          >
            <p className="idea-form-title">직접 기록하기</p>
            <input
              type="text"
              value={ideaTitle}
              onChange={(event) => {
                setIdeaTitle(event.target.value)
                setIdeaFormMessage(null)
              }}
              placeholder="아이디어 제목"
              aria-label="아이디어 제목"
              maxLength={60}
            />
            <textarea
              value={ideaDescription}
              onChange={(event) => {
                setIdeaDescription(event.target.value)
                setIdeaFormMessage(null)
              }}
              placeholder="어떤 아이디어인지 간단히 적어 보세요. (선택)"
              aria-label="아이디어 설명"
              rows={2}
              maxLength={500}
            />
            <div className="idea-form-row">
              <CategorySelect
                id="idea-form-category"
                options={CATEGORIES}
                value={ideaCategory}
                onChange={(value) => {
                  setIdeaCategory(value)
                  setIdeaFormMessage(null)
                }}
              />
              <button type="submit" className="idea-form-submit">
                기록하기
              </button>
            </div>
            {ideaFormMessage && (
              <p className="idea-form-message" role="status">
                {ideaFormMessage}
              </p>
            )}
          </form>
          {savedIdeas.length === 0 ? (
            <p className="wishlist-empty">
              저장된 아이디어가 없어요. 분석 결과 화면에서 '보관함에 저장'을 누르거나 제목 옆
              + 버튼을 눌러 직접 기록해 보세요.
            </p>
          ) : (
            <ul className="my-contest-list">
              {savedIdeas.map((idea) => (
                <li key={idea.id} className="my-contest-item">
                  <div className="my-contest-info">
                    <h3>{idea.title}</h3>
                    {idea.category && <p className="my-contest-meta">관심 분야: {idea.category}</p>}
                    <p className="my-contest-applied">{idea.savedAt} 저장</p>
                  </div>
                  <div className="my-contest-actions">
                    <button
                      type="button"
                      className="apply-from-wish-button"
                      onClick={() => onOpenIdea(idea)}
                    >
                      다시 보기
                    </button>
                    <button
                      type="button"
                      className="cancel-apply-button"
                      onClick={() => onDeleteIdea(idea.id)}
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
    </div>
  )
}

export default MyPage
