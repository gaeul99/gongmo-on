const ENTITIES: Record<string, string> = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', middot: '·', bull: '•',
  ndash: '–', mdash: '—', hellip: '…', laquo: '«', raquo: '»',
}

// Decode as plain text, never HTML, including double-encoded scraper values.
export function decodeDisplayText(value: string): string {
  let text = value
  for (let pass = 0; pass < 3; pass += 1) {
    const decoded = text.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (!code.startsWith('#')) return ENTITIES[code] ?? entity
      const number = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1))
      return number > 0 && number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
        ? String.fromCodePoint(number) : entity
    })
    if (decoded === text) break
    text = decoded
  }
  return text.replace(/[\u200b\ufeff]/g, '').replace(/\u00a0/g, ' ').trim()
}

export function normalizeContestText<T extends object>(contest: T): T {
  return Object.fromEntries(Object.entries(contest).map(([key, value]) => [key,
    ['title', 'organizer', 'field', 'description', 'eligibility'].includes(key) && typeof value === 'string'
      ? decodeDisplayText(value)
      : key === 'applySteps' && Array.isArray(value)
        ? value.map((step) => typeof step === 'string' ? decodeDisplayText(step) : step)
        : value,
  ])) as T
}
