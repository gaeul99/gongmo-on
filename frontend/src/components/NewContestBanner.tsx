import { useEffect, useState } from 'react'
import { contests } from '../data/mockData.js'
import {
  getNewContests,
  isNewContestOptIn,
  markContestsSeen,
} from '../utils/contestOpenAlerts.js'
import './NewContestBanner.css'

/** 홈 상단 '새로 접수 시작' 배너. 마이페이지 옵트인이 꺼져 있으면 표시하지 않습니다. */
export default function NewContestBanner() {
  const [newContests, setNewContests] = useState(() =>
    isNewContestOptIn() ? getNewContests(contests) : [],
  )

  // 화면 전환 없이 홈이 재활용되는 경우에도 최신 상태를 다시 확인합니다.
  useEffect(() => {
    setNewContests(isNewContestOptIn() ? getNewContests(contests) : [])
  }, [])

  if (newContests.length === 0) {
    return null
  }

  const previews = newContests.slice(0, 3)
  const extraCount = newContests.length - previews.length

  return (
    <div className="new-contest-banner" role="status">
      <div className="new-contest-info">
        <strong className="new-contest-title">🆕 새로 접수가 시작된 공모전 {newContests.length}건</strong>
        <span className="new-contest-list">
          {previews.map((contest) => (
            <span key={contest.id} className="new-contest-chip">
              {contest.title}
            </span>
          ))}
          {extraCount > 0 && <span className="new-contest-more">외 {extraCount}건</span>}
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
