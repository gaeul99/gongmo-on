import { afterEach, describe, expect, it, vi } from 'vitest'
import { normalizeSearchHistory, readSearchHistory, saveSearchHistory } from './searchHistory'
import { STORAGE_KEYS } from '../utils/storageKeys.js'

afterEach(() => vi.unstubAllGlobals())

describe('recent searches', () => {
  it('keeps the latest ten unique non-empty searches in order', () => {
    const existing = Array.from({ length: 12 }, (_, i) => `검색${i}`)
    const history = normalizeSearchHistory([' 검색3 ', '', null, ...existing])
    expect(history).toHaveLength(10)
    expect(history[0]).toBe('검색3')
    expect(history.filter((term) => term === '검색3')).toHaveLength(1)
    expect(history).not.toContain('')
  })

  it('restores saved searches and persists deletions', () => {
    const values = new Map()
    vi.stubGlobal('localStorage', {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    })
    saveSearchHistory(['디자인', '영상'])
    expect(readSearchHistory()).toEqual(['디자인', '영상'])
    saveSearchHistory(readSearchHistory().filter((term) => term !== '디자인'))
    expect(readSearchHistory()).toEqual(['영상'])
    saveSearchHistory([])
    expect(JSON.parse(values.get(STORAGE_KEYS.searchHistory))).toEqual([])
  })

  it('handles corrupt or unavailable browser storage', () => {
    vi.stubGlobal('localStorage', { getItem: () => '{invalid' })
    expect(readSearchHistory()).toEqual([])
    vi.stubGlobal('localStorage', {
      getItem: () => { throw new Error('blocked') },
      setItem: () => { throw new Error('quota') },
    })
    expect(readSearchHistory()).toEqual([])
    expect(() => saveSearchHistory(['디자인'])).not.toThrow()
    expect(normalizeSearchHistory({})).toEqual([])
  })
})
