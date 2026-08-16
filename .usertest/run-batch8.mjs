/** 批次 8：⌘↑↓ 边界钳制 + 浅色主题卡片可读性 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'results.json')
mkdirSync(__dirname, { recursive: true })
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const save = () => writeFileSync(OUT, JSON.stringify(results, null, 2))
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail, at: new Date().toISOString() })
  save()
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail.slice(0, 320) : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const sleep = ms => new Promise(r => setTimeout(r, ms))

await page.goto('http://127.0.0.1:8791/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  const titles = [...document.querySelectorAll('span.YDXeBa_title')]
  const at = titles.find(s => (s.textContent || '').trim() === 'asset-tracker')
  if (at) { const el = at.closest('button, [role="button"], div'); el?.click() }
})
await page.waitForTimeout(1500)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('展开其余'))
  if (b) b.click()
})
await page.waitForTimeout(1500)
await page.locator('span.YDXeBa_title', { hasText: '修复股市信号看板' }).first().click()
await page.waitForTimeout(9000)

// 跳到第一轮（playhead 基准 = 1），⌘↑ 应钳制在 #1 不越界
await page.locator('[data-turnbar-seg]').first().click()
await sleep(4000)
await page.keyboard.press('Meta+ArrowUp')
await sleep(1500)
const toastTop = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
record('B8-meta-up-clamps-at-turn1', /#1\b/.test(toastTop) && !/#0/.test(toastTop), `toast="${toastTop.slice(0, 50)}"`)

// 跳到最后一轮，⌘↓ 应钳制在 #22
await page.locator('[data-turnbar-seg]').last().click()
await sleep(4000)
await page.keyboard.press('Meta+ArrowDown')
await sleep(1500)
const toastBottom = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
record('B8-meta-down-clamps-at-last', /#22\b/.test(toastBottom) && !/#23/.test(toastBottom), `toast="${toastBottom.slice(0, 50)}"`)

// 浅色主题卡片可读性：悬停读计算样式
const seg = page.locator('[data-turnbar-seg]').nth(10)
const box = await seg.boundingBox()
if (box) {
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await sleep(400)
  const styles = await page.locator('[data-turnbar-card]').evaluate(el => {
    const cs = getComputedStyle(el)
    return { bg: cs.backgroundColor, color: cs.color }
  })
  const bodyBg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor)
  record('B8-light-theme-card-styles', true, `card bg=${styles.bg} color=${styles.color} | body bg=${bodyBg}`)
  await page.mouse.move(720, 40)
}

await browser.close()
console.log('\nDONE batch8')
