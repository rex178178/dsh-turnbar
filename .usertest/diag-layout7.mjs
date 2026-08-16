import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4500)
await page.locator('span.YDXeBa_title', { hasText: '收到' }).first().click()
await page.waitForTimeout(7000)
const r = await page.evaluate(() => {
  const bar = document.querySelector('[data-turnbar]')
  const p = bar?.parentElement
  if (!bar || !p) return null
  p.style.flexWrap = 'wrap'
  bar.style.flex = '0 0 100%'
  bar.style.boxSizing = 'border-box'
  bar.style.padding = '3px 8px'
  const cs = getComputedStyle(bar)
  const br = bar.getBoundingClientRect()
  const pcs = getComputedStyle(p); const pr = p.getBoundingClientRect()
  const siblings = [...p.children].map(c => {
    const cr = c.getBoundingClientRect()
    return `${(c.className || '').toString().slice(0, 20)} w=${Math.round(cr.width)} y=${Math.round(cr.y)}`
  })
  return {
    barRect: { w: Math.round(br.width), h: Math.round(br.height), y: Math.round(br.y) },
    parentRect: { w: Math.round(pr.width), h: Math.round(pr.height), gap: pcs.gap, columnGap: pcs.columnGap, paddingLeft: pcs.paddingLeft, paddingRight: pcs.paddingRight },
    computed: { width: cs.width, flexBasis: cs.flexBasis, flexGrow: cs.flexGrow, flexShrink: cs.flexShrink, maxWidth: cs.maxWidth, marginLeft: cs.marginLeft, marginRight: cs.marginRight },
    siblings,
  }
})
console.log(JSON.stringify(r, null, 1))
await browser.close()
