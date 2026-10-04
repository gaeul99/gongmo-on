import { useEffect, useRef, useState } from "react";
import { contests, referenceCases, winnerArchives } from "../data/mockData.js";
import type { ContestAlert, WishlistContest } from "../pages/MyPage";
import "./TopNav.css";

type Props = {
  loggedIn: boolean;
  // 마이페이지 버튼에 표시할 미확인 마감 알림 개수. 마이페이지를 열어 확인하면 0이 됩니다.
  notificationCount?: number;
  // 종 아이콘 패널에 보여 줄 전체 마감 알림 목록
  alerts: ContestAlert[];
  onGoHome: () => void;
  onGoDashboard: () => void;
  onGoMyPage: () => void;
  onOpenContest: (id: number) => void;
  onToggleWish: (target: Omit<WishlistContest, "addedAt">) => void;
  wishlistedContestIds: number[];
};

const NOTIF_BADGE_TEXT: Record<ContestAlert["tone"], string> = {
  today: "오늘 마감",
  urgent: "임박",
  upcoming: "예정",
  closed: "마감",
};

type SearchItem = {
  title: string;
  sub: string;
  url: string;
  // 공모전은 외부 링크 대신 앱 안의 상세 화면으로 연결합니다.
  kind?: "contest";
  contestId?: number;
};

// 앱이 소개하는 실제 자료(추천 공모전·유사 사례·수상작 페이지)를 검색 대상으로 모읍니다.
const SEARCH_ITEMS: SearchItem[] = [
  ...contests.map((contest) => ({
    title: contest.title,
    sub: `추천 공모전 · ${contest.organizer}`,
    url: contest.url,
    kind: "contest" as const,
    contestId: contest.id,
  })),
  ...referenceCases.map((item) => ({
    title: item.title,
    sub: `유사 사례 · ${item.organizer}`,
    url: item.url,
  })),
  ...winnerArchives.map((archive) => ({
    title: archive.title,
    sub: `수상작 자료 · ${archive.organizer}`,
    url: archive.url,
  })),
];

// 국내 전체 공모전·행사 검색은 외부 검색으로 연결합니다.
// 위비티·캠퍼스픽은 site 검색으로 마감된 지난 공모전 아카이브까지 찾을 수 있습니다.
const EXTERNAL_SEARCHES = [
  {
    label: "위비티 등록 공모전 검색",
    sub: "마감된 지난 공모전 아카이브까지 찾기",
    build: (query: string) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${query} site:wevity.com`)}`,
  },
  {
    label: "캠퍼스픽 등록 공모전 검색",
    sub: "대학생 공모전·행사 아카이브에서 찾기",
    build: (query: string) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${query} site:campuspick.com`)}`,
  },
  {
    label: "네이버 통합검색",
    sub: "공모전·행사 소식 전체에서 찾기",
    build: (query: string) =>
      `https://search.naver.com/search.naver?query=${encodeURIComponent(`${query} 공모전 행사`)}`,
  },
  {
    label: "구글 전체 검색",
    sub: "국내 전체 웹에서 찾기",
    build: (query: string) =>
      `https://www.google.com/search?q=${encodeURIComponent(`${query} 공모전 행사`)}`,
  },
];

