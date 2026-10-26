import { useState } from "react";
import type { FormEvent } from "react";
import AppLink from "../components/AppLink";
import GrowthTimeline from "../components/GrowthTimeline";
import MyContestCalendar from "../components/MyContestCalendar";
import ToggleSwitch from "../components/ToggleSwitch";
import { downloadUserData, mergeImportedData } from "../utils/dataPortability.js";
import { STORAGE_KEYS } from "../utils/storageKeys.js";
import type { Analysis } from "../types/analysis";
import "./MyPage.css";

// 로그인 계정은 서버(backend)에 저장되고, localStorage는 1차 캐시다.
// email은 공모전 마감 알림(이메일) 발송에 사용됩니다.
export type User = {
  nickname: string;
  joinedAt: string;
  email?: string;
  phone?: string;
};

// 결과 화면에서 응모한 공모전의 스냅숏. 공모전 데이터가 갱신돼도 목록이 유지됩니다.
// result는 도전 히스토리용 응모 결과(진행 중·수상·탈락) — 기록 전에는 'progress'로 봅니다.
export type AppliedContest = {
  id: number;
  title: string;
  organizer: string;
  deadline: string;
  url: string;
  appliedAt: string;
  result?: "progress" | "won" | "lost";
  resultAt?: string;
};

// 나중에 응모할 공모전을 모아 두는 관심 목록 스냅숏. 응모와 달리 로그인 없이도 저장됩니다.
export type WishlistContest = {
  id: number;
  title: string;
  organizer: string;
  deadline: string;
  url: string;
  addedAt: string;
};

// 보관함에 저장한 아이디어. 분석 결과 화면에서 다시 열 수 있습니다.
// analysis에는 저장 시점의 분석 결과 스냅숏이 함께 담겨 '다시 보기'로 복원됩니다.
export type SavedIdea = {
  id: string;
  title: string;
  description: string;
  category: string;
  savedAt: string;
  analysis?: Analysis | null;
};

// utils/contestAlerts.js가 만드는 마감 알림 한 건.
export type ContestAlert = {
  id: string;
  // 클릭 시 공모전 상세 화면으로 이동할 때 씁니다.
  contestId: number;
  title: string;
  kindLabel: string;
  deadline: string;
  left: number;
  tone: "today" | "urgent" | "upcoming" | "closed";
  message: string;
};

export type AuthResult =
  | { ok: true; user: User }
  | { ok: false; error: string };

type Props = {
  user: User | null;
  myContests: AppliedContest[];
  wishlist: WishlistContest[];
  savedIdeas: SavedIdea[];
  onLogin: (nickname: string, password: string) => Promise<AuthResult>;
  onSignup: (
    nickname: string,
    password: string,
    email: string,
    phone: string,
  ) => Promise<AuthResult>;
  /** 회원정보(아이디·이메일·휴대폰) 수정 — 성공 시 바뀐 user를 돌려줍니다. */
  onUpdateProfile: (payload: {
    currentPassword: string;
    nickname: string;
    email: string;
    phone: string;
  }) => Promise<AuthResult>;
  onLogout: () => void;
  notifOptIn: boolean;
  onToggleNotifOptIn: (next: boolean) => void;
  onCancelApply: (id: number) => void;
  /** 응모 결과(진행 중·수상·탈락)를 기록 — 대시보드 도전 히스토리의 재료가 됩니다. */
  onContestResult: (id: number, result: "progress" | "won" | "lost") => void;
  /** 내보내기 파일에서 가져온 목록을 앱 상태·저장소에 반영합니다. */
  onImportLists: (
    myContests: AppliedContest[],
    wishlist: WishlistContest[],
    savedIdeas: SavedIdea[],
  ) => void;
  onBack: () => void;
  onGoInput: () => void;
  // 공모전 탐색 화면으로 보내는 콜백 — 관심 목록 빈 상태에서 씁니다.
  onGoExplore: () => void;
  // 찜한 공모전 전용 화면으로 보내는 콜백 — 관심 공모전 안내에서 씁니다.
  // 찜한 목록은 이 전용 화면에서 한 번에 본다(2026-10-26 사용자 요청).
  // 대시보드의 onGoWishlist(마이페이지 섹션 이동)와는 다릅니다.
  onGoWishlistPage: () => void;
  // 아이디어 보관함 전용 화면으로 보내는 콜백 — 보관함 안내에서 씁니다.
  // 아이디어 목록·기록 폼은 마이페이지에서 없애고 전용 화면에서 본다(2026-10-26 사용자 요청).
  onGoArchivePage: () => void;
};

