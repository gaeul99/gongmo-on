// ==========================================================
// 연습 노트 모델·변환 로직 — 워드 문서 화면(2026-10-29) 전용 서비스.
// 노트는 서식 도구로 자유롭게 편집한 '문서 하나(content HTML)'가 전부인
// v2 모델이다. 구버전(기획 의도·차별점·예상 질문 칸으로 나뉜 v1) 노트는
// 읽을 때 문서로 자동 변환해 내용을 보존한다. 서버 백업·내보내기는 이
// 배열을 통째로 옮기므로 여기서 바뀐 모양이 그대로 따라간다.
// ==========================================================

export const NOTES_STORAGE_KEY = 'gongmo-on:practice-notes'

export type PracticeQA = { q: string; a: string }

export type PracticeNote = {
  id: string
  title: string
  // 도구(굵게·제목·목록·색 등)로 서식을 입힌 문서 본문 HTML
  content: string
  // 'YYYY-MM-DD' 마지막 저장 날짜
  updatedAt: string
  version: 2
}

// 구버전(v1) 노트 — loadStoredNotes()가 읽을 때 문서로 바꾼다.
export type LegacyPracticeNote = {
  id: string
  title: string
  intent?: string
  diff?: string
  qa?: PracticeQA[]
  updatedAt: string
}

export function todayString(): string {
  return new Date().toISOString().slice(0, 10)
}

/** 사용자가 적은 텍스트를 HTML에 안전하게 붙일 수 있게 이스케이프한다. */
export function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/** 줄바꿈으로 나뉜 텍스트를 문단(<p>) HTML로 만든다. 빈 줄은 버린다. */
function textToParagraphs(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .map((line) => `<p>${escapeHtml(line)}</p>`)
    .join('')
}

// 새 노트가 시작하는 연습 템플릿 — 기획 의도 → 차별점 → 예상 심사 질문 순서.
// 괄호 안내 문장은 사용자가 지우고 쓰도록 문단으로만 넣는다(서식 클래스 없음).
export function buildTemplateContent(): string {
  return [
    '<h1>기획 의도</h1>',
    '<p>( 어떤 문제를, 누구를 위해 푸는지 — 이 줄을 지우고 적어 보세요 )</p>',
    '<h1>차별점</h1>',
    '<p>( 기존 방식·서비스와 다른 점 — 이 줄을 지우고 적어 보세요 )</p>',
    '<h1>예상 심사 질문</h1>',
    '<p>( 심사위원이 품을 의문을 질문으로 적고, 바로 아래에 답을 미리 준비합니다 )</p>',
    '<h2>Q. 수익 모델은 무엇인가요?</h2>',
    '<p><br></p>',
    '<h2>Q. 이미 있는 서비스와 뭐가 다른가요?</h2>',
    '<p><br></p>',
  ].join('')
}

// 분석 결과 화면의 '연습 노트 만들기' 초안(NotePrefill)을 문서로 만든다.
export type NotePrefillSeed = { title: string; intent: string; diff: string }

export function buildPrefillContent(seed: NotePrefillSeed): string {
  const intent = textToParagraphs(seed.intent) || '<p>( 어떤 문제를, 누구를 위해 푸는지 — 이 줄을 지우고 적어 보세요 )</p>'
  const diff = textToParagraphs(seed.diff) || '<p>( 기존 방식·서비스와 다른 점 — 이 줄을 지우고 적어 보세요 )</p>'
  return [
    '<h1>기획 의도</h1>',
    intent,
    '<h1>차별점</h1>',
    diff,
    '<h1>예상 심사 질문</h1>',
    '<p>( 심사위원이 품을 의문을 질문으로 적고, 바로 아래에 답을 미리 준비합니다 )</p>',
    '<h2>Q. 비용은 어떻게 충당하나요?</h2>',
    '<p><br></p>',
  ].join('')
}

