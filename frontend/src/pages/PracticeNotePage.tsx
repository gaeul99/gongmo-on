// 연습 노트 — 워드 문서 화면(2026-10-29 사용자 요청).
// 노트는 서식 도구(굵게·제목·목록·색·정렬)로 자유롭게 편집하는 문서 하나로
// 저장된다. 구버전 칸(기획 의도·차별점·예상 질문) 노트는 읽을 때 문서로 자동
// 변환되고(services/practiceNotes), 완성한 문서는 인쇄·.doc 내려받기로
// 기획서 초안으로 바로 옮길 수 있다. 문서는 localStorage에 저장되고,
// 로그인 중이면 회고처럼 서버 백업에 함께 실립니다.
import { useEffect, useMemo, useRef, useState } from 'react'
import type {
  ClipboardEvent as ReactClipboardEvent,
  KeyboardEvent as ReactKeyboardEvent,
  MouseEvent as ReactMouseEvent,
  ReactNode,
} from 'react'
import AppLink from '../components/AppLink'
import {
  buildPrefillContent,
  buildTemplateContent,
  downloadNoteAsWord,
  escapeHtml,
  loadNotes,
  loadStoredNotes,
  noteCounts,
  saveNotes,
  sanitizeNoteHtml,
  todayString,
  type PracticeNote,
} from '../services/practiceNotes'
import './PracticeNotePage.css'

const NOTES_AUTOSAVE_DELAY_MS = 900

// 분석 결과 화면에서 노트를 만들 때 미리 채울 값 — 문서 초안으로 바뀌기 전과
// 같은 모양(ResultPage·App이 그대로 쓴다).
export type NotePrefill = {
  title: string
  intent: string
  diff: string
}

type Draft = {
  // null이면 아직 저장되지 않은 새 문서다. 자동 저장 후에는 노트 id가 채워진다.
  id: string | null
  title: string
  content: string
}

// 커서 위치의 현재 서식 — 도구 버튼의 눌림 상태(select 값)에 반영한다.
type FmtState = {
  block: string
  size: string
  bold: boolean
  italic: boolean
  underline: boolean
  strike: boolean
  ul: boolean
  ol: boolean
}

const EMPTY_FMT: FmtState = {
  block: 'p',
  size: '3',
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  ul: false,
  ol: false,
}

// execCommand fontSize의 1~7 눈금 — styleWithCSS 환경에서 키워드로 읽힐 때의 역변환.
const KEYWORD_TO_SIZE: Record<string, string> = {
  'xx-small': '1',
  'x-small': '2',
  small: '3',
  medium: '4',
  large: '5',
  'x-large': '6',
  'xx-large': '7',
}

const FONT_SIZES: ReadonlyArray<readonly [string, string]> = [
  ['1', '아주 작게'],
  ['2', '작게'],
  ['3', '보통'],
  ['4', '크게'],
  ['5', '더 크게'],
  ['6', '아주 크게'],
  ['7', '가장 크게'],
]

const INK_COLORS = ['#333333', '#767676', '#2563eb', '#0e7490', '#047857', '#b45309', '#be123c', '#7c3aed']
const MARK_COLORS = ['#fff3bf', '#d3f9d8', '#d0ebff', '#f3d9fa', '#ffd8a8', '#ffe3e3']

const PRACTICE_TIPS = [
  '심사위원은 보통 문제 정의 → 실현 가능성 → 차별점 → 기대효과 순서로 봅니다. 문서의 제목 1~3으로 목차를 잡으면 같은 순서가 돼요.',
  '예상 질문은 "비용은 어떻게 충당하나요?", "이미 있는 서비스와 뭐가 다른가요?", "팀이 감당 가능한가요?"부터 준비하세요.',
  '면접·발표가 없는 공모전은 문장을 기획서에 그대로 옮길 수 있게 다듬어 두세요. 질문에 답했다는 건 그 의문을 이미 해결했다는 뜻이에요.',
]

type ToolButtonProps = {
  label: ReactNode
  title: string
  active?: boolean
  // 색 팝업처럼 닫힘 리스너(화면 mousedown)보다 먼저 끊어야 하는 버튼에 쓴다.
  stopPropagation?: boolean
  onClick: () => void
}

