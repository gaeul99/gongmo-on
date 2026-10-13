// ==========================================================
// 마감 달력 엑셀(.xlsx) 내보내기 — exceljs 사용
// CSV와 달리 행 높이·열 너비·색을 파일에 지정할 수 있어 앱 달력과 같은 치수로 담는다.
// - '달력' 시트: 월간 그리드 — 칸 폭 12(≈89px)·행 높이 33pt(=44px), 앱 달력과 같은
//   점 기호(◆응모 ●마감일 ▲마감 7일 전 ×마감 지남)를 색 글자로, 오늘 칸은 연회색 배경
// - '마감 일정 목록' 시트: 구분·상태·마감 7일 전·공모전 페이지(하이퍼링크) 표
// exceljs는 용량이 커서 버튼을 누른 시점에만 동적으로 로드한다(코드 분할).
// ==========================================================

import {
  MARKS,
  WEEKDAY_HEADER,
  buildMonthGrids,
  remindDateOf,
  statusOf,
  todayKeyOf,
} from './calendarExport.js'

// 앱 달력 칸(약 88×44px)에 맞춘 엑셀 치수 — 열 폭 단위는 기본 글꼴 문자 수(1≈7px+여백),
// 행 높이 단위는 pt(1px=0.75pt)이다.
const DAY_COLUMN_WIDTH = 12
const DAY_ROW_HEIGHT_PT = 33
const WEEKDAY_ROW_HEIGHT_PT = 17

const COLORS = {
  text: 'FF000000',
  muted: 'FF6B7280',
  border: 'FFE5E7EB',
  fill: 'FFF3F4F6',
  link: 'FF2563EB',
}

// '#16a34a' → 'FF16A34A' (exceljs ARGB 표기)
const argbOf = (hex) => `FF${hex.replace('#', '').toUpperCase()}`

/** 달력 시트 — 월간 그리드를 앱과 같은 치수로 그린다. */
function buildCalendarSheet(workbook, entries, now) {
  const sheet = workbook.addWorksheet('달력', { views: [{ showGridLines: false }] })
  sheet.columns = Array.from({ length: 7 }, () => ({ width: DAY_COLUMN_WIDTH }))

  let rowIndex = 1
  const titleCell = sheet.getRow(rowIndex).getCell(1)
  titleCell.value = '공모온 달력 (응모·관심 전체)'
  titleCell.font = { bold: true, size: 14 }
  sheet.getRow(rowIndex).height = 22
  sheet.mergeCells(rowIndex, 1, rowIndex, 7)
  rowIndex += 1

  sheet.getRow(rowIndex).getCell(1).value = {
    richText: Object.values(MARKS).flatMap((mark, index) => [
      ...(index > 0
        ? [{ text: '   ', font: { size: 10, color: { argb: COLORS.muted } } }]
        : []),
      {
        text: `${mark.symbol} ${mark.label}`,
        font: { size: 10, bold: true, color: { argb: argbOf(mark.color) } },
      },
    ]),
  }
  sheet.getRow(rowIndex).height = 16
  sheet.mergeCells(rowIndex, 1, rowIndex, 7)
  rowIndex += 2

  for (const grid of buildMonthGrids(entries, now)) {
    const monthCell = sheet.getRow(rowIndex).getCell(1)
    monthCell.value = `${grid.year}년 ${grid.month}월`
    monthCell.font = { bold: true, size: 12 }
    sheet.getRow(rowIndex).height = 20
    sheet.mergeCells(rowIndex, 1, rowIndex, 7)
    rowIndex += 1

    const weekdayRow = sheet.getRow(rowIndex)
    WEEKDAY_HEADER.forEach((name, index) => {
      const cell = weekdayRow.getCell(index + 1)
      cell.value = name
      cell.font = { bold: true, size: 11 }
      cell.alignment = { horizontal: 'center', vertical: 'middle' }
      cell.border = { bottom: { style: 'thin', color: { argb: COLORS.border } } }
    })
    weekdayRow.height = WEEKDAY_ROW_HEIGHT_PT
    rowIndex += 1

    for (const week of grid.weeks) {
      const row = sheet.getRow(rowIndex)
      row.height = DAY_ROW_HEIGHT_PT
      week.forEach((day, index) => {
        const cell = row.getCell(index + 1)
        cell.border = {
          top: { style: 'thin', color: { argb: COLORS.border } },
          bottom: { style: 'thin', color: { argb: COLORS.border } },
          left: { style: 'thin', color: { argb: COLORS.border } },
          right: { style: 'thin', color: { argb: COLORS.border } },
        }
        cell.alignment = { wrapText: true, vertical: 'top', horizontal: 'left' }
        if (!day) return
        const runs = [
          { text: `${day.day}\n`, font: { bold: true, size: 11, color: { argb: COLORS.text } } },
        ]
        for (const mark of day.marks) {
          runs.push({
            text: `${mark.symbol} ${mark.title}\n`,
            font: { size: 9, color: { argb: argbOf(mark.color) } },
          })
        }
        cell.value = { richText: runs }
        if (day.today) {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.fill } }
        }
      })
      rowIndex += 1
    }
    rowIndex += 1
  }
}

