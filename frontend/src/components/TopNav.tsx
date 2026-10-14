import { useEffect, useMemo, useRef, useState } from "react";
import { referenceCases, winnerArchives } from "../data/mockData.js";
import { useContestPool } from "../data/contestPool.js";
import type { ContestAlert, WishlistContest } from "../pages/MyPage";
import { alertDismissKey } from "../utils/contestAlerts.js";
import AppLink from "./AppLink";
import "./TopNav.css";

type Props = {
  loggedIn: boolean;
  // 마이페이지 버튼에 표시할 미확인 마감 알림 개수. 마이페이지를 열어 확인하면 0이 됩니다.
  notificationCount?: number;
  // 종 아이콘 패널에 보여 줄 전체 마감 알림 목록
  alerts: ContestAlert[];
  // 읽음(확인) 처리한 알림 키 집합 — 읽은 항목은 목록에서 연회색으로 표시합니다.
  readAlertKeys: Set<string>;
  // 알림 항목을 하나 확인(읽음) 처리 — 확인한 것은 배지 개수에서 빠집니다.
  onDismissAlert: (alert: ContestAlert) => void;
  // 알림을 모두 읽음 처리 — 종 아이콘을 열거나 '모두 읽음'을 누르면 배지가 사라집니다.
  onMarkAllRead: () => void;
  // 알림을 모두 읽지 않음 처리 — '모두 읽음'의 반대로 배지와 읽음 표시를 되살립니다.
  onMarkAllUnread: () => void;
  onGoHome: () => void;
  onGoMyPage: () => void;
  onOpenContest: (id: number) => void;
  // 검색 팝업 하단의 '공모전 전체 탐색' 입구. 바로가기 5개의 입구는 2026-10-14
  // 사용자 요청으로 하단 바 메뉴 팝업(홈버튼 옆 아이콘) 하나로 정리됐다.
  onOpenExplore: () => void;
  // 하단 바 메뉴 팝업(홈버튼 옆 아이콘)이 여는 바로가기 5개다.
  onStart: () => void;
  onTypeTest: () => void;
  onDashboard: () => void;
  onNotes: () => void;
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
// 공모전은 데이터 풀(목업 + 자동 등록)에서 가져온다 — 자동 등록분도 검색에서 찾을 수 있게.
function buildSearchItems(contests: Array<{ id: number; title: string; organizer: string; url: string }>): SearchItem[] {
  return [
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
}

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
  readAlertKeys,
  onDismissAlert,
  onMarkAllRead,
  onMarkAllUnread,
  onGoHome,
  onGoMyPage,
  onOpenContest,
  onOpenExplore,
  onStart,
  onTypeTest,
  onDashboard,
  onNotes,
  onToggleWish,
  wishlistedContestIds,
}: Props) {
  const [searchOpen, setSearchOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");
  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const searchBoxRef = useRef<HTMLDivElement | null>(null);
  // 종 아이콘 + 알림 패널을 함께 감싸는 래퍼 — 패널을 아이콘 바로 밑에 붙이고,
  // 바깥 클릭 판정(아이콘·패널 둘 다 밖이면 닫기)의 기준이 된다.
  const bellBoxRef = useRef<HTMLDivElement | null>(null);
  // 메뉴 아이콘 + 바로가기 팝업을 함께 감싸는 래퍼 — 팝업을 아이콘 바로 위에
  // 붙이고, 바깥 클릭 판정의 기준이 된다.
  const menuBoxRef = useRef<HTMLDivElement | null>(null);
  // 검색 대상 공모전 — 목업 + 자동 등록이 합쳐진 풀
  const contests = useContestPool();
  const searchItems = useMemo(() => buildSearchItems(contests), [contests]);

  // 검색 드롭다운은 입력 박스 바깥을 누르면 닫습니다.
  useEffect(() => {
    if (!searchOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (searchBoxRef.current && !searchBoxRef.current.contains(event.target as Node)) {
        setSearchOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [searchOpen]);

  // 알림 패널은 종 아이콘·패널 바깥을 누르면 닫습니다(검색 드롭다운과 같은 방식).
  useEffect(() => {
    if (!notifOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (bellBoxRef.current && !bellBoxRef.current.contains(event.target as Node)) {
        setNotifOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [notifOpen]);

  // 메뉴 팝업은 아이콘·팝업 바깥을 누르면 닫습니다(검색·알림과 같은 방식).
  useEffect(() => {
    if (!menuOpen) return;
    const handlePointer = (event: MouseEvent) => {
      if (menuBoxRef.current && !menuBoxRef.current.contains(event.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointer);
    return () => document.removeEventListener("mousedown", handlePointer);
  }, [menuOpen]);

  // 검색·알림·메뉴 팝업은 Escape로도 닫습니다.
  useEffect(() => {
    if (!searchOpen && !notifOpen && !menuOpen) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSearchOpen(false);
        setNotifOpen(false);
        setMenuOpen(false);
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [searchOpen, notifOpen, menuOpen]);

  const trimmed = query.trim();
  const results = trimmed
    ? searchItems.filter((item) =>
        `${item.title} ${item.sub}`.includes(trimmed),
      ).slice(0, 8)
    : [];

  // 종 아이콘 — 패널을 여는 순간 알림을 모두 읽음 처리해 빨간 배지를 바로 지웁니다.
  const toggleNotif = () => {
    if (!notifOpen) onMarkAllRead();
    setNotifOpen((open) => !open);
  };

  return (
    <nav className="top-nav-bar" aria-label="공통 메뉴">
      <div className="nav-menu-row">
        {/* 바로가기 링크 줄(아이디어 분석·유형 검사·대시보드·연습 노트·공모전 탐색)은
            2026-10-14 사용자 요청으로 하단 바 메뉴 팝업(홈버튼 옆 아이콘)으로
            옮겼다. 상단바 1행은 검색 박스 하나만 남아 화면 가운데에 놓인다. */}
        {/* 메뉴바 인라인 검색 — 행 가운데에 놓이고,
            입력하면 박스 아래로 검색 결과 드롭다운이 펼쳐진다. */}
        <div className="nav-search" ref={searchBoxRef}>
          <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
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
            onFocus={() => setSearchOpen(true)}
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
              setSearchOpen(false);
              window.open(
                EXTERNAL_SEARCHES[0].build(trimmed),
                "_blank",
                "noopener",
              );
            }}
            placeholder="공모전·수상작 검색"
            aria-label="검색어"
            maxLength={40}
          />
          {query && (
            <button
              type="button"
              className="nav-search-clear"
              onClick={() => {
                setQuery("");
                searchInputRef.current?.focus();
              }}
              aria-label="검색어 지우기"
            >
              ×
            </button>
          )}
          {searchOpen && (
            <div
              className="search-dropdown"
              role="dialog"
              aria-label="공모전 자료 검색"
            >
              <div className="search-dropdown-scroll">
              {trimmed === "" ? (
                <p className="search-hint">
                  앱 속 자료와 국내 공모전 전체를 검색해 보세요.
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
                                <AppLink
                                  className="search-result-main"
                                  href={`/contest/${item.contestId}`}
                                  onNavigate={() => {
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
                                </AppLink>
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
                      '{trimmed}' 결과가 없어요. 아래 전체 검색을 이용해 보세요.
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
              <AppLink
                className="search-explore-link"
                href="/contest"
                onNavigate={() => {
                  setSearchOpen(false);
                  onOpenExplore();
                }}
              >
                필터로 찾고 싶다면 → 공모전 탐색
              </AppLink>
              </div>
            </div>
          )}
        </div>
      </div>
      {/* 화면 하단 고정 바 — 홈·알림·마이 아이콘이 여기로 내려 왔다
          (2026-10-14 사용자 요청 '아이콘 화면 하단으로'). position: fixed라
          상단바(sticky)와 달리 화면 맨 아래에 항상 붙어 있다.
          1행(상단바)은 검색창 하나(가운데)다 */}
      <div className="nav-bottom-bar">
        <AppLink
          className="nav-icon-button"
          href="/"
          ariaLabel="홈으로"
          title="홈으로"
          onNavigate={onGoHome}
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
        </AppLink>
        {/* 홈버튼 옆 메뉴 아이콘 — 누르면 홈 바 위 화면 가운데로 바로가기 5개 팝업이
            펼친다(2026-10-14 사용자 요청 '홈바에 홈버튼 옆에 메뉴아이콘', 같은 날
            '팝업 화면 중앙 정렬·유형 검사를 맨 위로'). 바로가기의 유일한 입구다
            (같은 날 페이지 맨 아래 메뉴는 사용자 요청으로 삭제) */}
        <div className="nav-menu-box" ref={menuBoxRef}>
          <button
            type="button"
            className={
              menuOpen ? "nav-icon-button menu-open" : "nav-icon-button"
            }
            onClick={() => setMenuOpen((open) => !open)}
            aria-label="메뉴"
            aria-expanded={menuOpen}
            title="메뉴"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path
                d="M4 7h16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M4 12h16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
              <path
                d="M4 17h16"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
          {menuOpen && (
            <div
              className="nav-menu-pop"
              role="dialog"
              aria-label="바로가기 메뉴"
            >
              <AppLink
                className="nav-menu-item"
                href="/test"
                onNavigate={() => {
                  setMenuOpen(false);
                  onTypeTest();
                }}
              >
                유형 검사
              </AppLink>
              <AppLink
                className="nav-menu-item"
                href="/input"
                onNavigate={() => {
                  setMenuOpen(false);
                  onStart();
                }}
              >
                아이디어 분석
              </AppLink>
              <AppLink
                className="nav-menu-item"
                href="/dashboard"
                onNavigate={() => {
                  setMenuOpen(false);
                  onDashboard();
                }}
              >
                대시보드
              </AppLink>
              <AppLink
                className="nav-menu-item"
                href="/notes"
                onNavigate={() => {
                  setMenuOpen(false);
                  onNotes();
                }}
              >
                연습 노트<span className="nav-link-new">NEW</span>
              </AppLink>
              <AppLink
                className="nav-menu-item"
                href="/contest"
                onNavigate={() => {
                  setMenuOpen(false);
                  onOpenExplore();
                }}
              >
                공모전 탐색
              </AppLink>
            </div>
          )}
        </div>
        <div className="nav-bell" ref={bellBoxRef}>
        <button
          type="button"
          className={
            notifOpen ? "nav-icon-button notif-open" : "nav-icon-button"
          }
          onClick={toggleNotif}
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
        {notifOpen && (
          <div
            className="notif-panel"
            role="dialog"
            aria-modal="false"
            aria-label="마감 알림"
          >
            <div className="notif-panel-scroll">
            <div className="notif-head">
              <p className="notif-head-title">알림</p>
              <div className="notif-head-actions">
                {alerts.length > 0 && (
                  <>
                    <button
                      type="button"
                      className="notif-mark-all"
                      onClick={onMarkAllRead}
                    >
                      모두 읽음
                    </button>
                    <button
                      type="button"
                      className="notif-mark-all"
                      onClick={onMarkAllUnread}
                    >
                      모두 읽지 않음
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="notif-close"
                  onClick={() => setNotifOpen(false)}
                  aria-label="알림 닫기"
                >
                  ×
                </button>
              </div>
            </div>
            {alerts.length === 0 ? (
              <p className="notif-empty">
                응모·관심 공모전의 마감이 가까워지면 이곳에 알려 드려요.
              </p>
            ) : (
              <ul className="notif-list">
                {alerts.map((alert) => {
                  const isRead = readAlertKeys.has(alertDismissKey(alert));
                  return (
                    <li key={alert.id}>
                      <AppLink
                        className={
                          isRead
                            ? "notif-item notif-item-clickable notif-item-read"
                            : "notif-item notif-item-clickable"
                        }
                        href={`/contest/${alert.contestId}`}
                        ariaLabel={`${alert.title} 상세 보기`}
                        onNavigate={() => {
                          onDismissAlert(alert);
                          setNotifOpen(false);
                          onOpenContest(alert.contestId);
                        }}
                      >
                        <span className={`notif-tone tone-${alert.tone}`}>
                          {NOTIF_BADGE_TEXT[alert.tone]}
                        </span>
                        <div className="notif-text">
                          <p className="notif-item-title">{alert.title}</p>
                          <p className="notif-item-meta">
                            {alert.kindLabel} · 마감 {alert.deadline} · {alert.message}
                          </p>
                        </div>
                      </AppLink>
                    </li>
                  );
                })}
              </ul>
            )}
            <AppLink
              className="notif-goto-mypage"
              href="/mypage"
              onNavigate={() => {
                setNotifOpen(false);
                onGoMyPage();
              }}
            >
              마이페이지에서 전체 보기 →
            </AppLink>
            </div>
          </div>
        )}
        </div>
        <AppLink
          className={
            loggedIn ? "nav-icon-button logged-in" : "nav-icon-button"
          }
          href="/mypage"
          ariaLabel={
            notificationCount > 0
              ? `마이페이지, 확인할 알림 ${notificationCount}개`
              : "마이페이지"
          }
          title={
            notificationCount > 0
              ? `확인할 알림 ${notificationCount}개`
              : "마이페이지"
          }
          onNavigate={onGoMyPage}
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
        </AppLink>
      </div>
    </nav>
  );
}

export default TopNav;