// 문서 HTML을 들여오기·불러오기 전에 가볍게 다듬는다. 완전한 정화는 아니지만
// 가져온 파일에 섞여 실행될 수 있는 스크립트·이벤트 속성·javascript: 주소를
// 걷어 내 2차 피해를 막는다(1차 방어는 내보내기 파일을 내가 만든다는 점).
export function sanitizeNoteHtml(html: string): string {
  return html
    .replace(/<\s*(script|iframe|object|embed|style|link|meta)\b[\s\S]*?(<\/\s*\1\s*>|$)/gi, '')
    .replace(/\son\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/\shref\s*=\s*(["'])\s*javascript:[^"']*\1/gi, '')
}

// 구버전 노트 한 개를 문서 HTML로 변환한다. 이미 v2면 그대로 둔다.
function migrateOne(raw: Record<string, unknown>): { note: PracticeNote; changed: boolean } | null {
  const id = raw.id === undefined || raw.id === null ? '' : String(raw.id)
  const title = typeof raw.title === 'string' ? raw.title : ''
  if (!id && !title) return null
  const updatedAt = typeof raw.updatedAt === 'string' ? raw.updatedAt : todayString()

  if (typeof raw.content === 'string') {
    const content = sanitizeNoteHtml(raw.content)
    const changed = content !== raw.content
    return { note: { id, title, content, updatedAt, version: 2 }, changed }
  }

  const intent = typeof raw.intent === 'string' ? raw.intent : ''
  const diff = typeof raw.diff === 'string' ? raw.diff : ''
  const qa = Array.isArray(raw.qa) ? (raw.qa as PracticeQA[]) : []
  const parts: string[] = []
  if (intent.trim() !== '') parts.push('<h1>기획 의도</h1>', textToParagraphs(intent))
  if (diff.trim() !== '') parts.push('<h1>차별점</h1>', textToParagraphs(diff))
  const filledQA = qa.filter(
    (pair) => pair && (String(pair.q ?? '').trim() !== '' || String(pair.a ?? '').trim() !== ''),
  )
  if (filledQA.length > 0) {
    parts.push('<h1>예상 심사 질문</h1>')
    filledQA.forEach((pair, index) => {
      const q = String(pair.q ?? '').trim()
      const a = String(pair.a ?? '').trim()
      if (q !== '') parts.push(`<h2>Q${index + 1}. ${escapeHtml(q)}</h2>`)
      parts.push(a !== '' ? `<p>${escapeHtml(a)}</p>` : '<p><br></p>')
    })
  }
  const content = parts.join('') || '<p><br></p>'
  return { note: { id, title, content, updatedAt, version: 2 }, changed: true }
}

export function migrateNotes(list: unknown[]): { notes: PracticeNote[]; changed: boolean } {
  const notes: PracticeNote[] = []
  let changed = false
  for (const item of list) {
    if (item === null || typeof item !== 'object') {
      changed = true
      continue
    }
    const result = migrateOne(item as Record<string, unknown>)
    if (result === null) {
      changed = true
      continue
    }
    if (result.changed) changed = true
    notes.push(result.note)
  }
  return { notes, changed }
}

/** localStorage에서 노트를 읽어 온다. 구버전 노트가 있으면 문서로 바꾼 사실을 changed로 알린다. */
export function loadStoredNotes(): { notes: PracticeNote[]; changed: boolean } {
  try {
    const raw = localStorage.getItem(NOTES_STORAGE_KEY)
    if (!raw) return { notes: [], changed: false }
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return { notes: [], changed: false }
    return migrateNotes(parsed)
  } catch {
    return { notes: [], changed: false }
  }
}

export function loadNotes(): PracticeNote[] {
  return loadStoredNotes().notes
}

export function saveNotes(notes: PracticeNote[]) {
  try {
    localStorage.setItem(NOTES_STORAGE_KEY, JSON.stringify(notes))
  } catch {
    // 저장에 실패해도 이 세션 안에서는 화면 상태를 유지한다.
  }
}

/** 문서 HTML을 줄 단위 일반 텍스트로 바꾼다 — 재매칭(아이디어 설명)·분량 계산에 쓴다. */
export function notePlainText(html: string): string {
  const decoded = html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|h1|h2|h3|h4|blockquote|li|div|tr)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
  return decoded
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line !== '')
    .join('\n\n')
}

/** 목록 카드·상태 표시줄에 보여 줄 분량 — 글자 수(공백 제외)와 어절 수. */
export function noteCounts(html: string): { chars: number; words: number } {
  const text = notePlainText(html)
  return {
    chars: text.replace(/\s/g, '').length,
    words: text.trim() === '' ? 0 : text.trim().split(/\s+/).length,
  }
}

// 워드(Word) 프로그램이 열 수 있는 HTML 문서 조립 — A4 페이지 설정을 포함한다.
// 실제 .docx가 아니라 Word가 호환 모드로 여는 HTML .doc 방식이다.
export function buildWordDocHtml(title: string, content: string): string {
  const safeTitle = escapeHtml(title)
  return [
    '<!DOCTYPE html>',
    '<html xmlns:o="urn:schemas-microsoft-com:office:office"',
    ' xmlns:w="urn:schemas-microsoft-com:office:word"',
    ' xmlns="http://www.w3.org/TR/REC-html40">',
    '<head>',
    '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">',
    `<title>${safeTitle}</title>`,
    '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom></w:WordDocument></xml><![endif]-->',
    '<style>',
    '@page WordSection1 { size: 595.3pt 841.9pt; margin: 56.7pt 56.7pt 56.7pt 56.7pt; }',
    'div.WordSection1 { page: WordSection1; }',
    "body { font-family: 'Malgun Gothic', '맑은 고딕', sans-serif; font-size: 11pt; line-height: 1.8; color: #333333; }",
    'h1 { font-size: 17pt; margin: 18pt 0 8pt; }',
    'h2 { font-size: 14pt; margin: 14pt 0 6pt; }',
    'h3 { font-size: 12pt; margin: 12pt 0 6pt; }',
    'p { margin: 0 0 8pt; }',
    'blockquote { margin: 6pt 0 6pt 8pt; padding-left: 10pt; border-left: 3pt solid #999999; color: #555555; }',
    'a { color: #2563eb; }',
    '</style>',
    '</head>',
    `<body><div class="WordSection1"><h1 style="font-size:20pt;margin:0 0 14pt;">${safeTitle}</h1>${content}</div></body>`,
    '</html>',
  ].join('\n')
}

function noteFileName(title: string): string {
  const cleaned = title.replace(/[\\/:*?"<>|]/g, '_').trim()
  return (cleaned || '연습 노트').slice(0, 80)
}

/** 문서를 워드에서 열 수 있는 .doc 파일로 내려받는다. */
export function downloadNoteAsWord(note: { title: string; content: string }) {
  const html = buildWordDocHtml(note.title.trim() || '연습 노트', note.content)
  const blob = new Blob(['\ufeff', html], { type: 'application/msword;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${noteFileName(note.title)}.doc`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}
