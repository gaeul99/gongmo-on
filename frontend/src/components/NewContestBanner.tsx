import { useState } from 'react'
import AppLink from './AppLink'
import { contests } from '../data/mockData.js'
import {
  getNewContests,
  isNewContestOptIn,
  markContestsSeen,
} from '../utils/contestOpenAlerts.js'
import './NewContestBanner.css'

type Props = {
  onOpenContest: (id: number) => void
}

/** 홈 상단 '새로 접수 시작' 배너. 마이페이지 옵트인이 꺼져 있으면 표시하지 않습니다. */
export default function NewContestBanner({ onOpenContest }: Props) {
  const [newContests, setNewContests] = useState(() =>
    isNewContestOptIn() ? getNewContests(contests) : [],
  )
  // '외 N건'을 누르면 나머지 공모전 칩을 배너 안에서 펼쳐 보여 줍니다.
  const [expanded, setExpanded] = useState(false)

  if (newContests.length === 0) {
    return null
  }

  const previews = expanded ? newContests : newContests.slice(0, 3)
  const extraCount = newContests.length - previews.length

  return (
    <div className="new-contest-banner" role="status">
      <div className="new-contest-info">
        <strong className="new-contest-title">
          <span className="new-contest-emoji" aria-hidden="true">🆕</span>{' '}
          새로 접수가 시작된 공모전 {newContests.length}건
        </strong>
        <span className="new-contest-list">
          {previews.map((contest) => (
            <AppLink
              key={contest.id}
              className="new-contest-chip"
              href={`/contest/${contest.id}`}
              title={`${contest.title} 상세 보기`}
              onNavigate={() => onOpenContest(contest.id)}
            >
              {contest.title}
            </AppLink>
          ))}
          {extraCount > 0 && (
            <button
              type="button"
              className="new-contest-more"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? '접기' : `외 ${extraCount}건 더 보기`}
            </button>
          )}
        </span>
      </div>
      <button
        type="button"
        className="new-contest-dismiss"
        onClick={() => {
          markContestsSeen(contests)
          setNewContests([])
        }}
      >
        확인했어요
      </button>
    </div>
  )
}
