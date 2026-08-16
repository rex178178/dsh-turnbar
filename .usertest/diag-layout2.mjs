import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)))
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4500)
// 列侧栏标题
const titles = await page.evaluate(() => [...document.querySelectorAll('span.YDXeBa_title')].map(x => x.textContent.trim()).slice(0, 12))
console.log('titles:', JSON.stringify(titles))
// 展开 asset-tracker（如需要）
await page.evaluate(() => {
  const at = [...document.querySelectorAll('span.YDXeBa_title')].find(s => (s.textContent || '').trim() === 'asset-tracker')
  if (at) { const el = at.closest('button, [role="button"], div'); el?.click() }
})
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('展开其余'))
  if (b) b.click()
})
await page.waitForTimeout(1500)
// 打开一个长会话
const target = page.locator('span.YDXeBa_title', { hasText: '修复股市信号看板' }).first()
if (await target.count() > 0) {
  await target.click()
  await page.waitForTimeout(9000)
  const info = await page.evaluate(() => {
    const bar = document.querySelector('[data-turnbar]')
    if (!bar) return { found: false }
    const r = bar.getBoundingClientRect()
    const chain = []
    let el = bar
    for (let i = 0; i < 6 && el; i++) {
      const cr = el.getBoundingClientRect()
      chain.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)} w=${Math.round(cr.width)} h=${Math.round(cr.height)}`)
      el = el.parentElement
    }
    const siblings = []
    const parent = bar.parentElement
    if (parent) {
      for (const s of parent.children) {
        const sr = s.getBoundingClientRect()
        siblings.push(`${s.tagName}.${(s.className || '').toString().slice(0, 40)} w=${Math.round(sr.width)} h=${Math.round(sr.height)}`)
      }
    }
    return { found: true, barRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }, chain, siblings }
  })
  console.log(JSON.stringify(info, null, 1))
} else {
  console.log('session not found; titles were:', JSON.stringify(titles))
}
await browser.close()