function ToolButton({ label, title, active = false, stopPropagation = false, onClick }: ToolButtonProps) {
  return (
    <button
      type="button"
      className={`doc-btn${active ? ' is-active' : ''}`}
      title={title}
      aria-label={title}
      aria-pressed={active}
      onMouseDown={(event) => {
        // 편집 중 선택 영역이 풀리지 않게 — 버튼 클릭이 문서 포커스를 가져가지 않는다.
        event.preventDefault()
        if (stopPropagation) event.stopPropagation()
      }}
      onClick={onClick}
    >
      {label}
    </button>
  )
}

type Props = {
  // 서버 백업 복원 등으로 localStorage 노트가 갱신됐음을 알리는 횟수.
  // 값이 바뀌면 목록을 다시 읽어 최신 상태를 보여 줍니다.
  dataVersion: number
  // 노트를 저장·삭제했을 때 호출 — 앱이 서버 백업을 다시 실행합니다.
  onNotesChanged: () => void
  // 분석 결과의 '연습 노트 만들기'로 넘어올 때 채워 넣을 초안(없으면 null)
  initialDraft?: NotePrefill | null
  onBack: () => void
  // 연습한 아이디어를 곧바로 분석으로 옮겨 보는 입구
  onGoInput: () => void
  // 준비 현황·출품 로드맵이 모인 대시보드로 이어지는 출구 — 기획 흐름
  // (연습 노트 → 대시보드)의 마지막 고리다.
  onGoDashboard: () => void
  // 아이디어 재매칭 — 문서 본문을 아이디어 설명으로 삼아 분석을 다시 돌려
  // 지금 접수 중인 공모전 추천을 받습니다.
  onRematch: (note: PracticeNote) => void
}

