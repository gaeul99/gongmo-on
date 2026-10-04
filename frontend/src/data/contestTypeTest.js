// 공모전에서 빛나는 방식에 따라 유형을 찾아 주는 짧은 자가 진단입니다.
// 심리 진단이 아닌 아이디어·공모전 선택을 위한 재미있는 참고 결과입니다.

// 총 24문항. 각 선택지는 한 유형에 2점, 관련 유형에 1점을 줍니다.
export const TYPE_TEST_QUESTIONS = [
  {
    id: 'spark',
    question: '새로운 아이디어가 떠오르는 순간은 언제인가요?',
    options: [
      { text: '불편한 점을 발견하고 해결 방법을 상상할 때', scores: { solver: 2, civic: 1 } },
      { text: '새로운 기술이나 도구를 만났을 때', scores: { explorer: 2, maker: 1 } },
      { text: '사람들의 이야기와 감정에 공감할 때', scores: { storyteller: 2, connector: 1 } },
      { text: '멋진 장면이나 이미지를 보았을 때', scores: { creator: 2, storyteller: 1 } },
    ],
  },
  {
    id: 'first-step',
    question: '공모전 공고를 처음 봤을 때 가장 먼저 확인하는 것은?',
    options: [
      { text: '해결해야 하는 사회 문제와 목표', scores: { civic: 2, solver: 1 } },
      { text: '제출 형식과 결과물의 기술적 조건', scores: { maker: 2, explorer: 1 } },
      { text: '참신함과 표현의 자유도', scores: { creator: 2, storyteller: 1 } },
      { text: '팀을 꾸릴 수 있는지와 사람들의 반응', scores: { connector: 2, civic: 1 } },
    ],
  },
  {
    id: 'role',
    question: '팀 프로젝트에서 자연스럽게 맡는 역할은?',
    options: [
      { text: '문제를 쪼개고 실행 계획을 세우는 사람', scores: { solver: 2, maker: 1 } },
      { text: '자료를 찾고 새로운 방법을 실험하는 사람', scores: { explorer: 2, solver: 1 } },
      { text: '이야기를 만들고 발표를 준비하는 사람', scores: { storyteller: 2, connector: 1 } },
      { text: '비주얼을 만들고 결과물을 다듬는 사람', scores: { creator: 2, maker: 1 } },
    ],
  },
  {
    id: 'impact',
    question: '내 아이디어가 어떤 변화를 만들면 가장 뿌듯할까요?',
    options: [
      { text: '누군가의 불편한 일상이 실제로 편해지는 것', scores: { solver: 2, civic: 1 } },
      { text: '전에 없던 방식으로 새로운 가능성을 여는 것', scores: { explorer: 2, creator: 1 } },
      { text: '많은 사람이 공감하고 이야기를 나누는 것', scores: { storyteller: 2, connector: 1 } },
      { text: '지역이나 공동체가 더 따뜻해지는 것', scores: { civic: 2, connector: 1 } },
    ],
  },
  {
    id: 'material',
    question: '아이디어를 발전시킬 때 가장 잘하는 것은?',
    options: [
      { text: '사용자의 입장에서 문제를 구체화하기', scores: { solver: 2, connector: 1 } },
      { text: '데이터와 사례를 찾아 근거 만들기', scores: { explorer: 2, civic: 1 } },
      { text: '기억에 남는 문장과 콘셉트 만들기', scores: { storyteller: 2, creator: 1 } },
      { text: '직접 만들고 테스트하며 완성도 높이기', scores: { maker: 2, creator: 1 } },
    ],
  },
  {
    id: 'deadline',
    question: '마감이 다가올수록 나는 어떻게 움직이나요?',
    options: [
      { text: '할 일을 나눠 차근차근 끝낸다', scores: { solver: 2, maker: 1 } },
      { text: '마지막까지 새로운 아이디어를 더 찾아본다', scores: { explorer: 2, creator: 1 } },
      { text: '팀원들과 분위기를 북돋우며 함께 달린다', scores: { connector: 2, storyteller: 1 } },
      { text: '핵심 메시지와 표현을 날카롭게 다듬는다', scores: { creator: 2, storyteller: 1 } },
    ],
  },
  {
    id: 'field',
    question: '다음 중 가장 관심이 가는 주제는?',
    options: [
      { text: '환경과 지속 가능한 생활', scores: { civic: 2, solver: 1 } },
      { text: 'AI·데이터·디지털 기술', scores: { explorer: 2, maker: 1 } },
      { text: '교육·복지·지역 공동체', scores: { connector: 2, civic: 1 } },
      { text: '문화·콘텐츠·브랜드 경험', scores: { creator: 2, storyteller: 1 } },
    ],
  },
  {
    id: 'output',
    question: '만들고 싶은 공모전 결과물은 무엇에 가깝나요?',
    options: [
      { text: '구체적인 정책이나 서비스 제안서', scores: { solver: 2, civic: 1 } },
      { text: '작동하는 앱·프로토타입·데이터 시각화', scores: { maker: 2, explorer: 1 } },
      { text: '영상·캠페인·사람을 움직이는 콘텐츠', scores: { storyteller: 2, connector: 1 } },
      { text: '포스터·제품·새로운 시각 디자인', scores: { creator: 2, maker: 1 } },
    ],
  },
  {
    id: 'motivation',
    question: '공모전에 도전하는 가장 큰 이유는?',
    options: [
      { text: '내가 발견한 문제를 세상에 알리고 싶어서', scores: { civic: 2, storyteller: 1 } },
      { text: '새로운 것을 배우고 직접 실험하고 싶어서', scores: { explorer: 2, maker: 1 } },
      { text: '사람들과 함께 좋은 결과를 만들고 싶어서', scores: { connector: 2, solver: 1 } },
      { text: '내 감각과 아이디어를 작품으로 보여주고 싶어서', scores: { creator: 2, storyteller: 1 } },
    ],
  },
  {
    id: 'obstacle',
    question: '아이디어가 도중에 막혔을 때 나는?',
    options: [
      { text: '아직 시도하지 않은 다른 방법을 찾아 본다', scores: { explorer: 2, solver: 1 } },
      { text: '일단 만들어 보면서 답을 찾는다', scores: { maker: 2, solver: 1 } },
      { text: '사람들에게 이야기하며 힌트를 얻는다', scores: { connector: 2, storyteller: 1 } },
      { text: '풀려는 문제 자체를 다시 정의한다', scores: { solver: 2, civic: 1 } },
    ],
  },
  {
    id: 'review',
    question: '출품작이 시상됐다면 심사평 중 가장 듣고 싶은 말은?',
    options: [
      { text: '문제 정의가 명확하고 실현 가능하다', scores: { solver: 2, civic: 1 } },
      { text: '직접 만든 결과물의 완성도가 높다', scores: { maker: 2, creator: 1 } },
      { text: '메시지가 보는 사람의 마음에 와닿는다', scores: { storyteller: 2, connector: 1 } },
      { text: '아무도 시도하지 않은 방식의 도전이다', scores: { explorer: 2, creator: 1 } },
    ],
  },
  {
    id: 'next-level',
    question: '다음 공모전에 완승하려면 무엇이 가장 필요할까요?',
    options: [
      { text: '더 단단한 데이터와 근거', scores: { explorer: 2, civic: 1 } },
      { text: '더 완성도 높은 시제품', scores: { maker: 2, solver: 1 } },
      { text: '더 많은 사람의 목소리와 참여', scores: { connector: 2, storyteller: 1 } },
      { text: '더 새로운 표현과 콘셉트', scores: { creator: 2, storyteller: 1 } },
    ],
  },
  {
    id: 'environment',
    question: '작업할 때 나를 가장 잘 움직이게 하는 환경은?',
    options: [
      { text: '문제 하나에 집중할 수 있는 조용한 곳', scores: { solver: 2, explorer: 1 } },
      { text: '자료와 도구를 마음껏 쓸 수 있는 곳', scores: { explorer: 2, maker: 1 } },
      { text: '사람들과 이야기가 오가는 활기찬 곳', scores: { connector: 2, storyteller: 1 } },
      { text: '나만의 감각에 몰입할 수 있는 곳', scores: { creator: 2, storyteller: 1 } },
    ],
  },
  {
    id: 'news',
    question: '세상 뉴스 중 눈길이 가는 것은?',
    options: [
      { text: '일상을 바꾸는 새 정책·제도', scores: { civic: 2, solver: 1 } },
      { text: '신기술과 새 서비스 출시 소식', scores: { explorer: 2, maker: 1 } },
      { text: '사람들의 반응과 화제가 된 콘텐츠', scores: { storyteller: 2, connector: 1 } },
      { text: '디자인·문화 트렌드', scores: { creator: 2, storyteller: 1 } },
    ],
  },
  {
    id: 'helper',
    question: '친구가 고민을 상담해 왔다. 나의 첫 마디는?',
    options: [
      { text: '"문제를 하나씩 쪼개서 순서를 정해 보자"', scores: { solver: 2, maker: 1 } },
      { text: '"비슷한 사례를 찾아서 참고해 보자"', scores: { explorer: 2, civic: 1 } },
      { text: '"네 이야기가 사람들에게 전해지게 해 보자"', scores: { storyteller: 2, connector: 1 } },
      { text: '"그 마음, 같이 있어 줄게"', scores: { connector: 2, civic: 1 } },
    ],
  },
  {
    id: 'role-model',
    question: '성공한 공모전 참가자의 모습은 어떤 모습일까요?',
    options: [
      { text: '문제를 발견하고 제안으로 연결하는 사람', scores: { solver: 2, civic: 1 } },
      { text: '새 도구를 먼저 익히고 응용하는 사람', scores: { explorer: 2, maker: 1 } },
      { text: '직접 만들어 결과물로 보여 주는 사람', scores: { maker: 2, creator: 1 } },
      { text: '사람들의 마음을 움직인 사람', scores: { storyteller: 2, connector: 1 } },
    ],
  },
  {
    id: 'compliment',
    question: '주변에서 가장 자주 듣는 나의 장점은?',
    options: [
      { text: '"책임감이 있어서 믿을 만해"', scores: { civic: 2, solver: 1 } },
      { text: '"호기심이 많아서 같이 있으면 재밌어"', scores: { explorer: 2, creator: 1 } },
      { text: '"손이 빠르고 결과물이 좋아"', scores: { maker: 2, solver: 1 } },
      { text: '"경청을 잘해서 너랑 있으면 편안해"', scores: { connector: 2, storyteller: 1 } },
    ],
  },
  {
    id: 'failure',
    question: '출품했는데 떨어졌다. 나의 반응은?',
    options: [
      { text: '어디가 아쉬웠는지 뼈저리게 분석한다', scores: { explorer: 2, solver: 1 } },
      { text: '다음엔 더 잘 만들어서 보여 주겠다', scores: { maker: 2, creator: 1 } },
      { text: '내 이야기가 전달 안 된 건가 되돌아본다', scores: { storyteller: 2, connector: 1 } },
      { text: '내가 푼 문제가 틀렸던 건가 다시 본다', scores: { solver: 2, civic: 1 } },
    ],
  },
  {
    id: 'new-tool',
    question: '새로운 도구·앱이 나왔을 때 나는?',
    options: [
      { text: '"이걸로 무슨 문제를 풀 수 있을까?"', scores: { solver: 2, explorer: 1 } },
      { text: '일단 설치해서 만져 본다', scores: { maker: 2, explorer: 1 } },
      { text: '"이걸로 사람들과 무슨 놀이를 할까?"', scores: { connector: 2, storyteller: 1 } },
      { text: '화면이 예쁜지 자세히 뜯어본다', scores: { creator: 2, maker: 1 } },
    ],
  },
  {
    id: 'conflict',
    question: '팀원과 의견이 갈렸을 때 나는?',
    options: [
      { text: '"기준을 정해서 객관적으로 비교하자"', scores: { explorer: 2, civic: 1 } },
      { text: '"각자 작은 시제품을 만들어 보고 골라자"', scores: { maker: 2, solver: 1 } },
      { text: '"서로의 의도를 먼저 이야기해 보자"', scores: { connector: 2, storyteller: 1 } },
      { text: '"주제 취지에 더 맞는 쪽으로 가자"', scores: { civic: 2, solver: 1 } },
    ],
  },
  {
    id: 'first-action',
    question: '반짝이는 아이디어가 생겼다. 첫 행동은?',
    options: [
      { text: '문제 상황과 해결 방법을 글로 정리한다', scores: { solver: 2, civic: 1 } },
      { text: '관련 기술과 사례를 검색한다', scores: { explorer: 2, maker: 1 } },
      { text: '바로 스케치부터 해 본다', scores: { maker: 2, creator: 1 } },
      { text: '친구에게 먼저 이야기해 반응을 본다', scores: { connector: 2, storyteller: 1 } },
    ],
  },
  {
    id: 'prize',
    question: '공모전 상금을 받았다. 가장 뿌듯한 사용처는?',
    options: [
      { text: '문제 해결에 도움 될 도구·강의에 투자', scores: { solver: 2, explorer: 1 } },
      { text: '더 좋은 장비·재료로 업그레이드', scores: { maker: 2, creator: 1 } },
      { text: '함께한 사람들과의 기념 모임', scores: { connector: 2, storyteller: 1 } },
      { text: '다음 작품을 위한 나만의 작업 공간', scores: { creator: 2, maker: 1 } },
    ],
  },
  {
    id: 'advice',
    question: '친구가 공모전에 도전한다며 조언을 구한다. 나의 조언은?',
    options: [
      { text: '"네가 아픈 문제부터 찾아 봐, 그게 주제야"', scores: { solver: 2, civic: 1 } },
      { text: '"요즘 새로 나온 도구부터 익혀 봐"', scores: { explorer: 2, maker: 1 } },
      { text: '"작게라도 일단 만들어서 보여 줘"', scores: { maker: 2, solver: 1 } },
      { text: '"네 이야기가 담긴 결과물을 만들어"', scores: { storyteller: 2, creator: 1 } },
    ],
  },
  {
    id: 'self-time',
    question: '혼자만의 시간에 즐기는 것은?',
    options: [
      { text: '일상 속 불편함을 관찰하며 개선안 상상', scores: { solver: 2, civic: 1 } },
      { text: '새로운 기술 영상·아티클 정독', scores: { explorer: 2, maker: 1 } },
      { text: '그림·사진·영상 감상', scores: { creator: 2, storyteller: 1 } },
      { text: '사람들과의 추억 사진 정리', scores: { connector: 2, civic: 1 } },
    ],
  },
]

