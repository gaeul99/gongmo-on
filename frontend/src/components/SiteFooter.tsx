import './SiteFooter.css'

// 모든 화면 맨 아래에서 문의 이메일을 안내하는 공통 푸터입니다.
function SiteFooter() {
  return (
    <footer className="site-footer">
      <p className="site-footer-lead">공내비에 문의할 일이 있나요?</p>
      <div className="site-footer-actions">
        <a className="site-footer-mail-button" href="mailto:rkf111122@gmail.com">
          문의하기
        </a>
        <span className="site-footer-email">rkf111122@gmail.com</span>
      </div>
      <p className="site-footer-copy">© 2026 공내비 · 아이디어 분석과 공모전 추천</p>
    </footer>
  )
}

export default SiteFooter
