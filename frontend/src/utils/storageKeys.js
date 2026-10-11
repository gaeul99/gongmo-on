// localStorage 키는 'idea-navigation:' 접두사 규칙을 따른다(AGENTS.md 규칙).
// 예전 'gongnabi:' 키로 저장된 값은 migrateLegacyKeys()가 앱 시작 때 한 번 새 키로 옮긴다.
export const STORAGE_KEYS = {
  typeTest: 'idea-navigation:type-test',
  seenContests: 'idea-navigation:seen-contests',
  chatKey: 'idea-navigation:chat-key',
}

const LEGACY_KEY_MAP = {
  'gongnabi:type-test': STORAGE_KEYS.typeTest,
  'gongnabi:seen-contests': STORAGE_KEYS.seenContests,
  'gongnabi:chat-key': STORAGE_KEYS.chatKey,
}

/** 앱 시작 때 한 번 호출한다. 예전 키의 값을 새 키로 옮기고 예전 키는 지운다. */
export function migrateLegacyKeys() {
  for (const [legacyKey, currentKey] of Object.entries(LEGACY_KEY_MAP)) {
    try {
      if (localStorage.getItem(currentKey) !== null) {
        localStorage.removeItem(legacyKey)
        continue
      }
      const raw = localStorage.getItem(legacyKey)
      if (raw !== null) {
        localStorage.setItem(currentKey, raw)
        localStorage.removeItem(legacyKey)
      }
    } catch {
      // 저장소 접근이 막힌 환경이면 조용히 건너뛴다(기존 각 유틸과 같은 정책).
    }
  }
}
