import { useMemo, useState } from 'react'
import type { AppliedContest, WishlistContest } from '../pages/MyPage'
import {
  downloadCalendarICS,
  downloadDeadlinesCSV,
  printDeadlinesPdf,
} from '../utils/calendarExport.js'
import './MyContestCalendar.css'

type Props = {
  myContests: AppliedContest[]
  wishlist: WishlistContest[]
}

type CalendarEntry = {
  id: string
  kind: 'applied' | 'wished'
  title: string
  organizer: string
  deadline: string
  url: string
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토']

const pad = (n: number) => String(n).padStart(2, '0')
const dayKey = (year: number, month: number, day: number) => `${year}-${pad(month + 1)}-${pad(day)}`

// 응모·관심 공모전의 마감일을 점으로 표시하는 월간 달력. 날짜를 누르면 그 날 마감인 공모전 목록이 열립니다.
function MyContestCalendar({ myContests, wishlist }: Props) {
  const today = new Date()
  const [view, setView] = useState({ year: today.getFullYear(), month: today.getMonth() })
  const [selected, setSelected] = useState<string | null>(null)

  const entries = useMemo<CalendarEntry[]>(
    () => [
      ...myContests.map((contest) => ({
        id: `applied-${contest.id}`,
        kind: 'applied' as const,
        title: contest.title,
        organizer: contest.organizer,
        deadline: contest.deadline,
        url: contest.url,
      })),
      ...wishlist.map((contest) => ({
        id: `wished-${contest.id}`,
        kind: 'wished' as const,
        title: contest.title,
        organizer: contest.organizer,
        deadline: contest.deadline,
        url: contest.url,
      })),
    ],
    [myContests, wishlist],
  )

  const entriesByDate = useMemo(() => {
    const map = new Map<string, CalendarEntry[]>()
    for (const entry of entries) {
      const list = map.get(entry.deadline) ?? []
      list.push(entry)
      map.set(entry.deadline, list)
    }
    return map
  }, [entries])

  const firstWeekday = new Date(view.year, view.month, 1).getDay()
  const lastDay = new Date(view.year, view.month + 1, 0).getDate()
  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate())
  const monthPrefix = `${view.year}-${pad(view.month + 1)}`
  const monthCount = entries.filter((entry) => entry.deadline.startsWith(monthPrefix)).length

  const moveMonth = (offset: number) => {
    setSelected(null)
    setView((current) => {
      const next = new Date(current.year, current.month + offset, 1)
      return { year: next.getFullYear(), month: next.getMonth() }
    })
  }

  const selectedEntries = selected ? (entriesByDate.get(selected) ?? []) : []

  return (
    <section className="calendar-section" aria-labelledby="calendar-title">
      <div className="calendar-toolbar">
        <h2 id="calendar-title">마감 달력</h2>
        <div className="calendar-export-group">
          <button
            type="button"
            className="calendar-export"
            onClick={() => printDeadlinesPdf(entries)}
            disabled={entries.length === 0}
            title="마감 일정 표를 인쇄 대화상자로 열어 PDF로 저장해요"
          >
            PDF
          </button>
          <button
            type="button"
            className="calendar-export"
            onClick={() => downloadDeadlinesCSV(entries)}
            disabled={entries.length === 0}
            title="엑셀에서 편집할 수 있는 표(CSV)로 내려받아요"
          >
            엑셀 (CSV)
          </button>
          <button
            type="button"
            className="calendar-export"
            onClick={() => downloadCalendarICS(entries)}
            disabled={entries.length === 0}
            title="구글·Outlook 등 캘린더에 가져올 수 있는 파일로 내려받아요"
          >
            캘린더 (.ics)
          </button>
        </div>
      </div>
      <div className="calendar-card">
        <div className="calendar-head">
          <button
            type="button"
            className="calendar-nav"
            onClick={() => moveMonth(-1)}
            aria-label="이전 달"
          >
            ‹
          </button>
          <p className="calendar-month">
            {view.year}년 {view.month + 1}월
            <span className="calendar-month-count">{monthCount}건</span>
          </p>
          <button
            type="button"
            className="calendar-nav"
            onClick={() => moveMonth(1)}
            aria-label="다음 달"
          >
            ›
          </button>
        </div>

        <div className="calendar-grid">
          {WEEKDAYS.map((day) => (
            <div key={day} className="calendar-weekday">
              {day}
            </div>
          ))}
          {Array.from({ length: firstWeekday }, (_, index) => (
            <div key={`blank-${index}`} className="calendar-day blank" aria-hidden="true" />
          ))}
          {Array.from({ length: lastDay }, (_, index) => {
            const day = index + 1
            const key = dayKey(view.year, view.month, day)
            const dayEntries = entriesByDate.get(key) ?? []
            const hasApplied = dayEntries.some((entry) => entry.kind === 'applied')
            const hasWished = dayEntries.some((entry) => entry.kind === 'wished')
            const classNames = ['calendar-day']
            if (key === todayKey) classNames.push('today')
            if (key === selected) classNames.push('selected')
            if (dayEntries.length > 0) classNames.push('has-entries')
            return (
              <button
                key={key}
                type="button"
                className={classNames.join(' ')}
                onClick={() => setSelected(selected === key ? null : key)}
                aria-pressed={selected === key}
                aria-label={`${view.year}년 ${view.month + 1}월 ${day}일${
                  dayEntries.length > 0 ? `, 마감 ${dayEntries.length}건` : ''
                }`}
              >
                <span className="calendar-day-num">{day}</span>
                {(hasApplied || hasWished) && (
                  <span className="calendar-dots">
                    {hasApplied && <i className="calendar-dot dot-applied" />}
                    {hasWished && <i className="calendar-dot dot-wished" />}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div className="calendar-legend">
          <span>
            <i className="calendar-dot dot-applied" /> 응모한 공모전
          </span>
          <span>
            <i className="calendar-dot dot-wished" /> 관심 공모전
          </span>
        </div>

        {selected && (
          <div className="calendar-detail">
            <p className="calendar-detail-title">
              {selected} 마감
              <span className="calendar-detail-count">{selectedEntries.length}건</span>
            </p>
            {selectedEntries.length === 0 ? (
              <p className="calendar-detail-empty">이 날 마감인 공모전이 없어요.</p>
            ) : (
              <ul className="calendar-detail-list">
                {selectedEntries.map((entry) => (
                  <li key={entry.id}>
                    <span className={`calendar-detail-badge ${entry.kind}`}>
                      {entry.kind === 'applied' ? '응모' : '관심'}
                    </span>
                    <a href={entry.url} target="_blank" rel="noreferrer">
                      {entry.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
      {entries.length === 0 && (
        <p className="calendar-empty">응모·관심 공모전이 생기면 마감일이 달력에 점으로 표시돼요.</p>
      )}
    </section>
  )
}

export default MyContestCalendar
