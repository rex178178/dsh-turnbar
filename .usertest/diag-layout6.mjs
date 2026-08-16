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
  const cs = bar ? getComputedStyle(bar) : null
  const pcs = p ? getComputedStyle(p) : null
  return {
    barStyle: cs ? { width: cs.width, maxWidth: cs.maxWidth, flex: cs.flex, flexBasis: cs.flexBasis, flexGrow: cs.flexGrow, flexShrink: cs.flexShrink, paddingLeft: cs.paddingLeft, paddingRight: cs.paddingRight, boxSizing: cs.boxSizing } : null,
    parentStyle: pcs ? { width: pcs.width, display: pcs.display, flexWrap: pcs.flexWrap, paddingLeft: pcs.paddingLeft, paddingRight: pcs.paddingRight, boxSizing: pcs.boxSizing } : null,
    parentRect: p ? { w: Math.round(p.getBoundingClientRect().width) } : null,
    barRect: bar ? { w: Math.round(bar.getBoundingClientRect().width) } : null,
  }
})
console.log(JSON.stringify(r, null, 1))
await browser.close()
