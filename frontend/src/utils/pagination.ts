// 페이지가 많을 때 번호 버튼이 패널 박스를 벗어나지 않게 번호를 골라 주는 유틸.
// 양끝(1·마지막)과 현재 주변만 남기고 사이는 'gap'으로 생략한다 — 1 … 4 5 6 … 52.
// 대시보드 Pager·공모전 탐색·분석 결과 화면의 페이지 넘김이 함께 쓴다.

export type PageItem = number | 'gap'

export function pageItems(page: number, pages: number): PageItem[] {
  if (pages <= 7) return Array.from({ length: pages }, (_, index) => index + 1)
  let start = Math.max(2, page - 1)
  let end = Math.min(pages - 1, page + 1)
  // 현재 쪽이 끝쪽에 가까우면 창을 끝에 붙여 마지막 번호들이 이어지게 한다
  if (page <= 3) end = Math.min(pages - 1, 4)
  if (page >= pages - 2) start = Math.max(2, pages - 3)
  const items: PageItem[] = [1]
  if (start > 2) items.push('gap')
  for (let num = start; num <= end; num += 1) items.push(num)
  if (end < pages - 1) items.push('gap')
  items.push(pages)
  return items
}
