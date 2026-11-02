import { describe, expect, it } from 'vitest'
import { decodeDisplayText, normalizeContestText } from './displayText'
import { contests } from '../data/mockData.js'

describe('contest display text', () => {
  it('decodes the Kyobo contest title and double-encoded text', () => {
    expect(decodeDisplayText('교보교육재단 2026 제10회 &lt;책갈피 독서편지 공모전&gt;')).toBe('교보교육재단 2026 제10회 <책갈피 독서편지 공모전>')
    expect(decodeDisplayText('KT&amp;amp;G &quot;공모전&quot;')).toBe('KT&G "공모전"')
  })
  it('handles numeric entities and invisible characters as plain text', () => {
    expect(decodeDisplayText('\ufeff&#xCC45;&#44040;&#54588;\u200b&nbsp;')).toBe('책갈피')
    expect(decodeDisplayText('&lt;img src=x onerror=alert(1)&gt;')).toBe('<img src=x onerror=alert(1)>')
    expect(decodeDisplayText('&#99999999;')).toBe('&#99999999;')
  })
  it('normalizes API fields without modifying URLs or original objects', () => {
    const original = { id: 1, title: '&lt;제목&gt;', url: 'https://example.com/?a=1&amp;b=2', applySteps: ['A &amp; B'] }
    const normalized = normalizeContestText(original)
    expect(normalized.title).toBe('<제목>')
    expect(normalized.applySteps).toEqual(['A & B'])
    expect(normalized.url).toBe(original.url)
    expect(original.title).toBe('&lt;제목&gt;')
  })
  it('has no encoded HTML entities or invisible markers in static contest titles', () => {
    for (const contest of contests) {
      expect(contest.title).not.toMatch(/&(?:#\w+|lt|gt|amp|quot|apos|nbsp);|[\u200b\ufeff]/)
    }
  })
})
