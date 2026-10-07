// ==========================================================
// 출품 로드맵
// 찜·응모한 공모전마다 5단계 출품 경로(주제 분석 → … → 제출)를 만들고,
// 마감까지 남은 기간을 단계별 비중으로 나눠 권장 완료일을 붙입니다.
// 단계 체크는 'idea-navigation:roadmaps'에 저장됩니다.
// ==========================================================

const ROADMAP_STORAGE_KEY = 'idea-navigation:roadmaps'
const DAY_MS = 24 * 60 * 60 * 1000

// 로드맵 5단계. weight는 마감까지 남은 기간을 나누는 비중(합계 1)으로,
// 결과물 제작이 가장 길고 제출 확인이 가장 짧습니다.
export const ROADMAP_STAGES = [
  {
    id: 'research',
    label: '주제 분석',
    weight: 0.15,
    tasks: [
      '공고를 읽고 심사 기준·제출 형식을 정리해요',
      '유사 사례 2개를 찾아 내 아이디어와 비교해요',
      '타깃과 문제를 한 문장으로 정의해요',
    ],
  },
  {
    id: 'idea',
    label: '아이디어 확정',
    weight: 0.2,
    tasks: [
      '핵심 기능을 딱 하나로 좁혀요',
      '분석 결과의 심사 포인트를 방향에 반영해요',
      '혼자라면 범위를 줄이고, 팀이면 역할을 정해요',
    ],
  },
  {
    id: 'plan',
    label: '기획서 작성',
    weight: 0.25,
    tasks: [
      '문제—해결—기대효과 순으로 초안을 써요',
      '심사 기준 항목마다 근거를 한 줄씩 채워요',
      '다른 사람에게 읽히고 어색한 문단을 고쳐요',
    ],
  },
  {
    id: 'build',
    label: '결과물 제작',
    weight: 0.3,
    tasks: [
      '프로토타입·영상·보드 중 결과물 형태를 정해요',
      '제출 양식·분량에 맞춰 다듬어요',
      '완성 전날에는 1차 완성본을 확정해요',
    ],
  },
  {
    id: 'submit',
    label: '제출·확인',
    weight: 0.1,
    tasks: [
      '파일·링크·이름표를 최종 점검해요',
      '접수 완료 화면을 캡처해 두어요',
      '마감 하루 전에 제출해 여유를 남겨요',
    ],
  },
]

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function readState() {
  try {
    const raw = localStorage.getItem(ROADMAP_STORAGE_KEY)
    const parsed = raw ? JSON.parse(raw) : null
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function writeState(state) {
  try {
    localStorage.setItem(ROADMAP_STORAGE_KEY, JSON.stringify(state))
  } catch {
    // 저장 실패 시에도 화면 동작에는 지장 없습니다.
  }
}

/** 한 공모전의 체크 상태. { 'research-0': true, … } 형태의 객체를 돌려줍니다. */
export function loadRoadmapChecks(contestId) {
  const entry = readState()[String(contestId)]
  const checked = isRecord(entry) && isRecord(entry.checked) ? entry.checked : {}
  return { ...checked }
}

/** 한 공모전의 체크 상태를 저장합니다. */
export function saveRoadmapChecks(contestId, checked) {
  const state = readState()
  state[String(contestId)] = { checked: { ...checked }, updatedAt: new Date().toISOString() }
  writeState(state)
}

function startOfDay(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

function formatDue(date) {
  return `${date.getMonth() + 1}.${String(date.getDate()).padStart(2, '0')}`
}

// 공모전 하나의 로드맵 뷰를 만듭니다. checked는 loadRoadmapChecks의 결과입니다.
// 마감까지 남은 기간을 단계 weight대로 나눠 각 단계의 권장 완료일을 정합니다.
/**
 * @param {{ id: number|string, deadline: string }} contest
 * @param {Record<string, boolean>} checked
 * @param {Date} [now]
 */
export function buildRoadmap(contest, checked = {}, now = new Date()) {
  const today = startOfDay(now)
  const deadline = new Date(`${contest.deadline}T00:00:00`)
  const leftMs = Number.isNaN(deadline.getTime()) ? 0 : deadline.getTime() - today.getTime()
  const leftDays = Math.round(leftMs / DAY_MS)

  // 남은 기간을 비중대로 나눠 단계별 기한을 쌓아 갑니다. 마감이 지났으면 기한 없음.
  let cursor = today.getTime()
  let total = 0
  let done = 0
  const stages = ROADMAP_STAGES.map((stage, stageIndex) => {
    const due = leftMs > 0 ? new Date(cursor + Math.round(leftMs * stage.weight)) : null
    if (due) cursor = due.getTime()
    const tasks = stage.tasks.map((text, taskIndex) => {
      const key = `${stage.id}-${taskIndex}`
      const isDone = Boolean(checked[key])
      total += 1
      if (isDone) done += 1
      return { key, text, done: isDone }
    })
    const stageDone = tasks.every((task) => task.done)
    const duePast = due !== null && due.getTime() < today.getTime()
    return {
      id: stage.id,
      label: stage.label,
      stageIndex,
      // 권장 완료일 — 남은 기간을 단계 비중대로 나눈 날짜
      dueLabel: due ? formatDue(due) : null,
      overdue: !stageDone && duePast,
      tasks,
      stageDone,
    }
  })

  const firstOpenStage = stages.find((stage) => !stage.stageDone)
  return {
    stages,
    total,
    done,
    percent: total === 0 ? 0 : Math.round((done / total) * 100),
    leftDays,
    // 지금 할 일 — 아직 안 한 첫 번째 작업. 전부 끝냈으면 null.
    next: firstOpenStage
      ? {
          stageLabel: firstOpenStage.label,
          text: firstOpenStage.tasks.find((task) => !task.done)?.text ?? '',
        }
      : null,
  }
}
