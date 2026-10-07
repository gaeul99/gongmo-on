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
import { sendWeeklyDigest } from '../services/notificationService.js'
import { downloadUserData, mergeImportedData } from '../utils/dataPortability.js'
import type { Analysis } from '../types/analysis'
import './MyPage.css'

// 로그인 사용자와 응모 기록은 이 브라우저(localStorage)에만 저장되는 데모 계정입니다.
// email은 공모전 마감 알림(이메일) 발송에 사용됩니다.
export type User = {
  nickname: string
  joinedAt: string
  email?: string
  phone?: string
}

// 결과 화면에서 응모한 공모전의 스냅숏. 공모전 데이터가 갱신돼도 목록이 유지됩니다.
// result는 도전 히스토리용 응모 결과(진행 중·수상·탈락) — 기록 전에는 'progress'로 봅니다.
export type AppliedContest = {
  id: number
  title: string
  organizer: string
  deadline: string
  url: string
  appliedAt: string
  result?: 'progress' | 'won' | 'lost'
  resultAt?: string
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
// analysis에는 저장 시점의 분석 결과 스냅숏이 함께 담겨 '다시 보기'로 복원됩니다.
export type SavedIdea = {
  id: string
  title: string
  description: string
  category: string
  savedAt: string
  analysis?: Analysis | null
}

// utils/contestAlerts.js가 만드는 마감 알림 한 건.
export type ContestAlert = {
  id: string
  // 클릭 시 공모전 상세 화면으로 이동할 때 씁니다.
  contestId: number
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
  /** 알림 하나를 확인(읽음) 처리 — 확인한 것은 상단 배지 개수에서 빠집니다. */
  onDismissAlert: (alert: ContestAlert) => void
  onLogin: (nickname: string, password: string) => Promise<AuthResult>
  onSignup: (nickname: string, password: string, email: string, phone: string) => Promise<AuthResult>
  /** 회원정보(아이디·이메일·휴대폰) 수정 — 성공 시 바뀐 user를 돌려줍니다. */
  onUpdateProfile: (payload: {
    currentPassword: string
    nickname: string
    email: string
    phone: string
  }) => Promise<AuthResult>
  onLogout: () => void
  notifOptIn: boolean
  onToggleNotifOptIn: (next: boolean) => void
  onCancelApply: (id: number) => void
  /** 응모 결과(진행 중·수상·탈락)를 기록 — 대시보드 도전 히스토리의 재료가 됩니다. */
  onContestResult: (id: number, result: 'progress' | 'won' | 'lost') => void
  onApplyWish: (target: Omit<WishlistContest, 'addedAt'>) => void
  onRemoveWish: (id: number) => void
  onOpenIdea: (idea: SavedIdea) => void
  onDeleteIdea: (id: string) => void
  onAddIdea: (target: Omit<SavedIdea, 'id' | 'savedAt'>) => boolean
  /** 내보내기 파일에서 가져온 목록을 앱 상태·저장소에 반영합니다. */
  onImportLists: (
    myContests: AppliedContest[],
    wishlist: WishlistContest[],
    savedIdeas: SavedIdea[],
  ) => void
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

// 응모 결과 옵션 — 마이페이지 배지와 대시보드 도전 히스토리가 같은 값을 씁니다.
const RESULT_OPTIONS: Array<{ value: 'progress' | 'won' | 'lost'; label: string }> = [
  { value: 'progress', label: '진행 중' },
  { value: 'won', label: '수상' },
  { value: 'lost', label: '탈락' },
]

function MyPage({
  user,
  myContests,
  wishlist,
  savedIdeas,
  alerts,
  onDismissAlert,
  onLogin,
  onSignup,
  onUpdateProfile,
  onLogout,
  notifOptIn,
  onToggleNotifOptIn,
  onCancelApply,
  onContestResult,
  onApplyWish,
  onRemoveWish,
  onOpenIdea,
  onDeleteIdea,
  onAddIdea,
  onImportLists,
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

  // 회원정보 수정 폼 — 로그인 사용자 정보로 채우고, 이름이 바뀌면 다시 동기화합니다.
  const [profileNickname, setProfileNickname] = useState('')
  const [profileEmail, setProfileEmail] = useState('')
  const [profilePhone, setProfilePhone] = useState('')
  const [profilePassword, setProfilePassword] = useState('')
  const [profileStatus, setProfileStatus] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null)
  const [profilePending, setProfilePending] = useState(false)
  // 회원정보 수정 폼은 클릭해 열었을 때만 보입니다.
  const [profileEditOpen, setProfileEditOpen] = useState(false)

  useEffect(() => {
    setProfileNickname(user?.nickname ?? '')
    setProfileEmail(user?.email ?? '')
    setProfilePhone(user?.phone ?? '')
    setProfilePassword('')
    setProfileStatus(null)
  }, [user?.nickname, user?.email, user?.phone])

  // 회원정보 저장 — 성공하면 App이 user를 갱신해 대시보드 이름이 바로 바뀝니다.
  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (profilePending) return
    setProfilePending(true)
    setProfileStatus(null)
    const result = await onUpdateProfile({
      currentPassword: profilePassword,
      nickname: profileNickname.trim(),
      email: profileEmail.trim(),
      phone: profilePhone.trim(),
    })
    setProfilePending(false)
    if (result.ok) {
      setProfilePassword('')
      setProfileStatus({ tone: 'ok', text: '회원정보를 저장했어요. 대시보드에도 새 이름이 바로 반영돼요.' })
    } else {
      setProfileStatus({ tone: 'error', text: result.error })
    }
  }

  // 보관함에 아이디어를 직접 기록하는 폼 상태
  const [ideaTitle, setIdeaTitle] = useState('')
  const [ideaDescription, setIdeaDescription] = useState('')
  const [ideaCategory, setIdeaCategory] = useState('')
  const [ideaFormMessage, setIdeaFormMessage] = useState<string | null>(null)
  const [ideaFormOpen, setIdeaFormOpen] = useState(false)
  // 신규 공모전 오픈 알림은 로그인과 무관하게 이 브라우저 설정으로 동작합니다.
  const [newContestAlert, setNewContestAlert] = useState(isNewContestOptIn)
  const [previewReady, setPreviewReady] = useState(false)
  // 주간 새 공모전 이메일 — 발송 버튼 상태와 결과 문구
  const [weeklyPending, setWeeklyPending] = useState(false)
  const [weeklyStatus, setWeeklyStatus] = useState<string | null>(null)

  // 주간 새 공모전 다이제스트 발송. 응모·관심 공모전의 분야를 모아 '내 분야'로 쓰고,
  // 기록이 없으면 전체 분야 기준으로 보냅니다.
  const handleSendWeeklyDigest = async () => {
    if (!user?.email || weeklyPending) return
    setWeeklyPending(true)
    setWeeklyStatus(null)
    const known = new Map(contests.map((contest) => [contest.id, String(contest.field ?? '')] as const))
    const fields = [
      ...new Set(
        [...myContests, ...wishlist]
          .map((item) => (known.get(item.id) ?? '').split(' ')[0])
          .filter(Boolean),
      ),
    ]
    try {
      const payload = await sendWeeklyDigest({
        nickname: user.nickname,
        email: user.email,
        fields,
        contests: contests.map((contest) => ({
          id: contest.id,
          title: contest.title,
          field: String(contest.field ?? ''),
          deadline: contest.deadline,
          url: contest.url,
        })),
      })
      const data = payload?.data
      setWeeklyStatus(
        data?.matched > 0
          ? `발송 완료! 새 공모전 ${data.matched}건을 ${user.email}로 보냈어요.`
          : data?.message ?? '이번 주 새 소식이 없어요.',
      )
    } catch {
      setWeeklyStatus('발송에 실패했어요. 백엔드가 켜져 있는지 확인해 주세요.')
    } finally {
      setWeeklyPending(false)
    }
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

  // 데이터 내보내기·가져오기 — 이 브라우저에만 저장되는 데이터를 파일로 옮깁니다.
  const [dataMessage, setDataMessage] = useState<string | null>(null)

  const handleExportData = () => {
    downloadUserData()
    setDataMessage('내보내기 파일(JSON)을 다운로드했어요.')
  }

  const handleImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text())
      const merged = mergeImportedData(parsed)
      if (!merged) {
        setDataMessage('공내비 내보내기 파일이 아니에요. 다른 파일을 선택해 주세요.')
        return
      }
      try {
        if (merged.typeTest !== null) {
          localStorage.setItem('gongnabi:type-test', JSON.stringify(merged.typeTest))
        }
        localStorage.setItem(
          'idea-navigation:submission-checklist',
          JSON.stringify(merged.checklist),
        )
      } catch {
        // 저장 실패 시에도 가져온 목록은 반영을 계속 진행합니다.
      }
      onImportLists(merged.myContests, merged.wishlist, merged.savedIdeas)
      setDataMessage('데이터를 가져왔어요. 기존 목록에 합쳐졌어요.')
    } catch {
      setDataMessage('파일을 읽지 못했어요. 내보낸 JSON 파일인지 확인해 주세요.')
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
              <div className="profile-actions">
                <button
                  type="button"
                  className="profile-edit-button"
                  aria-expanded={profileEditOpen}
                  onClick={() => setProfileEditOpen((open) => !open)}
                >
                  {profileEditOpen ? '수정 닫기' : '회원정보 수정'}
                </button>
                <button type="button" className="logout-button" onClick={onLogout}>
                  로그아웃
                </button>
              </div>
            </div>

            {profileEditOpen && (
            <section className="profile-edit" aria-labelledby="profile-edit-title">
              <h2 id="profile-edit-title">회원정보 수정</h2>
              <p className="profile-edit-hint">
                아이디(표시 이름)를 바꾸면 대시보드·나비 챗봇에도 새 이름이 나와요. 저장하려면 현재
                비밀번호 확인이 필요합니다.
              </p>
              <form className="profile-edit-form" onSubmit={handleProfileSubmit}>
                <div className="profile-edit-grid">
                  <label>
                    아이디(표시 이름)
                    <input
                      value={profileNickname}
                      onChange={(event) => setProfileNickname(event.target.value)}
                      maxLength={20}
                      required
                    />
                  </label>
                  <label>
                    이메일
                    <input
                      type="email"
                      value={profileEmail}
                      onChange={(event) => setProfileEmail(event.target.value)}
                      maxLength={60}
                      required
                    />
                  </label>
                  <label>
                    휴대폰(선택)
                    <input
                      value={profilePhone}
                      onChange={(event) => setProfilePhone(event.target.value)}
                      placeholder="숫자만 입력"
                      maxLength={13}
                    />
                  </label>
                  <label>
                    현재 비밀번호
                    <input
                      type="password"
                      value={profilePassword}
                      onChange={(event) => setProfilePassword(event.target.value)}
                      required
                    />
                  </label>
                </div>
                <div className="profile-edit-actions">
                  <button type="submit" className="profile-save-button" disabled={profilePending}>
                    {profilePending ? '저장 중…' : '저장하기'}
                  </button>
                  {profileStatus && (
                    <p className={`profile-edit-status tone-${profileStatus.tone}`} role="status">
                      {profileStatus.text}
                    </p>
                  )}
                </div>
              </form>
            </section>
            )}

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
                    return (
                      <li key={contest.id} className="my-contest-item">
                        <div className="my-contest-info">
                          <h3>{contest.title}</h3>
                          <p className="my-contest-meta">
                            {contest.organizer} · 마감 {contest.deadline}
                          </p>
                          <p className="my-contest-applied">
                            {contest.appliedAt} 응모
                          </p>
                          <div
                            className="result-group"
                            role="group"
                            aria-label={`${contest.title} 응모 결과 기록`}
                          >
                            {RESULT_OPTIONS.map((option) => {
                              const active = (contest.result ?? 'progress') === option.value
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={`result-chip tone-${option.value}${active ? ' is-active' : ''}`}
                                  aria-pressed={active}
                                  onClick={() => onContestResult(contest.id, option.value)}
                                >
                                  {option.label}
                                </button>
                              )
                            })}
                          </div>
                        </div>
                        <div className="my-contest-actions">
                          <a href={contest.url} target="_blank" rel="noreferrer">
                            공모전 페이지 ↗
                          </a>
                          <button
                            type="button"
                            className="cancel-apply-button"
                            onClick={() => onCancelApply(contest.id)}
                          >
                            응모 취소
                          </button>
                        </div>
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
                  아이디와 비밀번호로 가입하고, 이메일로 공모전 마감 알림을 받아 보세요.
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
                  placeholder="휴대폰 번호 (선택)"
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
            <p className="login-note">
              계정과 내역은 서버에 저장돼요. 브라우저를 정리해도 로그인하면 그대로 돌아와요.
            </p>
          </form>
        )}

        <GrowthTimeline myContests={myContests} savedIdeas={savedIdeas} />

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
                이메일로도 마감 알림 받기
              </label>
              <p className="notif-hint">
                {user.email
                  ? '응모·관심 공모전 마감 7일 전·3일 전·당일에 이메일로 알려 드려요.'
                  : '마감 알림을 받으려면 회원가입 때 이메일을 입력해 주세요.'}
              </p>
            </div>
          )}
          {user?.email && (
            <div className="notif-setting">
              <p className="weekly-title">주간 새 공모전 이메일</p>
              <p className="notif-hint">
                이번 주 접수 중이거나 마감이 다가오는 공모전을 응모·관심 기록의 분야 기준으로 모아
                메일로 보내 드려요. 기록이 없으면 전체 분야 기준이에요.
              </p>
              <button
                type="button"
                className="weekly-send-button"
                onClick={handleSendWeeklyDigest}
                disabled={weeklyPending}
              >
                {weeklyPending ? '보내는 중…' : '이번 주 소식 메일로 받기'}
              </button>
              {weeklyStatus && (
                <p className="weekly-status" role="status">
                  {weeklyStatus}
                </p>
              )}
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
                  {(alert.tone === 'today' || alert.tone === 'urgent') && (
                    <button
                      type="button"
                      className="alert-dismiss"
                      onClick={() => onDismissAlert(alert)}
                    >
                      확인 ✓
                    </button>
                  )}
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

        <section aria-labelledby="data-title" className="data-section">
          <h2 id="data-title">데이터 관리</h2>
          <p className="data-caption">
            내 응모·관심·보관함 데이터는 이 브라우저에만 저장돼요. 파일로 내보내 다른
            브라우저나 기기에서 가져올 수 있어요. 계정 정보는 보안상 내보내기에 포함되지
            않아요.
          </p>
          <div className="data-actions">
            <button type="button" className="data-export-button" onClick={handleExportData}>
              데이터 내보내기 (JSON)
            </button>
            <label className="data-import-label">
              데이터 가져오기
              <input
                type="file"
                accept="application/json,.json"
                className="data-import-input"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleImportFile(file)
                  event.target.value = ''
                }}
              />
            </label>
          </div>
          {dataMessage && (
            <p className="idea-form-message" role="status">
              {dataMessage}
            </p>
          )}
        </section>
      </div>
    </div>
  )
}

export default MyPage
