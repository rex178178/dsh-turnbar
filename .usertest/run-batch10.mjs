/** 修正版：⌘↑/⌘↓ 边界钳制（检查 .visible 与文案） */
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

// 到第一轮，等 toast 过期
await page.locator('[data-turnbar-seg]').first().click()
await sleep(6500)
const visBeforeUp = await page.locator('[data-turnbar-toast].visible').count()
await page.keyboard.press('Meta+ArrowUp')
await sleep(1500)
const upVisible = await page.locator('[data-turnbar-toast].visible').count()
const upText = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
record('B10-meta-up-clamp', (upVisible === 0) || (upVisible === 1 && /#1/.test(upText) && !/#0/.test(upText)),
  `beforeVis=${visBeforeUp} afterVis=${upVisible} text="${upText.slice(0, 40)}"`)

// 到最后一轮，等 toast 过期
await page.locator('[data-turnbar-seg]').last().click()
await sleep(6500)
await page.keyboard.press('Meta+ArrowDown')
await sleep(1500)
const downVisible = await page.locator('[data-turnbar-toast].visible').count()
const downText = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
record('B10-meta-down-clamp', (downVisible === 0) || (downVisible === 1 && /#22/.test(downText) && !/#23/.test(downText)),
  `afterVis=${downVisible} text="${downText.slice(0, 40)}"`)

await browser.close()
console.log('\nDONE batch10')