function TopNav({
  loggedIn,
  notificationCount = 0,
  alerts,
  onGoHome,
  onGoDashboard,
  onGoMyPage,
  onOpenContest,
  onToggleWish,
  wishlistedContestIds,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!searchOpen) return;
    searchInputRef.current?.focus();
  }, [searchOpen]);

  // 검색·알림 패널은 Escape로도 닫습니다.
  useEffect(() => {
    if (!searchOpen && !notifOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [searchOpen, notifOpen]);

  const trimmed = query.trim();
  const results = trimmed
    ? SEARCH_ITEMS.filter((item) =>
        `${item.title} ${item.sub}`.includes(trimmed),
      ).slice(0, 8)
    : [];

  const openSearch = () => {
    setQuery("");
    setSearchOpen(true);
  };

  return (
    <nav className="top-nav-bar" aria-label="공통 메뉴">
      <div className="nav-menu-row">
        <button
          type="button"
          className="nav-icon-button"
          onClick={openSearch}
          aria-label="검색"
          title="검색"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <circle
              cx="10.5"
              cy="10.5"
              r="6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <line
              x1="15"
              y1="15"
              x2="20"
              y2="20"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className="nav-icon-button"
          onClick={onGoDashboard}
          aria-label="대시보드"
          title="대시보드"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M6.5 19 V12.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M12 19 V5.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <path
              d="M17.5 19 V9.5"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            <line
              x1="4"
              y1="19.4"
              x2="20"
              y2="19.4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
          </svg>
        </button>
        <button
          type="button"
          className="nav-icon-button"
          onClick={onGoHome}
          aria-label="홈으로"
          title="홈으로"
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M4 11 L12 4 L20 11"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            <path
              d="M6.5 10 V19 H17.5 V10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </button>
        <button
          type="button"
          className={
            notifOpen ? "nav-icon-button notif-open" : "nav-icon-button"
          }
          onClick={() => setNotifOpen((open) => !open)}
          aria-label={alerts.length > 0 ? `알림 ${alerts.length}개` : "알림"}
          title="알림"
          aria-expanded={notifOpen}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
            <path
              d="M12 4.5 c-3.2 0 -5.2 2.3 -5.2 5.2 v3.4 l-1.6 3 h13.6 l-1.6 -3 v-3.4 c0 -2.9 -2 -5.2 -5.2 -5.2 Z"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            <path
              d="M10.2 19 a1.9 1.9 0 0 0 3.6 0"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          {notificationCount > 0 && (
            <span className="nav-badge" aria-hidden="true">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>
        <button
          type="button"
          className={loggedIn ? "nav-icon-button logged-in" : "nav-icon-button"}
          onClick={onGoMyPage}
          aria-label={
            notificationCount > 0
              ? `마이페이지, 확인할 알림 ${notificationCount}개`
              : "마이페이지"
          }
          title={
            notificationCount > 0
              ? `확인할 알림 ${notificationCount}개`
              : "마이페이지"
          }
        >
          <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
            <circle
              cx="12"
              cy="8.2"
              r="3.6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M4.8 19.4 c0.6 -4 3.6 -6 7.2 -6 s6.6 2 7.2 6"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          {notificationCount > 0 && (
            <span className="nav-badge" aria-hidden="true">
              {notificationCount > 9 ? "9+" : notificationCount}
            </span>
          )}
        </button>
      </div>

      {notifOpen && (
        <div className="notif-overlay" onClick={() => setNotifOpen(false)}>
          <div
            className="notif-panel"
            role="dialog"
            aria-modal="false"
            aria-label="마감 알림"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="notif-head">
              <p className="notif-head-title">알림</p>
              <button
                type="button"
                className="notif-close"
                onClick={() => setNotifOpen(false)}
                aria-label="알림 닫기"
              >
                ×
              </button>
            </div>
            {alerts.length === 0 ? (
              <p className="notif-empty">
                응모·관심 공모전의 마감이 가까워지면 이곳에 알려 드려요.
              </p>
            ) : (
              <ul className="notif-list">
                {alerts.map((alert) => (
                  <li key={alert.id} className="notif-item">
                    <span className={`notif-tone tone-${alert.tone}`}>
                      {NOTIF_BADGE_TEXT[alert.tone]}
                    </span>
                    <div className="notif-text">
                      <p className="notif-item-title">{alert.title}</p>
                      <p className="notif-item-meta">
                        {alert.kindLabel} · 마감 {alert.deadline} · {alert.message}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="notif-goto-mypage"
              onClick={() => {
                setNotifOpen(false);
                onGoMyPage();
              }}
            >
              마이페이지에서 전체 보기 →
            </button>
          </div>
        </div>
      )}

      {searchOpen && (
        <div className="search-overlay" onClick={() => setSearchOpen(false)}>
          <div
            className="search-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="공모전 자료 검색"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="search-input-row">
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                aria-hidden="true"
              >
                <circle
                  cx="10.5"
                  cy="10.5"
                  r="6"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                />
                <line
                  x1="15"
                  y1="15"
                  x2="20"
                  y2="20"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              </svg>
              <input
                ref={searchInputRef}
                type="text"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter" || !trimmed) return;
                  // 앱 내 공모전 결과가 있으면 Enter로 그 공모전 상세 화면을 바로 엽니다.
                  const contestHit = results.find(
                    (item) => item.kind === "contest" && item.contestId !== undefined,
                  );
                  if (contestHit && contestHit.contestId !== undefined) {
                    setSearchOpen(false);
                    onOpenContest(contestHit.contestId);
                    return;
                  }
                  window.open(
                    EXTERNAL_SEARCHES[0].build(trimmed),
                    "_blank",
                    "noopener",
                  );
                }}
                placeholder="공모전·수상작 자료 검색"
                aria-label="검색어"
                maxLength={40}
              />
              <button
                type="button"
                className="search-close"
                onClick={() => setSearchOpen(false)}
                aria-label="검색 닫기"
              >
                ×
              </button>
            </div>
            {trimmed === "" ? (
              <p className="search-hint">
                앱 속 자료부터 국내 공모전 전체(20년 아카이브 포함)까지 검색해
                보세요.
              </p>
            ) : (
              <>
                {results.length > 0 ? (
                  <>
                    <p className="search-section-label">앱 내 자료</p>
                    <ul className="search-results">
                      {results.map((item) => {
                        const isContest = item.kind === "contest";
                        const wished =
                          isContest &&
                          item.contestId !== undefined &&
                          wishlistedContestIds.includes(item.contestId);
                        return (
                          <li
                            key={item.url}
                            className={isContest ? "search-result-row" : undefined}
                          >
                            {isContest ? (
                              <button
                                type="button"
                                className="search-result-main"
                                onClick={() => {
                                  if (item.contestId === undefined) return;
                                  setSearchOpen(false);
                                  onOpenContest(item.contestId);
                                }}
                              >
                                <span className="search-result-title">
                                  {item.title}
                                </span>
                                <span className="search-result-sub">
                                  {item.sub} · 눌러서 상세 보기
                                </span>
                              </button>
                            ) : (
                              <a
                                className="search-result-main"
                                href={item.url}
                                target="_blank"
                                rel="noreferrer"
                              >
                                <span className="search-result-title">
                                  {item.title}
                                </span>
                                <span className="search-result-sub">{item.sub}</span>
                              </a>
                            )}
                            {isContest && item.contestId !== undefined && (
                              <button
                                type="button"
                                className={
                                  wished
                                    ? "search-wish-button active"
                                    : "search-wish-button"
                                }
                                aria-label={`${item.title} 관심 목록 ${
                                  wished ? "해제" : "추가"
                                }`}
                                title={
                                  wished
                                    ? "관심 목록에서 해제"
                                    : "관심 목록에 추가 (마이페이지에서 볼 수 있어요)"
                                }
                                onClick={() => {
                                  const contest = contests.find(
                                    (entry) => entry.id === item.contestId,
                                  );
                                  if (!contest) return;
                                  onToggleWish({
                                    id: contest.id,
                                    title: contest.title,
                                    organizer: contest.organizer,
                                    deadline: contest.deadline,
                                    url: contest.url,
                                  });
                                }}
                              >
                                {wished ? "★" : "☆"}
                              </button>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </>
                ) : (
                  <p className="search-hint">
                    앱 내 자료에는 '{trimmed}' 결과가 없어요. 아래 전체 검색을
                    이용해 보세요.
                  </p>
                )}
                <p className="search-section-label">국내 공모전 전체 검색</p>
                <ul className="search-results">
                  {EXTERNAL_SEARCHES.map((engine) => (
                    <li key={engine.label}>
                      <a
                        href={engine.build(trimmed)}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <span className="search-result-title">
                          {engine.label} '{trimmed}' ↗
                        </span>
                        <span className="search-result-sub">{engine.sub}</span>
                      </a>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

export default TopNav;
