import { useState } from 'react'
import type { AppliedContest, User, WishlistContest } from './MyPage'
import { contests } from '../data/mockData.js'
import './ContestDetailPage.css'

type Props = {
  contestId: number
  user: User | null
  appliedContestIds: number[]
  wishlistedContestIds: number[]
  onApplyContest: (target: Omit<AppliedContest, 'appliedAt'>) => void
  onToggleWish: (target: Omit<WishlistContest, 'addedAt'>) => void
  onGoMyPage: () => void
  onBack: () => void
}

// 마감까지 남은 일수(마감 지남은 음수). 오늘 0시 기준으로 날짜 차이를 계산합니다.
function daysLeft(deadline: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(`${deadline}T00:00:00`)
  return Math.round((end.getTime() - today.getTime()) / 86400000)
}

function deadlineBadge(left: number): { text: string; tone: string } {
  if (left < 0) return { text: '마감', tone: 'closed' }
  if (left === 0) return { text: '오늘 마감', tone: 'today' }
  return { text: `D-${left}`, tone: left <= 7 ? 'urgent' : 'upcoming' }
}

// 검색 결과에서 연 공모전의 상세 설명 화면입니다.
function ContestDetailPage({
  contestId,
  user,
  appliedContestIds,
  wishlistedContestIds,
  onApplyContest,
  onToggleWish,
  onGoMyPage,
  onBack,
}: Props) {
  const contest = contests.find((item) => item.id === contestId)
  // 실제 응모 안내(2단계)를 보여 줄지 — 확정·취소하면 false로 돌아갑니다.
  const [confirming, setConfirming] = useState(false)

  if (!contest) {
    return (
      <div className="page">
        <div className="detail-inner">
          <button type="button" className="back-button" onClick={onBack}>
            ← 돌아가기
          </button>
          <div className="empty-state">
            <p>찾는 공모전이 없어요. 목록에서 다시 선택해 주세요.</p>
            <button type="button" className="empty-button" onClick={onBack}>
              돌아가기
            </button>
          </div>
        </div>
      </div>
    )
  }

  const left = daysLeft(contest.deadline)
  const badge = deadlineBadge(left)
  const applied = appliedContestIds.includes(contest.id)
  const wished = wishlistedContestIds.includes(contest.id)

  return (
    <div className="page">
      <div className="detail-inner">
        <button type="button" className="back-button" onClick={onBack}>
          ← 돌아가기
        </button>

        <header className="detail-hero">
          <img
            className="detail-image"
            src={contest.image}
            alt={`${contest.title} 공모전 포스터`}
          />
          <div className="detail-hero-text">
            <div className="detail-badges">
              <span className="detail-field">{contest.field}</span>
              <span className={`detail-dday tone-${badge.tone}`}>{badge.text}</span>
            </div>
            <h1>{contest.title}</h1>
            <p className="detail-organizer">{contest.organizer}</p>
          </div>
        </header>

        <dl className="detail-facts">
          <div>
            <dt>주최</dt>
            <dd>{contest.organizer}</dd>
          </div>
          <div>
            <dt>분야</dt>
            <dd>{contest.field}</dd>
          </div>
          <div>
            <dt>접수 마감</dt>
            <dd>{contest.deadline}</dd>
          </div>
          <div>
            <dt>참가 대상</dt>
            <dd>{contest.eligibility}</dd>
          </div>
        </dl>

        <section aria-labelledby="detail-desc-title">
          <h2 id="detail-desc-title">공모전 소개</h2>
          <p className="detail-desc">{contest.description}</p>
        </section>

        <section aria-labelledby="detail-how-title">
          <h2 id="detail-how-title">응모 방법</h2>
          <ol className="detail-steps">
            {contest.applySteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </section>

        <div className="detail-actions">
          {left < 0 ? (
            <span className="detail-closed-note">접수가 마감된 공모전이에요.</span>
          ) : applied ? (
            <div className="detail-applied">
              <span>응모 완료 ✓</span>
              <button type="button" onClick={onGoMyPage}>
                마이페이지에서 보기 →
              </button>
            </div>
          ) : user && confirming ? (
            <div className="detail-apply-confirm" role="group" aria-label="응모 확인">
              <p className="detail-apply-confirm-text">
                실제 응모는 공모전 사이트에서 진행돼요. 옆의 '공모전 사이트로 이동'에서 제출을
                마친 뒤 신청 완료로 표시해 주세요.
              </p>
              <div className="detail-apply-confirm-actions">
                <button
                  type="button"
                  className="detail-apply-button"
                  onClick={() => {
                    onApplyContest({
                      id: contest.id,
                      title: contest.title,
                      organizer: contest.organizer,
                      deadline: contest.deadline,
                      url: contest.url,
                    })
                    setConfirming(false)
                  }}
                >
                  신청 완료로 표시
                </button>
                <button
                  type="button"
                  className="detail-apply-confirm-cancel"
                  onClick={() => setConfirming(false)}
                >
                  취소
                </button>
              </div>
            </div>
          ) : user ? (
            <button
              type="button"
              className="detail-apply-button"
              onClick={() => setConfirming(true)}
            >
              이 공모전 응모하기
            </button>
          ) : (
            <button type="button" className="detail-apply-button" onClick={onGoMyPage}>
              로그인하고 응모하기
            </button>
          )}
          <a className="detail-site-button" href={contest.url} target="_blank" rel="noreferrer">
            공모전 사이트로 이동 ↗
          </a>
          <button
            type="button"
            className={wished ? 'detail-wish-button active' : 'detail-wish-button'}
            onClick={() =>
              onToggleWish({
                id: contest.id,
                title: contest.title,
                organizer: contest.organizer,
                deadline: contest.deadline,
                url: contest.url,
              })
            }
          >
            {wished ? '★ 관심 목록에 저장됨' : '☆ 관심 목록에 추가'}
          </button>
        </div>

        <p className="detail-note">
          위 소개와 응모 방법은 공모전 공고를 요약해 둔 참고 자료예요. 세부 일정·상금·제출
          양식은 반드시 공모전 사이트의 공식 공고로 확인해 주세요.
        </p>
      </div>
    </div>
  )
}

export default ContestDetailPage