function PracticeNotePage({
  dataVersion,
  onNotesChanged,
  initialDraft = null,
  onBack,
  onGoInput,
  onGoDashboard,
  onRematch,
}: Props) {
  // 처음 읽을 때 구버전 노트가 문서로 바뀌면 바로 저장해 둔다(백업·내보내기가
  // 새 모양을 갖게). 화면 알림은 따로 없다 — 내용은 그대로 보존되므로.
  const [boot] = useState(() => loadStoredNotes())
  const [notes, setNotes] = useState<PracticeNote[]>(boot.notes)
  const migratedRef = useRef(boot.changed)

  useEffect(() => {
    if (!migratedRef.current) return
    migratedRef.current = false
    saveNotes(boot.notes)
  }, [boot.notes])

  const [draft, setDraft] = useState<Draft | null>(() =>
    initialDraft
      ? { id: null, title: initialDraft.title, content: buildPrefillContent(initialDraft) }
      : null,
  )
  // 편집 중 최신 문서 — 자동 저장·문서 닫기가 화면 밖 타이밍(타이머·탭 닫기)에서도
  // 최신 값을 읽게 하는 사본이다.
  const draftRef = useRef<Draft | null>(draft)
  // 편집기 세션 번호 — 문서를 열 때만 본문 DOM을 새로 깔기 위한 키다.
  const [session, setSession] = useState(0)
  const paperRef = useRef<HTMLDivElement | null>(null)
  const savedRangeRef = useRef<Range | null>(null)
  const saveTimerRef = useRef<number | null>(null)
  const flushRef = useRef<() => void>(() => {})
  const docScreenRef = useRef<HTMLDivElement | null>(null)

  const [counts, setCounts] = useState({ chars: 0, words: 0 })
  const [fmt, setFmt] = useState<FmtState>(EMPTY_FMT)
  const [palette, setPalette] = useState<'ink' | 'mark' | null>(null)
  const [saveState, setSaveState] = useState<'idle' | 'typing' | 'need-title' | 'saved'>('idle')
  const [savedAt, setSavedAt] = useState('')

  // 서버 복원으로 localStorage 노트가 갱신되면(dataVersion 증가) 목록을 다시 읽습니다.
  const [loadedVersion, setLoadedVersion] = useState(dataVersion)
  if (loadedVersion !== dataVersion) {
    setLoadedVersion(dataVersion)
    setNotes(loadNotes())
  }

  const editorOpen = draft !== null

  // 문서를 열 때의 본문만 기억한다 — 입력마다 React가 innerHTML을 다시 쓰면
  // 커서가 튀므로, 편집 중에는 DOM을 React 밖에 둔다.
  const initialHtml = useMemo(
    () => sanitizeNoteHtml(draft?.content ?? '') || '<p><br></p>',
    // 문서를 열 때(session 변경)만 다시 계산한다
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [session],
  )

  const setDraftUp = (next: Draft | null) => {
    draftRef.current = next
    setDraft(next)
  }

  const flushSave = () => {
    const current = draftRef.current
    if (!current) return
    const title = current.title.trim()
    if (title === '') {
      setSaveState('need-title')
      return
    }
    const content = current.content.trim() === '' ? '<p><br></p>' : current.content
    const updatedAt = todayString()
    let next: PracticeNote[]
    let savedId = current.id
    if (current.id) {
      next = notes.map((note) =>
        note.id === current.id ? { ...note, title, content, updatedAt } : note,
      )
    } else {
      savedId = `${Date.now()}`
      next = [{ id: savedId, title, content, updatedAt, version: 2 }, ...notes]
    }
    setNotes(next)
    saveNotes(next)
    onNotesChanged()
    setSaveState('saved')
    setSavedAt(new Date().toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' }))
    if (savedId !== current.id) setDraftUp({ ...current, id: savedId })
  }

  // 매 렌더마다 최신 flushSave를 가리키게 — 타이머·탭 닫기 청소가 최신 notes를 쓴다.
  useEffect(() => {
    flushRef.current = flushSave
  })

  const scheduleSave = () => {
    if (saveTimerRef.current !== null) window.clearTimeout(saveTimerRef.current)
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null
      flushSave()
    }, NOTES_AUTOSAVE_DELAY_MS)
  }

  // 화면을 떠날 때 저장 대기 중이던 입력을 마저 저장한다.
  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
      flushRef.current()
    },
    [],
  )

  // Ctrl+S / Cmd+S — 문서 저장의 워드 습관을 그대로 살린다.
  useEffect(() => {
    if (!editorOpen) return
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        flushRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [editorOpen])

  // 저장되지 않은 입력이 남아 있을 때 탭을 닫으면 브라우저가 되묻는다.
  useEffect(() => {
    if (!editorOpen || saveState !== 'typing') return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
    }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [editorOpen, saveState])

  // 커서가 문서 안을 움직일 때 현재 서식을 읽어 도구 버튼 눌림 상태에 반영하고,
  // 선택 영역을 기억해 도구 클릭(포커스가 도구로 잠깐 옮겨가도)에 대비한다.
  useEffect(() => {
    if (!editorOpen) return
    const update = () => {
      const paper = paperRef.current
      if (!paper) return
      const sel = window.getSelection()
      if (!sel || sel.rangeCount === 0 || !paper.contains(sel.anchorNode)) return
      savedRangeRef.current = sel.getRangeAt(0).cloneRange()
      const commandValue = (name: string) => {
        try {
          return String(document.queryCommandValue(name) ?? '')
        } catch {
          return ''
        }
      }
      const commandState = (name: string) => {
        try {
          return document.queryCommandState(name)
        } catch {
          return false
        }
      }
      const rawBlock = commandValue('formatBlock').replace(/[<>]/g, '').toLowerCase()
      const rawSize = commandValue('fontSize').toLowerCase()
      setFmt({
        block: ['h1', 'h2', 'h3', 'blockquote'].includes(rawBlock) ? rawBlock : 'p',
        size: /^\d$/.test(rawSize) ? rawSize : (KEYWORD_TO_SIZE[rawSize] ?? '3'),
        bold: commandState('bold'),
        italic: commandState('italic'),
        underline: commandState('underline'),
        strike: commandState('strikeThrough'),
        ul: commandState('insertUnorderedList'),
        ol: commandState('insertOrderedList'),
      })
    }
    document.addEventListener('selectionchange', update)
    return () => document.removeEventListener('selectionchange', update)
  }, [editorOpen])

  // 색 팝업 밖을 누르면 닫는다.
  useEffect(() => {
    if (!palette) return
    const close = () => setPalette(null)
    window.addEventListener('mousedown', close)
    return () => window.removeEventListener('mousedown', close)
  }, [palette])

  // 툴바를 상단 고정 내비(.top-nav-bar) 바로 아래에 붙인다 — 내비 높이를 재서 넘긴다.
  useEffect(() => {
    if (!editorOpen) return
    const nav = document.querySelector('.top-nav-bar')
    const screen = docScreenRef.current
    if (!nav || !screen) return
    const apply = () => {
      screen.style.setProperty('--doc-top', `${nav.getBoundingClientRect().height}px`)
    }
    apply()
    const observer = new ResizeObserver(apply)
    observer.observe(nav)
    return () => observer.disconnect()
  }, [editorOpen])

  const handleInput = () => {
    const paper = paperRef.current
    const current = draftRef.current
    if (!paper || !current) return
    const content = paper.innerHTML
    setDraftUp({ ...current, content })
    setCounts(noteCounts(content))
    setSaveState('typing')
    scheduleSave()
  }

  // 문서 밖에서 복사해 오면 글자만 받는다 — 웹·워드의 낯선 서식이 문서를
  // 뭉개지 않게 한다. 붙여 넣은 줄바꿈은 문단으로 바꾼다.
  const handlePasteAsText = (event: ReactClipboardEvent<HTMLDivElement>) => {
    event.preventDefault()
    const text = event.clipboardData?.getData('text/plain') ?? ''
    if (text.trim() === '') return
    const paragraphs = text
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .map((line) => `<p>${escapeHtml(line)}</p>`)
      .join('')
    const paper = paperRef.current
    if (!paper) return
    paper.focus()
    try {
      document.execCommand('insertHTML', false, paragraphs)
    } catch {
      // 미지원 환경은 무시한다
    }
    handleInput()
  }

  const handleEditorKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    // Tab — 문서에서는 포커스 이동 대신 들여쓰기로 쓴다(Shift+Tab은 내어쓰기).
    if (event.key === 'Tab') {
      event.preventDefault()
      exec(event.shiftKey ? 'outdent' : 'indent')
    }
  }

  const exec = (command: string, value?: string) => {
    const paper = paperRef.current
    if (!paper) return
    paper.focus()
    const sel = window.getSelection()
    if (sel && savedRangeRef.current) {
      sel.removeAllRanges()
      sel.addRange(savedRangeRef.current)
    }
    try {
      document.execCommand(command, false, value)
    } catch {
      // 미지원 명령은 무시한다
    }
    handleInput()
  }

  const handleToolbarMouseDown = (event: ReactMouseEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement
    // select·input·색 팝업은 원래 동작이 필요하다. 나머지 버튼은 편집 선택 영역을 지킨다.
    if (target.closest('select, input, .doc-color-panel')) return
    event.preventDefault()
  }

  const applyLink = () => {
    const sel = window.getSelection()
    if (sel && !sel.isCollapsed) {
      const url = window.prompt('연결할 주소(URL)를 입력하세요.', 'https://')
      if (!url || url === 'https://') return
      exec('createLink', url)
      return
    }
    const text = window.prompt('링크로 넣을 문장을 적어 주세요.')
    if (!text) return
    const url = window.prompt('연결할 주소(URL)를 입력하세요.', 'https://')
    if (!url || url === 'https://') return
    exec('insertHTML', `<a href="${escapeHtml(url)}">${escapeHtml(text)}</a>`)
  }

  const openNew = () => {
    const content = buildTemplateContent()
    setSession((prev) => prev + 1)
    setDraftUp({ id: null, title: '', content })
    setCounts(noteCounts(content))
    setFmt(EMPTY_FMT)
    setSaveState('idle')
    setSavedAt('')
  }

  const openNote = (note: PracticeNote) => {
    setSession((prev) => prev + 1)
    setDraftUp({ id: note.id, title: note.title, content: note.content })
    setCounts(noteCounts(note.content))
    setFmt(EMPTY_FMT)
    setSaveState('idle')
    setSavedAt('')
  }

  const closeEditor = () => {
    const current = draftRef.current
    if (current && current.title.trim() === '') {
      const keep = window.confirm(
        '문서 제목이 없어요. 「제목 없는 노트」로 저장할까요?\n취소하면 이 문서는 저장되지 않아요.',
      )
      if (keep) {
        setDraftUp({ ...current, title: '제목 없는 노트' })
        flushSave()
      }
    } else {
      flushSave()
    }
    setDraftUp(null)
  }

  const handleDownloadWord = () => {
    const current = draftRef.current
    if (!current) return
    const paper = paperRef.current
    downloadNoteAsWord({
      title: current.title.trim() || '연습 노트',
      content: paper ? paper.innerHTML : current.content,
    })
  }

  const handleDelete = (id: string) => {
    const target = notes.find((note) => note.id === id)
    // 삭제는 되돌릴 수 없다 — 실수 클릭을 막으려 한 번 확인한다.
    if (!window.confirm(`'${target?.title ?? '노트'}' 노트를 삭제할까요? 삭제한 문서는 복구할 수 없어요.`)) {
      return
    }
    const next = notes.filter((note) => note.id !== id)
    setNotes(next)
    saveNotes(next)
    onNotesChanged()
  }

  if (draft) {
    const saveLabel =
      saveState === 'typing'
        ? '입력 중…'
        : saveState === 'need-title'
          ? '제목을 입력하면 저장돼요'
          : saveState === 'saved'
            ? `저장됨 ${savedAt}`
            : '편집하면 자동 저장돼요'
    return (
      <div className="page notes-page notes-page--doc" ref={docScreenRef}>
        <button type="button" className="back-button" onClick={closeEditor}>
          ← 노트 목록으로
        </button>

        <div className="doc-titlebar">
          <input
            className="doc-title-input"
            type="text"
            value={draft.title}
            onChange={(event) => {
              const current = draftRef.current
              if (!current) return
              setDraftUp({ ...current, title: event.target.value })
              setSaveState('typing')
              scheduleSave()
            }}
            placeholder="문서 제목 — 예: 2026 대학생 창업 아이디어 공모전 계획서"
            aria-label="노트 제목"
            aria-invalid={saveState === 'need-title' ? true : undefined}
            maxLength={120}
          />
        </div>

        <div className="doc-toolbar" role="toolbar" aria-label="문서 서식 도구" onMouseDown={handleToolbarMouseDown}>
          <div className="doc-tool-group">
            <ToolButton label="↶" title="실행 취소" onClick={() => exec('undo')} />
            <ToolButton label="↷" title="다시 실행" onClick={() => exec('redo')} />
          </div>

          <div className="doc-tool-group">
            <select
              className="doc-select"
              title="문단 스타일"
              aria-label="문단 스타일"
              value={fmt.block}
              onChange={(event) => exec('formatBlock', `<${event.target.value}>`)}
            >
              <option value="p">본문</option>
              <option value="h1">제목 1</option>
              <option value="h2">제목 2</option>
              <option value="h3">제목 3</option>
              <option value="blockquote">인용구</option>
            </select>
            <select
              className="doc-select"
              title="글자 크기"
              aria-label="글자 크기"
              value={fmt.size}
              onChange={(event) => exec('fontSize', event.target.value)}
            >
              {FONT_SIZES.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="doc-tool-group">
            <ToolButton label={<b>B</b>} title="굵게" active={fmt.bold} onClick={() => exec('bold')} />
            <ToolButton label={<i>I</i>} title="기울임" active={fmt.italic} onClick={() => exec('italic')} />
            <ToolButton
              label={<span className="doc-btn-u">U</span>}
              title="밑줄"
              active={fmt.underline}
              onClick={() => exec('underline')}
            />
            <ToolButton
              label={<span className="doc-btn-s">S</span>}
              title="취소선"
              active={fmt.strike}
              onClick={() => exec('strikeThrough')}
            />
          </div>

          <div className="doc-tool-group doc-color-wrap">
            <ToolButton
              label="글자색"
              title="글자색 고르기"
              active={palette === 'ink'}
              stopPropagation
              onClick={() => setPalette((prev) => (prev === 'ink' ? null : 'ink'))}
            />
            <ToolButton
              label="형광펜"
              title="배경색(형광펜) 칠하기"
              active={palette === 'mark'}
              stopPropagation
              onClick={() => setPalette((prev) => (prev === 'mark' ? null : 'mark'))}
            />
            {palette && (
              <div className="doc-color-panel" role="menu" onMouseDown={(event) => event.stopPropagation()}>
                {(palette === 'ink' ? INK_COLORS : MARK_COLORS).map((color) => (
                  <button
                    key={color}
                    type="button"
                    className="doc-color-swatch"
                    style={{ background: color }}
                    title={palette === 'ink' ? `글자색 ${color}` : `배경색 ${color}`}
                    aria-label={palette === 'ink' ? `글자색 ${color}` : `배경색 ${color}`}
                    onMouseDown={(event) => event.stopPropagation()}
                    onClick={() => {
                      exec(palette === 'ink' ? 'foreColor' : 'hiliteColor', color)
                      setPalette(null)
                    }}
                  />
                ))}
                <button
                  type="button"
                  className="doc-color-clear"
                  onClick={() => {
                    exec(palette === 'ink' ? 'foreColor' : 'hiliteColor', palette === 'ink' ? '#333333' : 'transparent')
                    setPalette(null)
                  }}
                >
                  {palette === 'ink' ? '기본색' : '지우기'}
                </button>
              </div>
            )}
          </div>

          <div className="doc-tool-group">
            <ToolButton label="• 목록" title="글머리표 목록" active={fmt.ul} onClick={() => exec('insertUnorderedList')} />
            <ToolButton label="1. 목록" title="번호 매기기 목록" active={fmt.ol} onClick={() => exec('insertOrderedList')} />
          </div>

          <div className="doc-tool-group">
            <ToolButton label="들여쓰기" title="들여쓰기" onClick={() => exec('indent')} />
            <ToolButton label="내어쓰기" title="내어쓰기" onClick={() => exec('outdent')} />
          </div>

          <div className="doc-tool-group">
            <ToolButton label="왼쪽" title="왼쪽 정렬" onClick={() => exec('justifyLeft')} />
            <ToolButton label="가운데" title="가운데 정렬" onClick={() => exec('justifyCenter')} />
            <ToolButton label="오른쪽" title="오른쪽 정렬" onClick={() => exec('justifyRight')} />
            <ToolButton label="양쪽" title="양쪽 정렬" onClick={() => exec('justifyFull')} />
          </div>

          <div className="doc-tool-group">
            <ToolButton label="링크" title="선택한 글자에 링크 걸기" onClick={applyLink} />
            <ToolButton label="링크 해제" title="링크 지우기" onClick={() => exec('unlink')} />
          </div>

          <div className="doc-tool-group">
            <ToolButton label="구분선" title="가로 구분선 넣기" onClick={() => exec('insertHorizontalRule')} />
            <ToolButton label="서식 지우기" title="선택한 글자의 서식만 지우기" onClick={() => exec('removeFormat')} />
            <ToolButton
              label="템플릿"
              title="연습 템플릿(기획 의도·차별점·예상 질문)을 커서 위치에 넣기"
              onClick={() => exec('insertHTML', buildTemplateContent())}
            />
          </div>

          <div className="doc-tool-group doc-tool-actions">
            <ToolButton label="인쇄" title="문서 인쇄 — 인쇄 창에서 PDF로 저장할 수 있어요" onClick={() => window.print()} />
            <ToolButton label=".doc 저장" title="워드에서 열 수 있는 문서 파일로 내려받아요" onClick={handleDownloadWord} />
            <button type="button" className="doc-finish" onClick={closeEditor}>
              완료
            </button>
          </div>
        </div>

        <div className="doc-paper-wrap doc-print-area">
          <div
            key={session}
            ref={paperRef}
            className="doc-paper"
            contentEditable
            suppressContentEditableWarning
            role="textbox"
            aria-multiline="true"
            aria-label="노트 문서 본문"
            spellCheck
            onInput={handleInput}
            onPaste={handlePasteAsText}
            onKeyDown={handleEditorKeyDown}
            dangerouslySetInnerHTML={{ __html: initialHtml }}
          />
        </div>

        <div className="doc-statusbar">
          <span>
            글자 {counts.chars}자 · 단어 {counts.words}개
          </span>
          <span className="doc-status-state">{saveLabel}</span>
        </div>
      </div>
    )
  }

  return (
    <div className="notes-page">
      <button type="button" className="back-button" onClick={onBack}>
        ← 돌아가기
      </button>

      <header className="notes-header" data-reveal>
        <h1>연습 노트</h1>
        <p>
          워드 문서처럼 서식을 입혀 자유롭게 쓰는 노트예요. 기획 의도·차별점·예상 질문을
          문서로 정리해 두면 심사위원이 기획서에서 확인할 문장이 되고, 발표·면접이 있는
          공모전은 그대로 답변으로 쓸 수 있습니다. 완성한 문서는 .doc 파일로 저장하거나
          인쇄해 기획서 초안으로 옮기고, 노트마다 '새 공모전 찾기'를 누르면 노트 내용으로
          분석을 다시 돌려 지금 접수 중인 공모전 추천을 받아요.
        </p>
      </header>

      <div className="notes-toolbar" data-reveal>
        <button type="button" className="notes-new-button" onClick={openNew}>
          + 새 노트 만들기
        </button>
        {/* 두 출구는 세로로 나란히 — 대시보드 쪽은 버튼 모양으로 목적지를 구분한다
            (2026-10-19 사용자 요청) */}
        <div className="notes-links">
          <AppLink className="notes-to-input" href="/input" onNavigate={onGoInput}>
            아이디어를 AI 분석해 보고 싶다면 →
          </AppLink>
          <AppLink className="notes-to-dashboard" href="/dashboard" onNavigate={onGoDashboard}>
            준비 현황·출품 로드맵은 대시보드에서 →
          </AppLink>
        </div>
      </div>

      {notes.length === 0 ? (
        <div className="notes-empty" data-reveal>
          <p>아직 연습 노트가 없어요.</p>
          <p className="notes-empty-sub">
            공모전을 하나 정하고 기획 의도부터 예상 질문까지 워드 문서로 정리해 보세요.
          </p>
          <button type="button" className="notes-empty-button" onClick={openNew}>
            첫 노트 만들기
          </button>
        </div>
      ) : (
        <ul className="notes-list" data-reveal>
          {notes.map((note) => (
            <li key={note.id} className="note-card">
              <button
                type="button"
                className="note-card-main"
                onClick={() => openNote(note)}
                aria-label={`${note.title} 노트 열기`}
              >
                <span className="note-card-title">{note.title}</span>
                <span className="note-card-meta">
                  {note.updatedAt} 수정 · {noteCounts(note.content).chars}자
                </span>
              </button>
              {/* 카드 안의 행동 버튼들 — 노트 열기(main)와 구분해 오른쪽에 세로로 둔다 */}
              <div className="note-card-actions">
                <button
                  type="button"
                  className="note-card-match"
                  onClick={() => onRematch(note)}
                  title="노트 내용으로 분석을 다시 돌려 지금 접수 중인 공모전 추천을 받아요"
                >
                  새 공모전 찾기
                </button>
                <button
                  type="button"
                  className="note-card-delete"
                  onClick={() => handleDelete(note.id)}
                  aria-label={`${note.title} 노트 삭제`}
                >
                  삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <section className="notes-tips prose" aria-labelledby="notes-tips-title" data-reveal>
        <h2 id="notes-tips-title">실전에서 통하는 연습 팁</h2>
        <ul>
          {PRACTICE_TIPS.map((tip) => (
            <li key={tip}>{tip}</li>
          ))}
        </ul>
      </section>
    </div>
  )
}

export default PracticeNotePage
