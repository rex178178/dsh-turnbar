/** 批次 4：Esc 双响应（面板+toast）/ 点击段 #3 的翻页竞态 / 纯工具轮 flash 正确采样 */
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

const flashTurn = () => page.evaluate(() => {
  const flow = document.querySelector('[data-chat-flow]')
  const flash = document.querySelector('[data-turnbar-flash]')
  if (!flow || !flash) return null
  const tails = [...flow.querySelectorAll('[data-turn-tail]')]
  for (const t of tails) {
    if (t.getBoundingClientRect().top > flash.getBoundingClientRect().top + 5) return t.getAttribute('data-turn-tail')
  }
  return null
})
const scrollerTop = () => page.evaluate(() => {
  const flow = document.querySelector('[data-chat-flow]')
  let n = flow
  while (n) {
    const s = getComputedStyle(n)
    if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop
    n = n.parentElement
  }
  return -1
})

async function openSession () {
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
}

// ── 竞态复现：全新会话中直接点击段 #3（目标轮需要翻页） ─────────────────────
await openSession()
const t0 = Date.now()
await page.locator('[data-turnbar-seg]').nth(2).click()
// 轮询 flash 归属（2.5s 窗口内）
let ft3 = null
const t1 = Date.now()
while (Date.now() - t1 < 4000 && ft3 === null) { ft3 = await flashTurn(); await sleep(150) }
const dt3 = ((Date.now() - t0) / 1000).toFixed(1)
record('B4-click-seg3-lands-turn-3', ft3 === '3', `flash afterTail=${ft3} took=${dt3}s`)

// ── Esc 双响应：面板打开 + toast 可见时按 Esc ────────────────────────────────
const posA = await scrollerTop()
await page.locator('[data-turnbar-seg]').nth(10).click() // 跳 #11 → toast
await sleep(1500)
const posB = await scrollerTop()
await page.keyboard.press('Meta+k') // 开面板（toast 仍可见）
await sleep(400)
const panelOpen = await page.locator('[data-turnbar-search].visible').count()
await page.keyboard.press('Escape') // 意图：关面板
await sleep(600)
const panelClosed = await page.locator('[data-turnbar-search].visible').count()
const posC = await scrollerTop()
record('B4-esc-closes-panel-only', panelOpen === 1 && panelClosed === 0,
  `panel ${panelOpen}->${panelClosed}`)
record('B4-esc-does-not-also-return-scroll', Math.abs(posC - posB) < 5,
  `posA=${posA} posB(jump)=${posB} posC(esc)=${posC}`)
const toastGone = await page.locator('[data-turnbar-toast].visible').count()
record('B4-esc-panel-does-not-kill-toast', toastGone === 1, `toastVisible=${toastGone}`)

// ── 纯工具轮 #4 跳转：早期采样 flash ────────────────────────────────────────
await page.locator('[data-turnbar-seg]').nth(3).click()
let ft4 = null
const t4 = Date.now()
while (Date.now() - t4 < 3500 && ft4 === null) { ft4 = await flashTurn(); await sleep(120) }
record('B4-jump-to-tool-turn-4-flash', ft4 === '3' || ft4 === '5', `flash afterTail=${ft4}`)

await browser.close()
console.log('\nDONE batch4')
