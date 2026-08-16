import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', e => console.log('PAGEERROR:', String(e).slice(0, 150)))
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)
const info = await page.evaluate(() => {
  const bar = document.querySelector('[data-turnbar]')
  if (!bar) return { found: false }
  const r = bar.getBoundingClientRect()
  // 父链
  const chain = []
  let el = bar
  for (let i = 0; i < 6 && el; i++) {
    const cr = el.getBoundingClientRect()
    chain.push(`${el.tagName}.${(el.className || '').toString().slice(0, 40)} w=${Math.round(cr.width)} h=${Math.round(cr.height)}`)
    el = el.parentElement
  }
  // bar 的兄弟元素（同父级）
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
await browser.close()
