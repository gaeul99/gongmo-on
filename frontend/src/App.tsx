import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import HomePage from './pages/HomePage'
import IdeaInputPage from './pages/IdeaInputPage'
import ResultPage from './pages/ResultPage'
import MyPage from './pages/MyPage'
import DashboardPage from './pages/DashboardPage'
import TypeTestPage from './pages/TypeTestPage'
import ContestDetailPage from './pages/ContestDetailPage'
import ContestListPage, { type StatusFilter } from './pages/ContestListPage'
import PracticeNotePage from './pages/PracticeNotePage'
import type { NotePrefill } from './pages/PracticeNotePage'
import TopNav from './components/TopNav'
import SiteFooter from './components/SiteFooter'
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
import { loadSyncedContests } from './data/contestPool.js'
import { STORAGE_KEYS } from './utils/storageKeys.js'
import { useScrollReveal } from './utils/scrollReveal'
import {
  buildContestAlerts,
  urgentAlertCount,
  loadDismissedAlertIds,
  saveDismissedAlertIds,
  markAlertDismissed,
  alertDismissKey,
  getSeenAlertsKey,
  markAlertsSeen,
  subscribeSeenAlerts,
} from './utils/contestAlerts.js'

type Screen =
  | 'home'
  | 'input'
  | 'result'
  | 'mypage'
  | 'dashboard'
  | 'test'
  | 'contests'
  | 'contest'
  | 'notes'

const PATH_BY_SCREEN: Record<Screen, string> = {
  home: '/',
  input: '/input',
  result: '/result',
  mypage: '/mypage',
  dashboard: '/dashboard',
  test: '/test',
  contests: '/contest',
  contest: '/contest',
  notes: '/notes',
}

const IDEA_STORAGE_KEY = 'gongmo-on:idea'
// 마지막 분석 스냅숏 — 새로고침해도 결과 화면을 바로 볼 수 있게 세션에만 보관한다.
const ANALYSIS_STORAGE_KEY = 'gongmo-on:analysis'
const USER_STORAGE_KEY = 'gongmo-on:user'
const MY_CONTESTS_STORAGE_KEY = 'gongmo-on:my-contests'
const WISHLIST_STORAGE_KEY = 'gongmo-on:wishlist'
const SAVED_IDEAS_STORAGE_KEY = 'gongmo-on:saved-ideas'
const NOTIF_OPT_IN_STORAGE_KEY = 'gongmo-on:notif-opt-in'
// 유형 검사·자가 점검·연습 노트는 각 화면이 localStorage에 직접 씁니다.
// 서버 백업 시 푸시 시점의 최신 값을 함께 담아 갑니다.
const TYPE_TEST_STORAGE_KEY = STORAGE_KEYS.typeTest
const CHECKLIST_STORAGE_KEY = 'gongmo-on:submission-checklist'
const ROADMAP_STORAGE_KEY = 'gongmo-on:roadmaps'
const PRACTICE_NOTES_STORAGE_KEY = 'gongmo-on:practice-notes'

function loadStoredIdea(): IdeaInput | null {
  try {
    const raw = sessionStorage.getItem(IDEA_STORAGE_KEY)
    return raw ? (JSON.parse(raw) as IdeaInput) : null
  } catch {
    return null
  }
}

// 분석 스냅숏은 아이디어와 함께 저장해, 지금 보고 있는 아이디어와 다르면 버린다.
type AnalysisSnapshot = { idea: IdeaInput; analysis: Analysis }

function saveAnalysisSnapshot(idea: IdeaInput, analysis: Analysis) {
  try {
    sessionStorage.setItem(
      ANALYSIS_STORAGE_KEY,
      JSON.stringify({ idea, analysis } satisfies AnalysisSnapshot),
    )
  } catch {
    // 세션 저장 한도 초과 등 실패해도 화면 동작에는 지장 없습니다.
  }
}

