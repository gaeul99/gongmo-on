// ==========================================================
// 라우트 base 처리 (2026-10-23)
// 로컬 개발과 Render 단일 배포에서는 base가 '/'라서 이 모듈은 아무 일도
// 하지 않는다. GitHub Pages는 https://<계정>.github.io/<저장소>/ 하위
// 경로에 사이트가 뜨므로, 브라우저 실제 주소와 앱 논리 경로('/input' 같은
// 것) 사이에 base를 붙였다 뗐다 하는 일을 여기 한 곳에 모은다.
// base 값은 vite.config.ts가 VITE_BASE_PATH 환경변수로 정하고,
// import.meta.env.BASE_URL로 그 결과를 읽는다.
// ==========================================================

// 빌드 때 정해진 base — 항상 '/'로 끝난다('/' 또는 '/gongmo-on/').
const BASE = import.meta.env.BASE_URL

// 앱 논리 경로('/input', '/contest?status=upcoming')를 실제 브라우저 주소로
// 바꾼다. '/'로 시작하지 않는 값(외부 URL 등)은 그대로 돌려 준다.
export function hrefFor(path) {
  const value = String(path)
  if (!value.startsWith('/')) return value
  const [pathname, query = ''] = value.split('?')
  const stripped = pathname.replace(/^\//, '')
  return `${BASE}${stripped}${query ? `?${query}` : ''}`
}

// 현재 브라우저 주소를 앱 논리 경로로 되돌린다. base가 '/'면 주소 그대로다.
export function pathFromLocation() {
  const { pathname } = window.location
  if (BASE !== '/' && pathname.startsWith(BASE)) {
    return pathname.slice(BASE.length - 1)
  }
  return pathname
}
