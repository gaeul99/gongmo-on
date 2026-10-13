// ==========================================================
// 공모전 동기화 파서 점검용 스크립트 (실행: npx ts-node --transpile-only ...)
// 실제 사이트에서 목록·상세를 읽어 파서 출력을 JSON으로 덤프한다.
// 상태 파일은 건드리지 않는다.
// ==========================================================

import fs from 'fs'
import path from 'path'
import {
  collectContestKorea,
  collectWevity,
  parseCkDetail,
  parseWevityDetail,
  type Candidate,
} from '../services/contestSync'

const OUT_DIR = path.resolve(process.env.TEMP ?? '/tmp', 'helpycode', 'contest-scrape')

function dump(name: string, value: unknown) {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  const file = path.join(OUT_DIR, name)
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, 'utf-8')
  console.log(`dumped: ${file}`)
}

async function main() {
  const [ck, wevity] = await Promise.all([
    collectContestKorea(),
    collectWevity(),
  ])
  console.log(`ck candidates: ${ck.length}, wevity candidates: ${wevity.length}`)

  const preview = (items: Candidate[]) =>
    items.slice(0, 4).map(({ source, sourceId, title, category, organizer, eligibility, datesText, dday, image, url }) => ({
      source,
      sourceId,
      title,
      category,
      organizer,
      eligibility,
      datesText,
      dday,
      image: image ? '<image>' : undefined,
      url,
    }))
  dump('dry-candidates.json', { ck: preview(ck), wevity: preview(wevity) })

  const ckSample = ck[0]
  if (ckSample) {
    const html = await fetch(ckSample.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 GongmoOnContestSync/1.0' },
    }).then((r) => r.text())
    dump('dry-ck-detail.json', { url: ckSample.url, parsed: parseCkDetail(html) })
  }

  const wevitySample = wevity[0]
  if (wevitySample) {
    const html = await fetch(wevitySample.url, {
      headers: { 'User-Agent': 'Mozilla/5.0 GongmoOnContestSync/1.0' },
    }).then((r) => r.text())
    dump('dry-wevity-detail.json', { url: wevitySample.url, parsed: parseWevityDetail(html) })
  }
}

main().catch((error) => {
  console.error('dry run failed:', error)
  process.exit(1)
})
