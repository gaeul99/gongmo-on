import type { MouseEvent, ReactNode } from 'react'
import { hrefFor } from '../utils/routes.js'

type Props = {
  // 브라우저가 실제로 이동할 주소. 우클릭 메뉴의 '새 탭에서 열기'·가운데
  // 클릭·Ctrl+클릭은 이 주소로 브라우저가 직접 처리합니다.
  href: string
  className?: string
  title?: string
  ariaLabel?: string
  // 마키 복제 카드처럼 탭 이동에서 빼야 할 때 -1을 넘깁니다.
  tabIndex?: number
  children: ReactNode
  // 일반 클릭(같은 탭에서 여는 화면 전환)으로 열 때 실행할 이동 처리.
  onNavigate: () => void
}

// 앱 안 페이지로 연결되는 진짜 링크(<a href>). 버튼은 우클릭해도 브라우저
// 메뉴에 '새 탭에서 열기'가 없어서, 페이지로 이동하는 자리는 이 컴포넌트를
// 씁니다. 일반 클릭만 가로채 History API 라우팅으로 전환하고, 꾸민 클릭
// (새 탭·새 창)과 가운데 클릭은 브라우저가 링크 주소로 처리하게 둡니다.
function AppLink({
  href,
  className,
  title,
  ariaLabel,
  tabIndex,
  children,
  onNavigate,
}: Props) {
  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.button !== 0) return
    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return
    event.preventDefault()
    onNavigate()
  }

  return (
    <a
      // 논리 경로에 base를 붙여 실제 주소로 — Pages 하위 경로 배포 대응(2026-10-23)
      href={hrefFor(href)}
      className={className ? `app-link ${className}` : 'app-link'}
      title={title}
      aria-label={ariaLabel}
      tabIndex={tabIndex}
      onClick={handleClick}
    >
      {children}
    </a>
  )
}

export default AppLink
