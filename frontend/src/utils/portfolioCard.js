// ==========================================================
// 포트폴리오 카드 (2026-10-23, 같은 해 10-26 리디자인)
// 대시보드 도전 히스토리를 공유용 이미지(PNG)로 그려 내려받게 한다.
// canvas에 직접 그린다 — 외부 라이브러리 없이, 1080×1350(4:5)으로
// SNS 게시물 비율에 맞춘다. 재료는 dashboard.js의 buildPortfolioModel.
//
// 10-26 리디자인: 프레임 카드 구성(밝은 바탕 + 흰 카드), 수상률 통계,
// 응모 기간, 최근 도전 목록을 더해 '저장해 둘 가치'를 높였다(사용자 요청).
// ==========================================================

const W = 1080
const H = 1350
const FONT = "'Noto Sans KR', 'Malgun Gothic', 'Apple SD Gothic Neo', sans-serif"

// 화면의 검정 강조(--accent)와 같은 톤. 카드 바탕은 살짝 톤 다운한 회색,
// 본문은 흰 카드로 구분한다.
const INK = '#111827'
const GRAY = '#6b7280'
const LINE = '#e5e7eb'
const CHIP_BG = '#f3f4f6'
const FRAME_BG = '#eef0f3'

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath()
  ctx.moveTo(x + r, y)
  ctx.arcTo(x + w, y, x + w, y + h, r)
  ctx.arcTo(x + w, y + h, x, y + h, r)
  ctx.arcTo(x, y + h, x, y, r)
  ctx.arcTo(x, y, x + w, y, r)
  ctx.closePath()
}

// "2026-10-12 14:30"·"2026. 10. 12." 같은 표기가 섞여도 연·월·일만 골라
// 카드용 "2026. 10. 12."로 통일한다. 못 찾으면 앞 10자만 쓴다.
function formatDate(value) {
  const match = String(value ?? '').match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/)
  if (match) return `${match[1]}. ${Number(match[2])}. ${Number(match[3])}.`
  return String(value ?? '').slice(0, 10)
}

function truncate(ctx, text, maxWidth) {
  const raw = String(text ?? '')
  if (ctx.measureText(raw).width <= maxWidth) return raw
  let cut = raw.length
  while (cut > 1 && ctx.measureText(`${raw.slice(0, cut - 1)}…`).width > maxWidth) cut -= 1
  return `${raw.slice(0, Math.max(1, cut - 1))}…`
}

// 상태 칩 — 진행 중(회색)·수상(검정 반전)·탈락(흰 바탕 테두리).
function drawStatusChip(ctx, result, x, y) {
  const label = result === 'won' ? '수상' : result === 'lost' ? '탈락' : '진행 중'
  ctx.font = `700 22px ${FONT}`
  const width = ctx.measureText(label).width + 36
  const height = 40
  if (result === 'won') {
    ctx.fillStyle = INK
    roundRect(ctx, x, y, width, height, 20)
    ctx.fill()
    ctx.fillStyle = '#ffffff'
  } else if (result === 'lost') {
    ctx.fillStyle = '#ffffff'
    ctx.strokeStyle = LINE
    ctx.lineWidth = 2
    roundRect(ctx, x, y, width, height, 20)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = GRAY
  } else {
    ctx.fillStyle = CHIP_BG
    roundRect(ctx, x, y, width, height, 20)
    ctx.fill()
    ctx.fillStyle = INK
  }
  ctx.textAlign = 'center'
  ctx.fillText(label, x + width / 2, y + 28)
  ctx.textAlign = 'left'
  return width
}

// 분야 칩 한 줄을 그리고, 넘치면 다음 줄로 내려 그린다. 끝난 뒤의 y를 돌려준다.
function drawFieldChips(ctx, fields, x, y, maxWidth) {
  let chipX = x
  let rowY = y
  for (const field of fields) {
    const label = `${field.name} ${field.count}`
    ctx.font = `600 26px ${FONT}`
    const width = ctx.measureText(label).width + 44
    if (chipX + width > x + maxWidth) {
      chipX = x
      rowY += 72
    }
    ctx.fillStyle = CHIP_BG
    roundRect(ctx, chipX, rowY, width, 56, 28)
    ctx.fill()
    ctx.fillStyle = INK
    ctx.fillText(label, chipX + 22, rowY + 38)
    chipX += width + 14
  }
  return rowY + 56
}

// 섹션 제목(회색 굵은 글씨)을 찍고 다음 y를 돌려준다.
function drawSectionLabel(ctx, label, y) {
  ctx.fillStyle = GRAY
  ctx.font = `700 26px ${FONT}`
  ctx.fillText(label, 64, y)
  return y + 52
}

