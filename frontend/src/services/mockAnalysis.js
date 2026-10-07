// ==========================================================
// 입력을 반영하는 목업 분석기
// 실제 AI 분석 대신 입력(제목·관심 분야)으로 예시 문장을 조립해
// 결과 화면에 보여 줍니다. 실제 분석 API로 전환할 때 이 파일만 교체하면 됩니다.
// ==========================================================
import { categoryProfiles, contests, referenceCases } from '../data/mockData.js'
import { josa } from '../utils/korean.js'

// 입력 제목 기반 해시 — 같은 입력이면 항상 같은 유사도가 나옵니다.
function seedFrom(text) {
  let hash = 0
  for (let i = 0; i < text.length; i += 1) {
    hash = (hash * 31 + text.charCodeAt(i)) % 9973
  }
  return hash
}

function scoreFrom(seed, index, min, max) {
  return min + ((seed + index * 17) % (max - min + 1))
}

function getProfile(category) {
  return categoryProfiles[category] ?? categoryProfiles['기타']
}

// 입력 아이디어와 실제 공모전(referenceCases)을 이어 보여 주는 유사 사례를 만듭니다.
// 사례의 정체(제목·주최·링크·이미지)는 실제 공모전이고, 유사도·분석 문구는 입력을 반영해 생성합니다.
// (첫 사례는 항상 99%, 나머지는 제목 기반 점수이며 범위가 겹치지 않아 항상 내림차순입니다.)
function buildSimilarCases({ title, category }) {
  const seed = seedFrom(title + (category ?? ''))

  const analyses = [
    {
      similarity: 99,
      summary: `${referenceCases[0].organizer}${josa(referenceCases[0].organizer, '이가')} 진행한 실제 공모전입니다. ${referenceCases[0].domain} 주제로 '${title}'${josa(title, '와과')} 비슷한 방향의 아이디어가 실제로 공모된 사례라, 차별화 포인트를 점검하는 참고로 삼을 수 있습니다.`,
      overlap: [
        `${referenceCases[0].domain} 주제의 실제 공모 사례`,
        `'${title}'${josa(title, '와과')} 비슷한 문제 의식`,
        '완성형 기획안 심사 구조',
      ],
      difference: `비슷한 주제의 공모전이 실제로 있었다는 점을 감안해, '${title}'만의 고유한 문제 정의를 한 문장으로 다듬어 보세요.`,
    },
    {
      similarity: scoreFrom(seed, 2, 64, 76),
      summary: `${referenceCases[1].organizer}${josa(referenceCases[1].organizer, '이가')} 진행한 실제 공모전입니다. ${referenceCases[1].domain} 주제로 열리며, '${title}'${josa(title, '와과')} 비슷한 방향을 기술 아이디어로 풀어낼 수 있습니다.`,
      overlap: [
        `${referenceCases[1].domain} 주제의 실제 공모 사례`,
        `'${title}'${josa(title, '과과')} 겹치는 기술·아이디어 요소`,
        '완성형 기획안 심사 구조',
      ],
      difference: `실제 공모전 심사에서는 주제 적합성과 실현 가능성을 봅니다. '${title}'의 실행 방식과 필요한 자원을 구체적으로 적어 두면 강점이 됩니다.`,
    },
    {
      similarity: scoreFrom(seed, 3, 50, 62),
      summary: `${referenceCases[2].organizer}${josa(referenceCases[2].organizer, '이가')} 진행한 실제 공모전입니다. ${referenceCases[2].domain} 주제로 열리며, '${title}'${josa(title, '을를')} 데이터·기술 활용 관점에서 확장해 볼 수 있는 사례입니다.`,
      overlap: [
        `${referenceCases[2].domain} 주제의 실제 공모 사례`,
        `'${title}'${josa(title, '과과')} 활용할 수 있는 데이터·기술 요소`,
        '보상·참여 설계로 완성도를 높이는 구조',
      ],
      difference: `이미 공모된 아이디어와 겹치는 부분은 오히려 수요가 있다는 증거입니다. '${title}'만의 실행 방식과 대상 차이를 강조해 보세요.`,
    },
  ]

  return referenceCases.map((caseInfo, index) => ({
    ...caseInfo,
    source: '실제 공모전',
    similarity: analyses[index].similarity,
    summary: analyses[index].summary,
    overlap: analyses[index].overlap,
    difference: analyses[index].difference,
  }))
}

