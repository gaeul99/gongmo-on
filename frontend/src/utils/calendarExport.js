// ==========================================================
// 마감 달력 내보내기 (.ics / CSV / PDF)
// 응모·관심 공모전의 마감일을 세 가지 형식으로 내보낸다.
// - ICS: 구글 캘린더·Outlook·삼성 캘린더 등에서 가져오기
// - CSV: 엑셀에서 열어 편집 (UTF-8 BOM 포함)
// - PDF: 숨은 iframe으로 표를 그린 뒤 브라우저 인쇄 대화상자에서
//   "PDF로 저장"을 선택 (한글 폰트는 브라우저 설정을 따름)
// 마감일은 ICS에서 하루 종일 일정(VALUE=DATE)으로 담습니다.
// ==========================================================

const pad = (value) => String(value).padStart(2, '0')

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
  for (const entry of entries) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:gongnabi-${entry.kind}-${entry.id}-${toIcsDate(entry.deadline)}@gongnabi.local`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${toIcsDate(entry.deadline)}`,
      `DTEND;VALUE=DATE:${toIcsDate(addOneDay(entry.deadline))}`,
      `SUMMARY:[공내비] ${escapeIcsText(entry.title)}`,
      `DESCRIPTION:${escapeIcsText(
        `구분: ${entry.kind === 'applied' ? '응모' : '관심'} / 주최: ${entry.organizer} / 공모전 페이지: ${entry.url}`,
      )}`,
      'END:VEVENT',
    )
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
export function buildDeadlinesCSV(entries) {
  const cell = (value) => {
    const text = String(value ?? '')
    return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
  }
  const rows = [
    ['구분', '공모전명', '주최', '마감일', '상태', '공모전 페이지'],
  ]
  for (const entry of entries) {
    rows.push([
      entry.kind === 'applied' ? '응모' : '관심',
      entry.title,
      entry.organizer,
      entry.deadline,
      '마감',
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
  const rowsHtml = entries
    .map((entry) => {
      const kind = entry.kind === 'applied' ? '응모' : '관심'
      return `<tr><td>${escapeHtml(kind)}</td><td>${escapeHtml(entry.title)}</td><td>${escapeHtml(
        entry.organizer,
      )}</td><td>${escapeHtml(entry.deadline)}</td></tr>`
    })
    .join('')
  const basis = asOf ? `<p class="basis">데이터 기준일: ${escapeHtml(asOf)}</p>` : ''
  const html = `<!doctype html><html lang="ko"><head><meta charset="utf-8" />
<title>공내비 마감 일정</title>
<style>
  body { font-family: 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif; margin: 32px; color: #222; }
  h1 { font-size: 20px; margin: 0 0 4px; }
  .basis { font-size: 12px; color: #777; margin: 0 0 16px; }
  table { border-collapse: collapse; width: 100%; font-size: 13px; }
  th, td { border: 1px solid #ccc; padding: 7px 9px; text-align: left; word-break: keep-all; }
  th { background: #f2ecfc; }
  tr:nth-child(even) td { background: #fafafa; }
</style></head><body>
<h1>공내비 마감 일정 (응모·관심 전체)</h1>
${basis}
<table><thead><tr><th>구분</th><th>공모전명</th><th>주최</th><th>마감일</th></tr></thead>
<tbody>${rowsHtml}</tbody></table>
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
