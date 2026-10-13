// ==========================================================
// 공모전 자동 등록(스크래핑 동기화)
// 위비티(wevity.com)와 콘테스트코리아(contestkorea.com)의 접수 중·접수 예정
// 공모전 목록을 주기적으로 읽어 backend/data/contests.json에 등록한다.
// 수동으로 정제한 목업 데이터(frontend mockData.js)는 프론트엔드 폴백이며,
// 이 서버는 그 외의 공모전을 자동으로 수집해 /api/contests로 내려준다.
// robots.txt가 Allow:/ 인 공개 목록 페이지만 읽고, 요청 사이에 지연을 둔다.
// ==========================================================

import fs from 'fs'
import path from 'path'

export type SyncedContest = {
  id: number
  source: 'contestkorea' | 'wevity'
  sourceId: string
  title: string
  organizer: string
  field: string
  startDate?: string
  deadline: string
  eligibility: string
  ageGroups: Array<'teen' | 'adult'>
  image: string
  url: string
  description: string
  applySteps: string[]
}

type RegistryEntry = {
  id: number
  /** 마감 뒤 정리된 항목 — 같은 소스 게시물이 다시 보이면 같은 id로 재등록한다. */
  pruned?: boolean
  /**
   * 읽었지만 등록 불가(이미 마감 등)로 판정된 게시물. 소스 목록에 계속 노출돼도
   * 상세를 다시 읽지 않게 한다. 다른 게시물로 갈아엎어지면 보통 str_no·ix가 새로
   * 발급되므로 이 키로는 나타나지 않는다.
   */
  dead?: boolean
}

type ContestSyncState = {
  lastSync?: string
  nextId: number
  /** 소스 게시물 키(예: contestkorea:202610110007) → 부여한 숫자 id. id는 동기화 사이에 절대 바뀌지 않는다. */
  registry: Record<string, RegistryEntry>
  contests: SyncedContest[]
}

export type SyncSummary = {
  added: number
  refreshed: number
  pruned: number
  skippedDetailFail: number
  total: number
  lastSync?: string
}

// 목록·상세 후보(파서 출력). 상세를 읽기 전의 원시 정보다.
export type Candidate = {
  source: 'contestkorea' | 'wevity'
  sourceId: string
  url: string
  title: string
  category: string
  organizer: string
  eligibility: string
  /** '09.30~10.25' 형태(연도 없음) 또는 '2026-09-28 ~ 2026-10-25' 형태 */
  datesText: string
  /** 목록에 표시된 D-day(예: 'D-13'). deadline 연도 복원에 쓴다. */
  dday?: string | undefined
  /** 목록에서 바로 얻은 대표 이미지(위비티 스페셜 배너). */
  image?: string | undefined
}

// 상세 페이지 파서의 공통 출력. 값이 없으면 프로퍼티를 아예 비워 둔다.
export type DetailInfo = {
  image?: string | undefined
  description?: string | undefined
  startDate?: string | undefined
  deadline?: string | undefined
  organizer?: string | undefined
  eligibility?: string | undefined
  category?: string | undefined
}

const DATA_DIR = path.resolve(__dirname, '..', 'data')
const CONTESTS_FILE = path.join(DATA_DIR, 'contests.json')

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) GongmoOnContestSync/1.0'
const REQUEST_DELAY_MS = 400
const DETAIL_FETCH_LIMIT = 200 // 동기화 1회당 상세 페이지 최대 요청 수(초기 수집이 몇 패스에 걸쳐 끝난다)
const MAX_PAGES = 15
const KEEP_PRUNED_DAYS = 30 // 마감 후 이 기간이 지나면 목록에서 제거한다
const SYNC_INTERVAL_MS = 6 * 60 * 60 * 1000 // 6시간
const SYNC_MIN_GAP_MS = 60 * 60 * 1000 // 재시작 직후 중복 실행 방지용 최소 간격

