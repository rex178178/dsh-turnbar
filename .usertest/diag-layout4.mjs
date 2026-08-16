import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4500)
await page.locator('span.YDXeBa_title', { hasText: '收到' }).first().click()
await page.waitForTimeout(7000)

const experiments = {
  'A: flex-basis 100% (独占一行, wrap 期望)': `
    [data-turnbar] { flex-basis: 100% !important; }
    /* 父容器尝试 wrap 的替代：绝对定位铺满 */
  `,
  'B: absolute 铺满 (相对 composerSeat)': `
    [data-turnbar] { position: absolute !important; left: 8px !important; right: 8px !important; width: auto !important; top: auto !important; }
  `,
  'C: min-width 100% (溢出挤走兄弟)': `
    [data-turnbar] { flex: 1 1 auto !important; min-width: 100% !important; }
  `,
}

for (const [name, css] of Object.entries(experiments)) {
  await page.evaluate((css) => {
    const style = document.createElement('style')
    style.id = 'layout-test'
    style.textContent = css
    document.getElementById('layout-test')?.remove()
    document.head.appendChild(style)
  }, css)
  await page.waitForTimeout(400)
  const r = await page.evaluate(() => {
    const bar = document.querySelector('[data-turnbar]')
    const sib1 = bar?.parentElement?.firstElementChild
    const barR = bar?.getBoundingClientRect()
    const sibR = sib1?.getBoundingClientRect()
    return {
      bar: barR ? { w: Math.round(barR.width), h: Math.round(barR.height), y: Math.round(barR.y) } : null,
      sib1: sibR ? { cls: (sib1.className || '').toString().slice(0, 24), w: Math.round(sibR.width) } : null,
      segs: document.querySelectorAll('[data-turnbar-seg]').length,
    }
  })
  console.log(name, '→', JSON.stringify(r))
}
// 清理测试样式
await page.evaluate(() => document.getElementById('layout-test')?.remove())
await browser.close()
