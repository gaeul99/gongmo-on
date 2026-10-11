// ==========================================================
// 마감 달력 내보내기 (.ics / CSV / PDF)
// 응모·관심 공모전의 마감일을 세 가지 형식으로 내보낸다.
// 달력 화면과 같이 구분(응모·관심)·상태(응모 결과·마감 여부)와
// 마감 7일 전 날짜(달력의 빨간 점)를 함께 담는다.
// - ICS: 구글 캘린더·Outlook·삼성 캘린더 등에서 가져오기 —
//   마감이 지나지 않은 공모전엔 '마감 7일 전' 일정도 함께 담는다
// - CSV: 엑셀에서 열어 편집 (UTF-8 BOM 포함)
// - PDF: 숨은 iframe으로 표를 그린 뒤 브라우저 인쇄 대화상자에서
//   "PDF로 저장"을 선택 (한글 폰트는 브라우저 설정을 따름)
// 마감일은 ICS에서 하루 종일 일정(VALUE=DATE)으로 담습니다.
// ==========================================================

const pad = (value) => String(value).padStart(2, '0')

// 상태 문구 — 달력 상세 목록의 결과 칩과 같은 라벨을 쓴다.
const RESULT_LABELS = { progress: '진행 중', won: '수상', lost: '탈락' }