// ---------- 소스별 분야 매핑 ----------
// 콘테스트코리아 게시판(bcode) → 앱 분야. 2026-10-11 수동 등록 때 쓴 분류를 그대로 옮겼다.
const CK_BCODE_FIELD: Record<string, string> = {
  '030110001': '문학 (문예·글짓기)',
  '030210001': '디자인 (네이밍·슬로건)',
  '030310001': '과학기술 (학문·IT)',
  '030610001': '디자인 (미술·웹툰)',
  '030810001': '예체능 (스포츠)',
  '030910001': '예체능 (음악·댄스)',
  '031210001': '기타 (사진·영상)',
  '031410001': '창업 (아이디어·건축)',
  '031610001': '기타 (요리·뷰티·오디션)',
  '031810001': '기타 (다양한 분야)',
}

// 콘테스트코리아 '대표분야' 문구 → 앱 분야(bcode를 못 읽었을 때의 폴백)
const CK_CATEGORY_FIELD: Array<[RegExp, string]> = [
  [/과학|학문|IT/, '과학기술 (학문·IT)'],
  [/디자인|웹툰|미술/, '디자인 (미술·웹툰)'],
  [/네이밍|슬로건/, '디자인 (네이밍·슬로건)'],
  [/문학|문예/, '문학 (문예·글짓기)'],
  [/아이디어|건축|창업/, '창업 (아이디어·건축)'],
  [/음악|콩쿠르|댄스/, '예체능 (음악·댄스)'],
  [/사진|영상|영화/, '기타 (사진·영상)'],
  [/요리|뷰티|오디션|배우/, '기타 (요리·뷰티·오디션)'],
  [/스포츠/, '예체능 (스포츠)'],
]

// 위비티 '분야' 문구 → 앱 분야
const WEVITY_FIELD: Array<[RegExp, string]> = [
  [/기획|아이디어/, '기타 (아이디어·기획)'],
  [/광고|마케팅|홍보/, '생활 (광고·마케팅)'],
  [/논문|리포트/, '기타 (논문·리포트)'],
  [/영상|UCC|사진/, '기타 (사진·영상)'],
  [/디자인|캐릭터|웹툰/, '디자인 (캐릭터·웹툰)'],
  [/웹|모바일|플래시/, '과학기술 (웹·모바일)'],
  [/게임|소프트웨어|프로그램/, '과학기술 (게임·소프트웨어)'],
  [/과학|공학/, '과학기술 (과학·공학)'],
  [/문학|글|시나리오/, '문학 (글·시나리오)'],
  [/건축|건설|인테리어/, '창업 (건축·인테리어)'],
  [/네이밍|슬로건/, '디자인 (네이밍·슬로건)'],
  [/예체능|미술|음악/, '예체능 (미술·음악)'],
  [/취업|창업|스타트업/, '창업 (취업·창업)'],
  [/해외/, '기타 (해외)'],
]

function mapField(source: Candidate['source'], category: string, bcode?: string): string {
  if (source === 'contestkorea') {
    if (bcode && CK_BCODE_FIELD[bcode]) return CK_BCODE_FIELD[bcode]
    for (const [pattern, field] of CK_CATEGORY_FIELD) {
      if (pattern.test(category)) return field
    }
    return category ? `기타 (${category.replace(/•/g, '·')})` : '기타'
  }
  for (const [pattern, field] of WEVITY_FIELD) {
    if (pattern.test(category)) return field
  }
  return category ? `기타 (${category.replace(/\//g, '·')})` : '기타'
}

// ---------- 상태 파일 ----------
function readState(): ContestSyncState {
  let parsed: Partial<ContestSyncState>
  try {
    const raw = fs.readFileSync(CONTESTS_FILE, 'utf-8')
    parsed = JSON.parse(raw) as Partial<ContestSyncState>
  } catch {
    // 파일이 없거나 손상됐으면 빈 상태에서 다시 수집한다.
    return { nextId: 1000, registry: {}, contests: [] }
  }
  const state: ContestSyncState = {
    nextId: Number(parsed.nextId) > 0 ? Number(parsed.nextId) : 1000,
    registry: parsed.registry ?? {},
    contests: Array.isArray(parsed.contests) ? parsed.contests : [],
  }
  if (typeof parsed.lastSync === 'string') state.lastSync = parsed.lastSync
  return state
}

function writeState(state: ContestSyncState) {
  fs.mkdirSync(DATA_DIR, { recursive: true })
  fs.writeFileSync(CONTESTS_FILE, `${JSON.stringify(state, null, 2)}\n`, 'utf-8')
}

