// localStorage·sessionStorage 키는 'gongmo-on:' 접두사 규칙을 따른다(AGENTS.md 규칙).
// 예전 접두사 키('idea-navigation:', 더 옛날 'gongnabi:')는 migrateLegacyKeys()가
// 앱 시작 때 한 번 새 키로 옮긴다.
export const STORAGE_KEYS = {
  typeTest: 'gongmo-on:type-test',
  seenContests: 'gongmo-on:seen-contests',
}

// 예전 'idea-navigation:' 키 → 새 'gongmo-on:' 키.
// 아래쪽의 더 옛날 'gongnabi:' 항목보다 먼저 처리해, 최신 세대 값이 이기게 한다.
const LEGACY_KEY_MAP = {
  'idea-navigation:user': 'gongmo-on:user',
  'idea-navigation:auth-token': 'gongmo-on:auth-token',
  'idea-navigation:my-contests': 'gongmo-on:my-contests',
  'idea-navigation:wishlist': 'gongmo-on:wishlist',
  'idea-navigation:saved-ideas': 'gongmo-on:saved-ideas',
  'idea-navigation:notif-opt-in': 'gongmo-on:notif-opt-in',
  'idea-navigation:submission-checklist': 'gongmo-on:submission-checklist',
  'idea-navigation:roadmaps': 'gongmo-on:roadmaps',
  'idea-navigation:practice-notes': 'gongmo-on:practice-notes',
  'idea-navigation:type-test-progress': 'gongmo-on:type-test-progress',
  'idea-navigation:dismissed-alerts': 'gongmo-on:dismissed-alerts',
  'idea-navigation:alerts-seen': 'gongmo-on:alerts-seen',
  'idea-navigation:type-test': STORAGE_KEYS.typeTest,
  'idea-navigation:seen-contests': STORAGE_KEYS.seenContests,
  'gongnabi:type-test': STORAGE_KEYS.typeTest,
  'gongnabi:seen-contests': STORAGE_KEYS.seenContests,
}

// 아이디어·분석 스냅숏은 세션 저장소에 보관된다 — 같은 규칙으로 옮긴다.
const LEGACY_SESSION_KEY_MAP = {
  'idea-navigation:idea': 'gongmo-on:idea',
  'idea-navigation:analysis': 'gongmo-on:analysis',
}

function migrateKey(storage, legacyKey, currentKey) {
  try {
    if (storage.getItem(currentKey) !== null) {
      // 새 키가 이미 있으면(더 최신 상태) 예전 키만 지운다.
      storage.removeItem(legacyKey)
      return
    }
    const raw = storage.getItem(legacyKey)
    if (raw !== null) {
      storage.setItem(currentKey, raw)
      storage.removeItem(legacyKey)
    }
  } catch {
    // 저장소 접근이 막힌 환경이면 조용히 건너뛴다(기존 각 유틸과 같은 정책).
  }
}

/** 앱 시작 때 한 번 호출한다. 예전 키의 값을 새 키로 옮기고 예전 키는 지운다. */
export function migrateLegacyKeys() {
  for (const [legacyKey, currentKey] of Object.entries(LEGACY_KEY_MAP)) {
    migrateKey(localStorage, legacyKey, currentKey)
  }
  for (const [legacyKey, currentKey] of Object.entries(LEGACY_SESSION_KEY_MAP)) {
    migrateKey(sessionStorage, legacyKey, currentKey)
  }
}
