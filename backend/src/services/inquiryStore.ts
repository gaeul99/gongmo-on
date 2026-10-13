// ==========================================================
// 문의 접수 저장소
// DB가 없는 데모 프로젝트라 backend/src/data/ 아래 JSON 파일로 보관합니다.
// 이메일 발송(SMTP)이 실패하거나 로그 모드여도 접수 내역은 여기에 남습니다.
// ==========================================================

import fs from 'fs'
import path from 'path'

export type Inquiry = {
  id: string
  at: string
  // 답변을 받을 이메일 — 입력하지 않은 문의도 받는다(빈 문자열).
  email: string
  category: string
  content: string
}

const DATA_DIR = path.resolve(__dirname, '..', 'data')
const INQUIRIES_FILE = path.join(DATA_DIR, 'inquiries.json')
const MAX_INQUIRIES = 500

function ensureDataDir() {
  if (!fs.existsSync(DATA_DIR)) {
    fs.mkdirSync(DATA_DIR, { recursive: true })
  }
}

function readJson<T>(file: string, fallback: T): T {
  let raw: string
  try {
    raw = fs.readFileSync(file, 'utf-8')
  } catch {
    // 파일이 아직 없는 초기 상태뿐이다 — fallback이 정답.
    return fallback
  }
  try {
    return JSON.parse(raw) as T
  } catch (error) {
    if (raw.trim() === '') return fallback
    // 손상 파일을 빈 값으로 대신 읽으면 이후 저장이 전체를 덮어쓴다.
    // 원본을 보관하고 실패로 멈춘다(userStore.ts와 같은 정책).
    const quarantine = `${file}.corrupt-${Date.now()}`
    try {
      fs.copyFileSync(file, quarantine)
      console.error(
        `[inquiryStore] 데이터 파일 손상: ${file} — 원본을 ${quarantine}에 보관했습니다.`,
        error,
      )
    } catch {
      console.error(`[inquiryStore] 데이터 파일 손상: ${file} — 보관 실패, 원본은 그대로 있습니다.`, error)
    }
    throw new Error(`Corrupted data file: ${file}`)
  }
}

function writeJson(file: string, value: unknown) {
  ensureDataDir()
  // temp에 쓰고 rename으로 갈아끼운다 — 쓰다가 죽어도 기존 파일은 온전하다.
  const tmp = `${file}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), 'utf-8')
  fs.renameSync(tmp, file)
}

export function appendInquiry(input: Omit<Inquiry, 'id' | 'at'>): Inquiry {
  const inquiries = readJson<Inquiry[]>(INQUIRIES_FILE, [])
  const record: Inquiry = {
    ...input,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    at: new Date().toISOString(),
  }
  // 오래된 문의부터 잘라낸다 — 최근 500건이면 데모 용도로 충분하다.
  const next = [...inquiries, record].slice(-MAX_INQUIRIES)
  writeJson(INQUIRIES_FILE, next)
  return record
}