// ---------- HTTP ----------
async function fetchHtml(url: string): Promise<string> {
  let lastError: unknown
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { 'User-Agent': USER_AGENT, 'Accept-Language': 'ko-KR,ko;q=0.9' },
        signal: AbortSignal.timeout(15000),
      })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      return await response.text()
    } catch (error) {
      lastError = error
      await sleep(700)
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError))
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))

// ---------- HTML 유틸 ----------
function decodeEntities(text: string): string {
  return text
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&rsquo;/g, "'")
    .replace(/&middot;/g, '·')
    .replace(/&bull;/g, '·')
}

/** 태그를 제거하고 공백을 정리한다. */
function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
}

/** 태그 제거 + 문단 줄바꿈 유지(본문 요약용) */
function stripTagsKeepBreaks(html: string): string {
  return decodeEntities(
    html
      .replace(/<(?:br|\/p|\/div|\/li)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ''),
  )
    .replace(/[ \t\u00a0]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

function metaContent(html: string, property: string): string {
  const match = html.match(
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]+content=["']([\\s\\S]*?)["']`, 'i'),
  )
  return match ? decodeEntities(match[1] ?? '').trim() : ''
}

// ---------- 날짜 ----------
function toIsoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function todayIso(): string {
  const now = new Date()
  return toIsoDate(now.getFullYear(), now.getMonth() + 1, now.getDate())
}

function addDaysIso(baseIso: string, days: number): string {
  const [y, m, d] = baseIso.split('-').map(Number)
  if (!y || !m || !d) return baseIso
  const date = new Date(Date.UTC(y, m - 1, d + days))
  return date.toISOString().slice(0, 10)
}

/** '2026.09.30 ~ 2026.10.25' 또는 '2026-09-28 ~ 2026-10-25' */
function parseFullPeriod(text: string): { startDate?: string; deadline?: string } {
  const match = text.match(
    /(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\s*(?:~|–|—|-)\s*(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/,
  )
  if (!match) return {}
  return {
    startDate: toIsoDate(Number(match[1]), Number(match[2]), Number(match[3])),
    deadline: toIsoDate(Number(match[4]), Number(match[5]), Number(match[6])),
  }
}

/**
 * 연도 없는 목록 기간('09.30~10.25')과 D-day로 기간을 복원한다.
 * D-day는 접수 마감(마지막 날짜)을 가리키므로 deadline = 오늘 + D, 연도는
 * 목록의 마지막 MM.DD와 일치하는 해로 고른다.
 */
function parseShortPeriod(
  text: string,
  dday?: string,
): { startDate?: string; deadline?: string } {
  const parts = [...text.matchAll(/(\d{1,2})[.\-/](\d{1,2})/g)]
  const last = parts[parts.length - 1]
  const first = parts[0]
  if (!last || !first) return {}
  const lastMonth = Number(last[1])
  const lastDay = Number(last[2])

  const dMatch = typeof dday === 'string' ? dday.match(/D[+-](\d{1,3})/) : null
  if (dMatch) {
    const days = Number(dMatch[1])
    const deadline = addDaysIso(todayIso(), days)
    const [dlY, dlM, dlD] = deadline.split('-').map(Number)
    if (!dlY || !dlM || !dlD) return {}
    // D-day로 계산한 날짜가 목록의 마지막 MM.DD와 어긋나면(표시 지연 등) 무시한다.
    if (dlM !== lastMonth || dlD !== lastDay) return {}
    // 시작 월이 마감 월보다 6개월 이상 크면 연도가 바뀌는 구간(12월→1월)이다.
    const startMonth = Number(first[1])
    const startYear = startMonth - lastMonth > 6 ? dlY - 1 : dlY
    return {
      startDate: toIsoDate(startYear, startMonth, Number(first[2])),
      deadline,
    }
  }

  // D-day를 못 믿으면 올해~내년 중 MM.DD가 오늘 이후인 해를 고른다.
  const nowYear = new Date().getFullYear()
  for (const year of [nowYear, nowYear + 1]) {
    const candidate = toIsoDate(year, lastMonth, lastDay)
    if (candidate >= todayIso()) return { deadline: candidate }
  }
  return {}
}

// ---------- 참가 자격 → 연령 ----------
function deriveAgeGroups(eligibility: string): Array<'teen' | 'adult'> {
  const text = eligibility ?? ''
  const teen = /(유치원|초등|중학생|고등학생|중고등|청소년|아동|학생\(자\)|미성년)/.test(text)
  const adult = /(대학생|대학원생|대학\)|재학생|휴학생|일반인|성인|외국인|직장인|주부|시니어|누구나|전체|국민)/.test(
    text,
  )
  if (teen && adult) return ['teen', 'adult']
  if (teen) return ['teen']
  if (adult) return ['adult']
  // 자격 문구가 비어 있으면 성인 기본값으로 둔다(필터에서 놓치지 않게).
  return ['adult']
}

// ---------- 콘테스트코리아 ----------
const CK_BASE = 'https://www.contestkorea.com'

function parseCkList(html: string): Candidate[] {
  const candidates: Candidate[] = []
  // 항목 경계: 각 공모전의 좋아요 버튼(val="str_no")이 항목 안에 한 번씩 나온다.
  const itemPattern =
    /<a href="view\.php\?int_gbn=(?:\d+)(?:&amp;|&)Txt_bcode=(\d+)(?:&amp;|&)str_no=(\d+)"[^>]*>([\s\S]{0,600}?)<\/a>([\s\S]{0,4000}?)(?=<a href="view\.php|<div class="paging|<\/table|$)/g
  let match: RegExpExecArray | null
  while ((match = itemPattern.exec(html)) !== null) {
    const bcode = match[1] ?? ''
    const strNo = match[2] ?? ''
    const anchorInner = match[3] ?? ''
    const tail = match[4] ?? ''
    const title = stripTags(anchorInner.match(/<span class="txt">([\s\S]{0,300}?)<\/span>/)?.[1] ?? '')
    if (!strNo || !title) continue
    const category = stripTags(anchorInner.match(/<span class="category">([\s\S]{0,120}?)<\/span>/)?.[1] ?? '')

    const organizer = stripTags(
      tail.match(/<strong>주최<\/strong>\s*\.?\s*([\s\S]{0,200}?)<\/li>/)?.[1] ?? '',
    )
    const eligibility = stripTags(
      tail.match(/<strong>대상<\/strong>\s*\.?\s*([\s\S]{0,300}?)<\/li>/)?.[1] ?? '',
    )
    const datesText = stripTags(
      tail.match(/<em>접수[^<]*<\/em>\s*([\s\S]{0,80}?)<\/span>/)?.[1] ?? '',
    )
    const dday = stripTags(tail.match(/<span class="day">([^<]{0,20})</)?.[1] ?? '')
    const status = stripTags(
      tail.match(/<span class="day">[^<]*<\/span>\s*<span class="condition">([^<]{0,20})</)?.[1] ?? '',
    )

    // 공지·문의 게시물과 마감된 공모전은 등록하지 않는다.
    if (/뉴스와정보|공지사항|문의|질문과답변/.test(category)) continue
    if (status && /마감$|^마감|접수마감/.test(status)) continue

    candidates.push({
      source: 'contestkorea',
      sourceId: strNo,
      url: `${CK_BASE}/sub/view.php?int_gbn=1&Txt_bcode=${bcode}&str_no=${strNo}`,
      title,
      category,
      organizer,
      eligibility,
      datesText,
      dday: dday || undefined,
    })
  }
  return candidates
}

export function parseCkDetail(html: string): DetailInfo {
  const ogImage = metaContent(html, 'og:image')
  const ogDescription = metaContent(html, 'og:description')

  const rowValue = (labelPattern: string): string => {
    const patterns = [
      `<th[^>]*>\\s*${labelPattern}\\s*</th>\\s*<td[^>]*>([\\s\\S]{0,300}?)</td>`,
      `<th[^>]*>[^<]*${labelPattern}[\\s\\S]{0,60}?</th>\\s*<td[^>]*>([\\s\\S]{0,300}?)</td>`,
    ]
    for (const pattern of patterns) {
      const match = html.match(new RegExp(pattern, 'i'))
      if (match) {
        const value = stripTags(match[1] ?? '')
        if (value) return value
      }
    }
    return ''
  }

  const period = parseFullPeriod(rowValue('접수기간'))
  return {
    image: ogImage || undefined,
    description: ogDescription ? ogDescription.replace(/\s+/g, ' ').trim().slice(0, 400) : undefined,
    startDate: period.startDate,
    deadline: period.deadline,
    organizer: rowValue('주최[^<]*') || undefined,
    eligibility: rowValue('참가대상') || undefined,
    category: rowValue('대표분야') || undefined,
  }
}

// ---------- 위비티 ----------
const WEVITY_BASE = 'https://www.wevity.com'

function parseWevityList(html: string): Candidate[] {
  const candidates = new Map<string, Candidate>()

  // 일반 목록(ms-list): 제목 링크·분야(sub-tit)·주최사(organ)·D-day·상태(dday span)
  const rowPattern =
    /<a href="[^"]*gbn=view[^"]*ix=(\d+)[^"]*"[^>]*>([\s\S]{0,400}?)<\/a>[\s\S]{0,600}?<div class="organ">([\s\S]{0,200}?)<\/div>[\s\S]{0,400}?<div class="day">([\s\S]{0,300}?)<\/div>/g
  let match: RegExpExecArray | null
  while ((match = rowPattern.exec(html)) !== null) {
    const ix = match[1] ?? ''
    const anchorHtml = match[2] ?? ''
    const organizer = stripTags(match[3] ?? '')
    const dayHtml = match[4] ?? ''
    if (!ix) continue
    const status = stripTags(dayHtml.match(/<span class="dday[^"]*">([^<]*)<\/span>/)?.[1] ?? '')
    if (/마감$/.test(status)) continue
    const title = stripTags(anchorHtml.replace(/<span[^>]*>[\s\S]*?<\/span>/g, ''))
    const categories = stripTags(
      html.slice(match.index, match.index + 1600).match(/<div class="sub-tit">\s*분야\s*:\s*([\s\S]{0,200}?)<\/div>/)?.[1] ?? '',
    )
    const dday = stripTags(dayHtml.match(/D-(\d{1,3})/)?.[0] ?? '')
    if (!title) continue
    candidates.set(ix, {
      source: 'wevity',
      sourceId: ix,
      url: `${WEVITY_BASE}/?c=find&s=1&gbn=view&gp=1&ix=${ix}`,
      title,
      category: categories.split(',')[0]?.trim() ?? '',
      organizer,
      eligibility: '',
      datesText: '',
      dday: dday || undefined,
    })
  }

  // 스페셜 배너(hide-info): 이미지 alt=제목, hide-dday·hide-cat가 함께 나온다.
  const specialPattern =
    /<a href="[^"]*gbn=view[^"]*ix=(\d+)[^"]*"><img src="([^"]+)" alt="([^"]*)"[^>]*><\/a>\s*<div class="hide-info">[\s\S]{0,200}?<div class="hide-dday">([^<]*)<\/div>[\s\S]{0,600}?<div class="hide-cat">\s*([\s\S]{0,300}?)<\/div>/g
  while ((match = specialPattern.exec(html)) !== null) {
    const ix = match[1] ?? ''
    const image = match[2] ?? ''
    const title = stripTags(match[3] ?? '')
    const dday = stripTags(match[4] ?? '')
    const categories = stripTags(match[5] ?? '')
    if (!ix) continue
    const existing = candidates.get(ix)
    if (existing) {
      // 일반 목록에 없던 이미지를 채워 준다.
      if (!existing.image && image) existing.image = image.startsWith('http') ? image : `${WEVITY_BASE}${image}`
      continue
    }
    if (/마감$/.test(stripTags(dday))) continue
    candidates.set(ix, {
      source: 'wevity',
      sourceId: ix,
      url: `${WEVITY_BASE}/?c=find&s=1&gbn=view&gp=1&ix=${ix}`,
      title,
      category: categories.split(',')[0]?.trim() ?? '',
      organizer: '',
      eligibility: '',
      datesText: '',
      dday: dday || undefined,
      image: image.startsWith('http') ? image : `${WEVITY_BASE}${image}`,
    })
  }

  return [...candidates.values()]
}

export function parseWevityDetail(html: string): DetailInfo {
  // 정보표: '분야', '응모대상', '주최/주관', '접수기간' 등이 dt/dd(또는 th/td)로 나온다.
  const rowValue = (label: string): string => {
    const patterns = [
      `<dt[^>]*>\\s*${label}\\s*</dt>\\s*<dd[^>]*>([\\s\\S]{0,300}?)</dd>`,
      `<th[^>]*>\\s*${label}\\s*</th>\\s*<td[^>]*>([\\s\\S]{0,300}?)</td>`,
      `${label}\\s*</(?:dt|th|span|b)>\\s*(?:<[^>]+>\\s*)*([^<>]{1,200})`,
    ]
    for (const pattern of patterns) {
      const match = html.match(new RegExp(pattern, 'i'))
      if (match) {
        const value = stripTags(match[1] ?? '')
        if (value) return value
      }
    }
    return ''
  }

  const periodText = rowValue('접수기간')
  const period = parseFullPeriod(periodText)

  // 대표 이미지: 업로드 디렉터리의 첫 이미지.
  const imageMatch = html.match(/<img[^>]+src="((?:https?:\/\/www\.wevity\.com)?\/upload\/[^"]+\.(?:jpg|jpeg|png|gif)[^"]*)"/i)
  const imageSrc = imageMatch?.[1] ?? ''
  const image = imageSrc ? (imageSrc.startsWith('http') ? imageSrc : `${WEVITY_BASE}${imageSrc}`) : undefined

  // 본문: '상세내용' 구간의 텍스트를 요약으로 쓴다.
  let description: string | undefined
  const bodyIndex = html.indexOf('상세내용')
  if (bodyIndex >= 0) {
    const bodyHtml = html.slice(bodyIndex, bodyIndex + 12000)
    const text = stripTagsKeepBreaks(bodyHtml.replace(/^[\s\S]{0,200}?상세내용/, ''))
      .replace(/※ 본 내용은 참고 자료입니다[\s\S]*?확인하세요\.?/, '')
      .trim()
    if (text.length >= 40) description = text.replace(/\s+/g, ' ').slice(0, 400)
  }

  return {
    image,
    description,
    startDate: period.startDate,
    deadline: period.deadline,
    organizer: rowValue('주최(?:/주관)?') || undefined,
    eligibility: rowValue('응모대상') || undefined,
    category: rowValue('분야') || undefined,
  }
}

// ---------- 항목 조립 ----------
function buildDescription(contest: Omit<SyncedContest, 'description' | 'applySteps' | 'id'>, scraped?: string): string {
  const scrapedText = (scraped ?? '').trim()
  if (scrapedText.length >= 40) return scrapedText
  const startText = contest.startDate ? ` ${contest.startDate}부터` : ''
  return (
    `${contest.organizer || '주최 기관'} 주최 '${contest.title}' 공모전입니다. ` +
    `${contest.field} 분야 대회로 참가 자격은 ${contest.eligibility || '공고문 확인'}이며,` +
    `접수 기간은${startText || ' 공고문 확인 후'} ${contest.deadline}까지입니다. ` +
    '주제 범위·총 상금·제출 양식 등 세부 요강은 공고문에서 확인해 주세요.'
  )
}

function buildApplySteps(contest: Omit<SyncedContest, 'applySteps' | 'description' | 'id'>): string[] {
  const period = contest.startDate ? `${contest.startDate} ~ ${contest.deadline}` : contest.deadline
  return [
    '공고문에서 주제 범위, 제출 양식, 상금 등 공모 요강을 확인합니다.',
    '요강에 맞춰 작품 또는 참가 신청서를 준비합니다.',
    `접수 기간(${period}) 안에 공고문 안내 경로로 제출합니다.`,
    '주최 측 심사를 거쳐 수상 작품이 발표되면 결과를 확인합니다.',
  ]
}

function buildContest(params: {
  candidate: Candidate
  id: number
  detail?: DetailInfo | undefined
}): SyncedContest | null {
  const { candidate, id, detail } = params
  let startDate = detail?.startDate
  let deadline = detail?.deadline

  // 상세에서 기간을 못 읽었으면 목록 정보로 복원한다.
  if (!deadline) {
    const fromList = parseShortPeriod(candidate.datesText, candidate.dday)
    startDate = startDate ?? fromList.startDate
    deadline = fromList.deadline
  }
  if (!deadline) return null
  if (deadline < todayIso()) return null // 이미 마감된 공모전은 등록하지 않는다

  const organizer = (detail?.organizer || candidate.organizer || '').replace(/\s+/g, ' ').trim()
  const eligibility = (detail?.eligibility || candidate.eligibility || '').trim()
  // 위비티는 분야를 여러 개 나열하므로 첫 번째(대표) 분야만 매핑에 쓴다.
  const category = (detail?.category || candidate.category).split(',')[0]?.trim() ?? ''
  const field = mapField(candidate.source, category, candidate.source === 'contestkorea' ? candidate.url.match(/Txt_bcode=(\d+)/)?.[1] : undefined)

  const base = {
    id,
    source: candidate.source,
    sourceId: candidate.sourceId,
    title: candidate.title,
    organizer,
    field,
    deadline,
    eligibility,
    ageGroups: deriveAgeGroups(eligibility),
    image: detail?.image ?? candidate.image ?? '',
    url: candidate.url,
  }
  const withStart: SyncedContest = startDate
    ? { ...base, startDate, description: buildDescription({ ...base, startDate }, detail?.description), applySteps: buildApplySteps({ ...base, startDate }) }
    : { ...base, description: buildDescription(base, detail?.description), applySteps: buildApplySteps(base) }
  return withStart
}

// ---------- 목록 수집 ----------
export async function collectContestKorea(): Promise<Candidate[]> {
  const all = new Map<string, Candidate>()
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let html: string
    try {
      html = await fetchHtml(
        `${CK_BASE}/sub/list.php?int_gbn=1&displayrow=100&page=${page}`,
      )
    } catch (error) {
      console.error(`[contestSync] 콘테스트코리아 ${page}페이지 수집 실패:`, error)
      break
    }
    const items = parseCkList(html)
    const before = all.size
    for (const item of items) all.set(item.sourceId, item)
    console.log(`[contestSync] 콘테스트코리아 ${page}페이지: ${items.length}건 (누적 ${all.size})`)
    if (all.size === before || items.length === 0) break
    await sleep(REQUEST_DELAY_MS)
  }
  return [...all.values()]
}

export async function collectWevity(): Promise<Candidate[]> {
  const all = new Map<string, Candidate>()
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    let html: string
    try {
      html = await fetchHtml(
        `${WEVITY_BASE}/?c=find&s=1&gub=1&gp=${page}`,
      )
    } catch (error) {
      console.error(`[contestSync] 위비티 ${page}페이지 수집 실패:`, error)
      break
    }
    const items = parseWevityList(html)
    const before = all.size
    for (const item of items) all.set(item.sourceId, item)
    console.log(`[contestSync] 위비티 ${page}페이지: ${items.length}건 (누적 ${all.size})`)
    if (all.size === before || items.length === 0) break
    await sleep(REQUEST_DELAY_MS)
  }
  return [...all.values()]
}

