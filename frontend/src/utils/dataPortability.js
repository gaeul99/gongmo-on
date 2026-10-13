// ==========================================================
// 데이터 내보내기·가져오기
// 응모·관심·보관함 데이터는 이 브라우저(localStorage)에만 저장되므로,
// JSON 파일로 내보내 다른 브라우저·기기에서 가져올 수 있게 합니다.
// 계정 정보(비밀번호 해시 포함)는 보안상 내보내기에서 제외합니다.
// ==========================================================

import { STORAGE_KEYS } from './storageKeys.js'

const KEYS = {
  myContests: 'gongmo-on:my-contests',
  wishlist: 'gongmo-on:wishlist',
  savedIdeas: 'gongmo-on:saved-ideas',
  typeTest: STORAGE_KEYS.typeTest,
  checklist: 'gongmo-on:submission-checklist',
  roadmaps: 'gongmo-on:roadmaps',
  practiceNotes: 'gongmo-on:practice-notes',
}

// 내보내기 형식 식별자 — 로그인 복원(서버에서 받은 데이터)도 같은 형식으로
// 병합하기 위해 밖에서 씁니다.
export const EXPORT_KIND = 'gongmo-on:export'
export const EXPORT_VERSION = 1

function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

function writeJson(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // 저장 실패 시에도 화면 동작에는 지장 없습니다.
  }
}

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** 현재 브라우저의 데이터를 내보내기용 JSON 객체로 만듭니다. */
export function buildExportPayload() {
  return {
    kind: EXPORT_KIND,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      myContests: readJson(KEYS.myContests, []),
      wishlist: readJson(KEYS.wishlist, []),
      savedIdeas: readJson(KEYS.savedIdeas, []),
      typeTest: readJson(KEYS.typeTest, null),
      checklist: readJson(KEYS.checklist, {}),
      roadmaps: readJson(KEYS.roadmaps, {}),
      practiceNotes: readJson(KEYS.practiceNotes, []),
    },
  }
}

/** 현재 브라우저의 데이터를 JSON 파일로 내려받습니다. */
export function downloadUserData() {
  const payload = buildExportPayload()
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `gongmo-on-data-${new Date().toISOString().slice(0, 10)}.json`
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

/**
 * 내보내기 파일과 현재 브라우저 데이터를 합칩니다. 기존 항목을 유지하고 없는 것만 추가합니다.
 * @param {any} raw 내보내기 파일의 파싱 결과
 * @returns {any} 병합 결과. 파일 형식이 올바르지 않으면 null.
 */
export function mergeImportedData(raw) {
  // 구버전 내보내기(kind 'idea-navigation:export')도 받아들인다 — 이름 변경 전 파일 호환.
  if (!isRecord(raw) || (raw.kind !== EXPORT_KIND && raw.kind !== 'idea-navigation:export')) return null
  const data = isRecord(raw.data) ? raw.data : {}

  const validContests = (list) =>
    Array.isArray(list)
      ? list.filter((item) => isRecord(item) && typeof item.id === 'number' && item.title)
      : []

  const mergeById = (imported, currentKey) => {
    const current = readJson(KEYS[currentKey], [])
    const merged = [...(Array.isArray(current) ? current : [])]
    for (const item of imported) {
      if (!merged.some((c) => isRecord(c) && c.id === item.id)) merged.push(item)
    }
    return merged
  }

  const mergeSaved = (imported, current) => {
    const sameIdea = (a, b) =>
      a.title === b.title && a.description === b.description && a.category === b.category
    const result = [...current]
    for (const item of imported) {
      const idx = result.findIndex((s) => isRecord(s) && sameIdea(s, item))
      if (idx === -1) {
        result.push(item)
      } else if (!result[idx].analysis && item.analysis) {
        result[idx] = { ...result[idx], analysis: item.analysis }
      }
    }
    return result
  }

  const importedSaved = (Array.isArray(data.savedIdeas) ? data.savedIdeas : []).filter(
    (item) => isRecord(item) && typeof item.title === 'string',
  )
  const currentSaved = readJson(KEYS.savedIdeas, [])
  const currentTypeTest = readJson(KEYS.typeTest, null)
  const currentChecklist = readJson(KEYS.checklist, {})
  const importedChecklist = isRecord(data.checklist) ? data.checklist : {}

  // 연습 노트 — id 기준으로 합칩니다(기존 노트 유지, 없는 것만 추가).
  const importedNotes = (Array.isArray(data.practiceNotes) ? data.practiceNotes : []).filter(
    (item) => isRecord(item) && typeof item.id !== 'undefined' && typeof item.title === 'string',
  )
  const currentNotes = readJson(KEYS.practiceNotes, [])
  const mergedNotes = [...(Array.isArray(currentNotes) ? currentNotes : [])]
  for (const note of importedNotes) {
    if (!mergedNotes.some((item) => isRecord(item) && item.id === note.id)) mergedNotes.push(note)
  }

  const checklist = {}
  for (const key of new Set([...Object.keys(currentChecklist), ...Object.keys(importedChecklist)])) {
    checklist[key] = Boolean(currentChecklist[key]) || Boolean(importedChecklist[key])
  }

  // 로드맵 — 공모전별 체크를 합칩니다(한 번이라도 체크했으면 유지).
  const currentRoadmaps = readJson(KEYS.roadmaps, {})
  const importedRoadmaps = isRecord(data.roadmaps) ? data.roadmaps : {}
  const roadmaps = {}
  for (const key of new Set([...Object.keys(currentRoadmaps), ...Object.keys(importedRoadmaps)])) {
    const cur = isRecord(currentRoadmaps[key]) ? currentRoadmaps[key] : {}
    const imp = isRecord(importedRoadmaps[key]) ? importedRoadmaps[key] : {}
    const curChecked = isRecord(cur.checked) ? cur.checked : {}
    const impChecked = isRecord(imp.checked) ? imp.checked : {}
    const checked = {}
    for (const task of new Set([...Object.keys(curChecked), ...Object.keys(impChecked)])) {
      checked[task] = Boolean(curChecked[task]) || Boolean(impChecked[task])
    }
    const stamps = [cur.updatedAt, imp.updatedAt].filter((v) => typeof v === 'string').sort()
    roadmaps[key] = { checked, updatedAt: stamps[stamps.length - 1] }
  }

  return {
    myContests: mergeById(validContests(data.myContests), 'myContests'),
    wishlist: mergeById(validContests(data.wishlist), 'wishlist'),
    savedIdeas: mergeSaved(importedSaved, Array.isArray(currentSaved) ? currentSaved : []),
    typeTest: data.typeTest !== undefined && data.typeTest !== null ? data.typeTest : currentTypeTest,
    checklist,
    roadmaps,
    practiceNotes: mergedNotes,
  }
}

/** 병합된 localStorage 전용 데이터(유형 검사·자가 점검·로드맵·연습 노트)를 저장합니다. */
export function writeLocalOnlyData(merged) {
  try {
    if (merged.typeTest !== null) {
      localStorage.setItem(KEYS.typeTest, JSON.stringify(merged.typeTest))
    }
    localStorage.setItem(KEYS.checklist, JSON.stringify(merged.checklist))
    localStorage.setItem(KEYS.roadmaps, JSON.stringify(merged.roadmaps))
    if (Array.isArray(merged.practiceNotes)) {
      localStorage.setItem(KEYS.practiceNotes, JSON.stringify(merged.practiceNotes))
    }
  } catch {
    // 저장 실패 시에도 화면 동작에는 지장 없습니다.
  }
}
