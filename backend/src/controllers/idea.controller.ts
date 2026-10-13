// ==========================================================
// 아이디어 분석 요청 처리
// 입력 검증 → AI 서비스 호출 → 표준 응답 형식으로 포장합니다.
// ==========================================================
import type { Request, Response } from "express";
import {
  AiKeyExpiredError,
  AiNotConfiguredError,
  AiRequestTooLargeError,
  AiUpstreamError,
  analyzeIdea,
  isAiConfigured,
  type AnalyzeContest,
  type AnalyzeReferenceCase,
  type AnalyzeRequestBody,
} from "../services/ai.service";
import { sendError } from "../utils/apiValidation";

const MAX_TITLE_LENGTH = 100;
const MAX_DESCRIPTION_LENGTH = 2000;
const MAX_CATEGORY_LENGTH = 100;
// 후보 목록 상한 — 개수와 항목 문자열 길이를 묶어 토큰 비용 폭탄을 막는다.
const MAX_CANDIDATE_ITEMS = 60;
const MAX_CANDIDATE_TEXT = 200;

// 후보 목록은 클라이언트가 보내는 값이라 곧이곧대로 AI 프롬프트에 들어간다.
// 형식이 맞는 항목만 남기고(id는 정수), 문자 필드는 상한 안으로 잘라 보낸다.
function sanitizeCandidates<T extends { id: number }>(input: unknown): T[] {
  if (!Array.isArray(input)) return [];
  return input
    .filter(
      (item): item is T =>
        typeof item === "object" &&
        item !== null &&
        Number.isInteger((item as { id?: unknown }).id),
    )
    .slice(0, MAX_CANDIDATE_ITEMS)
    .map((item) => {
      const entry: Record<string, unknown> = {
        ...(item as Record<string, unknown>),
      };
      for (const key of Object.keys(entry)) {
        if (typeof entry[key] === "string") {
          entry[key] = (entry[key] as string)
            .trim()
            .slice(0, MAX_CANDIDATE_TEXT);
        }
      }
      return entry as T;
    });
}

export async function postIdeaAnalysis(
  req: Request,
  res: Response,
): Promise<void> {
  const body = req.body as Partial<AnalyzeRequestBody>;
  const idea = body?.idea;

  if (
    !idea ||
    typeof idea.title !== "string" ||
    idea.title.trim() === "" ||
    typeof idea.description !== "string" ||
    idea.description.trim() === ""
  ) {
    sendError(
      res,
      400,
      "INVALID_REQUEST",
      "아이디어 제목과 설명을 입력해 주세요.",
    );
    return;
  }
  if (
    idea.title.length > MAX_TITLE_LENGTH ||
    idea.description.length > MAX_DESCRIPTION_LENGTH
  ) {
    sendError(
      res,
      400,
      "INVALID_REQUEST",
      `제목은 ${MAX_TITLE_LENGTH}자, 설명은 ${MAX_DESCRIPTION_LENGTH}자 이내로 입력해 주세요.`,
    );
    return;
  }
  if (!Array.isArray(body.referenceCases) || !Array.isArray(body.contests)) {
    sendError(
      res,
      400,
      "INVALID_REQUEST",
      "분석 대상 사례·공모전 목록이 필요합니다.",
    );
    return;
  }
  if (
    typeof idea.category === "string" &&
    idea.category.length > MAX_CATEGORY_LENGTH
  ) {
    sendError(
      res,
      400,
      "INVALID_REQUEST",
      "관심 분야는 100자 이내로 입력해 주세요.",
    );
    return;
  }
  if (!isAiConfigured()) {
    sendError(
      res,
      503,
      "AI_NOT_CONFIGURED",
      "OpenAI API 키가 설정되지 않았어요. backend/.env에 키를 넣은 뒤 서버를 다시 시작해 주세요.",
    );
    return;
  }

  try {
    const data = await analyzeIdea({
      idea: {
        title: idea.title.trim(),
        description: idea.description.trim(),
        category: typeof idea.category === "string" ? idea.category.trim() : "",
      },
      referenceCases: sanitizeCandidates<AnalyzeReferenceCase>(
        body.referenceCases,
      ),
      contests: sanitizeCandidates<AnalyzeContest>(body.contests),
    });
    res.json({ success: true, data });
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      sendError(
        res,
        503,
        "AI_NOT_CONFIGURED",
        "OpenAI API 키가 설정되지 않았어요.",
      );
      return;
    }
    if (error instanceof AiRequestTooLargeError) {
      sendError(
        res,
        400,
        "AI_REQUEST_TOO_LARGE",
        "분석 요청이 너무 큽니다. 후보 수와 설명 길이를 줄인 뒤 다시 시도해 주세요.",
      );
      return;
    }
    if (error instanceof AiKeyExpiredError) {
      console.error(
        "[ai] AI 인증 토큰이 만료되었습니다. mlapi.run에서 토큰을 재발급해 backend/.env의 OPENAI_API_KEY를 교체한 뒤 서버를 재시작하세요.",
      );
      sendError(
        res,
        503,
        "AI_TOKEN_EXPIRED",
        "AI 인증 토큰이 만료되었어요. 토큰이 갱신되면 다시 분석할 수 있어요.",
      );
      return;
    }
    if (error instanceof AiUpstreamError) {
      console.error("[ai] 분석 실패:", error.message);
      sendError(
        res,
        502,
        "AI_UPSTREAM",
        "AI 분석 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.",
      );
      return;
    }
    console.error("[ai] 알 수 없는 오류:", error);
    sendError(res, 500, "INTERNAL", "서버 내부 오류가 발생했어요.");
  }
}