function loadAnalysisSnapshot(idea: IdeaInput): Analysis | null {
  try {
    const raw = sessionStorage.getItem(ANALYSIS_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as AnalysisSnapshot
    if (
      parsed?.idea?.title !== idea.title ||
      parsed?.idea?.description !== idea.description ||
      parsed?.idea?.category !== idea.category ||
      !parsed.analysis
    ) {
      return null
    }
    return parsed.analysis
  } catch {
    return null
  }
}

function clearAnalysisSnapshot() {
  try {
    sessionStorage.removeItem(ANALYSIS_STORAGE_KEY)
  } catch {
    // 무시 — 지워지지 않아도 아이디어 비교로 걸러진다.
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

// /contest?status=... — 탐색 화면 필터도 주소로 정할 수 있게 합니다.
// 새 탭으로 열거나 공유한 주소에서도 '곧 시작' 필터가 그대로 걸립니다.
const EXPLORE_STATUS_VALUES: ReadonlySet<string> = new Set(['all', 'open', 'upcoming', 'closed'])

function exploreFilterFromLocation(): StatusFilter {
  const value = new URLSearchParams(window.location.search).get('status')
  return value && EXPLORE_STATUS_VALUES.has(value) ? (value as StatusFilter) : 'all'
}

// 주소에 맞는 화면을 판별합니다. 결과 화면은 저장된 아이디어가 없으면 입력 화면으로 돌아갑니다.
function screenFromLocation(): Screen {
  const { pathname } = window.location
  if (pathname === PATH_BY_SCREEN.result) {
    return loadStoredIdea() ? 'result' : 'input'
  }
  // /contest는 공모전 탐색(목록), /contest/:id는 개별 상세 화면이다.
  if (/^\/contest\/\d+/.test(pathname)) {
    return 'contest'
  }
  if (pathname === PATH_BY_SCREEN.contests) {
    return 'contests'
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
  // 모든 화면의 data-reveal 요소를 관찰해 스크롤 등장 애니메이션을 담당한다.
  useScrollReveal()
  const [screen, setScreen] = useState<Screen>(screenFromLocation)
  // 개별 공모전 상세 화면(/contest/:id)의 id. 새 탭에서 상세 주소를 곧바로
  // 열 때도 이 값으로 화면을 그립니다. 상세 화면에서 다른 상세로 넘어가거나
  // 뒤로·앞으로로 주소가 바뀌면 함께 갱신합니다.
  const [contestId, setContestId] = useState(contestIdFromLocation)
  const [idea, setIdea] = useState<IdeaInput | null>(loadStoredIdea)
  // 유형 검사 결과에서 넘어올 때 입력 화면에 미리 채워 넣을 때 사용합니다.
  const [prefill, setPrefill] = useState<IdeaInput | null>(null)
  const [typeHints, setTypeHints] = useState<TypeIdeaHints | null>(null)
  // 분석 결과 화면의 '연습 노트 만들기'로 넘어올 때 채워 넣을 노트 초안.
  // 다른 입구(메뉴·홈)에서 연습 노트를 열면 null로 비워 둡니다.
  const [notePrefill, setNotePrefill] = useState<NotePrefill | null>(null)
  // 서버 토큰이 없는 옛 세션(서버 저장 도입 전 로그인)은 동기화가 안 되므로 로그아웃 상태로 시작합니다.
  const [user, setUser] = useState<User | null>(() => (getAuthToken() ? loadUser() : null))
  const [myContests, setMyContests] = useState<AppliedContest[]>(loadMyContests)
  const [wishlist, setWishlist] = useState<WishlistContest[]>(loadWishlist)
  const [savedIdeas, setSavedIdeas] = useState<SavedIdea[]>(loadSavedIdeas)
  // 로그인 복원·연습 노트 저장 등으로 서버 백업이 필요해진 횟수. 각 화면이 이 값으로
  // localStorage의 자기 데이터를 다시 읽고, 백업도 다시 실행합니다.
  const [syncVersion, setSyncVersion] = useState(0)
  // 서버 백업(풀·푸시)이 실패하고 있음을 알리는 배너. 성공하면 바로 내려간다.
  const [backupFailed, setBackupFailed] = useState(false)
  // 서버 백업 푸시는 로그인 직후 복원(풀)이 성공한 뒤에만 허용합니다.
  // 복원 전 푸시하면 서버 백업을 미완성 로컬 목록으로 덮어쓸 수 있어서입니다.
  const canPushRef = useRef(false)
  // 보관함 '다시 보기'로 연 결과 화면에서 복원할 스냅숏을 담고 있습니다.
  // 새로 분석을 시작하면(null로 초기화) AI를 새로 요청합니다.
  const [openedSaved, setOpenedSaved] = useState<SavedIdea | null>(null)
  // 공모전 탐색 화면의 '적합도순' 정렬·뱃지에 쓸 마지막 분석 결과. 보관함 저장
  // 여부와 관계없이 결과 화면의 분석이 끝날 때마다 갱신되며, 새로고침 후에는
  // 보관함에 분석이 저장된 아이디어의 스냅숏으로 대체됩니다.
  const [latestAnalysis, setLatestAnalysis] = useState<Analysis | null>(null)
  const [notifOptIn, setNotifOptIn] = useState<boolean>(loadNotifOptIn)
  // 마지막으로 확인한 마감 알림 조합. 마이페이지를 열면 현재 조합으로 갱신됩니다.
  // localStorage를 외부 스토어로 구독합니다 — 갱신은 markAlertsSeen이 담당합니다.
  const seenAlertKey = useSyncExternalStore(subscribeSeenAlerts, getSeenAlertsKey)
  // 내가 하나씩 확인(읽음)한 마감 알림. 확인한 것은 배지 개수에서 빠집니다.
  const [dismissedAlertIds, setDismissedAlertIds] = useState<string[]>(loadDismissedAlertIds)
  // 읽음(확인) 처리한 알림 키 집합 — 알림 목록에서 연회색 '읽음' 스타일로 표시할 때 씁니다.
  const readAlertKeys = new Set(dismissedAlertIds)

  // 알림 하나를 확인 처리하고 localStorage에도 기록합니다.
  const dismissAlert = (alert: ContestAlert) => {
    setDismissedAlertIds((ids) => {
      const next = markAlertDismissed(ids, alert)
      saveDismissedAlertIds(next)
      return next
    })
  }

  // 알림을 모두 읽음 처리합니다. 상단 종·마이페이지 아이콘을 누르거나
  // '모두 읽음' 버튼을 누르면 배지가 바로 사라지도록, 지금 목록에 있는 알림을
  // 개별 확인 기록에 넣고 새 알림 조합 키도 지금 것으로 갱신합니다.
  // 이후 마감이 임박한 새 알림이 생기면 배지는 다시 붙습니다.
  // (utils의 markAlertDismissed 대신 여기서 키를 만드는 이유 — 상태 배열을
  // 직접 불투명 함수에 넘기지 않게 하기 위해서다. 키 형식은 alertDismissKey와 같다.)
  const markAllAlertsRead = () => {
    const keys = alerts.map((alert) => `${alert.id}:${alert.tone}`)
    const next = dismissedAlertIds.concat(
      keys.filter((key) => !dismissedAlertIds.includes(key)),
    )
    saveDismissedAlertIds(next)
    setDismissedAlertIds(next)
    markAlertsSeen(urgentAlertKey)
  }

  // 알림을 모두 읽지 않음 처리합니다. '모두 읽음'의 반대 — 지금 목록에 있는 알림을
  // 개별 확인 기록에서 빼고 새 알림 조합 키도 지워, 배지와 '읽음' 스타일을 되살립니다.
  const markAllAlertsUnread = () => {
    const keys = new Set(alerts.map((alert) => `${alert.id}:${alert.tone}`))
    const next = dismissedAlertIds.filter((key) => !keys.has(key))
    saveDismissedAlertIds(next)
    setDismissedAlertIds(next)
    markAlertsSeen('')
  }

  // 응모·관심 공모전의 마감일로 알림을 만듭니다. 오늘 날짜가 바뀔 때는 화면을 다시 열면 반영됩니다.
  // (useMemo 대신 일반 계산 — 데이터가 작아 재계산 비용이 무시할 수준이고,
  // 컴파일러가 상태를 불투명 함수에 넘기는 패턴을 변이 위험으로 보는 것을 피한다)
  const alerts = buildContestAlerts(myContests, wishlist) as ContestAlert[]
  // 공모전 탐색 화면에 미리 걸어 둘 접수 상태 필터. 홈의 전체 보기 버튼이 정합니다
  // ('곧 마감' 전체 보기는 전체, '곧 시작' 전체 보기는 'upcoming').
  // 주소의 ?status=도 함께 반영해 새 탭에서 열어도 같은 필터가 걸립니다.
  const [exploreFilter, setExploreFilter] = useState<StatusFilter>(exploreFilterFromLocation)
  const urgentCount = urgentAlertCount(alerts)
  // 지금 확인이 필요한(오늘 마감·임박) 알림 목록의 조합. 조합이 바뀌면 새 알림이 생긴 것입니다.
  const urgentAlertKey = alerts
    .filter((alert) => alert.tone === 'today' || alert.tone === 'urgent')
    .map((alert) => alert.id)
    .sort()
    .join('|')
  // 배지 개수 = 오늘 마감·임박 알림 중 내가 아직 확인하지 않은 것.
  // 또한 한 번도 확인 화면을 안 열었던 새 조합이면 전부 세어 보여 준다(seenAlertKey).
  const dismissedKeys = useMemo(() => new Set(dismissedAlertIds), [dismissedAlertIds])
  // 아직 읽지 않은 '지금 확인이 필요한'(오늘 마감·마감 임박) 알림 — 상단 종 배지 개수가
  // 이 목록을 센다(2026-10-13).
  const unreadUrgentAlerts = useMemo(
    () =>
      alerts.filter(
        (alert) =>
          (alert.tone === 'today' || alert.tone === 'urgent') &&
          !dismissedKeys.has(alertDismissKey(alert)),
      ),
    [alerts, dismissedKeys],
  )
  const unconfirmedUrgentCount = unreadUrgentAlerts.length
  const newCombination =
    urgentCount > 0 && urgentAlertKey !== seenAlertKey
  const myPageBadgeCount = newCombination
    ? urgentCount
    : unconfirmedUrgentCount

  // 마이페이지를 열고 있는 동안에는 마감 알림을 모두 확인한 것으로 기록합니다.
  useEffect(() => {
    if (screen !== 'mypage' || urgentAlertKey === seenAlertKey) return
    markAlertsSeen(urgentAlertKey)
  }, [screen, urgentAlertKey, seenAlertKey])

  // 브라우저 뒤로/앞으로 버튼으로 화면을 이동합니다. 상세 화면 id와 탐색
  // 필터도 주소에서 다시 읽어 두 화면 사이 이동에도 최신 값을 유지합니다.
  useEffect(() => {
    const handlePopState = () => {
      setScreen(screenFromLocation())
      setContestId(contestIdFromLocation())
      setExploreFilter(exploreFilterFromLocation())
    }
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

  // query에는 '?status=upcoming'처럼 주소 뒤에 붙일 문자열을 넘깁니다.
  const navigate = (next: Screen, query = '') => {
    window.history.pushState(null, '', PATH_BY_SCREEN[next] + query)
    setScreen(next)
  }

  const handleAnalyze = (submitted: IdeaInput) => {
    try {
      sessionStorage.setItem(IDEA_STORAGE_KEY, JSON.stringify(submitted))
    } catch {
      // 저장에 실패해도 화면 전환은 계속 진행합니다.
    }
    // 새 아이디어 분석이 시작되니 이전 아이디어의 스냅숏은 치운다.
    clearAnalysisSnapshot()
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
      if (!result.ok) {
        // 서버에 도달했지만 복원이 거절된 경우 — 백업도 막혀 있음을 알린다.
        setBackupFailed(true)
        return
      }
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
      setBackupFailed(false)
      setSyncVersion((v) => v + 1)
    } catch {
      // 백엔드가 꺼져 있어도 로그인 자체는 계속 진행됩니다.
      setBackupFailed(true)
    }
  }

  // 새로고침해도 토큰이 남아 로그인이 유지되는 세션은 로그인 버튼을 다시 누르지 않는다.
  // 시작 시 복원을 직접 돌려야 자동 백업(canPushRef)이 켜진다 — 이 호출이 없으면
  // 로그인 상태인데도 변경 사항이 서버에 올라가지 않는 빈틈이 있었다.
  // 마운트 1회만 실행 — 로그인 버튼을 누른 흐름은 handleSignIn/SignUp이 이미 복원을 돌린다.
  useEffect(() => {
    if (!getAuthToken()) return
    void restoreFromServer()
  }, [])

  // 백엔드가 자동 등록한 공모전(/api/contests)을 시작 때 한 번 가져온다.
  // 실패해도 목업 데이터로 화면은 그대로 동작하고, 도착하면 데이터 풀을 쓰는
  // 화면들이 알아서 다시 그려진다.
  useEffect(() => {
    void loadSyncedContests()
  }, [])

  // 로그인 중이고 서버 복원이 한 번 성공한 뒤에는 목록이 바뀔 때마다
  // 서버에 백업합니다(0.8초 디바운스). 유형 검사·자가 점검·연습 노트처럼
  // 각 화면이 localStorage에 직접 쓴 값도 이 시점에 함께 백업됩니다.
  useEffect(() => {
    if (!user || !canPushRef.current) return
    const timer = window.setTimeout(() => {
      pushUserData(buildSyncPayload(myContests, wishlist, savedIdeas))
        .then((result) => setBackupFailed(!result.ok))
        .catch(() => {
          // 백엔드가 꺼져 있으면 다음 변경 때 다시 시도합니다.
          setBackupFailed(true)
        })
    }, 800)
    return () => window.clearTimeout(timer)
  }, [user, myContests, wishlist, savedIdeas, syncVersion])

  // 백업 실패 상태가 이어지면 서버 복원을 주기적으로 다시 시도한다 — 서버 재시작
  // 순간에 뜬 '백업 지연' 배너가 사용자의 새로고침 없이도 스스로 내려가게 한다.
  // 병합은 '없는 것만 추가' 규칙이라 활동 중 복원에도 로컬 변경이 덮이지 않는다.
  // restoreFromServer는 매 렌더마다 새로 만들어지므로 ref로 읽어 인터벌이
  // 렌더마다 리셋되는 것을 막는다(settledRef와 같은 패턴).
  const restoreRef = useRef(restoreFromServer)
  useEffect(() => {
    restoreRef.current = restoreFromServer
  })
  useEffect(() => {
    if (!user || !backupFailed) return
    const timer = window.setInterval(() => {
      void restoreRef.current()
    }, 20_000)
    return () => window.clearInterval(timer)
  }, [user, backupFailed])

  const handleApplyContest = (target: Omit<AppliedContest, 'appliedAt'>) => {
    // 응모 기록은 찜과 마찬가지로 로그인 없이도 남긴다 — 로그인 사용자만 허용하면
    // 로그아웃 상태의 '응모 완료' 확인이 조용히 사라져 달력·응모 목록에 아예
    // 나오지 않는 문제가 있었다. 로그인하면 서버 백업과 자동 병합된다.
    if (myContests.some((contest) => contest.id === target.id)) return
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

  // 보관함에 저장된 아이디어를 수정합니다. 다른 아이디어와 제목·설명·분야가
  // 모두 같으면 저장하지 않고 false를 돌려줍니다. 입력이 바뀌면 저장된 분석
  // 스냅숏은 더는 같은 아이디어의 결과가 아니므로 함께 지웁니다 — '다시 보기'는
  // 수정된 내용으로 분석을 새로 요청해 보여 줍니다.
  const handleUpdateIdea = (
    id: string,
    patch: { title: string; description: string; category: string },
  ): boolean => {
    const duplicated = savedIdeas.some(
      (saved) =>
        saved.id !== id &&
        saved.title === patch.title &&
        saved.description === patch.description &&
        saved.category === patch.category,
    )
    if (duplicated) return false
    const next = savedIdeas.map((saved) =>
      saved.id === id ? { ...saved, ...patch, analysis: null } : saved,
    )
    setSavedIdeas(next)
    persistList(SAVED_IDEAS_STORAGE_KEY, next)
    return true
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
    // 새로고침해도 같은 결과가 바로 복원되도록 세션 스냅숏도 함께 심는다.
    if (saved.analysis) {
      saveAnalysisSnapshot(restored, saved.analysis)
    } else {
      clearAnalysisSnapshot()
    }
    setIdea(restored)
    setPrefill(null)
    setTypeHints(null)
    setOpenedSaved(saved)
    navigate('result')
  }

  // 분석이 끝날 때마다 보관함의 같은 아이디어 스냅숏을 최신 결과로 갱신합니다.
  const handleAnalysisSettled = (analysis: Analysis) => {
    const isSameIdea = idea
      ? (saved: SavedIdea) =>
          saved.title === idea.title &&
          saved.description === idea.description &&
          saved.category === idea.category
      : () => false
    // AI 요청 실패 시 떨어지는 데모 결과는 저장된 AI 분석을 덮지 않게 막는다 —
    // 탐색 화면 '적합도순' 점수(latestAnalysis)도 AI 스냅숏 기준을 유지하도록
    // 보호된다. 재분석에 성공하면(source가 'ai') 그때 정상 갱신됩니다.
    const hadAiResult =
      savedIdeas.some((saved) => isSameIdea(saved) && saved.analysis?.source === 'ai') ||
      (idea !== null && loadAnalysisSnapshot(idea)?.source === 'ai')
    if (analysis.source === 'demo' && hadAiResult) return
    // 보관함에 저장하지 않은 아이디어여도 마지막 분석은 기억해 둡니다 —
    // 탐색 화면의 '적합도순' 정렬이 이 스냅숏을 사용합니다.
    setLatestAnalysis(analysis)
    if (!idea) return
    saveAnalysisSnapshot(idea, analysis)
    if (!savedIdeas.some(isSameIdea)) return
    const next = savedIdeas.map((saved) =>
      isSameIdea(saved) ? { ...saved, analysis } : saved,
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

  // 공모전 탐색 화면의 '적합도순' 정렬·뱃지에 쓸 점수표. 마지막으로 본 분석을
  // 우선하고, 스냅숏이 없을 때(새로고침 직후 등)는 보관함에 분석이 저장된
  // 첫 아이디어로 대체합니다. 분석을 한 번도 안 했으면 null — 이때는 탐색
  // 화면에 분석 안내 한 줄이 대신 보입니다.
  // (useMemo 대신 일반 계산 — 데이터가 작아 재계산 비용이 무시할 수준)
  const fitSource = latestAnalysis ?? savedIdeas.find((saved) => saved.analysis)?.analysis ?? null
  const fitScores = fitSource
    ? fitSource.contests.map((contest) => ({ id: contest.id, score: contest.matchScore }))
    : null

  // 앱 내 공모전 상세 화면으로 이동. 검색 팝업·마감 임박 목록이 함께 씁니다.
  // 상세 화면을 이미 보고 있을 때 다른 공모전을 열어도 id가 바로 바뀌게
  // 상태로 함께 갱신합니다.
  const openContest = (id: number) => {
    window.history.pushState(null, '', `/contest/${id}`)
    setScreen('contest')
    setContestId(id)
  }

  return (
    <>
      <TopNav
        loggedIn={user !== null}
        notificationCount={myPageBadgeCount}
        alerts={alerts}
        readAlertKeys={readAlertKeys}
        onDismissAlert={dismissAlert}
        onMarkAllRead={markAllAlertsRead}
        onMarkAllUnread={markAllAlertsUnread}
        onGoHome={() => navigate('home')}
        onGoMyPage={() => {
          // 메뉴바 마이페이지 아이콘을 누르면 알림을 모두 읽음 처리해 배지를 바로 지운다.
          markAllAlertsRead()
          navigate('mypage')
        }}
        onOpenContest={openContest}
        onOpenExplore={() => {
          setExploreFilter('all')
          navigate('contests')
        }}
        onToggleWish={handleToggleWish}
        wishlistedContestIds={wishlist.map((contest) => contest.id)}
        // 메뉴바 바로가기 링크 — 홈 화면 탭이 메뉴바로 흡수됐다(2026-10-13)
        onStart={() => {
          setPrefill(null)
          setTypeHints(null)
          navigate('input')
        }}
        onTypeTest={() => navigate('test')}
        onDashboard={() => navigate('dashboard')}
        onNotes={() => {
          setNotePrefill(null)
          navigate('notes')
        }}
      />
      {screen === 'home' && (
        <>
          <HomePage
            onExplore={() => {
              setExploreFilter('all')
              navigate('contests')
            }}
            // '곧 시작되는 공모전'의 전체 보기 — 탐색 화면을 '곧 시작' 필터로 엽니다.
            // 주소에도 ?status=를 심어 새 탭으로 열어도 같은 필터가 걸리게 합니다.
            onExploreUpcoming={() => {
              setExploreFilter('upcoming')
              navigate('contests', '?status=upcoming')
            }}
            onOpenContest={openContest}
          />
        </>
      )}
      {screen === 'input' && (
        <IdeaInputPage
          initialIdea={prefill}
          typeHints={typeHints}
          savedIdeas={savedIdeas}
          onOpenIdea={handleOpenIdea}
          onDeleteIdea={handleDeleteIdea}
          onUpdateIdea={handleUpdateIdea}
          onBack={() => navigate('home')}
          onAnalyze={handleAnalyze}
        />
      )}
      {screen === 'contests' && (
        <ContestListPage
          wishlistedContestIds={wishlist.map((contest) => contest.id)}
          onToggleWish={handleToggleWish}
          onOpenContest={openContest}
          onBack={() => navigate('home')}
          initialStatusFilter={exploreFilter}
          fitScores={fitScores}
          onGoInput={() => {
            setPrefill(null)
            setTypeHints(null)
            navigate('input')
          }}
        />
      )}
      {screen === 'contest' && (
        <ContestDetailPage
          contestId={contestId}
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
          initialAnalysis={openedSaved?.analysis ?? (idea ? loadAnalysisSnapshot(idea) : null)}
          onAnalysisSettled={handleAnalysisSettled}
          onApplyContest={handleApplyContest}
          onToggleWish={handleToggleWish}
          onSaveIdea={(analysis) => handleSaveIdea(idea, analysis)}
          onGoMyPage={() => navigate('mypage')}
          onOpenContest={openContest}
          onGoNotes={(draft) => {
            setNotePrefill(draft)
            navigate('notes')
          }}
          onSignIn={handleSignIn}
          onSignUp={handleSignUp}
        />
      )}
      {screen === 'dashboard' && (
        <DashboardPage
          onOpenContest={openContest}
          user={user}
          onGoLogin={() => navigate('mypage')}
          onOpenExplore={() => {
            setExploreFilter('all')
            navigate('contests')
          }}
          onGoInput={() => {
            setPrefill(null)
            setTypeHints(null)
            navigate('input')
          }}
        />
      )}
      {screen === 'notes' && (
        <PracticeNotePage
          dataVersion={syncVersion}
          onNotesChanged={() => setSyncVersion((v) => v + 1)}
          initialDraft={notePrefill}
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
          readAlertKeys={readAlertKeys}
          onDismissAlert={dismissAlert}
          onMarkAllAlertsRead={markAllAlertsRead}
          onMarkAllAlertsUnread={markAllAlertsUnread}
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
          onUpdateIdea={handleUpdateIdea}
          onImportLists={handleImportLists}
          onBack={() => navigate('home')}
          onGoInput={() => {
            setPrefill(null)
            setTypeHints(null)
            navigate('input')
          }}
          onGoExplore={() => {
            setExploreFilter('all')
            navigate('contests')
          }}
        />
      )}
      {/* 서버 백업 실패 알림 — 데이터가 이 브라우저에만 있음을 알리고, 성공하면 스스로 사라진다 */}
      {backupFailed && (
        <div className="sync-notice" role="status">
          <span>서버 백업이 지연되고 있어요 · 최근 변경은 이 브라우저에만 저장돼 있어요</span>
          <button
            type="button"
            aria-label="백업 지연 알림 닫기"
            onClick={() => setBackupFailed(false)}
          >
            ×
          </button>
        </div>
      )}
      <SiteFooter />
    </>
  )
}

export default App
