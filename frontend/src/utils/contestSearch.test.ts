import { describe, expect, it } from 'vitest'
import { createContestMatcher } from './contestSearch'

describe('contest keyword search', () => {
  it('finds literal words in titles, organizers, fields, descriptions and eligibility', () => {
    const matches = createContestMatcher('바다')
    for (const key of ['title', 'organizer', 'field', 'description', 'eligibility']) {
      expect(matches({ [key]: '우리 바다를 위한 도전' })).toBe(true)
    }
    expect(matches({ title: '산림 공모전' })).toBe(false)
  })

  it('finds related topics even when the original word is absent', () => {
    expect(createContestMatcher('AI')({ title: '인공지능 활용 아이디어 공모전' })).toBe(true)
    expect(createContestMatcher('영상')({ title: '청소년 숏폼 챌린지' })).toBe(true)
    expect(createContestMatcher('환경')({ title: '탄소중립 아이디어 공모전' })).toBe(true)
    expect(createContestMatcher('창업')({ title: '스타트업 경진대회' })).toBe(true)
    expect(createContestMatcher('디자인')({ title: '마스코트 캐릭터 공모전' })).toBe(true)
  })

  it('normalizes English case and full-width characters without matching inside unrelated English words', () => {
    expect(createContestMatcher(' ａｉ ')({ title: 'AI 콘텐츠 공모전' })).toBe(true)
    expect(createContestMatcher('AI')({ title: 'Painting Award' })).toBe(false)
    expect(createContestMatcher('UCC')({ title: 'Success Award' })).toBe(false)
    expect(createContestMatcher('AI')({ title: '생성형AI콘텐츠 공모전' })).toBe(true)
  })

  it('requires every query word to match and handles empty or missing fields', () => {
    const matches = createContestMatcher('청소년 영상')
    expect(matches({ title: '청소년 숏폼 대회' })).toBe(true)
    expect(matches({ title: '청소년 음악 대회' })).toBe(false)
    expect(createContestMatcher('   ')({})).toBe(true)
    expect(createContestMatcher('사진')({})).toBe(false)
  })
})