// 응모 결과 옵션 — 마이페이지 배지와 대시보드 도전 히스토리가 같은 값을 씁니다.
const RESULT_OPTIONS: Array<{
  value: "progress" | "won" | "lost";
  label: string;
}> = [
  { value: "progress", label: "진행 중" },
  { value: "won", label: "수상" },
  { value: "lost", label: "탈락" },
];

function validateNicknameForForm(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return "아이디를 입력해 주세요.";
  if (trimmed.length > 20) return "아이디는 20자 이내로 입력해 주세요.";

  for (const char of trimmed) {
    const code = char.charCodeAt(0);
    if (code < 32 || code === 127) {
      return "아이디에 제어 문자는 사용할 수 없어요.";
    }
  }

  return null;
}

function MyPage({
  user,
  myContests,
  wishlist,
  savedIdeas,
  onLogin,
  onSignup,
  onUpdateProfile,
  onLogout,
  notifOptIn,
  onToggleNotifOptIn,
  onCancelApply,
  onContestResult,
  onImportLists,
  onBack,
  onGoInput,
  onGoExplore,
  onGoWishlistPage,
  onGoArchivePage,
}: Props) {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [nickname, setNickname] = useState("");
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  // 회원정보 수정 폼 — 로그인 사용자 정보로 채우고, 이름이 바뀌면 다시 동기화합니다.
  const [profileNickname, setProfileNickname] = useState("");
  const [profileEmail, setProfileEmail] = useState("");
  const [profilePhone, setProfilePhone] = useState("");
  const [profilePassword, setProfilePassword] = useState("");
  const [profileStatus, setProfileStatus] = useState<{
    tone: "ok" | "error";
    text: string;
  } | null>(null);
  const [profilePending, setProfilePending] = useState(false);
  // 회원정보 수정 폼은 클릭해 열었을 때만 보입니다.
  const [profileEditOpen, setProfileEditOpen] = useState(false);

  // 폼을 열 때 로그인 사용자 정보로 채운다. 저장에 성공하면 아래에서 돌아온
  // 최신 user로 다시 채워 폼과 계정 정보를 맞춥니다.
  const toggleProfileEdit = () => {
    if (!profileEditOpen) {
      setProfileNickname(user?.nickname ?? "");
      setProfileEmail(user?.email ?? "");
      setProfilePhone(user?.phone ?? "");
      setProfilePassword("");
      setProfileStatus(null);
    }
    setProfileEditOpen((open) => !open);
  };

  // 회원정보 저장 — 성공하면 App이 user를 갱신해 대시보드 이름이 바로 바뀝니다.
  const handleProfileSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (profilePending) return;
    setProfilePending(true);
    setProfileStatus(null);
    const result = await onUpdateProfile({
      currentPassword: profilePassword,
      nickname: profileNickname.trim(),
      email: profileEmail.trim(),
      phone: profilePhone.trim(),
    });
    setProfilePending(false);
    if (result.ok) {
      if (result.user) {
        setProfileNickname(result.user.nickname);
        setProfileEmail(result.user.email ?? "");
        setProfilePhone(result.user.phone ?? "");
      }
      setProfilePassword("");
      setProfileStatus({
        tone: "ok",
        text: "회원정보를 저장했어요. 대시보드에도 새 이름이 바로 반영돼요.",
      });
    } else {
      setProfileStatus({ tone: "error", text: result.error });
    }
  };

  // 데이터 내보내기·가져오기 — 이 브라우저에만 저장되는 데이터를 파일로 옮깁니다.
  const [dataMessage, setDataMessage] = useState<string | null>(null);

  const handleExportData = () => {
    downloadUserData();
    setDataMessage("내보내기 파일(JSON)을 다운로드했어요.");
  };

  const handleImportFile = async (file: File) => {
    try {
      const parsed = JSON.parse(await file.text());
      const merged = mergeImportedData(parsed);
      if (!merged) {
        setDataMessage(
          "공모온 내보내기 파일이 아니에요. 다른 파일을 선택해 주세요.",
        );
        return;
      }
      try {
        if (merged.typeTest !== null) {
          localStorage.setItem(
            STORAGE_KEYS.typeTest,
            JSON.stringify(merged.typeTest),
          );
        }
        localStorage.setItem(
          "gongmo-on:submission-checklist",
          JSON.stringify(merged.checklist),
        );
      } catch {
        // 저장 실패 시에도 가져온 목록은 반영을 계속 진행합니다.
      }
      onImportLists(merged.myContests, merged.wishlist, merged.savedIdeas);
      setDataMessage("데이터를 가져왔어요. 기존 목록에 합쳐졌어요.");
    } catch {
      setDataMessage(
        "파일을 읽지 못했어요. 내보낸 JSON 파일인지 확인해 주세요.",
      );
    }
  };

  const switchMode = () => {
    setMode(mode === "login" ? "signup" : "login");
    setError(null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (pending) return;

    const trimmed = nickname.trim();
    const nicknameError = validateNicknameForForm(trimmed);
    if (nicknameError) {
      setError(nicknameError);
      return;
    }
    if (!password) {
      setError("비밀번호를 입력해 주세요.");
      return;
    }
    if (mode === "signup" && password.length < 8) {
      setError("비밀번호는 8자 이상이어야 해요.");
      return;
    }
    if (mode === "signup" && password !== passwordConfirm) {
      setError("비밀번호가 서로 일치하지 않아요.");
      return;
    }
    if (mode === "signup" && !email.trim()) {
      setError("알림을 받을 이메일 주소를 입력해 주세요.");
      return;
    }
    if (mode === "signup" && !/^\S+@\S+\.\S+$/.test(email.trim())) {
      setError("이메일 형식을 확인해 주세요. (예: name@example.com)");
      return;
    }

    setPending(true);
    setError(null);
    const result =
      mode === "login"
        ? await onLogin(trimmed, password)
        : await onSignup(trimmed, password, email.trim(), phone.trim());
    setPending(false);

    if (!result.ok) {
      setError(result.error);
      return;
    }
    setPassword("");
    setPasswordConfirm("");
    setEmail("");
    setPhone("");
  };

  return (
    <div className="page mypage-page">
      <div className="mypage-inner">
        <button type="button" className="back-button" onClick={onBack}>
          ← 홈으로
        </button>

        <header className="mypage-header" data-reveal>
          <p className="mypage-badge">마이페이지</p>
          <h1>내 공모전</h1>
        </header>

        {user ? (
          <>
            <div className="profile-card">
              <span className="profile-avatar" aria-hidden="true">
                {user.nickname.slice(0, 1)}
              </span>
              <div className="profile-text">
                <p className="profile-name">{user.nickname}님, 안녕하세요!</p>
                <p className="profile-since">
                  {user.joinedAt.slice(0, 10)}부터 함께하는 중
                </p>
              </div>
              <div className="profile-actions">
                <button
                  type="button"
                  className="profile-edit-button"
                  aria-expanded={profileEditOpen}
                  onClick={toggleProfileEdit}
                >
                  {profileEditOpen ? "수정 닫기" : "회원정보 수정"}
                </button>
                <button
                  type="button"
                  className="logout-button"
                  onClick={onLogout}
                >
                  로그아웃
                </button>
              </div>
            </div>

            {profileEditOpen && (
              <section
                className="profile-edit"
                aria-labelledby="profile-edit-title"
                data-reveal
              >
                <h2 id="profile-edit-title">회원정보 수정</h2>
                <p className="profile-edit-hint">
                  아이디(표시 이름)를 바꾸면 대시보드에도 새 이름이 나와요.
                  저장하려면 현재 비밀번호 확인이 필요합니다.
                </p>
                <form
                  className="profile-edit-form"
                  onSubmit={handleProfileSubmit}
                >
                  <div className="profile-edit-grid">
                    <label>
                      아이디(표시 이름)
                      <input
                        value={profileNickname}
                        onChange={(event) =>
                          setProfileNickname(event.target.value)
                        }
                        maxLength={20}
                        required
                      />
                    </label>
                    <label>
                      이메일
                      <input
                        type="email"
                        value={profileEmail}
                        onChange={(event) =>
                          setProfileEmail(event.target.value)
                        }
                        maxLength={60}
                        required
                      />
                    </label>
                    <label>
                      휴대폰(선택)
                      <input
                        value={profilePhone}
                        onChange={(event) =>
                          setProfilePhone(event.target.value)
                        }
                        placeholder="숫자만 입력"
                        maxLength={13}
                      />
                    </label>
                    <label>
                      현재 비밀번호
                      <input
                        type="password"
                        value={profilePassword}
                        onChange={(event) =>
                          setProfilePassword(event.target.value)
                        }
                        required
                      />
                    </label>
                  </div>
                  <div className="profile-edit-actions">
                    <button
                      type="submit"
                      className="profile-save-button"
                      disabled={profilePending}
                    >
                      {profilePending ? "저장 중…" : "저장하기"}
                    </button>
                    {profileStatus && (
                      <p
                        className={`profile-edit-status tone-${profileStatus.tone}`}
                        role="status"
                      >
                        {profileStatus.text}
                      </p>
                    )}
                  </div>
                </form>
              </section>
            )}

            <section aria-labelledby="my-contest-title" data-reveal>
              <h2 id="my-contest-title">
                내가 응모한 공모전{" "}
                <span className="contest-count">{myContests.length}개</span>
              </h2>
              {myContests.length === 0 ? (
                <div className="empty-state">
                  <p>
                    아직 응모한 공모전이 없어요.
                    <br />
                    분석 결과에서 마음에 드는 공모전을 응모하면 이곳에 모입니다.
                  </p>
                  <AppLink
                    className="empty-button"
                    href="/input"
                    onNavigate={onGoInput}
                  >
                    아이디어 분석 시작하기
                  </AppLink>
                </div>
              ) : (
                <ul className="my-contest-list">
                  {myContests.map((contest) => {
                    return (
                      <li key={contest.id} className="my-contest-item">
                        <div className="my-contest-info">
                          <h3>{contest.title}</h3>
                          <p className="my-contest-meta">
                            {contest.organizer} · 마감 {contest.deadline}
                          </p>
                          <p className="my-contest-applied">
                            {contest.appliedAt} 응모
                          </p>
                          <div
                            className="result-group"
                            role="group"
                            aria-label={`${contest.title} 응모 결과 기록`}
                          >
                            {RESULT_OPTIONS.map((option) => {
                              const active =
                                (contest.result ?? "progress") === option.value;
                              return (
                                <button
                                  key={option.value}
                                  type="button"
                                  className={`result-chip tone-${option.value}${active ? " is-active" : ""}`}
                                  aria-pressed={active}
                                  onClick={() =>
                                    onContestResult(contest.id, option.value)
                                  }
                                >
                                  {option.label}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                        <div className="my-contest-actions">
                          <a
                            href={contest.url}
                            target="_blank"
                            rel="noreferrer"
                          >
                            공모전 페이지 ↗
                          </a>
                          <button
                            type="button"
                            className="cancel-apply-button"
                            onClick={() => {
                              const title = contest.title ?? "이 공모전";
                              if (
                                !window.confirm(
                                  `'${title}' 응모 기록을 취소할까요? 달력·도전 히스토리에서도 사라져요.`,
                                )
                              ) {
                                return;
                              }
                              onCancelApply(contest.id);
                            }}
                          >
                            응모 취소
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        ) : (
          <form className="login-card" onSubmit={handleSubmit}>
            {mode === "login" ? (
              <>
                <p className="login-title">로그인</p>
                <p className="login-desc">
                  로그인하면 응모 기록과 내 목록이 저장돼요.
                </p>
              </>
            ) : (
              <>
                <p className="login-title">회원가입</p>
                <p className="login-desc">
                  아이디·비밀번호로 가입하고 이메일로 마감 알림을 받아 보세요.
                </p>
              </>
            )}
            <input
              type="text"
              value={nickname}
              onChange={(event) => setNickname(event.target.value)}
              placeholder="아이디"
              aria-label="아이디"
              maxLength={20}
            />
            <p className="login-note">아이디는 1~20자 이내로 입력해 주세요.</p>
            <input
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              placeholder={
                mode === "signup" ? "비밀번호 (8자 이상)" : "비밀번호"
              }
              aria-label="비밀번호"
              maxLength={40}
            />
            {mode === "signup" && (
              <>
                <input
                  type="password"
                  value={passwordConfirm}
                  onChange={(event) => setPasswordConfirm(event.target.value)}
                  placeholder="비밀번호 확인"
                  aria-label="비밀번호 확인"
                  maxLength={40}
                />
                <input
                  type="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  placeholder="이메일 (마감 알림 수신용)"
                  aria-label="이메일"
                  maxLength={60}
                />
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="휴대폰 번호 (선택)"
                  aria-label="휴대폰 번호"
                  maxLength={20}
                />
              </>
            )}
            {error && (
              <p className="auth-error" role="alert">
                {error}
              </p>
            )}
            <button type="submit" className="login-button" disabled={pending}>
              {pending
                ? "처리 중..."
                : mode === "login"
                  ? "로그인"
                  : "가입하고 시작하기"}
            </button>
            <button
              type="button"
              className="switch-mode-button"
              onClick={switchMode}
            >
              {mode === "login"
                ? "처음이신가요? 회원가입하기"
                : "이미 계정이 있나요? 로그인"}
            </button>
            <p className="login-note">
              계정과 내역은 서버에 저장돼요. 브라우저를 정리해도 로그인하면
              그대로 돌아와요.
            </p>
          </form>
        )}

        <GrowthTimeline myContests={myContests} savedIdeas={savedIdeas} />

        <section
          className="alert-section"
          aria-labelledby="alert-title"
          data-reveal
        >
          <h2 id="alert-title">공모전 알림</h2>
          {/* 마감 알림 목록은 2026-10-15 사용자 요청으로 빼고 이메일 수신 토글만
              남겼다 — 알림은 상단바 종 모양 메뉴에서 확인한다 */}
          {user && (
            <div className="notif-setting">
              <div className="notif-toggle-row">
                <ToggleSwitch
                  id="notif-email-opt-in"
                  checked={notifOptIn}
                  onChange={onToggleNotifOptIn}
                />
                <label
                  className="notif-toggle-label"
                  htmlFor="notif-email-opt-in"
                >
                  이메일로도 마감 알림 받기
                </label>
              </div>
              <p className="notif-hint">
                {user.email
                  ? "마감 7일 전·3일 전·당일에 이메일로 알려 드려요."
                  : "마감 알림을 받으려면 회원가입 때 이메일을 입력해 주세요."}
              </p>
            </div>
          )}
        </section>

        <MyContestCalendar myContests={myContests} wishlist={wishlist} />

        {/* 관심 공모전·아이디어 보관함 안내 — 같은 사이즈 박스를 나란히 배치한다
            (2026-10-26 사용자 요청). 두 목록 모두 전용 화면(/wishlist, /archive)에서
            본다 — 마이페이지에는 목록을 두지 않는다. */}
        <div className="mypage-duo" data-reveal>
          <section className="mypage-duo-box" aria-labelledby="wishlist-title">
            <h2 id="wishlist-title">
              관심 공모전{" "}
              <span className="contest-count">{wishlist.length}개</span>
            </h2>
            <div className="wishlist-empty wishlist-teaser">
              {wishlist.length === 0
                ? "아직 관심 공모전이 없어요. 분석 결과나 탐색 화면에서 '☆'를 눌러 저장해 보세요."
                : "찜한 공모전은 전용 화면에서 한 번에 볼 수 있어요. 화면에서 관심을 해제하거나 응모를 기록할 수 있어요."}
              {wishlist.length === 0 ? (
                <AppLink
                  className="empty-cta-button"
                  href="/contest"
                  onNavigate={onGoExplore}
                >
                  공모전 둘러보기 →
                </AppLink>
              ) : (
                <AppLink
                  className="empty-cta-button"
                  href="/wishlist"
                  onNavigate={onGoWishlistPage}
                >
                  찜한 공모전 보기 →
                </AppLink>
              )}
            </div>
          </section>
          <section
            className="mypage-duo-box"
            aria-labelledby="archive-teaser-title"
          >
            <h2 id="archive-teaser-title">
              아이디어 보관함{" "}
              <span className="contest-count">{savedIdeas.length}개</span>
            </h2>
            <div className="wishlist-empty wishlist-teaser">
              {savedIdeas.length === 0
                ? "저장된 아이디어가 없어요. 분석 결과 화면의 '보관함에 저장'으로 옮기거나 직접 기록해 보세요."
                : "분석 결과와 메모를 보관함에 모아 두었어요. 전용 화면에서 다시 보거나 수정할 수 있어요."}
              <AppLink
                className="empty-cta-button"
                href="/archive"
                onNavigate={onGoArchivePage}
              >
                보관함 열어보기 →
              </AppLink>
            </div>
          </section>
        </div>

        <section
          aria-labelledby="data-title"
          className="data-section"
          data-reveal
        >
          <h2 id="data-title">데이터 관리</h2>
          <p className="data-caption">
            {user
              ? "내 응모·관심·보관함 데이터는 계정에 연결되어 서버에도 백업돼요. 다른 브라우저나 기기에서 로그인하면 그대로 돌아와요. 계정 정보는 보안상 내보내기에 포함되지 않아요."
              : "내 응모·관심·보관함 데이터는 이 브라우저에만 저장돼요. 파일로 내보내 다른 브라우저나 기기에서 가져올 수 있어요. 계정 정보는 보안상 내보내기에 포함되지 않아요."}
          </p>
          <div className="data-actions">
            <button
              type="button"
              className="data-export-button"
              onClick={handleExportData}
            >
              데이터 내보내기 (JSON)
            </button>
            <label className="data-import-label">
              데이터 가져오기
              <input
                type="file"
                accept="application/json,.json"
                className="data-import-input"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleImportFile(file);
                  event.target.value = "";
                }}
              />
            </label>
          </div>
          {dataMessage && (
            <p className="idea-form-message" role="status">
              {dataMessage}
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

export default MyPage;