// 공모전 추천 이유를 입력에 맞게 만들고, 관심 분야가 일치하는 공모전을 앞으로 정렬합니다.
// 적합도 점수는 같은 입력이면 항상 같은 값(제목 기반 해시)이 나옵니다.
function buildContests({ title, category }) {
  const profile = getProfile(category)
  const seed = seedFrom(title + (category ?? ''))
  const fieldMatch = (contest) =>
    Boolean(category) &&
    (contest.field === category || contest.field.startsWith(`${category} `))

  return [...contests]
    .sort((a, b) => Number(fieldMatch(b)) - Number(fieldMatch(a)))
    .map((contest) => {
      const isMatch = fieldMatch(contest)
      let matchReason
      if (isMatch) {
        matchReason = `관심 분야(${category})와 공모전 주제가 직접 연결되어 가장 잘 맞습니다. '${title}'${josa(title, '을를')} 그대로 제안서로 발전시켜 보세요.`
      } else if (contest.id === 1) {
        matchReason = `'${title}'의 핵심 가치(${profile.issue})를 환경 주제로 풀어낼 수 있어 제안해 볼 만한 공모전입니다.`
      } else if (contest.id === 2) {
        matchReason = `누구나 참여할 수 있는 아이디어 공모라, '${title}'${josa(title, '을를')} 아이디어 기획안 형태로 부담 없이 제출해 볼 수 있습니다.`
      } else if (contest.id === 3) {
        matchReason = `'${title}'${josa(title, '을를')} 실제 사업 아이템으로 발전시키는 구상을 평가하는 공모전이라, 아이디어의 다음 단계와 잘 맞물립니다.`
      } else {
        matchReason = `'${title}'${josa(title, '을를')} 일상 행정·편의 서비스와 접목해 확장할 여지를 높게 평가했습니다.`
      }
      return {
        ...contest,
        matchScore: isMatch ? scoreFrom(seed, contest.id, 76, 92) : scoreFrom(seed, contest.id, 42, 68),
        matchReason,
      }
    })
}

// 설명 문장에서 의미 있는 단어를 뽑아 분석 문장에 녹입니다.
// 조사까지 붙은 단어가 그대로 뽑히면 문장이 지저분해지므로 흔한 조사·불용어는 걸러 냅니다.
const STOPWORDS = new Set([
  '그리고', '하지만', '그래서', '그런데', '정말', '너무', '있는', '위한', '해서', '하는',
  '하는것', '할수', '같은', '이런', '저런', '같이', '으로', '에서', '것을', '것이', '등을',
  '등의', '등과', '입니다', '합니다', '됩니다', '되도록', '대한', '대해', '앱을', '앱이',
  '앱은', '서비스를', '서비스가', '서비스는', '사용자가', '사용자를', '사용자는', '통해',
  '함께', '바로', '다른', '여러', '모든', '가장', '위해', '때문',
])

const PARTICLE_RE = /(으로|에서|에게|부터|까지|와|과|을|를|이|가|은|는|도|의|에|로)$/

// 동사·형용사가 어근만 남은 형태(찾아주·보여줍니다 등)도 키워드가 되면 문장이 어색해지므로 거른다
const VERB_ENDING_RE = /(습니다|됩니다|합니다|줍니다|해요|돼요|예요|에요|아서|어서|라서|면서|라는|다는|주고|되고|하고|되며|하며|주$|하$|돼$)/

function stripParticle(word) {
  const stripped = word.replace(PARTICLE_RE, '')
  return stripped.length >= 2 ? stripped : word
}

function keywordsFrom(description, limit = 3) {
  if (!description) return []
  const words = description
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .map((word) => stripParticle(word.trim()))
    .filter(
      (word) =>
        word.length >= 2 &&
        !STOPWORDS.has(word) &&
        !VERB_ENDING_RE.test(word) &&
        !/^\d+$/.test(word),
    )
  const freq = new Map()
  for (const word of words) freq.set(word, (freq.get(word) ?? 0) + 1)
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
    .slice(0, limit)
    .map(([word]) => word)
}

