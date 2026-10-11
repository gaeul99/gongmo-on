import { useEffect, useRef, useState } from 'react'
import type { KeyboardEvent } from 'react'
import './CategorySelect.css'

type Props = {
  id: string
  options: string[]
  value: string
  onChange: (value: string) => void
}

// 클릭하면 목록이 열리고, 검색어로 목록을 필터링해 선택할 수 있는 선택창
function CategorySelect({ id, options, value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  const filtered = options.filter((option) => option.includes(query.trim()))

  const close = () => {
    setOpen(false)
    setQuery('')
  }

  // 선택창 바깥을 클릭하면 닫기
  useEffect(() => {
    if (!open) return
    const handleMouseDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        close()
      }
    }
    document.addEventListener('mousedown', handleMouseDown)
    return () => document.removeEventListener('mousedown', handleMouseDown)
  }, [open])

  const select = (option: string) => {
    onChange(option)
    close()
  }

  const handleSearchKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      close()
    }
    if (event.key === 'ArrowDown') {
      // 검색 입력에서 아래쪽 화살표로 첫 옵션(또는 현재 선택의 다음 항목)으로 이동
      event.preventDefault()
      const options = containerRef.current?.querySelectorAll<HTMLButtonElement>('.category-option')
      if (options && options.length > 0) {
        const selectedIndex = Array.from(options).findIndex((option) => option.classList.contains('selected'))
        ;(options[selectedIndex >= 0 && selectedIndex + 1 < options.length ? selectedIndex + 1 : 0])?.focus()
      }
      return
    }
    if (event.key === 'Enter' && filtered.length > 0) {
      event.preventDefault()
      select(filtered[0])
    }
  }

  // 옵션 목록 안에서 위·아래 화살표로 이동하고 Escape로 닫는다.
  const handleOptionKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
      containerRef.current?.querySelector<HTMLInputElement>('.category-search')?.focus()
      return
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return
    event.preventDefault()
    const options = containerRef.current?.querySelectorAll<HTMLButtonElement>('.category-option')
    if (!options || options.length === 0) return
    const index = Array.from(options).indexOf(event.currentTarget)
    const next =
      event.key === 'ArrowDown'
        ? options[(index + 1) % options.length]
        : options[(index - 1 + options.length) % options.length]
    next?.focus()
  }

  return (
    <div className="category-select" ref={containerRef}>
      <button
        type="button"
        id={id}
        className="category-trigger"
        onClick={() => (open ? close() : setOpen(true))}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className={value ? '' : 'placeholder'}>{value || '분야를 선택하세요'}</span>
        <span className="arrow" aria-hidden="true">
          {open ? '▴' : '▾'}
        </span>
      </button>

      {value && !open && (
        <button
          type="button"
          className="category-clear"
          onClick={() => onChange('')}
          aria-label="선택한 관심 분야 지우기"
        >
          ×
        </button>
      )}

      {open && (
        <div className="category-panel">
          <input
            type="text"
            className="category-search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleSearchKeyDown}
            placeholder="분야 검색"
            autoFocus
          />
          {filtered.length > 0 ? (
            <ul className="category-options" role="listbox" aria-label="관심 분야 목록">
              {filtered.map((option) => (
                <li key={option}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={option === value}
                    className={`category-option${option === value ? ' selected' : ''}`}
                    onClick={() => select(option)}
                    onKeyDown={handleOptionKeyDown}
                  >
                    {option}
                    {option === value && (
                      <span className="check" aria-hidden="true">
                        ✓
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="category-empty">검색 결과가 없습니다</p>
          )}
        </div>
      )}
    </div>
  )
}

export default CategorySelect
