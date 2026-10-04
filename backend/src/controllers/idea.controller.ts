// ==========================================================
// 아이디어 분석 요청 처리
// 입력 검증 → AI 서비스 호출 → 표준 응답 형식으로 포장합니다.
// ==========================================================
import type { Request, Response } from 'express'
import {
  AiNotConfiguredError,
  AiUpstreamError,
  analyzeIdea,
  isAiConfigured,
  type AnalyzeRequestBody,
} from '../services/ai.service'

const MAX_TITLE_LENGTH = 100
const MAX_DESCRIPTION_LENGTH = 2000

function errorResponse(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ success: false, error: { code, message } })
}

export async function postIdeaAnalysis(req: Request, res: Response): Promise<void> {
  const body = req.body as Partial<AnalyzeRequestBody>
  const idea = body?.idea

  if (
    !idea ||
    typeof idea.title !== 'string' ||
    idea.title.trim() === '' ||
    typeof idea.description !== 'string' ||
    idea.description.trim() === ''
  ) {
    errorResponse(res, 400, 'INVALID_REQUEST', '아이디어 제목과 설명을 입력해 주세요.')
    return
  }
  if (idea.title.length > MAX_TITLE_LENGTH || idea.description.length > MAX_DESCRIPTION_LENGTH) {
    errorResponse(
      res,
      400,
      'INVALID_REQUEST',
      `제목은 ${MAX_TITLE_LENGTH}자, 설명은 ${MAX_DESCRIPTION_LENGTH}자 이내로 입력해 주세요.`,
    )
    return
  }
  if (!Array.isArray(body.referenceCases) || !Array.isArray(body.contests)) {
    errorResponse(res, 400, 'INVALID_REQUEST', '분석 대상 사례·공모전 목록이 필요합니다.')
    return
  }
  if (!isAiConfigured()) {
    errorResponse(
      res,
      503,
      'AI_NOT_CONFIGURED',
      'OpenAI API 키가 설정되지 않았어요. backend/.env에 키를 넣은 뒤 서버를 다시 시작해 주세요.',
    )
    return
  }

  try {
    const data = await analyzeIdea(body as AnalyzeRequestBody)
    res.json({ success: true, data })
  } catch (error) {
    if (error instanceof AiNotConfiguredError) {
      errorResponse(res, 503, 'AI_NOT_CONFIGURED', 'OpenAI API 키가 설정되지 않았어요.')
      return
    }
    if (error instanceof AiUpstreamError) {
      console.error('[ai] 분석 실패:', error.message)
      errorResponse(
        res,
        502,
        'AI_UPSTREAM',
        'AI 분석 중 문제가 발생했어요. 잠시 후 다시 시도해 주세요.',
      )
      return
    }
    console.error('[ai] 알 수 없는 오류:', error)
    errorResponse(res, 500, 'INTERNAL', '서버 내부 오류가 발생했어요.')
  }
}
