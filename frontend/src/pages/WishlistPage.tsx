// ==========================================================
// 찜한 공모전 페이지
// 마이페이지의 '찜한 공모전 보기'로만 연결되는 전용 화면이다.
// 탐색 화면과는 연결하지 않는다(2026-10-26 사용자 요청).
// 찜한 공모전을 한 화면에 모아 보고, 바로 관심을 해제하거나
// 응모 기록을 남길 수 있다.
// ==========================================================
import { useState } from 'react'
import AppLink from '../components/AppLink'
import type { User, WishlistContest } from './MyPage'
import './WishlistPage.css'

type Props = {
  user: User | null
  wishlist: WishlistContest[]
  /** 관심 해제 — 목록에서 바로 지울 때 씁니다. */
  onRemoveWish: (id: number) => void
  /** 응모 기록 — 확인 단계의 '제출했어요'로 내 응모 목록에 옮깁니다. */
  onApplyWish: (target: Omit<WishlistContest, 'addedAt'>) => void
  onBack: () => void
  // 찜이 비었을 때 공모전을 담으러 가는 안내 링크가 씁니다.
  onGoExplore: () => void
}

// 마감까지 남은 일수(마감 지남은 음수). 응모 확인 문구를 마감 여부에 맞게 분기할 때 씁니다.
function daysLeft(deadline: string): number {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const end = new Date(`${deadline}T00:00:00`)
  return Math.round((end.getTime() - today.getTime()) / 86400000)
}

function WishlistPage({
  user,
  wishlist,
  onRemoveWish,
  onApplyWish,
  onBack,
  onGoExplore,
}: Props) {
  // '응모하기'의 2단계 확인 — 상세·결과 화면과 같은 원칙으로,
  // 확인 박스를 연 공모전 id를 기억합니다(한 번에 하나만 열립니다).
  const [confirmingWishId, setConfirmingWishId] = useState<number | null>(null)

  return (
    <div className="wishlist-page">
      <div className="wishlist-inner">
        <button type="button" className="back-button" onClick={onBack}>
          ← 마이페이지로
        </button>

        <header className="wishlist-header" data-reveal>
          <h1>
            찜한 공모전{" "}
            <span className="wishlist-count">{wishlist.length}건</span>
          </h1>
          <p className="wishlist-caption">
            관심 목록에 담아 둔 공모전을 한 화면에서 확인하세요. 바로 관심을
            해제하거나, 제출을 마친 응모를 기록할 수 있어요.
          </p>
        </header>

        {wishlist.length === 0 ? (
          <div className="wishlist-empty-box" data-reveal>
            아직 찜한 공모전이 없어요. 분석 결과나 탐색 화면에서 '☆'를 눌러
            저장해 보세요.
            <AppLink
              className="wishlist-cta-button"
              href="/contest"
              onNavigate={onGoExplore}
            >
              공모전 둘러보기 →
            </AppLink>
          </div>
        ) : (
          <ul className="wishlist-list" data-reveal>
            {wishlist.map((contest) => {
              const confirming = confirmingWishId === contest.id
              return (
                <li key={contest.id} className="wishlist-item">
                  <div className="wishlist-info">
                    <h3>{contest.title}</h3>
                    <p className="wishlist-meta">
                      {contest.organizer} · 마감 {contest.deadline}
                    </p>
                    <p className="wishlist-added">{contest.addedAt} 관심 추가</p>
                  </div>
                  <div className="wishlist-actions">
                    <a href={contest.url} target="_blank" rel="noreferrer">
                      공모전 페이지 ↗
                    </a>
                    {user ? (
                      <button
                        type="button"
                        className="wishlist-apply-button"
                        aria-expanded={confirming}
                        onClick={() =>
                          setConfirmingWishId(confirming ? null : contest.id)
                        }
                      >
                        응모하기
                      </button>
                    ) : (
                      <span className="wishlist-login-hint">
                        로그인하면 응모할 수 있어요
                      </span>
                    )}
                    <button
                      type="button"
                      className="wishlist-remove-button"
                      onClick={() => onRemoveWish(contest.id)}
                    >
                      관심 해제
                    </button>
                  </div>
                  {/* 응모 기록은 상세·결과 화면과 같은 2단계 확인을 거친다 —
                      실제 응모는 공모전 사이트에서 진행되므로 확인 단계에서
                      사이트로 먼저 보낸다(핵심 설계 원칙). */}
                  {confirming && (
                    <div
                      className="wishlist-apply-confirm"
                      role="group"
                      aria-label="응모 확인"
                    >
                      <p className="wishlist-apply-confirm-title">
                        {daysLeft(contest.deadline) < 0
                          ? "이미 마감된 공모전이에요. 실제로 제출을 마친 경우에만 기록해 주세요."
                          : "실제 응모는 공모전 사이트에서 제출해요."}
                      </p>
                      <ol className="wishlist-apply-confirm-steps">
                        {daysLeft(contest.deadline) < 0 ? (
                          <li>
                            제출을 마친 응모라면 '제출했어요'를 눌러 내 응모
                            목록과 마감 달력에 기록하세요.
                          </li>
                        ) : (
                          <>
                            <li>
                              먼저 공모전 사이트에 접속해 제출을 마쳐 주세요.
                            </li>
                            <li>
                              제출이 끝나면 '제출했어요'를 눌러 내 응모 목록에
                              기록하세요.
                            </li>
                          </>
                        )}
                      </ol>
                      <div className="wishlist-apply-confirm-actions">
                        <a
                          className="wishlist-apply-confirm-site"
                          href={contest.url}
                          target="_blank"
                          rel="noreferrer"
                        >
                          공모전 사이트 열기 ↗
                        </a>
                        <button
                          type="button"
                          className="wishlist-apply-button"
                          onClick={() => {
                            onApplyWish({
                              id: contest.id,
                              title: contest.title,
                              organizer: contest.organizer,
                              deadline: contest.deadline,
                              url: contest.url,
                            })
                            setConfirmingWishId(null)
                          }}
                        >
                          제출했어요 — 완료로 표시
                        </button>
                        <button
                          type="button"
                          className="wishlist-apply-confirm-cancel"
                          onClick={() => setConfirmingWishId(null)}
                        >
                          취소
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}

export default WishlistPage