/** 목록 시트 — 달력 상세 목록의 칩 정보(구분·상태·마감 7일 전)를 표로 담는다. */
function buildListSheet(workbook, entries, now) {
  const sheet = workbook.addWorksheet('마감 일정 목록')
  sheet.columns = [{ width: 8 }, { width: 40 }, { width: 18 }, { width: 12 }, { width: 10 }, { width: 12 }, { width: 44 }]

  const headerRow = sheet.getRow(1)
  ;['구분', '공모전명', '주최', '마감일', '상태', '마감 7일 전', '공모전 페이지'].forEach((name, index) => {
    const cell = headerRow.getCell(index + 1)
    cell.value = name
    cell.font = { bold: true }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COLORS.fill } }
    cell.border = { bottom: { style: 'thin', color: { argb: COLORS.text } } }
  })

  const todayKey = todayKeyOf(now)
  entries.forEach((entry, index) => {
    const row = sheet.getRow(index + 2)
    const kindCell = row.getCell(1)
    kindCell.value = entry.kind === 'applied' ? '응모' : '관심'
    kindCell.font = {
      bold: true,
      color: { argb: argbOf(entry.kind === 'applied' ? MARKS.applied.color : MARKS.deadline.color) },
    }
    row.getCell(2).value = entry.title
    row.getCell(3).value = entry.organizer
    row.getCell(4).value = entry.deadline
    row.getCell(5).value = statusOf(entry, now)
    row.getCell(6).value = entry.deadline < todayKey ? '' : remindDateOf(entry.deadline)
    const linkCell = row.getCell(7)
    linkCell.value = { text: entry.url, hyperlink: entry.url }
    linkCell.font = { color: { argb: COLORS.link }, underline: true }
  })
}

/**
 * 달력·목록 두 시트를 담은 워크북을 만든다.
 * @param {import('./calendarExport.js').CalendarEntry[]} entries
 * @param {Date} [now]
 */
export async function buildCalendarWorkbook(entries, now = new Date()) {
  const ExcelJS = (await import('exceljs')).default
  const workbook = new ExcelJS.Workbook()
  workbook.creator = '공모온'
  buildCalendarSheet(workbook, entries, now)
  buildListSheet(workbook, entries, now)
  return workbook
}

/**
 * 달력을 서식이 유지되는 엑셀(.xlsx) 파일로 내려받습니다.
 * @param {import('./calendarExport.js').CalendarEntry[]} entries
 */
export async function downloadCalendarXlsx(entries) {
  if (entries.length === 0) return
  const workbook = await buildCalendarWorkbook(entries)
  const buffer = await workbook.xlsx.writeBuffer()
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = 'gongmo-on-calendar.xlsx'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
