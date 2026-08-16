/** 批次 5：竞态复现率统计（搜索跳 #3 ×4 次）+ Esc 双动作变体（焦点在 body） */
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
  // 重试：侧栏状态可能因上次会话而不同（项目已展开/折叠、按钮文案变化）
  for (let attempt = 0; attempt < 3; attempt++) {
    await page.evaluate(() => {
      const titles = [...document.querySelectorAll('span.YDXeBa_title')]
      const at = titles.find(s => (s.textContent || '').trim() === 'asset-tracker')
      if (at) { const el = at.closest('button, [role="button"], div'); el?.click() }
    })
    await page.waitForTimeout(1000)
    await page.evaluate(() => {
      const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('展开其余'))
      if (b) b.click()
    })
    await page.waitForTimeout(1000)
    const title = page.locator('span.YDXeBa_title', { hasText: '修复股市信号看板' }).first()
    if ((await title.count()) > 0) {
      await title.click()
      await page.waitForTimeout(9000)
      return
    }
  }
  throw new Error('cannot open session after 3 attempts')
}

// ── 竞态复现率：搜索跳 #3 × 4（每次全新加载会话） ──────────────────────────
const outcomes = []
for (let i = 0; i < 4; i++) {
  await openSession()
  await page.keyboard.press('Meta+k')
  await sleep(400)
  await page.locator('[data-turnbar-search-input]').fill('看板')
  await sleep(700)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  let ft = null
  const t1 = Date.now()
  while (Date.now() - t1 < 4000 && ft === null) { ft = await flashTurn(); await sleep(120) }
  outcomes.push(ft)
  console.log(`run ${i + 1}: flash afterTail=${ft}`)
}
const correct = outcomes.filter(x => x === '3').length
record('B5-race-repro-rate-4runs', correct >= 3, `runs=${JSON.stringify(outcomes)} correct=${correct}/4`)

// ── Esc 双动作变体：焦点移到 body 后，面板+toast 同时可见时按 Esc ───────────
await openSession()
const posA = await scrollerTop()
await page.locator('[data-turnbar-seg]').nth(10).click()
await sleep(1500)
const posB = await scrollerTop()
await page.keyboard.press('Meta+k')
await sleep(400)
await page.evaluate(() => { (document.activeElement || document.body)?.blur() }) // 焦点到 body
await sleep(200)
await page.keyboard.press('Escape')
await sleep(600)
const panelClosed = await page.locator('[data-turnbar-search].visible').count()
const posC = await scrollerTop()
record('B5-esc-panel-focus-body-closes', panelClosed === 0, `panel=${panelClosed}`)
record('B5-esc-focus-body-does-not-also-return', Math.abs(posC - posB) < 5,
  `posA=${posA} posB=${posB} posC=${posC}`)

await browser.close()
console.log('\nDONE batch5')