// 결과 유형 6개. keywords는 접수 중 공모전(mockData.js의 contests)의 제목·분야에서
// 추천 후보를 뽑을 때 쓰는 단어이고, primaryCategory는 '이 유형으로 분석 시작'을 눌렀을 때
// 입력 화면의 관심 분야로 미리 채워지는 값(입력 화면 CATEGORIES 중 하나)입니다.
export const CONTEST_TYPES = {
  solver: {
    id: 'solver',
    name: '문제 해결형',
    emoji: '🧩',
    tagline: '불편함을 발견하면 해결책으로 바꾸는 사람',
    description:
      '일상의 문제를 구체적으로 정의하고, 실행 가능한 서비스나 제안으로 바꾸는 데 강해요.',
    tip: '제안형 공모전은 "누가·언제·어떻게"가 명확할수록 유리해요. 해결 대상과 실행 계획을 구체적으로 적어 보세요.',
    strengths: [
      '문제를 정확히 정의하는 능력 — 심사위원이 "아 이런 문제였지"라고 납득하게 만들어요',
      '현실적인 해결책으로 연결하는 구성력 — 막연한 아이디어를 실행 가능한 제안으로 바꿔요',
      '근거를 깔아 논리적으로 설득하는 전개력 — 왜 이 해결책인지 순서대로 보여 줘요',
    ],
    watchouts: [
      '진지하게만 흘러 신선함이 부족해 보일 수 있어요. 사례를 뒤집는 반전 한 장을 준비해 보세요',
      '현실 검토에 시간을 쓰다 출발이 늦어지기 쉬워요. 초안을 먼저 쓰고 다듬는 순서로 가세요',
    ],
    teamRole: '문제를 정의하고 방향을 잡는 기획 앵커',
    roadmap: [
      '일상에서 불편한 순간 3가지를 메모장에 기록해요',
      '그중 가장 많은 사람이 겪는 문제 하나를 고르고, 겪는 사람을 구체적으로 그려요',
      '이미 있는 해결책 2~3가지를 조사해 "이것과 다른 점"을 한 줄씩 적어요',
      '누가·언제·어떻게 쓰는지 한 페이지 제안으로 정리해요',
    ],
    synergy: {
      typeId: 'connector',
      reason: '사람들의 목소리를 모아 주는 공감 연결형과 만나면, 문제 정의가 생활 밀착형으로 완성돼요.',
    },
    keywords: ['아이디어', '정책', '서비스', '생활'],
    primaryCategory: '생활',
  },
  explorer: {
    id: 'explorer',
    name: '기술 탐험형',
    emoji: '🔭',
    tagline: '새로운 기술로 가능성의 지도를 넓히는 사람',
    description: 'AI·데이터·디지털 도구를 빠르게 탐색하고, 전에 없던 방식으로 문제를 풀어내요.',
    tip: 'AI·데이터 공모전은 아이디어의 "적용 대상"을 한 명의 사용자로 좁히면 참신함이 살아나요.',
    strengths: [
      '새로운 도구·기술을 빠르게 익히는 학습력 — 남들이 주저할 때 이미 써 봐요',
      '기술을 주제에 접목하는 응용력 — "이걸로 무엇을 할 수 있지"를 화면으로 보여 줘요',
      '최신 트렌드를 담아내는 콘셉트 감각 — 지금 심사위원이 궁금해할 것을 앞서 가져와요',
    ],
    watchouts: [
      '기술 소개에 치우쳐 "왜 이 문제인가"가 약해질 수 있어요. 문제 한 장, 기술 한 장 비율을 지켜 보세요',
      '도구 탐색이 길어져 마감 직전에 몰아치는 리스크가 있어요. 탐색에 시간 제한을 걸어 두세요',
    ],
    teamRole: '최신 기술과 도구를 끌어오는 스카우터',
    roadmap: [
      '관심 주제에 최근 쓰인 기술·도구 2가지를 조사해 비교해요',
      '둘 중 우리 주제에 더 맞는 것을 고르고, "왜 이것인가"를 두 문장으로 적어요',
      '작은 실험이나 시연 화면을 먼저 만들어 가능한지 확인해요',
      '"이 기술 없이는 안 되는 이유"를 한 문장으로 다듬어 결과물 첫 페이지에 넣어요',
    ],
    synergy: {
      typeId: 'maker',
      reason: '바로 만들어 보는 실행 제작형과 만나면 탐험한 기술이 시연 가능한 결과물이 돼요.',
    },
    keywords: ['AI', '데이터', '디지털', '기술'],
    primaryCategory: '기타',
  },
  maker: {
    id: 'maker',
    name: '실행 제작형',
    emoji: '🛠️',
    tagline: '생각을 손으로 옮겨 바로 만들어 보는 사람',
    description:
      '아이디어를 빠르게 앱·프로토타입·시제품으로 구현해, 말이 아니라 결과물로 증명하는 데 강해요.',
    tip: '창업·서비스 공모전은 완성도보다 "작동하는 것"이 먼저예요. 핵심 기능 하나만 확실히 만들어 보세요.',
    strengths: [
      '생각을 빠르게 결과물로 바꾸는 실행력 — 아이디어가 종이에 머물지 않아요',
      '완성도를 끌어올리는 다듬기 근성 — 마감 전 마지막 수정을 미루지 않아요',
      '작동하는 것으로 증명하는 설득력 — "만들 수 있다"를 보여 주기 때문에 신뢰가 생겨요',
    ],
    watchouts: [
      '만들다 보니 문제 정의와 기획 문서가 성의 없어질 수 있어요. 심사위원은 결과물보다 먼저 기획서를 읽어요',
      '기능을 늘리다 핵심 하나가 옅어지는 과욕을 조심하세요. 잘 되는 것 하나가 낫습니다',
    ],
    teamRole: '아이디어를 실물로 만들어 내는 엔진',
    roadmap: [
      '출품 결과물의 핵심 기능을 딱 하나 정해요',
      '종이에 화면 흐름을 스케치하고 흐름이 자연스러운지 확인해요',
      '가장 거친 프로토타입을 하루 안에 만들어 움직이게 해요',
      '친구에게 한 번 써 보게 하고 멈춘 지점을 기록해 고쳐요',
    ],
    synergy: {
      typeId: 'creator',
      reason: '비주얼로 마무리하는 감각 창작형과 만나면 프로토타입이 출품작 수준의 인상이 돼요.',
    },
    keywords: ['창업', '경영', '외식', '애플리케이션', '경제'],
    primaryCategory: '생활',
  },
  storyteller: {
    id: 'storyteller',
    name: '이야기 설계형',
    emoji: '✍️',
    tagline: '아이디어에 마음을 움직이는 이야기를 입히는 사람',
    description: '복잡한 메시지를 누구나 이해하고 공감할 수 있는 콘텐츠와 캠페인으로 만들어요.',
    tip: '영상·콘텐츠 공모전은 처음 몇 초가 승부예요. 주제를 단순한 장면 하나로 압축해 보세요.',
    strengths: [
      '감정을 끌어내는 카피와 연출력 — 보는 사람의 마음을 먼저 움직여요',
      '기승전결이 살아 있는 구성력 — 복잡한 주제도 이야기로 쉽게 풀어요',
      '사람의 입으로 퍼지는 메시징 — 출품이 끝나도 회자되는 작품을 만들어요',
    ],
    watchouts: [
      '이야기가 길어져 주제 전달이 흐려질 수 있어요. 지우고도 의미가 남는 장면만 남기세요',
      '메시지는 좋은데 데이터·근거가 비어 보일 수 있어요. 숫자 한 줄이면 탄탄해져요',
    ],
    teamRole: '메시지를 만들고 전달하는 목소리',
    roadmap: [
      '전하고 싶은 메시지를 한 문장으로 압축해요',
      '첫 3초를 사로잡을 장면 하나를 정해요',
      '기승전결 4컷으로 이야기 뼈대를 세워요',
      '타깃에게 보여 주고 "전달됐는지"를 물어보고 다듬어요',
    ],
    synergy: {
      typeId: 'creator',
      reason: '비주얼로 말하는 감각 창작형과 만나면 좋은 이야기가 기억에 남는 작품이 돼요.',
    },
    keywords: ['콘텐츠', '영상', '캠페인', '문화'],
    primaryCategory: '기타',
  },
  creator: {
    id: 'creator',
    name: '감각 창작형',
    emoji: '🎨',
    tagline: '새로운 시선과 표현으로 장면을 만드는 사람',
    description: '남들과 다른 콘셉트와 시각 언어로 아이디어를 눈에 보이는 결과물로 완성해요.',
    tip: '디자인·사진 공모전은 주제 해석이 점수를 가릅니다. 출품 전에 평가 기준을 꼼꼼히 확인하세요.',
    strengths: [
      '첫인상을 만드는 비주얼 감각 — 화면에 머무는 시간을 늘려요',
      '디테일을 끝까지 다듬는 완성도 — 여백과 정렬에서 차이가 나요',
      '분위기를 담는 색감·여백 활용 — 주제의 온도를 눈으로 전해요',
    ],
    watchouts: [
      '예쁜데 말이 없는 결과물이 되기 쉬워요. 한 문장이라도 메시지를 심어 주세요',
      '표현에 달려가 주제 해석이 얕아질 수 있어요. 해석 한 줄을 먼저 쓰고 시작하세요',
    ],
    teamRole: '결과물의 인상을 책임지는 디렉터',
    roadmap: [
      '주제를 나만의 언어로 한 문장 해석해 적어요',
      '톤이 맞는 레퍼런스 3장을 모아 색·구도를 정해요',
      '초안을 빠르게 깔고, 여백과 정렬부터 다듬어요',
      '작게 축소했을 때도 읽히는지 확인하고 제출해요',
    ],
    synergy: {
      typeId: 'storyteller',
      reason: '메시지를 설계하는 이야기 설계형과 만나면 예쁜 작품이 기억에 남는 작품이 돼요.',
    },
    keywords: ['디자인', '미술', '사진', '제품'],
    primaryCategory: '기타',
  },
  connector: {
    id: 'connector',
    name: '공감 연결형',
    emoji: '🤝',
    tagline: '사람과 사람 사이에 더 나은 변화를 연결하는 사람',
    description: '사람들의 목소리를 듣고, 함께 참여할 수 있는 따뜻한 아이디어를 만들어요.',
    tip: '교육·복지 공모전은 현장의 목소리가 근거가 됩니다. 인터뷰나 설문 한 줄이면 설득력이 달라져요.',
    strengths: [
      '사람들의 목소리를 모으는 경청력 — 현장에서 나온 말이 최고의 근거가 돼요',
      '서로 다른 입장을 잇는 중재력 — 이해관계가 얽힌 주제를 잘 풀어요',
      '참여를 이끌어 내는 설득력 — 아이디어에 사람이 모여요',
    ],
    watchouts: [
      '모두의 의견을 맞추려다 방향이 늦게 잡힐 수 있어요. 절반은 듣고 절반은 결정하세요',
      '공감 중심이라 수치·근거가 약해 보일 수 있어요. 설문 결과 한 장을 곁들이세요',
    ],
    teamRole: '사람과 사람을 잇는 다리',
    roadmap: [
      '도움이 필요한 사람 한 명을 구체적으로 떠올려요 (이름까지 붙여 보세요)',
      '그 사람의 하루를 따라가며 불편한 지점을 기록해요',
      '이미 있는 지원 제도를 조사하고 비어 있는 틈을 찾아요',
      '사람들이 참여할 방법을 결과물에 꼭 담아요',
    ],
    synergy: {
      typeId: 'solver',
      reason: '문제를 정의하는 문제 해결형과 만나면 공감이 실현 가능한 제안이 돼요.',
    },
    keywords: ['복지', '교육', '지역', '참여'],
    primaryCategory: '복지',
  },
  civic: {
    id: 'civic',
    name: '사회 변화형',
    emoji: '🌱',
    tagline: '작은 제안으로 더 나은 사회의 방향을 만드는 사람',
    description: '공공의 문제를 자신의 일처럼 바라보고, 지속 가능한 변화를 제안하는 데 강해요.',
    tip: '정책·환경 공모전은 실제 사례와 비교하면 제안이 단단해져요. 유사 사례 분석으로 차별점을 찾아 보세요.',
    strengths: [
      '공공·사회 이슈를 읽는 안목 — 주제의 무게를 정확히 짚어요',
      '지속가능한 관점으로 제안하는 기획력 — 끝나지 않는 효과를 설계해요',
      '더 나은 사회를 상상하는 비전 — 심사위원의 마음을 움직여요',
    ],
    watchouts: [
      '이슈가 커서 실현 가능성이 옅어 보일 수 있어요. 작은 지역 한 곳으로 좁혀 보세요',
      '비전 설명이 길어지기 쉬워요. 첫 페이지에 "첫걸음 한 가지"를 먼저 보여 주세요',
    ],
    teamRole: '주제의 방향과 무게를 정하는 나침반',
    roadmap: [
      '관심 있는 사회 이슈를 하나 좁혀요 (환경·교통·복지 중에서)',
      '그 이슈로 고통받는 구체적인 집단과 장소를 정해요',
      '지자체·기관의 기존 대책을 조사해 빈틈을 찾아요',
      '작게라도 실현 가능한 첫걸음을 제안서 첫 장에 담아요',
    ],
    synergy: {
      typeId: 'explorer',
      reason: '새로운 기술을 찾아 오는 기술 탐험형과 만나면 사회 이슈에 신선한 해법이 더해져요.',
    },
    keywords: ['환경', '공공', '정책', '지속가능'],
    primaryCategory: '환경',
  },
}

