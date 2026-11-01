import { STORAGE_KEYS } from '../utils/storageKeys.js'

const LIMIT = 10

export function normalizeSearchHistory(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  const terms = value
    .filter((term): term is string => typeof term === 'string')
    .map((term) => term.trim().slice(0, 40))
    .filter(Boolean)
  return [...new Set(terms)].slice(0, LIMIT)
}

export function readSearchHistory(): string[] {
  try {
    return normalizeSearchHistory(JSON.parse(localStorage.getItem(STORAGE_KEYS.searchHistory) ?? '[]'))
  } catch {
    return []
  }
}

export function saveSearchHistory(history: string[]): void {
  try {
    localStorage.setItem(STORAGE_KEYS.searchHistory, JSON.stringify(normalizeSearchHistory(history)))
  } catch {
    // Storage may be unavailable; searching and this session's history still work.
  }
}
