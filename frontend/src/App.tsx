import { useEffect, useMemo, useState } from 'react'
import HomePage from './pages/HomePage'
import IdeaInputPage from './pages/IdeaInputPage'
import ResultPage from './pages/ResultPage'
import MyPage from './pages/MyPage'
import DashboardPage from './pages/DashboardPage'
import TypeTestPage from './pages/TypeTestPage'
import ContestDetailPage from './pages/ContestDetailPage'
import TopNav from './components/TopNav'
import NabiChat from './components/NabiChat'
import ThemeToggle from './components/ThemeToggle'
import type {
  AppliedContest,
  AuthResult,
  ContestAlert,
  SavedIdea,
  User,
  WishlistContest,
} from './pages/MyPage'
import type { IdeaInput } from './pages/IdeaInputPage'
import { signIn, signUp } from './services/auth.js'
import { syncNotificationSubscription } from './services/notificationService.js'
import { buildContestAlerts, urgentAlertCount } from './utils/contestAlerts.js'

type Screen = 'home' | 'input' | 'result' | 'mypage' | 'dashboard' | 'test' | 'contest'

const PATH_BY_SCREEN: Record<Screen, string> = {
  home: '/',
  input: '/input',
  result: '/result',
  mypage: '/mypage',
  dashboard: '/dashboard',
  test: '/test',
  contest: '/contest',
}

const IDEA_STORAGE_KEY = 'idea-navigation:idea'
const USER_STORAGE_KEY = 'idea-navigation:user'
const MY_CONTESTS_STORAGE_KEY = 'idea-navigation:my-contests'
const WISHLIST_STORAGE_KEY = 'idea-navigation:wishlist'
const SAVED_IDEAS_STORAGE_KEY = 'idea-navigation:saved-ideas'
const NOTIF_OPT_IN_STORAGE_KEY = 'idea-navigation:notif-opt-in'
// 마이페이지에서 마지막으로 확인한 마감 알림 조합(알림 id 나열). 이후 새 알림이 생기면 다시 배지가 붙습니다.
const ALERTS_SEEN_STORAGE_KEY = 'idea-navigation:alerts-seen'

function loadStoredIdea(): IdeaInput | null {
  try {
    const raw = sessionStorage.getItem(IDEA_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as IdeaInput) : null
  } catch {
    return null
  }
}

function loadUser(): User | null {
  try {
    const raw = localStorage.getItem(USER_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as User) : null
  } catch {
    return null
  }
}

function loadMyContests(): AppliedContest[] {
  try {
    const raw = localStorage.getItem(MY_CONTESTS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as AppliedContest[]) : []
  } catch {
    return []
  }
}

function loadWishlist(): WishlistContest[] {
  try {
    const raw = localStorage.getItem(WISHLIST_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as WishlistContest[]) : []
  } catch {
    return []
  }
}

function loadSavedIdeas(): SavedIdea[] {
  try {
    const raw = localStorage.getItem(SAVED_IDEAS_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as SavedIdea[]) : []
  } catch {
    return []
  }
}

// 이메일·문자 알림 수신 동의. 한 번도 건드리지 않았다면 기본으로 켭니다.
function loadNotifOptIn(): boolean {
  try {
    const raw = localStorage.getItem(NOTIF_OPT_IN_STORAGE_KEY)
    return raw === null ? true : raw === 'true'
  } catch {
    return true
  }
}

// localStorage에 목록을 저장합니다. 저장에 실패해도 화면 상태는 유지됩니다.
function persistList(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장에 실패해도 이 세션 안에서는 목록을 유지합니다.
  }
}

// 주소에 맞는 화면을 판별합니다. 결과 화면은 저장된 아이디어가 없으면 입력 화면으로 돌아갑니다.
function screenFromLocation(): Screen {
  const { pathname } = window.location
  if (pathname === PATH_BY_SCREEN.result) {
    return loadStoredIdea() ? 'result' : 'input'
  }
  if (/^\/contest\/\d+/.test(pathname)) {
    return 'contest'
  }
  if (pathname === PATH_BY_SCREEN.input) {
    return 'input'
  }
  if (pathname === PATH_BY_SCREEN.mypage) {
    return 'mypage'
  }
  if (pathname === PATH_BY_SCREEN.dashboard) {
    return 'dashboard'
  }
  if (pathname === PATH_BY_SCREEN.test) {
    return 'test'
  }
  return 'home'
}

// /contest/:id 주소에서 공모전 id를 뽑아 냅니다. 없는 형태면 0(=못 찾음)으로 돌려 줍니다.
function contestIdFromLocation(): number {
  const match = /^\/contest\/(\d+)/.exec(window.location.pathname)
  return match ? Number(match[1]) : 0
}

