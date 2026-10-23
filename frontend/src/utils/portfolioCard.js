// ==========================================================
// 포트폴리오 카드 (2026-10-23)
// 대시보드 도전 히스토리를 공유용 이미지(PNG)로 그려 내려받게 한다.
// canvas에 직접 그린다 — 외부 라이브러리 없이, 1080×1350(4:5)으로
// SNS 게시물 비율에 맞춘다. 재료는 dashboard.js의 buildPortfolioModel.
// ==========================================================

const W = 1080
const H = 1350
const FONT = "'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"

// 카드 배경의 살짝 톤 다운된 회색 — 흰 카드는 패널만으로 구분한다.
const INK = '#111827'
const GRAY = '#6b7280'
const LINE = '#e5e7eb'

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// 이모지 없이 텍스트만으로 그린다 — 공모온 화면의 검정 강조 규칙을 그대로 쓴다.
function drawCard(ctx, model, now) {
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, W, H)

  // 상단 검정 밴드 — 화면의 검정 강조(--accent)와 같은 톤.
  ctx.fillStyle = INK
  ctx.fillRect(0, 0, W, 132)
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'alphabetic'
  ctx.font = `800 40px ${FONT}`
  ctx.fillText('공모온', 80, 84)
  ctx.font = `600 26px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText('포트폴리오 카드', W - 80, 82)
  ctx.textAlign = 'left'

  // 닉네임 헤드라인
  ctx.fillStyle = INK
  ctx.font = `800 54px ${FONT}`
  ctx.fillText(`${model.nickname}님의 도전`, 80, 268)

  // 통계 3열 — 누적 도전·수상·진행 중.
  const stats = [
    { label: '누적 도전', value: model.total },
    { label: '수상', value: model.won },
    { label: '진행 중', value: model.progress },
  ]
  stats.forEach((stat, index) => {
    const x = 80 + index * 320
    ctx.fillStyle = INK
    ctx.font = `800 84px ${FONT}`
    ctx.fillText(String(stat.value), x, 442)
    ctx.fillStyle = GRAY
    ctx.font = `600 26px ${FONT}`
    ctx.fillText(stat.label, x, 492)
  })

  // 구분선
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(80, 560)
  ctx.lineTo(W - 80, 560)
  ctx.stroke()

  // 도전한 분야 상위 3개를 칩으로.
  let cursorY = 636
  const topFields = (model.fields ?? []).slice(0, 3)
  if (topFields.length > 0) {
    ctx.fillStyle = GRAY
    ctx.font = `700 26px ${FONT}`
    ctx.fillText('도전한 분야', 80, cursorY)
    let chipX = 80
    const chipY = cursorY + 24
    for (const field of topFields) {
      const label = `${field.name} ${field.count}`
      ctx.font = `600 26px ${FONT}`
      const width = ctx.measureText(label).width + 44
      ctx.fillStyle = '#f3f4f6'
      roundRect(ctx, chipX, chipY, width, 56, 28)
      ctx.fill()
      ctx.fillStyle = INK
      ctx.fillText(label, chipX + 22, chipY + 38)
      chipX += width + 14
    }
    cursorY += 130
  }

  // 수상 이력 — 결과 기록이 있을 때만.
  const wonItems = model.wonItems ?? []
  if (wonItems.length > 0) {
    ctx.fillStyle = GRAY
    ctx.font = `700 26px ${FONT}`
    ctx.fillText('수상 이력', 80, cursorY)
    let itemY = cursorY + 56
    for (const item of wonItems) {
      ctx.fillStyle = INK
      ctx.font = `700 30px ${FONT}`
      const title = item.title.length > 30 ? `${item.title.slice(0, 29)}…` : item.title
      ctx.fillText(title, 80, itemY)
      ctx.fillStyle = GRAY
      ctx.font = `600 22px ${FONT}`
      ctx.fillText(item.resultAt ? `${item.resultAt} 기록` : '기록 대기', 80, itemY + 34)
      itemY += 96
    }
    cursorY = itemY
  }

  // 하단 — 기록일과 서비스 표기.
  ctx.fillStyle = GRAY
  ctx.font = `600 24px ${FONT}`
  const dateKey = `${now.getFullYear()}. ${now.getMonth() + 1}. ${now.getDate()}.`
  ctx.fillText(`${dateKey} 기준`, 80, H - 72)
  ctx.textAlign = 'right'
  ctx.fillText('공모온 · 공모전 도전 기록', W - 80, H - 72)
  ctx.textAlign = 'left'
}

// 카드 이미지를 PNG 파일로 내려받는다. 그릴 재료가 없으면 false.
export function downloadPortfolioCard(model, now = new Date()) {
  if (!model || !model.total) return false
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) return false
  drawCard(ctx, model, now)

  canvas.toBlob((blob) => {
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'gongmo-on-portfolio.png'
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 'image/png')
  return true
}
