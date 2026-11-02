// Related terms expand only from a complete query word, never recursively.
const RELATED_TERMS = [
  ['ai', '인공지능', '생성형ai', '생성형인공지능', '머신러닝', '딥러닝'],
  ['영상', '동영상', '숏폼', '쇼츠', '릴스', '영화', 'ucc', '비디오'],
  ['디자인', '시각디자인', '제품디자인', '그래픽', '브랜딩', '로고', '캐릭터', '일러스트'],
  ['그림', '미술', '회화', '드로잉', '일러스트', '아트'],
  ['문학', '글쓰기', '글짓기', '소설', '수필', '에세이', '시나리오', '동화', '독후감'],
  ['사진', '포토', '포토그래피', '촬영'],
  ['환경', '친환경', '기후', '탄소중립', '재활용', '새활용', '업사이클', '자원순환', '생태'],
  ['창업', '스타트업', '사업화', '비즈니스', '앙트러프러너'],
  ['코딩', '프로그래밍', '소프트웨어', '개발', 'sw', '해커톤'],
  ['데이터', '빅데이터', '데이터분석', '통계'],
  ['건축', '공간디자인', '도시디자인', '조경'],
  ['음악', '작곡', '음원', '노래', '뮤직'],
  ['광고', '홍보', '마케팅', '캠페인'],
  ['게임', '게이밍', '게임콘텐츠', '로블록스'],
  ['복지', '돌봄', '장애인', '고령자', '노인', '취약계층'],
  ['교육', '학습', '에듀', '에듀테크'],
  ['안전', '재난', '방재', '사고예방'],
  ['교통', '모빌리티', '대중교통', '자전거', '보행'],
  ['관광', '여행', '여행지'],
  ['반려동물', '반려견', '반려묘', '펫'],
]

function normalize(value: string): string {
  return value.normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ').trim()
}

function contains(text: string, term: string): boolean {
  // Short Latin keywords must not match inside unrelated words (AI in "painting").
  if (term.length <= 3 && /^[a-z0-9]+$/.test(term)) {
    return new RegExp(`(^|[^a-z0-9])${term}($|[^a-z0-9])`).test(text)
  }
  return text.includes(term)
}

type SearchableContest = {
  title?: string
  organizer?: string
  field?: string
  description?: string
  eligibility?: string
  applySteps?: string[]
}

export function createContestMatcher(query: string): (contest: SearchableContest) => boolean {
  const words = normalize(query).split(' ').filter(Boolean)
  const expanded = words.map((word) => new Set([
    word,
    ...RELATED_TERMS.filter((group) => group.includes(word)).flat(),
  ]))
  return (contest) => {
    const text = normalize([
      contest.title, contest.organizer, contest.field, contest.description,
      contest.eligibility, ...(contest.applySteps ?? []),
    ].filter(Boolean).join(' '))
    return expanded.every((terms) => [...terms].some((term) => contains(text, term)))
  }
}
