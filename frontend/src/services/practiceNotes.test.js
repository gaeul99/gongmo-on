// ==========================================================
// practiceNotes 서비스 테스트 — Vitest
// 구버전(v1) 노트의 문서 변환, 새 노트 템플릿, 일반 텍스트 추출,
// 워드 문서 조립, HTML 소독을 확인합니다.
// ==========================================================
import { afterEach, describe, expect, it } from 'vitest'
import {
  buildPrefillContent,
  buildTemplateContent,
  buildWordDocHtml,
  escapeHtml,
  loadStoredNotes,
  migrateNotes,
  noteCounts,
  notePlainText,
  sanitizeNoteHtml,
  saveNotes,
} from './practiceNotes'

// 테스트 환경(node)에는 localStorage가 없다 — 메모리 저장소로 대체한다.
const memoryStore = new Map()
globalThis.localStorage = {
  getItem: (key) => (memoryStore.has(key) ? memoryStore.get(key) : null),
  setItem: (key, value) => {
    memoryStore.set(key, String(value))
  },
  removeItem: (key) => {
    memoryStore.delete(key)
  },
}

const STORAGE_KEY = 'gongmo-on:practice-notes'

afterEach(() => {
  localStorage.removeItem(STORAGE_KEY)
})

const LEGACY_NOTE = {
  id: '1',
  title: '복습 도우미',
  intent: '대학생은 필기를 하지만\n다시 꺼내 보지 않아 학습이 끊깁니다.',
  diff: '요약 앱은 직접 만들어야 합니다. 우리는 자동 생성됩니다.',
  qa: [
    { q: '수익 모델은 무엇인가요?', a: '구독제입니다.' },
    { q: '', a: '' },
    { q: '팀이 감당 가능한가요?', a: '' },
  ],
  updatedAt: '2026-10-01',
}

describe('migrateNotes — 구버전 노트를 문서로 바꾼다', () => {
  it('기획 의도·차별점·예상 질문이 순서대로 문단이 된다', () => {
    const { notes, changed } = migrateNotes([LEGACY_NOTE])
    expect(changed).toBe(true)
    expect(notes).toHaveLength(1)
    const note = notes[0]
    expect(note.id).toBe('1')
    expect(note.title).toBe('복습 도우미')
    expect(note.updatedAt).toBe('2026-10-01')
    expect(note.version).toBe(2)
    expect(note.content).toContain('<h1>기획 의도</h1>')
    expect(note.content).toContain('<p>대학생은 필기를 하지만</p>')
    expect(note.content).toContain('<h1>차별점</h1>')
    expect(note.content).toContain('<h1>예상 심사 질문</h1>')
    expect(note.content).toContain('<h2>Q1. 수익 모델은 무엇인가요?</h2>')
    expect(note.content).toContain('<p>구독제입니다.</p>')
    // 빈 질문·답변 칸은 문서에 남지 않는다(채워진 칸만 번호를 이어 받는다)
    expect(note.content).not.toContain('Q3.')
  })

  it('빈 칸만 있던 노트도 최소한의 문서가 된다', () => {
    const { notes } = migrateNotes([{ id: '2', title: '빈 노트', updatedAt: '2026-10-02' }])
    expect(notes[0].content).toBe('<p><br></p>')
  })

  it('이미 v2인 노트는 그대로 보존한다', () => {
    const v2 = {
      id: '3',
      title: '문서 노트',
      content: '<p>서식이 입혀진 본문</p>',
      updatedAt: '2026-10-03',
      version: 2,
    }
    const { notes, changed } = migrateNotes([v2])
    expect(changed).toBe(false)
    expect(notes[0].content).toBe('<p>서식이 입혀진 본문</p>')
  })

  it('깨진 항목(문자열 등)은 버리고 changed를 알린다', () => {
    const { notes, changed } = migrateNotes(['garbage', LEGACY_NOTE])
    expect(changed).toBe(true)
    expect(notes).toHaveLength(1)
  })
})

