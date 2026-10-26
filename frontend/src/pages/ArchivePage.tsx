// ==========================================================
// 아이디어 보관함 페이지
// 마이페이지의 '보관함 열어보기'로만 연결되는 전용 화면이다(2026-10-26 사용자 요청).
// 원래 마이페이지에 있던 아이디어 목록·기록 폼이 이 화면으로 옮겨졌다.
// 저장된 아이디어를 다시 보거나(분석 결과 복원), 직접 기록·수정·삭제할 수 있다.
// 목록·폼 디자인은 MyPage.css의 공용 클래스를 그대로 재사용한다.
// ==========================================================
import { useState } from "react";
import type { FormEvent } from "react";
import AppLink from "../components/AppLink";
import CategorySelect from "../components/CategorySelect";
import type { SavedIdea } from "./MyPage";
import "./ArchivePage.css";

type Props = {
  savedIdeas: SavedIdea[];
  /** 다시 보기 — 저장된 분석 스냅숏과 함께 결과 화면을 연다. */
  onOpenIdea: (idea: SavedIdea) => void;
  onDeleteIdea: (id: string) => void;
  /** 직접 기록 — 같은 내용의 아이디어가 이미 있으면 false를 돌려줍니다. */
  onAddIdea: (target: Omit<SavedIdea, "id" | "savedAt">) => boolean;
  /** 보관함 아이디어 수정 — 같은 내용의 아이디어가 이미 있으면 false를 돌려줍니다. */
  onUpdateIdea: (
    id: string,
    patch: { title: string; description: string; category: string },
  ) => boolean;
  onBack: () => void;
  // 보관함이 비었을 때 아이디어 분석으로 보내는 안내 링크가 씁니다.
  onGoInput: () => void;
};

// 입력 화면과 같은 관심 분야 목록
const CATEGORIES = ["환경", "교육", "안전", "복지", "교통", "생활", "기타"];