function App() {
  const [screen, setScreen] = useState<Screen>(screenFromLocation)
  const [idea, setIdea] = useState<IdeaInput | null>(loadStoredIdea)
  // 유형 검사 결과에서 넘어올 때 입력 화면에 미리 채워 넣을 때 사용합니다.
  const [prefill, setPrefill] = useState<IdeaInput | null>(null)
  const [user, setUser] = useState<User | null>(loadUser)
  const [myContests, setMyContests] = useState<AppliedContest[]>(loadMyContests)
  const [wishlist, setWishlist] = useState<WishlistContest[]>(loadWishlist)
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>(loadSavedIdeas)
  const [notifOptIn, setNotifOptIn] = useState<boolean>(loadNotifOptIn)
  // 마지막으로 확인한 마감 알림 조합. 마이페이지를 열면 현재 조합으로 갱신됩니다.
  const [seenAlertKey, setSeenAlertKey] = useState<string>(() => {
    try {
      return localStorage.getItem(ALERTS_SEEN_STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  })

  // 응모·관심 공모전의 마감일로 알림을 만듭니다. 오늘 날짜가 바뀔 때는 화면을 다시 열면 반영됩니다.
  const alerts = useMemo(
    () => buildContestAlerts(myContests, wishlist) as ContestAlert[],
    [myContests, wishlist],
  )
  const urgentCount = useMemo(() => urgentAlertCount(alerts), [alerts])
  // 지금 확인이 필요한(오늘 마감·임박) 알림 목록의 조합. 조합이 바뀌면 새 알림이 생긴 것입니다.
  const urgentAlertKey = useMemo(
    () =>
      alerts
        .filter((alert) => alert.tone === 'today' || alert.tone === 'urgent')
        .map((alert) => alert.id)
        .sort()
        .join('|'),
    [alerts],
  )
  const myPageBadgeCount =
    urgentCount > 0 && urgentAlertKey !== seenAlertKey ? urgentCount : 0

  // 마이페이지를 열고 있는 동안에는 마감 알림을 모두 확인한 것으로 기록합니다.
  useEffect(() => {
    if (screen !== 'mypage' || urgentAlertKey === seenAlertKey) return
    setSeenAlertKey(urgentAlertKey)
    try {
      localStorage.setItem(ALERTS_SEEN_STORAGE_KEY, urgentAlertKey)
    } catch {
      // 저장에 실패해도 이 세션 안에서는 확인 상태를 유지합니다.
    }
  }, [screen, urgentAlertKey, seenAlertKey])

  // 브라우저 뒤로/앞으로 버튼으로 화면을 이동합니다.
  useEffect(() => {
    const handlePopState = () => setScreen(screenFromLocation())
    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [])

  // 브라우저가 새로고침·뒤로 가기 때 옛 스크롤 위치를 되살리지 않게 막습니다.
  useEffect(() => {
    if ('scrollRestoration' in window.history) {
      window.history.scrollRestoration = 'manual'
    }
  }, [])

  // 화면이 바뀔 때마다 맨 위에서부터 보여 줍니다. (보관함 '다시 보기'처럼
  // 페이지 아래에서 화면을 열어도 결과가 위에서 시작하게)
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [screen])

  // 결과 화면 주소인데 저장된 아이디어가 없으면 주소를 입력 화면에 맞춰 둡니다.
  useEffect(() => {
    if (window.location.pathname === PATH_BY_SCREEN.result && !loadStoredIdea()) {
      window.history.replaceState(null, '', PATH_BY_SCREEN.input)
    }
  }, [])

  const navigate = (next: Screen) => {
    window.history.pushState(null, '', PATH_BY_SCREEN[next])
    setScreen(next)
  }

  const handleAnalyze = (submitted: IdeaInput) => {
    try {
      sessionStorage.setItem(IDEA_STORAGE_KEY, JSON.stringify(submitted))
    } catch {
      // 저장에 실패해도 화면 전환은 계속 진행합니다.
    }
    setIdea(submitted)
    setPrefill(null)
    navigate('result')
  }

  const saveSession = (nextUser: User) => {
    try {
      localStorage.setItem(USER_STORAGE_KEY, JSON.stringify(nextUser))
    } catch {
      // 저장에 실패해도 이 세션 안에서는 로그인 상태를 유지합니다.
    }
    setUser(nextUser)
  }

  const handleSignIn = async (nickname: string, password: string): Promise<AuthResult> => {
    const result = await signIn(nickname, password)
    if (result.ok && result.user) {
      const nextUser: User = {
        nickname: result.user.nickname,
        joinedAt: result.user.joinedAt,
        email: result.user.email,
        phone: result.user.phone,
      }
      saveSession(nextUser)
      return { ok: true, user: nextUser }
    }
    return { ok: false, error: result.error ?? '로그인에 실패했어요. 다시 시도해 주세요.' }
  }

  const handleSignUp = async (
    nickname: string,
    password: string,
    email: string,
    phone: string,
  ): Promise<AuthResult> => {
    const result = await signUp(nickname, password, email, phone)
    if (result.ok && result.user) {
      const nextUser: User = {
        nickname: result.user.nickname,
        joinedAt: result.user.joinedAt,
        email: result.user.email,
        phone: result.user.phone,
      }
      saveSession(nextUser)
      return { ok: true, user: nextUser }
    }
    return { ok: false, error: result.error ?? '가입에 실패했어요. 다시 시도해 주세요.' }
  }

  const handleLogout = () => {
    try {
      localStorage.removeItem(USER_STORAGE_KEY)
    } catch {
      // 제거에 실패해도 화면 상태는 로그아웃으로 바꿉니다.
    }
    setUser(null)
  }

  const handleToggleNotifOptIn = (next: boolean) => {
    try {
      localStorage.setItem(NOTIF_OPT_IN_STORAGE_KEY, String(next))
    } catch {
      // 저장에 실패해도 이 세션 안에서는 설정을 유지합니다.
    }
    setNotifOptIn(next)
  }

  // 로그인 상태·응모/관심 목록·수신 설정이 바뀔 때마다 백엔드 구독 정보를 최신으로 동기화합니다.
  useEffect(() => {
    if (!user || (!user.email && !user.phone)) return
    const contestMap = new Map<
      number,
      { id: number; title: string; deadline: string; url?: string }
    >()
    for (const contest of [...myContests, ...wishlist]) {
      contestMap.set(contest.id, {
        id: contest.id,
        title: contest.title,
        deadline: contest.deadline,
        url: contest.url,
      })
    }
    const ideaCategories = [...new Set(savedIdeas.map((item) => item.category).filter(Boolean))]
    syncNotificationSubscription({
      nickname: user.nickname,
      email: user.email,
      phone: user.phone,
      ideaCategories,
      contests: [...contestMap.values()],
      optIn: notifOptIn,
    }).catch(() => {
      // 백엔드가 꺼져 있어도 화면 동작에는 지장 없게 조용히 건너뜁니다.
    })
  }, [user, myContests, wishlist, savedIdeas, notifOptIn])

  const handleApplyContest = (target: Omit<AppliedContest, 'appliedAt'>) => {
    if (!user || myContests.some((contest) => contest.id === target.id)) return
    const entry: AppliedContest = { ...target, appliedAt: new Date().toISOString().slice(0, 10) }
    const next = [entry, ...myContests]
    setMyContests(next)
    persistList(MY_CONTESTS_STORAGE_KEY, next)
    // 응모한 공모전은 관심 목록에서 자동으로 옮겨 간 것으로 처리합니다.
    const nextWishlist = wishlist.filter((contest) => contest.id !== target.id)
    if (nextWishlist.length !== wishlist.length) {
      setWishlist(nextWishlist)
      persistList(WISHLIST_STORAGE_KEY, nextWishlist)
    }
  }

  const handleCancelApply = (id: number) => {
    const next = myContests.filter((contest) => contest.id !== id)
    setMyContests(next)
    persistList(MY_CONTESTS_STORAGE_KEY, next)
  }

  const handleToggleWish = (target: Omit<WishlistContest, 'addedAt'>) => {
    const exists = wishlist.some((contest) => contest.id === target.id)
    const next = exists
      ? wishlist.filter((contest) => contest.id !== target.id)
      : [
          { ...target, addedAt: new Date().toISOString().slice(0, 10) },
          ...wishlist,
        ]
    setWishlist(next)
    persistList(WISHLIST_STORAGE_KEY, next)
  }

  const handleRemoveWish = (id: number) => {
    const next = wishlist.filter((contest) => contest.id !== id)
    setWishlist(next)
    persistList(WISHLIST_STORAGE_KEY, next)
  }

  // 중복(제목·설명·분야 모두 일치)이면 저장하지 않고 false를 돌려줍니다.
  const handleSaveIdea = (target: Omit<SavedIdea, 'id' | 'savedAt'>): boolean => {
    const exists = savedIdeas.some(
      (saved) =>
        saved.title === target.title &&
        saved.description === target.description &&
        saved.category === target.category,
    )
    if (exists) return false
    const entry: SavedIdea = {
      id: `${Date.now()}`,
      ...target,
      savedAt: new Date().toISOString().slice(0, 10),
    }
    const next = [entry, ...savedIdeas]
    setSavedIdeas(next)
    persistList(SAVED_IDEAS_STORAGE_KEY, next)
    return true
  }

  const handleDeleteIdea = (id: string) => {
    const next = savedIdeas.filter((idea) => idea.id !== id)
    setSavedIdeas(next)
    persistList(SAVED_IDEAS_STORAGE_KEY, next)
  }

  // 보관함의 아이디어를 다시 열어 분석 결과 화면으로 이동합니다.
  const handleOpenIdea = (saved: SavedIdea) => {
    const restored: IdeaInput = {
      title: saved.title,
      description: saved.description,
      category: saved.category,
    }
    try {
      sessionStorage.setItem(IDEA_STORAGE_KEY, JSON.stringify(restored))
    } catch {
      // 저장에 실패해도 화면 전환은 계속 진행합니다.
    }
    setIdea(restored)
    setPrefill(null)
    navigate('result')
  }

  const ideaSaved =
    idea !== null &&
    savedIdeas.some(
      (saved) =>
        saved.title === idea.title &&
        saved.description === idea.description &&
        saved.category === idea.category,
    )

  // 앱 내 공모전 상세 화면으로 이동. 검색 팝업·마감 임박 목록이 함께 씁니다.
  const openContest = (id: number) => {
    window.history.pushState(null, '', `/contest/${id}`)
    setScreen('contest')
  }

  return (
    <>
      <TopNav
        loggedIn={user !== null}
        notificationCount={myPageBadgeCount}
        alerts={alerts}
        onGoHome={() => navigate('home')}
        onGoDashboard={() => navigate('dashboard')}
        onGoMyPage={() => navigate('mypage')}
        onOpenContest={openContest}
        onToggleWish={handleToggleWish}
        wishlistedContestIds={wishlist.map((contest) => contest.id)}
      />
      <ThemeToggle />
      <NabiChat />
      {screen === 'home' && (
        <HomePage
          onStart={() => {
            setPrefill(null)
            navigate('input')
          }}
          onDashboard={() => navigate('dashboard')}
          onTypeTest={() => navigate('test')}
          onOpenContest={openContest}
        />
      )}
      {screen === 'input' && (
        <IdeaInputPage
          initialIdea={prefill}
          onBack={() => navigate('home')}
          onAnalyze={handleAnalyze}
        />
      )}
      {screen === 'contest' && (
        <ContestDetailPage
          contestId={contestIdFromLocation()}
          user={user}
          appliedContestIds={myContests.map((contest) => contest.id)}
          wishlistedContestIds={wishlist.map((contest) => contest.id)}
          onApplyContest={handleApplyContest}
          onToggleWish={handleToggleWish}
          onGoMyPage={() => navigate('mypage')}
          onBack={() => {
            if (window.history.length > 1) {
              window.history.back()
            } else {
              navigate('home')
            }
          }}
        />
      )}
      {screen === 'test' && (
        <TypeTestPage
          onBack={() => navigate('home')}
          onGoInput={(category) => {
            setPrefill({ title: '', description: '', category })
            navigate('input')
          }}
        />
      )}
      {screen === 'result' && idea && (
        <ResultPage
          idea={idea}
          onRestart={() => navigate('input')}
          user={user}
          appliedContestIds={myContests.map((contest) => contest.id)}
          wishlistedContestIds={wishlist.map((contest) => contest.id)}
          ideaSaved={ideaSaved}
          onApplyContest={handleApplyContest}
          onToggleWish={handleToggleWish}
          onSaveIdea={() => handleSaveIdea(idea)}
          onGoMyPage={() => navigate('mypage')}
        />
      )}
      {screen === 'dashboard' && <DashboardPage onOpenContest={openContest} />}
      {screen === 'mypage' && (
        <MyPage
          user={user}
          myContests={myContests}
          wishlist={wishlist}
          savedIdeas={savedIdeas}
          alerts={alerts}
          onLogin={handleSignIn}
          onSignup={handleSignUp}
          onLogout={handleLogout}
          notifOptIn={notifOptIn}
          onToggleNotifOptIn={handleToggleNotifOptIn}
          onCancelApply={handleCancelApply}
          onApplyWish={handleApplyContest}
          onRemoveWish={handleRemoveWish}
          onOpenIdea={handleOpenIdea}
          onDeleteIdea={handleDeleteIdea}
          onAddIdea={handleSaveIdea}
          onBack={() => navigate('home')}
          onGoInput={() => {
            setPrefill(null)
            navigate('input')
          }}
        />
      )}
    </>
  )
}

export default App