describe('loadStoredNotes/saveNotes — localStorage 왕복', () => {
  it('v1 JSON을 읽으면 문서로 변환해 돌려 준다', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([LEGACY_NOTE]))
    const { notes, changed } = loadStoredNotes()
    expect(changed).toBe(true)
    expect(notes[0].content).toContain('<h1>기획 의도</h1>')
    // 바뀐 형식을 다시 저장하면 두 번째 읽기부터는 changed가 아니다
    saveNotes(notes)
    expect(loadStoredNotes().changed).toBe(false)
  })

  it('저장 값이 없으면 빈 목록이다', () => {
    expect(loadStoredNotes().notes).toEqual([])
  })

  it('깨진 JSON은 빈 목록으로 건너뛴다', () => {
    localStorage.setItem(STORAGE_KEY, '{broken')
    expect(loadStoredNotes().notes).toEqual([])
  })
})

describe('템플릿·초안 문서', () => {
  it('연습 템플릿은 세 개의 큰 제목을 갖는다', () => {
    const content = buildTemplateContent()
    expect(content).toContain('<h1>기획 의도</h1>')
    expect(content).toContain('<h1>차별점</h1>')
    expect(content).toContain('<h1>예상 심사 질문</h1>')
  })

  it('분석 결과 초안의 의도·차별점을 문단으로 채운다', () => {
    const content = buildPrefillContent({
      title: '복습 도우미',
      intent: '시험 기간에 복습을 습관으로 만든다',
      diff: '',
    })
    expect(content).toContain('<p>시험 기간에 복습을 습관으로 만든다</p>')
    // 비워 둔 차별점은 안내 문단으로 남는다
    expect(content).toContain('기존 방식·서비스와 다른 점')
  })
})

describe('notePlainText — 문서를 일반 텍스트로', () => {
  it('문단·제목을 줄바꿈으로 바꾸고 태그를 벗긴다', () => {
    const text = notePlainText('<h1>제목</h1><p>첫 문장</p><p>둘째 문장</p>')
    expect(text).toBe('제목\n\n첫 문장\n\n둘째 문장')
  })

  it('이스케이프된 문자를 되돌린다', () => {
    expect(notePlainText('<p>a &amp; b &lt;c&gt;</p>')).toBe('a & b <c>')
  })
})

describe('noteCounts — 분량 계산', () => {
  it('공백 제외 글자 수와 어절 수를 센다', () => {
    const { chars, words } = noteCounts('<p>공모 전 도 우 미</p>')
    expect(chars).toBe(6)
    expect(words).toBe(5)
  })

  it('빈 문서는 0이다', () => {
    expect(noteCounts('<p><br></p>')).toEqual({ chars: 0, words: 0 })
  })
})

describe('sanitizeNoteHtml — 가져온 HTML 소독', () => {
  it('script와 이벤트 속성을 걷어 낸다', () => {
    const dirty = '<p onclick="alert(1)">본문</p><script>alert(2)</script>'
    const clean = sanitizeNoteHtml(dirty)
    expect(clean).not.toContain('script')
    expect(clean).not.toContain('onclick')
    expect(clean).toContain('<p>본문</p>')
  })

  it('javascript: 주소를 걷어 낸다', () => {
    expect(sanitizeNoteHtml('<a href="javascript:alert(1)">링크</a>')).toBe('<a>링크</a>')
  })
})

describe('buildWordDocHtml — 워드 문서 조립', () => {
  it('제목을 이스케이프해 문서 맨 위에 놓는다', () => {
    const html = buildWordDocHtml('<공모전> 기획서', '<p>본문</p>')
    expect(html).toContain(escapeHtml('<공모전> 기획서'))
    expect(html).toContain('<p>본문</p>')
    expect(html).toContain('@page WordSection1')
  })
})
