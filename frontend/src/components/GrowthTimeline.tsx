import { useMemo } from 'react'
import type { AppliedContest, SavedIdea, WishlistContest } from '../pages/MyPage'
import { buildGrowthTimeline } from '../utils/growthTimeline.js'
import type { RetroNote } from '../utils/retroNotes.js'
import './GrowthTimeline.css'

type Props = {
  myContests: AppliedContest[]
  wishlist: WishlistContest[]
  savedIdeas: SavedIdea[]
  retros: Record<string, RetroNote>
}

const SUMMARY_ORDER = [
  { type: 'apply', label: '응모' },
  { type: 'idea', label: '보관한 아이디어' },
  { type: 'retro', label: '회고' },
  { type: 'wish', label: '관심' },
  { type: 'test', label: '유형 검사' },
] as const

function GrowthTimeline({ myContests, wishlist, savedIdeas, retros }: Props) {
  const events = useMemo(
    () => buildGrowthTimeline({ myContests, wishlist, savedIdeas, retros }),
    [myContests, wishlist, savedIdeas, retros],
  )

  const counts = useMemo(() => {
    const map: Record<string, number> = {}
    for (const event of events) {
      map[event.type] = (map[event.type] ?? 0) + 1
    }
    return map
  }, [events])

  return (
    <section className="growth-section" aria-labelledby="growth-title">
      <h2 id="growth-title">성장 타임라인</h2>
      <div className="growth-summary">
        {SUMMARY_ORDER.map(({ type, label }) => (
          <span key={type} className={`growth-chip chip-${type}`}>
            <b>{counts[type] ?? 0}</b> {label}
          </span>
        ))}
      </div>
      {events.length === 0 ? (
        <p className="growth-empty">
          아직 활동 기록이 없어요. 아이디어를 분석하고 공모전에 관심을 표시하면 이곳에 성장
          흐름이 쌓입니다.
        </p>
      ) : (
        <ol className="growth-list">
          {events.map((event, index) => (
            <li key={`${event.type}-${event.title}-${event.date}-${index}`} className="growth-item">
              <span className={`growth-dot dot-${event.type}`} aria-hidden="true" />
              <div className="growth-card">
                <div className="growth-card-head">
                  <span className={`growth-badge badge-${event.type}`}>{event.label}</span>
                  <span className="growth-date">{event.date}</span>
                </div>
                <p className="growth-title">{event.title}</p>
                {event.meta && <p className="growth-meta">{event.meta}</p>}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}

export default GrowthTimeline
