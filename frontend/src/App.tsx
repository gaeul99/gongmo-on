import { useEffect, useMemo, useRef, useState } from 'react'
import HomePage from './pages/HomePage'
import IdeaInputPage from './pages/IdeaInputPage'
import ResultPage from './pages/ResultPage'
import MyPage from './pages/MyPage'
import DashboardPage from './pages/DashboardPage'
import TypeTestPage from './pages/TypeTestPage'
import ContestDetailPage from './pages/ContestDetailPage'
import PracticeNotePage from './pages/PracticeNotePage'
import TopNav from './components/TopNav'
import NabiChat from './components/NabiChat'
import SiteFooter from './components/SiteFooter'
import ThemeToggle from './components/ThemeToggle'
import type {
  AppliedContest,
  AuthResult,
  ContestAlert,
  SavedIdea,
  User,
  WishlistContest,
} from './pages/MyPage'
import type { IdeaInput, TypeIdeaHints } from './pages/IdeaInputPage'
import type { Analysis } from './types/analysis'
import { signIn, signUp, requestLogout, getAuthToken, updateProfile } from './services/auth.js'
import { syncNotificationSubscription } from './services/notificationService.js'
import { pullUserData, pushUserData } from './services/userDataSync.js'
import { mergeImportedData, writeLocalOnlyData, EXPORT_KIND, EXPORT_VERSION } from './utils/dataPortability.js'
import {
  buildContestAlerts,
  urgentAlertCount,
  loadDismissedAlertIds,
  saveDismissedAlertIds,
  markAlertDismissed,
  alertDismissKey,
} from './utils/contestAlerts.js'

type Screen =
  | 'home'
  | 'input'
  | 'result'
  | 'mypage'
  | 'dashboard'
  | 'test'
  | 'contest'
  | 'notes'

const PATH_BY_SCREEN: Record<Screen, string> = {
  home: '/',
  input: '/input',
  result: '/result',
  mypage: '/mypage',
  dashboard: '/dashboard',
  test: '/test',
  contest: '/contest',
  notes: '/notes',
}

const IDEA_STORAGE_KEY = 'idea-navigation:idea'
const USER_STORAGE_KEY = 'idea-navigation:user'
const MY_CONTESTS_STORAGE_KEY = 'idea-navigation:my-contests'
const WISHLIST_STORAGE_KEY = 'idea-navigation:wishlist'
const SAVED_IDEAS_STORAGE_KEY = 'idea-navigation:saved-ideas'
const NOTIF_OPT_IN_STORAGE_KEY = 'idea-navigation:notif-opt-in'
// 유형 검사·자가 점검·연습 노트는 각 화면이 localStorage에 직접 씁니다.
// 서버 백업 시 푸시 시점의 최신 값을 함께 담아 갑니다.
const TYPE_TEST_STORAGE_KEY = 'gongnabi:type-test'
const CHECKLIST_STORAGE_KEY = 'idea-navigation:submission-checklist'
const ROADMAP_STORAGE_KEY = 'idea-navigation:roadmaps'
const PRACTICE_NOTES_STORAGE_KEY = 'idea-navigation:practice-notes'
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

// 이메일 알림 수신 동의. 한 번도 건드리지 않았다면 기본으로 켭니다.
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

// localStorage에서 JSON 값을 읽습니다. 서버 백업 직전 최신 값을 담을 때 씁니다.
function readStoredJson<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