// 입력 아이디어를 여러 각도에서 짚어 보는 상세 분석 문단을 만듭니다.
// 실제 데이터가 아니라 입력(제목·설명·분야 프로필)을 반영한 참고 의견입니다.
// 설명이 길수록 설명의 단어를 직접 인용해 아이디어마다 다른 분석이 나옵니다.
function buildDetail({ title, category, description }) {
  const profile = getProfile(category)
  const keywords = keywordsFrom(description)
  const hasKeywords = keywords.length > 0

  return {
    ideaSummary: `'${title}'${josa(title, '은는')} ${profile.issue} 문제를 다루며, ${profile.approach} 방식으로 해결을 제안하는 아이디어입니다.${
      hasKeywords ? ` 설명에서 '${keywords.join('·')}'에 무게를 둔 기획으로 읽힙니다.` : ''
    } 주요 사용자는 ${profile.audience} 등이 될 것으로 보입니다.`,
    targetUsers: [
      `핵심 사용자 — ${profile.audience}`,
      hasKeywords
        ? `확장 대상 — '${keywords[0]}'${josa(keywords[0], '을를')} 대신 겪어 주는 사람(보호자·관리자)`
        : `확장 대상 — '${title}'의 문제를 대신 겪어 주는 사람(보호자·관리자)`,
      '심사위원이 체감할 수 있는 일반 이용자 1~2명 페르소나를 추가로 정의해 보세요.',
    ],
    strengths: [
      `'${title}'${josa(title, '은는')} ${profile.approach}라는 명확한 해결 방식을 갖추고 있어 기획 설명이 쉽습니다.${
        hasKeywords ? ` 특히 '${keywords[0]}'${josa(keywords[0], '을를')} 직접 다루는 점이 구체적입니다.` : ''
      }`,
      `${profile.issue}처럼 많은 사람이 공감하는 문제를 다뤄 주제 공감대가 높습니다.`,
      '입력에 문제 상황과 접근 방식이 함께 담겨 있어 완성형 기획안으로 발전시키기 좋은 구조입니다.',
    ],
    improvements: [
      description && description.length >= 60
        ? `문제를 직접 겪는 ${profile.audience}의 구체적 사례나 수치를 한 개 이상 덧붙이면 설득력이 올라갑니다.`
        : '설명이 아직 짧아요 — 문제가 언제·누구에게 발생하는지 상황을 한 문단 더 써 보면 분석이 훨씬 정확해집니다.',
      '아이디어가 동작하는 모습을 와이어프레임·목업 이미지 1장 이상으로 보여 주세요.',
      hasKeywords
        ? `비슷한 시도가 있다면 '${keywords[0]}' 부분만큼은 다르게 했다는 점을 한 문장으로 요약해 넣으세요.`
        : `비슷한 시도가 있다면 '${title}'만의 차이를 한 문장으로 요약해 넣으세요.`,
    ],
    judgePoints: [
      `주제 적합성 — 출품 공모전의 주제 문구와 '${title}'의 문제 정의를 같은 단어로 맞춰 주세요.`,
      '실현 가능성 — 3개월 안에 만들 수 있는 범위로 기능을 좁히고 1단계·2단계 계획을 제시하세요.',
      hasKeywords
        ? `기대 효과 — '${keywords[0]}'${josa(keywords[0], '와과')} 관련된 숫자(사용자 수·절감 시간 등)로 효과를 표현하세요.`
        : '기대 효과 — 사용자 수·절감 시간처럼 측정 가능한 숫자로 효과를 표현하세요.',
    ],
    extensionIdeas: [
      `${profile.approach}를 다른 분야(안전·교통·교육 등)에도 적용한 확장판을 옵션으로 제시해 보세요.`,
      '사용자 기록이 쌓일수록 유용해지는 데이터 기반 기능을 추가 아이디어로 붙이면 차별화됩니다.',
      '지역 단위 파일럿 → 전국 확산처럼 단계가 보이는 확장 로드맵을 덧붙여 보세요.',
    ],
  }
}

export function buildMockAnalysis(ideaInput) {
  return {
    similarCases: buildSimilarCases(ideaInput),
    contests: buildContests(ideaInput),
    detail: buildDetail(ideaInput),
  }
}