// answers: 질문 순서대로 고른 선택지 번호(0부터) 배열. 부분 응답이어도 계산됩니다.
// percentage는 결과 유형의 성향 일치율(%) — 한 문항에서 한 유형이 받을 수 있는 최대 2점,
// 즉 전체 문항수 × 2점을 100% 기준으로 환산한 값입니다.
export function calculateContestType(answers) {
  const scores = Object.keys(CONTEST_TYPES).reduce((result, id) => {
    result[id] = 0
    return result
  }, {})

  answers.forEach((answerIndex, questionIndex) => {
    const option = TYPE_TEST_QUESTIONS[questionIndex]?.options[answerIndex]
    if (!option) return
    Object.entries(option.scores).forEach(([id, score]) => {
      scores[id] += score
    })
  })

  const maxScore = TYPE_TEST_QUESTIONS.length * 2
  const percentOf = (score) => Math.round((score / maxScore) * 100)
  const sorted = Object.entries(scores).sort(([, a], [, b]) => b - a)
  const distribution = sorted.map(([id, score]) => ({ id, score, percent: percentOf(score) }))
  return {
    type: CONTEST_TYPES[sorted[0][0]],
    scores,
    percentage: percentOf(scores[sorted[0][0]]),
    distribution,
  }
}

// 유형 키워드로 접수 중 공모전을 골라 마감이 가까운 순으로 추천합니다.
// 후보가 부족하면 나머지 공모전으로 채워 항상 limit개를 돌려줍니다.
export function recommendContestsForType(typeId, contests, limit = 3) {
  const type = CONTEST_TYPES[typeId]
  if (!type) return []
  const matched = []
  const rest = []
  for (const contest of contests) {
    const haystack = `${contest.title} ${contest.field}`.toLowerCase()
    const isMatch = type.keywords.some((keyword) => haystack.includes(keyword.toLowerCase()))
    ;(isMatch ? matched : rest).push(contest)
  }
  const byDeadline = (a, b) => (a.deadline < b.deadline ? -1 : a.deadline > b.deadline ? 1 : 0)
  matched.sort(byDeadline)
  rest.sort(byDeadline)
  return [...matched, ...rest].slice(0, limit)
}