// ---------- 동기화 본체 ----------
let syncInFlight: Promise<SyncSummary> | null = null

export function syncContests(options: { force?: boolean } = {}): Promise<SyncSummary> {
  if (syncInFlight) return syncInFlight
  const state = readState()
  if (!options.force && state.lastSync) {
    const elapsed = Date.now() - new Date(state.lastSync).getTime()
    if (Number.isFinite(elapsed) && elapsed < SYNC_MIN_GAP_MS) {
      const summary: SyncSummary = {
        added: 0,
        refreshed: 0,
        pruned: 0,
        skippedDetailFail: 0,
        total: state.contests.length,
      }
      summary.lastSync = state.lastSync
      return Promise.resolve(summary)
    }
  }
  syncInFlight = runSync().finally(() => {
    syncInFlight = null
  })
  return syncInFlight
}

async function runSync(): Promise<SyncSummary> {
  const state = readState()
  const [ckItems, wevityItems] = await Promise.all([
    collectContestKorea(),
    collectWevity().catch((error) => {
      console.error('[contestSync] 위비티 수집 실패(이번 패스는 콘테스트코리아만 반영):', error)
      return [] as Candidate[]
    }),
  ])
  const candidates = [...ckItems, ...wevityItems]

  let added = 0
  let refreshed = 0
  let skippedDetailFail = 0
  let detailFetches = 0

  for (const candidate of candidates) {
    const key = `${candidate.source}:${candidate.sourceId}`
    const known = state.registry[key]
    const existing = known ? state.contests.find((c) => c.id === known.id) : undefined
    if (existing) continue // 이미 등록된 항목은 그대로 둔다
    if (known?.dead) continue // 마감·무효로 판정된 게시물은 상세를 다시 읽지 않는다

    // 신규이거나(unknown) 정리됐던 항목이 다시 보이는 경우(pruned) — 상세를 읽어 등록한다.
    // 한도를 넘은 신규 항목은 다음 동기화에서 처리된다.
    if (detailFetches >= DETAIL_FETCH_LIMIT) continue

    let detail: DetailInfo | undefined
    let fetchOk = false
    try {
      const html = await fetchHtml(candidate.url)
      detail = candidate.source === 'contestkorea' ? parseCkDetail(html) : parseWevityDetail(html)
      fetchOk = true
    } catch (error) {
      console.error(`[contestSync] 상세 수집 실패(${key}):`, error)
      skippedDetailFail += 1
      detail = undefined
    }
    detailFetches += 1
    await sleep(REQUEST_DELAY_MS)

    // 읽었는데 등록 불가(이미 마감 등)면 dead로 기억해 다음 패스의 낭비를 막고,
    // 읽기 자체가 실패했으면 다음 동기화에 재시도한다.
    const probe = buildContest({ candidate, id: 0, detail })
    if (!probe) {
      if (fetchOk) state.registry[key] = { id: 0, dead: true }
      else skippedDetailFail += 1
      continue
    }

    const knownId = known?.id ?? 0
    const id = knownId > 0 ? knownId : state.nextId
    if (!(knownId > 0)) state.nextId += 1
    const contest = { ...probe, id }
    state.registry[key] = { id }
    state.contests.push(contest)
    if (known?.pruned) refreshed += 1
    else added += 1
  }

  // 마감 뒤 일정 기간 지난 항목은 목록에서 치운다(id는 registry에 남아 재등록돼도 유지된다).
  const pruneBefore = addDaysIso(todayIso(), -KEEP_PRUNED_DAYS)
  const kept: SyncedContest[] = []
  let pruned = 0
  for (const contest of state.contests) {
    if (contest.deadline < pruneBefore) {
      for (const [key, entry] of Object.entries(state.registry)) {
        if (entry.id === contest.id) state.registry[key] = { ...entry, pruned: true }
      }
      pruned += 1
    } else {
      kept.push(contest)
    }
  }
  state.contests = kept
  state.lastSync = new Date().toISOString()
  writeState(state)

  const summary: SyncSummary = {
    added,
    refreshed,
    pruned,
    skippedDetailFail,
    total: kept.length,
  }
  if (state.lastSync) summary.lastSync = state.lastSync
  console.log(`[contestSync] 동기화 완료 — 신규 ${added}, 재등록 ${refreshed}, 정리 ${pruned}, 보관 ${kept.length}건`)
  return summary
}

// ---------- 조회·스케줄러 ----------
export function getContests(): SyncedContest[] {
  return readState().contests
}

let schedulerStarted = false

export function startContestSyncScheduler() {
  if (schedulerStarted) return
  schedulerStarted = true
  // 시작 직후 서버가 먼저 뜨도록 잠시 뒤 첫 동기화를 실행한다(강제 아님 — 최근에
  // 동기화했다면 건너뛴다). 이후 6시간마다 갱신한다.
  setTimeout(() => {
    syncContests().catch((error) => console.error('[contestSync] 자동 동기화 실패:', error))
  }, 3000)
  setInterval(() => {
    syncContests().catch((error) => console.error('[contestSync] 주기 동기화 실패:', error))
  }, SYNC_INTERVAL_MS)
}