function drawCard(ctx, model, now) {
  // 바탕(프레임) + 흰 카드 — 이미지 자체가 '카드 한 장'으로 읽히게 한다.
  ctx.fillStyle = FRAME_BG
  ctx.fillRect(0, 0, W, H)
  ctx.fillStyle = '#ffffff'
  roundRect(ctx, 24, 24, W - 48, H - 48, 36)
  ctx.fill()
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  roundRect(ctx, 24, 24, W - 48, H - 48, 36)
  ctx.stroke()

  ctx.textBaseline = 'alphabetic'

  // 브랜드 필 + 카드 이름
  ctx.fillStyle = INK
  roundRect(ctx, 64, 64, 148, 64, 32)
  ctx.fill()
  ctx.fillStyle = '#ffffff'
  ctx.font = `800 30px ${FONT}`
  ctx.textAlign = 'center'
  ctx.fillText('공모온', 64 + 74, 106)
  ctx.textAlign = 'left'
  ctx.fillStyle = GRAY
  ctx.font = `600 24px ${FONT}`
  ctx.textAlign = 'right'
  ctx.fillText('포트폴리오 카드', W - 64, 102)
  ctx.textAlign = 'left'

  // 헤드라인 + 응모 기간
  ctx.fillStyle = INK
  ctx.font = `800 54px ${FONT}`
  ctx.fillText(`${model.nickname}님의 도전 기록`, 64, 240)
  ctx.fillStyle = GRAY
  ctx.font = `600 26px ${FONT}`
  const periodText = model.period
    ? `응모 기간 ${formatDate(model.period.from)} ~ ${formatDate(model.period.to)} · 총 ${model.total}회`
    : `총 ${model.total}회 응모`
  ctx.fillText(truncate(ctx, periodText, W - 128), 64, 292)

  // 통계 4열 — 누적 도전·수상·진행 중·수상률(결과 확정분 기준).
  const stats = [
    { label: '누적 도전', value: String(model.total) },
    { label: '수상', value: String(model.won) },
    { label: '진행 중', value: String(model.progress) },
    { label: '수상률', value: model.winRate === null ? '—' : `${model.winRate}%` },
  ]
  const statLeft = 64
  const statWidth = (W - 128) / 4
  stats.forEach((stat, index) => {
    const x = statLeft + index * statWidth
    ctx.fillStyle = INK
    ctx.font = `800 76px ${FONT}`
    ctx.fillText(stat.value, x, 438)
    ctx.fillStyle = GRAY
    ctx.font = `600 24px ${FONT}`
    ctx.fillText(stat.label, x, 486)
    if (index > 0) {
      ctx.strokeStyle = LINE
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x - 28, 372)
      ctx.lineTo(x - 28, 492)
      ctx.stroke()
    }
  })

  let cursorY = 576
  ctx.strokeStyle = LINE
  ctx.lineWidth = 2
  ctx.beginPath()
  ctx.moveTo(64, cursorY)
  ctx.lineTo(W - 64, cursorY)
  ctx.stroke()

  // 도전한 분야 — 상위 4개를 칩으로.
  const topFields = (model.fields ?? []).slice(0, 4)
  if (topFields.length > 0) {
    cursorY = drawSectionLabel(ctx, '도전한 분야', cursorY + 56)
    cursorY = drawFieldChips(ctx, topFields, 64, cursorY + 4, W - 128) + 40
  }

  // 수상 이력 — 최대 2건. 칩 + 제목 + 기록일.
  const wonItems = model.wonItems ?? []
  if (wonItems.length > 0) {
    cursorY = drawSectionLabel(ctx, '수상 이력', cursorY + 16)
    for (const item of wonItems) {
      ctx.fillStyle = INK
      ctx.font = `700 30px ${FONT}`
      ctx.fillText(truncate(ctx, item.title, W - 300), 64, cursorY + 22)
      ctx.fillStyle = GRAY
      ctx.font = `600 22px ${FONT}`
      ctx.textAlign = 'right'
      ctx.fillText(item.resultAt ? `${formatDate(item.resultAt)} 기록` : '기록 대기', W - 64, cursorY + 22)
      ctx.textAlign = 'left'
      cursorY += 72
    }
  }

  // 최근 도전 — 최대 3건. 상태 칩 + 제목 + 응모일. 제목을 찍기 전에 항목 하나라도
  // 들어갈 공간이 있는지 먼저 본다 — 공간이 없으면 제목만 남는 실수를 막는다.
  const recentItems = model.recentItems ?? []
  if (recentItems.length > 0 && cursorY + 52 + 72 <= H - 132) {
    cursorY = drawSectionLabel(ctx, '최근 도전', cursorY + 40)
    for (const item of recentItems) {
      if (cursorY + 72 > H - 132) break
      const chipWidth = drawStatusChip(ctx, item.result, 64, cursorY)
      ctx.fillStyle = INK
      ctx.font = `700 28px ${FONT}`
      ctx.fillText(truncate(ctx, item.title, W - 420), 64 + chipWidth + 18, cursorY + 28)
      ctx.fillStyle = GRAY
      ctx.font = `600 22px ${FONT}`
      ctx.textAlign = 'right'
      ctx.fillText(item.appliedAt ? formatDate(item.appliedAt) : '', W - 64, cursorY + 28)
      ctx.textAlign = 'left'
      cursorY += 72
    }
  }

  // 하단 — 기록일과 서비스 표기.
  ctx.fillStyle = GRAY
  ctx.font = `600 24px ${FONT}`
  const dateKey = `${now.getFullYear()}. ${now.getMonth() + 1}. ${now.getDate()}.`
  ctx.fillText(`${dateKey} 기준`, 64, H - 88)
  ctx.textAlign = 'right'
  ctx.fillText('공모온 · 공모전 도전 기록', W - 64, H - 88)
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
    const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    link.download = `gongmo-on-portfolio-${stamp}.png`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }, 'image/png')
  return true
}
