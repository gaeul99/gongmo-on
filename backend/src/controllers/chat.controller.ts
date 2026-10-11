// ==========================================================
// 대시보드 챗봇 요청 처리
// 기본은 서버 .env의 키로 대화하고, x-chat-key 헤더로 사용자 키가
// 오면 그 키를 우선합니다. 키는 요청 처리에만 쓰고 로그에 남기지 않습니다.
// ==========================================================
import type { Request, Response } from 'express'
import {
  ChatKeyMissingError,
  ChatKeyRejectedError,
  ChatTimeoutError,
  ChatUpstreamError,
  hasServerChatKey,
  normalizeHistory,
  sendChatMessage,
} from '../services/chat.service'

function errorResponse(res: Response, status: number, code: string, message: string) {
  res.status(status).json({ success: false, error: { code, message } })
}

// 프론트가 키 입력 화면을 건너뛸지 판단할 때 쓰는 서버 키 보유 여부.
export function getChatConfig(_req: Request, res: Response): void {
  res.json({ success: true, data: { serverKey: hasServerChatKey() } })
}

export async function postChat(req: Request, res: Response): Promise<void> {
  // 헤더 키가 비어 있어도 서버 키로 폴백하므로 여기서 막지 않는다.
  // 정말 키가 없는 경우는 서비스가 ChatKeyMissingError로 알려 준다.
  const headerKey = req.header('x-chat-key')?.trim() ?? ''

  const body = req.body as { messages?: unknown; snapshot?: unknown } | undefined
  const history = normalizeHistory(body?.messages)
  const lastMessage = history[history.length - 1]
  if (history.length === 0 || lastMessage?.role !== 'user') {
    errorResponse(res, 400, 'INVALID_REQUEST', '보낼 메시지가 없어요.')
    return
  }

  const snapshot = body?.snapshot ?? {}
  // 스냅숏도 클라이언트가 보낸 값이라 비대한 JSON이 그대로 프롬프트에 들어갈 수 없게 상한을 둔다.
  if (JSON.stringify(snapshot ?? null).length > 100_000) {
    errorResponse(res, 400, 'INVALID_REQUEST', '대화 맥락 데이터가 너무 커요.')
    return
  }

  try {
    const data = await sendChatMessage(headerKey, history, snapshot)
    res.json({ success: true, data })
  } catch (error) {
    if (error instanceof ChatKeyMissingError) {
      errorResponse(res, 400, 'KEY_MISSING', error.message)
      return
    }
    if (error instanceof ChatKeyRejectedError) {
      errorResponse(res, 401, 'KEY_REJECTED', error.message)
      return
    }
    if (error instanceof ChatTimeoutError) {
      console.error('[chat] 응답 지연:', error.message)
      errorResponse(res, 504, 'CHAT_TIMEOUT', error.message)
      return
    }
    if (error instanceof ChatUpstreamError) {
      console.error('[chat] 업스트림 실패:', error.message)
      errorResponse(
        res,
        502,
        'CHAT_UPSTREAM',
        '모델 서버 응답에 문제가 있어요. 잠시 후 다시 시도해 주세요.',
      )
      return
    }
    console.error('[chat] 알 수 없는 오류:', error)
    errorResponse(res, 500, 'INTERNAL', '서버 내부 오류가 발생했어요.')
  }
}