export function todayKeyOf(now) {
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

// 달력의 빨간 점(마감 7일 전)과 같은 날짜 — 마감일에서 7일을 뺀 날.
export function remindDateOf(deadline) {
  const [year, month, day] = deadline.split('-').map(Number)
  const date = new Date(year, month - 1, day - 7)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// 달력 목록 칩과 같은 상태 — 결과 기록이 있으면 결과를, 없으면 마감 여부를 알린다.
export function statusOf(entry, now) {
  if (entry.result) return RESULT_LABELS[entry.result]
  return entry.deadline < todayKeyOf(now) ? '마감' : '마감 예정'
}

// 달력 표시 기호·색 — 앱 달력의 점과 같은 의미·색을 쓴다(CSV에서는 기호로, PDF에서는 색 점으로).
export const MARKS = {
  applied: { symbol: '◆', color: '#16a34a', label: '응모한 공모전' },
  deadline: { symbol: '●', color: '#f97316', label: '공모전 마감일' },
  remind: { symbol: '▲', color: '#dc2626', label: '마감 7일 전' },
  closed: { symbol: '×', color: '#9ca3af', label: '마감 지난 공모전' },
}

export const WEEKDAY_HEADER = ['일', '월', '화', '수', '목', '금', '토']

export function shortTitle(text, max = 10) {
  return text.length > max ? `${text.slice(0, max)}…` : text
}

/**
 * 달력 화면과 같은 월간 그리드를 만든다. 마감일(주황)·응모(초록)·마감 7일 전(빨강,
 * 마감이 지나지 않은 항목만)·마감 지남(회색)을 날짜별 점 표시로 모아 일정이 있는 달의
 * 그리드를 오름차순으로 돌려준다.
 * @param {CalendarEntry[]} entries
 * @param {Date} now
 */
export function buildMonthGrids(entries, now) {
  const todayKey = todayKeyOf(now)
  const marksByDate = new Map()
  const monthKeys = new Set()
  const addMark = (dateKey, mark) => {
    const list = marksByDate.get(dateKey) ?? []
    list.push(mark)
    marksByDate.set(dateKey, list)
  }
  for (const entry of entries) {
    const closed = entry.deadline < todayKey
    const title = shortTitle(entry.title)
    if (entry.kind === 'applied') addMark(entry.deadline, { ...MARKS.applied, title })
    if (closed) {
      addMark(entry.deadline, { ...MARKS.closed, title })
    } else {
      const remindKey = remindDateOf(entry.deadline)
      addMark(entry.deadline, { ...MARKS.deadline, title })
      addMark(remindKey, { ...MARKS.remind, title })
      monthKeys.add(remindKey.slice(0, 7))
    }
    monthKeys.add(entry.deadline.slice(0, 7))
  }
  return [...monthKeys]
    .sort()
    .map((monthKey) => {
      const [year, month] = monthKey.split('-').map(Number)
      const firstWeekday = new Date(year, month - 1, 1).getDay()
      const lastDay = new Date(year, month, 0).getDate()
      const weeks = []
      let week = Array.from({ length: firstWeekday }, () => null)
      for (let day = 1; day <= lastDay; day += 1) {
        const key = `${monthKey}-${pad(day)}`
        week.push({ day, today: key === todayKey, marks: marksByDate.get(key) ?? [] })
        if (week.length === 7) {
          weeks.push(week)
          week = []
        }
      }
      if (week.length > 0) weeks.push([...week, ...Array.from({ length: 7 - week.length }, () => null)])
      return { year, month, weeks }
    })
}

/** 월간 그리드 하나를 인쇄용 HTML 표로 그린다 — 앱 달력과 같은 색 점·오늘 테두리. */
function monthGridHtml(grid) {
  const head = WEEKDAY_HEADER.map((name) => `<th class="cal-head">${name}</th>`).join('')
  const body = grid.weeks
    .map((week) => {
      const cells = week
        .map((day) => {
          if (!day) return '<td class="cal-cell cal-blank"></td>'
          const classes = day.today ? 'cal-cell cal-today' : 'cal-cell'
          const dots = day.marks
            .map((mark) => `<i class="cal-dot" style="background:${mark.color}"></i>`)
            .join('')
          const labels = day.marks
            .slice(0, 3)
            .map((mark) => `<span class="cal-ev">${mark.symbol}${escapeHtml(mark.title)}</span>`)
            .join('')
          const more = day.marks.length > 3 ? `<span class="cal-ev">+${day.marks.length - 3}건 더</span>` : ''
          return `<td class="${classes}"><span class="cal-daynum">${day.day}</span>${
            dots ? `<span class="cal-dots">${dots}</span>` : ''
          }${labels}${more}</td>`
        })
        .join('')
      return `<tr>${cells}</tr>`
    })
    .join('')
  // 열너비 동일 — 앱 달력의 1fr 7열과 같게 colgroup으로 균등 폭을 명시한다.
  const cols = WEEKDAY_HEADER.map(() => '<col style="width:14.28%" />').join('')
  return `<div class="cal-block"><p class="cal-month">${grid.year}년 ${grid.month}월</p><table class="cal"><colgroup>${cols}</colgroup><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table></div>`
}

// 'YYYY-MM-DD' → 'YYYYMMDD' (ICS 날짜 표기)
function toIcsDate(dateText) {
  return dateText.replaceAll('-', '')
}

function addOneDay(dateText) {
  const date = new Date(`${dateText}T00:00:00`)
  date.setDate(date.getDate() + 1)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

// ICS 텍스트 예약 문자(백슬래시·세미콜론·쉼표·줄바꿈) 이스케이프
function escapeIcsText(text) {
  return String(text).replaceAll('\\', '\\\\').replaceAll(';', '\\;').replaceAll(',', '\\,').replaceAll('\n', '\\n')
}

/**
 * @typedef {Object} CalendarEntry
 * @property {string} id
 * @property {'applied'|'wished'} kind
 * @property {string} title
 * @property {string} organizer
 * @property {string} deadline 'YYYY-MM-DD'
 * @property {string} url
 * @property {'progress'|'won'|'lost'} [result] 응모한 공모전에만 기록된 결과
 */

/**
 * @param {CalendarEntry[]} entries
 * @param {Date} [now]
 * @returns {string}
 */
export function buildCalendarICS(entries, now = new Date()) {
  const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(
    now.getUTCHours(),
  )}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//GongNabi//GongNabi Deadlines//KO',
    'CALSCALE:GREGORIAN',
  ]
  const todayKey = todayKeyOf(now)
  for (const entry of entries) {
    const kind = entry.kind === 'applied' ? '응모' : '관심'
    const description = `구분: ${kind} / 상태: ${statusOf(entry, now)} / 주최: ${entry.organizer} / 공모전 페이지: ${entry.url}`
    lines.push(
      'BEGIN:VEVENT',
      `UID:gongnabi-${entry.kind}-${entry.id}-${toIcsDate(entry.deadline)}@gongnabi.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(entry.deadline)}`,
      `DTEND;VALUE=DATE:${toIcsDate(addOneDay(entry.deadline))}`,
      `SUMMARY:[공내비] ${escapeIcsText(entry.title)}`,
      `DESCRIPTION:${escapeIcsText(description)}`,
      'END:VEVENT',
    )
    // 달력의 빨간 점과 같은 '마감 7일 전' 일정 — 마감이 지난 공모전은 담지 않는다.
    if (entry.deadline >= todayKey) {
      const remindDate = remindDateOf(entry.deadline)
      lines.push(
        'BEGIN:VEVENT',
        `UID:gongnabi-remind-${entry.id}-${toIcsDate(remindDate)}@gongnabi.local`,
        `DTSTAMP:${stamp}`,
        `DTSTART;VALUE=DATE:${toIcsDate(remindDate)}`,
        `DTEND;VALUE=DATE:${toIcsDate(addOneDay(remindDate))}`,
        `SUMMARY:[공내비] 마감 7일 전 — ${escapeIcsText(entry.title)}`,
        `DESCRIPTION:${escapeIcsText(description)}`,
        'END:VEVENT',
      )
    }
  }
  lines.push('END:VCALENDAR')
  // ICS 규격은 CRLF 줄바꿈을 요구합니다.
  return lines.join('\r\n')
}

/** blob 파일을 사용자에게 내려줍니다.
 * @param {Blob} blob
 * @param {string} filename
 */
function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

/**
 * 체크한 공모전 일정을 .ics 파일로 내려받습니다.
 * @param {CalendarEntry[]} entries
 */
export function downloadCalendarICS(entries) {
  if (entries.length === 0) return
  // 한국어 제목이 포함되므로 BOM을 붙여 윈도우 캘린더 앱에서도 깨지지 않게 합니다.
  triggerDownload(new Blob([`\ufeff${buildCalendarICS(entries)}`], {
    type: 'text/calendar;charset=utf-8',
  }), 'gongnabi-deadlines.ics')
}

/**
 * 엑셀에서 바로 열리는 CSV 표를 만듭니다.
 * @param {CalendarEntry[]} entries
 * @returns {string}
 */
export function buildDeadlinesCSV(entries, now = new Date()) {
  const cell = (value) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const rows = [
    ['공내비 달력 (응모·관심 전체)'],
    ['◆ 응모한 공모전 · ● 공모전 마감일 · ▲ 마감 7일 전 · × 마감 지난 공모전'],
    [],
  ]
  // 달력 화면과 같은 월간 그리드 — 날짜 칸 안에 점 기호와 일정 제목을 함께 적는다.
  for (const grid of buildMonthGrids(entries, now)) {
    rows.push([`${grid.year}년 ${grid.month}월`, '', '', '', '', '', ''])
    rows.push(WEEKDAY_HEADER)
    for (const week of grid.weeks) {
      rows.push(
        week.map((day) => {
          if (!day) return ''
          const lines = [String(day.day)]
          for (const mark of day.marks) lines.push(`${mark.symbol} ${mark.title}`)
          return lines.join('\n')
        }),
      )
    }
    rows.push([])
  }
  rows.push(['마감 일정 목록'])
  rows.push(['구분', '공모전명', '주최', '마감일', '상태', '마감 7일 전', '공모전 페이지'])
  for (const entry of entries) {
    rows.push([
      entry.kind === 'applied' ? '응모' : '관심',
      entry.title,
      entry.organizer,
      entry.deadline,
      statusOf(entry, now),
      entry.deadline < todayKeyOf(now) ? '' : remindDateOf(entry.deadline),
      entry.url,
    ])
  }
  // CRLF + 첫 행 BOM은 엑셀 호환을 위한 관례입니다.
  return rows.map((row) => row.map(cell).join(',')).join('\r\n')
}

/**
 * 마감 일정을 엑셀용 CSV 파일로 내려받습니다.
 * @param {CalendarEntry[]} entries
 */
export function downloadDeadlinesCSV(entries) {
  if (entries.length === 0) return
  triggerDownload(new Blob([`\ufeff${buildDeadlinesCSV(entries)}`], {
    type: 'text/csv;charset=utf-8',
  }), 'gongnabi-deadlines.csv')
}

/**
 * 마감 일정 표를 인쇄 대화상자로 엽니다. 사용자가 "PDF로 저장"을 고르면 PDF가 됩니다.
 * 별도 라이브러리 없이 숨은 iframe만 사용하며, 한글은 브라우저 기본 폰트로 렌더링됩니다.
 * @param {CalendarEntry[]} entries
 * @param {string} [asOf] 데이터 기준일 표기 (예: '2026-10-02')
 */
export function printDeadlinesPdf(entries, asOf) {
  if (entries.length === 0) return
  const now = new Date()
  const todayKey = todayKeyOf(now)
  const rowsHtml = entries
    .map((entry) => {
      const kind = entry.kind === 'applied' ? '응모' : '관심'
      const remind = entry.deadline < todayKey ? '' : remindDateOf(entry.deadline)
      return `<tr><td>${escapeHtml(kind)}</td><td>${escapeHtml(entry.title)}</td><td>${escapeHtml(
        entry.organizer,
      )}</td><td>${escapeHtml(entry.deadline)}</td><td>${escapeHtml(
        statusOf(entry, now),
      )}</td><td>${escapeHtml(remind)}</td></tr>`
    })
    .join('')
  const basis = asOf ? `<p class="basis">데이터 기준일: ${escapeHtml(asOf)}</p>` : ''
  const grids = buildMonthGrids(entries, now)
  const legend = Object.values(MARKS)
    .map(
      (mark) =>
        `<span class="cal-legend-item"><i class="cal-dot" style="background:${mark.color}"></i>${mark.label}</span>`,
    )
    .join('')
  const gridsHtml = grids.map(monthGridHtml).join('')
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
<title>공내비 달력 · 마감 일정</title>
<style>
  body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; margin: 32px; color: #000000;
    print-color-adjust: exact; -webkit-print-color-adjust: exact; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .basis { font-size: 12px; color: #000000; margin: 0 0 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #000000; padding: 7px 9px; text-align: left; word-break: keep-all; }
  th { background: #ffffff; }
  tr:nth-child(even) td { background: #ffffff; }
  .cal-legend { font-size: 11px; margin: 0 0 14px; }
  .cal-legend-item { margin-right: 14px; }
  /* 달력 그리드 — 앱 달력(MyContestCalendar)과 같은 치수: 날짜 칸 최소 높이 44px,
     7열 균등 폭(칸 폭 약 88px — 앱의 720px 컨테이너 기준), 칸 사이 4px 간격.
     한 달에 하나의 표를 전체 폭으로 내려 쓰고, 내용이 많은 칸은 앱의 min-height처럼 늘어난다 */
  .cal-wrap { margin: 0 0 22px; }
  .cal-block { width: 100%; max-width: 648px; margin: 0 auto 18px; page-break-inside: avoid; }
  .cal-month { font-size: 14px; font-weight: 700; margin: 0 0 6px; }
  table.cal { table-layout: fixed; width: 100%; font-size: 11px; border-collapse: separate; border-spacing: 4px; }
  .cal th, .cal td { border: none; padding: 0; text-align: center; }
  .cal .cal-head { font-weight: 600; padding: 4px 0; }
  .cal td { vertical-align: top; }
  .cal-cell { height: 44px; padding: 6px 2px 4px; word-break: keep-all; }
  .cal-daynum { display: block; font-weight: 700; }
  /* 오늘 날짜 — 앱과 같이 검정 원 안에 흰 숫자 */
  .cal-today .cal-daynum {
    display: inline-block; width: 22px; height: 22px; line-height: 22px;
    border-radius: 999px; background: #000000; color: #ffffff;
  }
  .cal-dots { display: block; margin-top: 2px; }
  .cal-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; margin-right: 3px; }
  .cal-ev { display: block; font-size: 9px; line-height: 1.35; margin-top: 2px; }
  .list-title { font-size: 15px; font-weight: 700; margin: 8px 0; page-break-after: avoid; }
</style></head><body>
<h1>공내비 달력 · 마감 일정 (응모·관심 전체)</h1>
${basis}
<p class="cal-legend">${legend}</p>
<div class="cal-wrap">${gridsHtml}</div>
<p class="list-title">마감 일정 목록</p>
<table><thead><tr><th>구분</th><th>공모전명</th><th>주최</th><th>마감일</th><th>상태</th><th>마감 7일 전</th></tr></thead>
<tbody>${rowsHtml}</tbody></table>
<p class="basis">상태의 진행 중·수상·탈락은 응모 결과 기록이고, '마감 7일 전'은 달력의 빨간 점과 같은 날짜입니다.</p>
</body></html>`

  const frame = document.createElement('iframe')
  frame.setAttribute('aria-hidden', 'true')
  frame.style.position = 'fixed'
  frame.style.right = '0'
  frame.style.bottom = '0'
  frame.style.width = '0'
  frame.style.height = '0'
  frame.style.border = '0'
  document.body.appendChild(frame)
  const doc = frame.contentDocument
  if (!doc) {
    frame.remove()
    return
  }
  doc.open()
  doc.write(html)
  doc.close()
  const win = frame.contentWindow
  if (!win) {
    frame.remove()
    return
  }
  // 문서 렌더를 잠깐 기다렸다가 인쇄 대화상자를 열고, 끝나면 iframe을 치웁니다.
  win.addEventListener('afterprint', () => frame.remove())
  window.setTimeout(() => {
    win.focus()
    win.print()
  }, 120)
}

/** HTML 특수문자 이스케이프 (PDF 표 생성용) */
function escapeHtml(text) {
  return String(text)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
}
