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
function buildContests({ title, category }) {
  const profile = getProfile(category)
  const fieldMatch = (contest) =>
    Boolean(category) &&
    (contest.field === category || contest.field.startsWith(`${category} `))

  return [...contests]
    .sort((a, b) => Number(fieldMatch(b)) - Number(fieldMatch(a)))
    .map((contest) => {
      let matchReason
      if (fieldMatch(contest)) {
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
      return { ...contest, matchReason }
    })
}

export function buildMockAnalysis(ideaInput) {
  return {
    similarCases: buildSimilarCases(ideaInput),
    contests: buildContests(ideaInput),
  }
}
