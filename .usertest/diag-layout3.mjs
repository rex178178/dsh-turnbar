import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)))
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text().slice(0, 150)) })
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4500)
// 直接点"收到"会话（3 轮）
for (const name of ['收到', '继续']) {
  const t = page.locator('span.YDXeBa_title', { hasText: name }).first()
  if (await t.count() > 0) {
    await t.click()
    await page.waitForTimeout(7000)
    const info = await page.evaluate(() => {
      const bar = document.querySelector('[data-turnbar]')
      if (!bar) return { found: false, session: document.title }
      const r = bar.getBoundingClientRect()
      const chain = []
      let el = bar
      for (let i = 0; i < 8 && el; i++) {
        const cr = el.getBoundingClientRect()
        chain.push(`${el.tagName}.${(el.className || '').toString().slice(0, 44)} w=${Math.round(cr.width)} h=${Math.round(cr.height)}`)
        el = el.parentElement
      }
      const siblings = []
      const parent = bar.parentElement
      if (parent) {
        for (const s of parent.children) {
          const sr = s.getBoundingClientRect()
          siblings.push(`${s.tagName}.${(s.className || '').toString().slice(0, 44)} w=${Math.round(sr.width)} h=${Math.round(sr.height)}`)
        }
      }
      return {
        found: true,
        barRect: { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) },
        chain, siblings,
        segments: document.querySelectorAll('[data-turnbar-seg]').length,
      }
    })
    console.log(`[${name}]`, JSON.stringify(info, null, 1))
    break
  }
}
await browser.close()