function ArchivePage({
  savedIdeas,
  onOpenIdea,
  onDeleteIdea,
  onAddIdea,
  onUpdateIdea,
  onBack,
  onGoInput,
}: Props) {
  // 보관함에 아이디어를 직접 기록하는 폼 상태
  const [ideaTitle, setIdeaTitle] = useState("");
  const [ideaDescription, setIdeaDescription] = useState("");
  const [ideaCategory, setIdeaCategory] = useState("");
  const [ideaFormMessage, setIdeaFormMessage] = useState<string | null>(null);
  const [ideaFormOpen, setIdeaFormOpen] = useState(false);
  // 수정 중인 보관함 아이디어 — 폼이 '직접 기록하기' 대신 '아이디어 수정'으로 바뀝니다.
  const [editingIdeaId, setEditingIdeaId] = useState<string | null>(null);

  // 보관함 항목 '수정' — 기록 폼을 수정 모드로 전환하고 값을 채워 넣습니다.
  const startIdeaEdit = (idea: SavedIdea) => {
    setEditingIdeaId(idea.id);
    setIdeaTitle(idea.title);
    setIdeaDescription(idea.description);
    setIdeaCategory(idea.category);
    setIdeaFormMessage(null);
    setIdeaFormOpen(true);
    // 수정 대상 바로 위에서 폼을 보여 준다 — 목록이 길어도 폼이 보이게.
    document
      .getElementById("idea-record-form")
      ?.scrollIntoView({ behavior: "smooth", block: "center" });
  };

  // 수정 모드를 끝내고 폼을 비웁니다('기록하기'로 되돌아갑니다).
  const cancelIdeaEdit = () => {
    setEditingIdeaId(null);
    setIdeaTitle("");
    setIdeaDescription("");
    setIdeaCategory("");
    setIdeaFormMessage(null);
  };

  const handleIdeaSubmit = (event: FormEvent) => {
    event.preventDefault();
    const title = ideaTitle.trim();
    if (!title) {
      setIdeaFormMessage("제목을 입력해 주세요.");
      return;
    }
    if (editingIdeaId) {
      const updated = onUpdateIdea(editingIdeaId, {
        title,
        description: ideaDescription.trim(),
        category: ideaCategory,
      });
      if (updated) {
        cancelIdeaEdit();
        setIdeaFormMessage(
          "아이디어를 수정했어요. 저장된 분석 결과는 지워져서, 다시 보기 때 새로 분석해요.",
        );
      } else {
        setIdeaFormMessage(
          "제목·설명·분야가 같은 아이디어가 이미 보관함에 있어요.",
        );
      }
      return;
    }
    const added = onAddIdea({
      title,
      description: ideaDescription.trim(),
      category: ideaCategory,
    });
    if (added) {
      setIdeaTitle("");
      setIdeaDescription("");
      setIdeaCategory("");
      setIdeaFormMessage("보관함에 기록했어요.");
    } else {
      setIdeaFormMessage(
        "제목·설명·분야가 같은 아이디어가 이미 보관함에 있어요.",
      );
    }
  };

  return (
    <div className="archive-page">
      <div className="archive-inner">
        <button type="button" className="back-button" onClick={onBack}>
          ← 마이페이지로
        </button>

        <header className="archive-page-header" data-reveal>
          <h1>
            아이디어 보관함{" "}
            <span className="wishlist-count">{savedIdeas.length}건</span>
          </h1>
          <p className="wishlist-caption">
            분석 결과와 메모를 한곳에 모아 뒀어요. 다시 보면 저장된 분석 결과가
            그대로 열리고, 직접 기록한 아이디어도 수정할 수 있어요.
          </p>
        </header>

        <div className="archive-toolbar">
          <h2 id="archive-list-title">아이디어 목록</h2>
          <button
            type="button"
            className="idea-add-button"
            aria-expanded={ideaFormOpen}
            aria-controls="idea-record-form"
            aria-label={
              ideaFormOpen
                ? "아이디어 기록 폼 닫기"
                : "아이디어 직접 기록하기"
            }
            onClick={() => {
              // 폼을 닫으면 수정 모드도 함께 끝냅니다 — 다시 열면 기록 모드.
              if (ideaFormOpen) {
                setIdeaFormOpen(false);
                setEditingIdeaId(null);
              } else {
                setIdeaFormOpen(true);
              }
            }}
          >
            +
          </button>
        </div>

        <form
          className={ideaFormOpen ? "idea-form" : "idea-form idea-form-hidden"}
          id="idea-record-form"
          onSubmit={handleIdeaSubmit}
        >
          <p className="idea-form-title">
            {editingIdeaId ? "아이디어 수정" : "직접 기록하기"}
          </p>
          {editingIdeaId && (
            <p className="idea-form-hint">
              내용을 바꾸면 저장된 분석 결과는 지워져요. '다시 보기' 때 새로
              분석해요.
            </p>
          )}
          <input
            type="text"
            value={ideaTitle}
            onChange={(event) => {
              setIdeaTitle(event.target.value);
              setIdeaFormMessage(null);
            }}
            placeholder="아이디어 제목"
            aria-label="아이디어 제목"
            maxLength={60}
          />
          <textarea
            value={ideaDescription}
            onChange={(event) => {
              setIdeaDescription(event.target.value);
              setIdeaFormMessage(null);
            }}
            placeholder="어떤 아이디어인지 간단히 적어 보세요. (선택)"
            aria-label="아이디어 설명"
            rows={2}
            maxLength={500}
          />
          <div className="idea-form-row">
            <CategorySelect
              id="idea-form-category"
              options={CATEGORIES}
              value={ideaCategory}
              onChange={(value) => {
                setIdeaCategory(value);
                setIdeaFormMessage(null);
              }}
            />
            <button type="submit" className="idea-form-submit">
              {editingIdeaId ? "수정 완료" : "기록하기"}
            </button>
            {editingIdeaId && (
              <button
                type="button"
                className="idea-form-cancel"
                onClick={cancelIdeaEdit}
              >
                취소
              </button>
            )}
          </div>
          {ideaFormMessage && (
            <p className="idea-form-message" role="status">
              {ideaFormMessage}
            </p>
          )}
        </form>

        {savedIdeas.length === 0 ? (
          <div className="wishlist-empty" data-reveal>
            보관함이 비어 있어요. 분석 결과 화면의 '보관함에 저장'으로 옮기거나,
            위의 '아이디어 기록하기'로 첫 아이디어를 남겨 보세요.
            <AppLink
              className="empty-cta-button"
              href="/input"
              onNavigate={onGoInput}
            >
              아이디어 분석 시작하기 →
            </AppLink>
          </div>
        ) : (
          <ul className="my-contest-list" data-reveal>
            {savedIdeas.map((idea) => (
              <li
                key={idea.id}
                className={
                  editingIdeaId === idea.id
                    ? "my-contest-item my-contest-item--editing"
                    : "my-contest-item"
                }
              >
                <div className="my-contest-info">
                  <h3>{idea.title}</h3>
                  {idea.category && (
                    <p className="my-contest-meta">
                      관심 분야: {idea.category}
                    </p>
                  )}
                  <p className="my-contest-applied">{idea.savedAt} 저장</p>
                </div>
                <div className="my-contest-actions">
                  <button
                    type="button"
                    className="apply-from-wish-button"
                    onClick={() => onOpenIdea(idea)}
                  >
                    다시 보기
                  </button>
                  <button
                    type="button"
                    className="cancel-apply-button"
                    onClick={() => startIdeaEdit(idea)}
                  >
                    수정
                  </button>
                  <button
                    type="button"
                    className="cancel-apply-button"
                    onClick={() => {
                      if (
                        !window.confirm(
                          `'${idea.title}' 아이디어를 삭제할까요? 저장된 분석 결과도 함께 사라져요.`,
                        )
                      ) {
                        return;
                      }
                      onDeleteIdea(idea.id);
                    }}
                  >
                    삭제
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default ArchivePage;