// 서버 백업 페이로드 — 목록은 앱 상태, 유형 검사·자가 점검·연습 노트는
// 푸시 시점의 localStorage 최신 값을 담습니다(각 화면이 직접 쓰는 값이라).
function buildSyncPayload(
  myContests: AppliedContest[],
  wishlist: WishlistContest[],
  savedIdeas: SavedIdea[],
) {
  return {
    myContests,
    wishlist,
    savedIdeas,
    typeTest: readStoredJson<unknown>(TYPE_TEST_STORAGE_KEY, null),
    checklist: readStoredJson<Record<string, boolean>>(CHECKLIST_STORAGE_KEY, {}),
    roadmaps: readStoredJson<Record<string, unknown>>(ROADMAP_STORAGE_KEY, {}),
    practiceNotes: readStoredJson<unknown[]>(PRACTICE_NOTES_STORAGE_KEY, []),
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
  if (pathname === PATH_BY_SCREEN.notes) {
    return 'notes'
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
  const [typeHints, setTypeHints] = useState<TypeIdeaHints | null>(null)
  // 서버 토큰이 없는 옛 세션(서버 저장 도입 전 로그인)은 동기화가 안 되므로 로그아웃 상태로 시작합니다.
  const [user, setUser] = useState<User | null>(() => (getAuthToken() ? loadUser() : null))
  const [myContests, setMyContests] = useState<AppliedContest[]>(loadMyContests)
  const [wishlist, setWishlist] = useState<WishlistContest[]>(loadWishlist)
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>(loadSavedIdeas)
  // 로그인 복원·연습 노트 저장 등으로 서버 백업이 필요해진 횟수. 각 화면이 이 값으로
  // localStorage의 자기 데이터를 다시 읽고, 백업도 다시 실행합니다.
  const [syncVersion, setSyncVersion] = useState(0)
  // 서버 백업 푸시는 로그인 직후 복원(풀)이 성공한 뒤에만 허용합니다.
  // 복원 전 푸시하면 서버 백업을 미완성 로컬 목록으로 덮어쓸 수 있어서입니다.
  const canPushRef = useRef(false)
  // 보관함 '다시 보기'로 연 결과 화면에서 복원할 스냅숏을 담고 있습니다.
  // 새로 분석을 시작하면(null로 초기화) AI를 새로 요청합니다.
  const [openedSaved, setOpenedSaved] = useState<SavedIdea | null>(null)
  const [notifOptIn, setNotifOptIn] = useState<boolean>(loadNotifOptIn)
  // 마지막으로 확인한 마감 알림 조합. 마이페이지를 열면 현재 조합으로 갱신됩니다.
  const [seenAlertKey, setSeenAlertKey] = useState<string>(() => {
    try {
      return localStorage.getItem(ALERTS_SEEN_STORAGE_KEY) ?? ''
    } catch {
      return ''
    }
  })
  // 내가 하나씩 확인(읽음)한 마감 알림. 확인한 것은 배지 개수에서 빠집니다.
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>(loadDismissedAlertIds)

  // 알림 하나를 확인 처리하고 localStorage에도 기록합니다.
  const dismissAlert = (alert: ContestAlert) => {
    setDismissedAlertIds((ids) => {
      const next = markAlertDismissed(ids, alert)
      saveDismissedAlertIds(next)
      return next
    })
  }

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
  // 배지 개수 = 오늘 마감·임박 알림 중 내가 아직 확인하지 않은 것.
  // 또한 한 번도 확인 화면을 안 열었던 새 조합이면 전부 세어 보여 준다(seenAlertKey).
  const dismissedKeys = useMemo(() => new Set(dismissedAlertIds), [dismissedAlertIds])
  const unconfirmedUrgentCount = useMemo(
    () =>
      alerts.filter(
        (alert) =>
          (alert.tone === 'today' || alert.tone === 'urgent') &&
          !dismissedKeys.has(alertDismissKey(alert)),
      ).length,
    [alerts, dismissedKeys],
  )
  const newCombination =
    urgentCount > 0 && urgentAlertKey !== seenAlertKey
  const myPageBadgeCount = newCombination
    ? urgentCount
    : unconfirmedUrgentCount

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
    setTypeHints(null)
    setOpenedSaved(null)
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
      void restoreFromServer()
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
      void restoreFromServer()
      return { ok: true, user: nextUser }
    }
    return { ok: false, error: result.error ?? '가입에 실패했어요. 다시 시도해 주세요.' }
  }

  // 회원정보 수정 — 서버에 저장하고 바뀐 user를 세션과 상태에 반영합니다.
  // 아이디를 바꿔도 로그인 상태가 유지되므로 서버 복원은 다시 돌지 않습니다.
  const handleUpdateProfile = async (payload: {
    currentPassword: string
    nickname: string
    email: string
    phone: string
  }): Promise<AuthResult> => {
    const result = await updateProfile(payload)
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
    return { ok: false, error: result.error ?? '회원정보 저장에 실패했어요. 다시 시도해 주세요.' }
  }

  const handleLogout = () => {
    requestLogout().catch(() => {
      // 서버 세션은 30일 뒤 자동 만료되므로 실패해도 계속 진행합니다.
    })
    try {
      localStorage.removeItem(USER_STORAGE_KEY)
    } catch {
      // 제거에 실패해도 화면 상태는 로그아웃으로 바꿉니다.
    }
    setUser(null)
    canPushRef.current = false
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
    if (!user || !user.email) return
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
      ideaCategories,
      contests: [...contestMap.values()],
      optIn: notifOptIn,
    }).catch(() => {
      // 백엔드가 꺼져 있어도 화면 동작에는 지장 없게 조용히 건너뜁니다.
    })
  }, [user, myContests, wishlist, savedIdeas, notifOptIn])

  // 로그인 직후 서버에 저장된 내역을 가져와 이 브라우저 목록과 합칩니다.
  // 브라우저를 정리해 localStorage가 비어 있어도 서버 백업으로 복원됩니다.
  // 병합은 내보내기 파일 가져오기와 같은 규칙(기존 항목 유지, 없는 것만 추가)을 씁니다.
  const restoreFromServer = async () => {
    try {
      const result = await pullUserData()
      if (!result.ok) return
      const merged = mergeImportedData({
        kind: EXPORT_KIND,
        version: EXPORT_VERSION,
        data: result.data,
      })
      if (!merged) return
      writeLocalOnlyData(merged)
      setMyContests(merged.myContests)
      persistList(MY_CONTESTS_STORAGE_KEY, merged.myContests)
      setWishlist(merged.wishlist)
      persistList(WISHLIST_STORAGE_KEY, merged.wishlist)
      setSavedIdeas(merged.savedIdeas)
      persistList(SAVED_IDEAS_STORAGE_KEY, merged.savedIdeas)
      canPushRef.current = true
      setSyncVersion((v) => v + 1)
    } catch {
      // 백엔드가 꺼져 있어도 로그인 자체는 계속 진행됩니다.
    }
  }

  // 로그인 중이고 서버 복원이 한 번 성공한 뒤에는 목록이 바뀔 때마다
  // 서버에 백업합니다(0.8초 디바운스). 유형 검사·자가 점검·연습 노트처럼
  // 각 화면이 localStorage에 직접 쓴 값도 이 시점에 함께 백업됩니다.
  useEffect(() => {
    if (!user || !canPushRef.current) return
    const timer = window.setTimeout(() => {
      pushUserData(buildSyncPayload(myContests, wishlist, savedIdeas)).catch(() => {
        // 백엔드가 꺼져 있으면 다음 변경 때 다시 시도합니다.
      })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [user, myContests, wishlist, savedIdeas, syncVersion])

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

  // 응모 결과(진행 중·수상·탈락) 기록 — 대시보드 도전 히스토리의 재료가 됩니다.
  const handleContestResult = (id: number, result: 'progress' | 'won' | 'lost') => {
    const next = myContests.map((contest) =>
      contest.id === id ? { ...contest, result, resultAt: new Date().toISOString().slice(0, 10) } : contest,
    )
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
  const handleSaveIdea = (target: Omit<SavedIdea, 'id' | 'savedAt'>, analysis: Analysis | null = null): boolean => {
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
      analysis,
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
  // 저장된 분석 스냅숏이 있으면 AI 재요청 없이 그 결과를 바로 보여 줍니다.
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
    setTypeHints(null)
    setOpenedSaved(saved)
    navigate('result')
  }

  // 분석이 끝날 때마다 보관함의 같은 아이디어 스냅숏을 최신 결과로 갱신합니다.
  const handleAnalysisSettled = (analysis: Analysis) => {
    if (!idea) return
    const exists = savedIdeas.some(
      (saved) =>
        saved.title === idea.title &&
        saved.description === idea.description &&
        saved.category === idea.category,
    )
    if (!exists) return
    const next = savedIdeas.map((saved) =>
      saved.title === idea.title &&
      saved.description === idea.description &&
      saved.category === idea.category
        ? { ...saved, analysis }
        : saved,
    )
    setSavedIdeas(next)
    persistList(SAVED_IDEAS_STORAGE_KEY, next)
  }

  // 데이터 가져오기(내보내기 파일)로 들어온 목록을 앱 상태에 반영합니다.
  const handleImportLists = (
    nextMyContests: AppliedContest[],
    nextWishlist: WishlistContest[],
    nextSavedIdeas: SavedIdea[],
  ) => {
    setMyContests(nextMyContests)
    persistList(MY_CONTESTS_STORAGE_KEY, nextMyContests)
    setWishlist(nextWishlist)
    persistList(WISHLIST_STORAGE_KEY, nextWishlist)
    setSavedIdeas(nextSavedIdeas)
    persistList(SAVED_IDEAS_STORAGE_KEY, nextSavedIdeas)
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
        onDismissAlert={dismissAlert}
        onGoHome={() => navigate('home')}
        menuItems={[
          {
            key: 'analyze',
            emoji: '💡',
            label: '아이디어 분석',
            description: '강점 분석 + 공모전 추천',
            onSelect: () => {
              setPrefill(null)
              setTypeHints(null)
              navigate('input')
            },
          },
          {
            key: 'typetest',
            emoji: '📝',
            label: '유형 검사',
            description: '2분 성향 검사로 시작',
            onSelect: () => navigate('test'),
          },
          {
            key: 'dashboard',
            emoji: '📊',
            label: '대시보드',
            description: '마감·통계 한눈에',
            onSelect: () => navigate('dashboard'),
          },
          {
            key: 'notes',
            emoji: '🗒️',
            label: '연습 노트',
            description: '응모 전 심사 연습',
            onSelect: () => navigate('notes'),
          },
          {
            key: 'mypage',
            emoji: '👤',
            label: '마이페이지',
            description: '찜·응모·알림 관리',
            onSelect: () => navigate('mypage'),
          },
        ]}
        onGoMyPage={() => navigate('mypage')}
        onOpenContest={openContest}
        onToggleWish={handleToggleWish}
        wishlistedContestIds={wishlist.map((contest) => contest.id)}
      />
      <ThemeToggle />
      <NabiChat
        onOpenContest={openContest}
        onGoInput={() => {
          setPrefill(null)
          setTypeHints(null)
          navigate('input')
        }}
      />
      {screen === 'home' && (
        <HomePage
          onStart={() => {
            setPrefill(null)
            setTypeHints(null)
            navigate('input')
          }}
          onDashboard={() => navigate('dashboard')}
          onTypeTest={() => navigate('test')}
          onNotes={() => navigate('notes')}
          onOpenContest={openContest}
        />
      )}
      {screen === 'input' && (
        <IdeaInputPage
          initialIdea={prefill}
          typeHints={typeHints}
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
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
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
          onGoInput={(category, hints) => {
            setPrefill({ title: '', description: '', category })
            setTypeHints(hints)
            navigate('input')
          }}
        />
      )}
      {screen === 'result' && idea && (
        <ResultPage
          idea={idea}
          onRestart={() => {
            setOpenedSaved(null)
            navigate('input')
          }}
          user={user}
          appliedContestIds={myContests.map((contest) => contest.id)}
          wishlistedContestIds={wishlist.map((contest) => contest.id)}
          ideaSaved={ideaSaved}
          initialAnalysis={openedSaved?.analysis ?? null}
          onAnalysisSettled={handleAnalysisSettled}
          onApplyContest={handleApplyContest}
          onToggleWish={handleToggleWish}
          onSaveIdea={(analysis) => handleSaveIdea(idea, analysis)}
          onGoMyPage={() => navigate('mypage')}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
        />
      )}
      {screen === 'dashboard' && (
        <DashboardPage
          onOpenContest={openContest}
          user={user}
          onGoLogin={() => navigate('mypage')}
        />
      )}
      {screen === 'notes' && (
        <PracticeNotePage
          dataVersion={syncVersion}
          onNotesChanged={() => setSyncVersion((v) => v + 1)}
          onBack={() => navigate('home')}
          onGoInput={() => {
            setPrefill(null)
            setTypeHints(null)
            navigate('input')
          }}
        />
      )}
      {screen === 'mypage' && (
        <MyPage
          user={user}
          myContests={myContests}
          wishlist={wishlist}
          savedIdeas={savedIdeas}
          alerts={alerts}
          onDismissAlert={dismissAlert}
          onLogin={handleSignIn}
          onSignup={handleSignUp}
          onUpdateProfile={handleUpdateProfile}
          onLogout={handleLogout}
          notifOptIn={notifOptIn}
          onToggleNotifOptIn={handleToggleNotifOptIn}
          onCancelApply={handleCancelApply}
          onContestResult={handleContestResult}
          onApplyWish={handleApplyContest}
          onRemoveWish={handleRemoveWish}
          onOpenIdea={handleOpenIdea}
          onDeleteIdea={handleDeleteIdea}
          onAddIdea={handleSaveIdea}
          onImportLists={handleImportLists}
          onBack={() => navigate('home')}
          onGoInput={() => {
            setPrefill(null)
            setTypeHints(null)
            navigate('input')
          }}
        />
      )}
      <SiteFooter />
    </>
  )
}

export default App
