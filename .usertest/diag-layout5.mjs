import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4500)
await page.locator('span.YDXeBa_title', { hasText: '收到' }).first().click()
await page.waitForTimeout(7000)

// 方案 D：父容器 flex-wrap: wrap + turnbar flex-basis 100%
await page.evaluate(() => {
  const bar = document.querySelector('[data-turnbar]')
  const p = bar?.parentElement
  if (p) {
    p.style.flexWrap = 'wrap'
    p.style.alignItems = 'center'
  }
  const s = document.createElement('style')
  s.id = 't'
  s.textContent = '[data-turnbar] { flex: 0 0 100% !important; }'
  document.head.appendChild(s)
})
await page.waitForTimeout(500)
const r1 = await page.evaluate(() => {
  const bar = document.querySelector('[data-turnbar]')
  const p = bar?.parentElement
  const barR = bar?.getBoundingClientRect()
  const kids = p ? [...p.children].map(c => {
    const cr = c.getBoundingClientRect()
    return `${(c.className || '').toString().slice(0, 22)} w=${Math.round(cr.width)} y=${Math.round(cr.y)}`
  }) : []
  return { bar: barR ? { w: Math.round(barR.width), h: Math.round(barR.height), y: Math.round(barR.y) } : null, kids, parentH: p ? Math.round(p.getBoundingClientRect().height) : null }
})
console.log('D (wrap):', JSON.stringify(r1, null, 1))
await browser.close()
