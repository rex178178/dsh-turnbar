/** 批次 3：复现已发现 bug + 变体确认（focus 陷阱 / toast 自动隐藏 / 纯工具轮跳转） */
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
const toastVisible = () => page.locator('[data-turnbar-toast].visible').count()
const activeEl = () => page.evaluate(() => {
  const ae = document.activeElement
  return `${ae?.tagName}${ae?.getAttribute('data-turnbar-search-input') !== null ? '(SEARCH-INPUT)' : ''}${ae?.tagName === 'TEXTAREA' ? '(TEXTAREA)' : ''}${ae?.tagName === 'BODY' ? '(BODY)' : ''}`
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

// 记录「加载更早」按钮的真实文案（loadEarlierVisible 正则的健壮性）
await openSession()
const earlierBtnText = await page.evaluate(() => {
  const flow = document.querySelector('[data-chat-flow]')
  const btns = [...(flow?.querySelectorAll('button') ?? [])].map(b => b.textContent.trim())
  return btns.slice(0, 8)
})
record('B3-earlier-button-label', true, JSON.stringify(earlierBtnText))

// ── 复现 bug：搜索跳转 #3 落在轮 1（flash 归属轮） ─────────────────────────
await page.keyboard.press('Meta+k')
await sleep(400)
await page.locator('[data-turnbar-search-input]').fill('看板')
await sleep(700)
await page.keyboard.press('ArrowDown') // 第二行 = #3
await page.keyboard.press('Enter')
await sleep(3000)
const ft = await flashTurn()
record('B3-search-jump-3-lands-turn-3', ft === '3', `flash afterTail=${ft} (expect 3)`)

// ── bug 变体：搜索跳转后 Esc 返回是否被隐藏输入框吞掉 ──────────────────────
const atTop = await scrollerTop()
await page.keyboard.press('Escape')
await sleep(600)
const afterEsc = await scrollerTop()
record('B3-esc-return-after-search-jump', Math.abs(afterEsc - atTop) > 100, `before=${atTop} after=${afterEsc}`)
record('B3-esc-return-focus', true, `activeElement=${await activeEl()}`)

// ── 变体：⌘↑ 在隐藏输入框聚焦时失效 ────────────────────────────────────────
const beforeArrow = await scrollerTop()
await page.keyboard.press('Meta+ArrowDown')
await sleep(1500)
const afterArrow = await scrollerTop()
record('B3-meta-arrow-with-hidden-input-focus', Math.abs(afterArrow - beforeArrow) > 100, `before=${beforeArrow} after=${afterArrow}`)

// ── toast 5s 自动隐藏（.visible class） ─────────────────────────────────────
await page.evaluate(() => (document.activeElement || document.body)?.blur())
await page.locator('[data-turnbar-seg]').nth(10).click()
await sleep(1200)
const vis1 = await toastVisible()
await sleep(4800) // 总 6s > 5s
const vis2 = await toastVisible()
record('B3-toast-shows-then-autohides', vis1 === 1 && vis2 === 0, `visible@1.2s=${vis1} @6s=${vis2}`)

// ── 无轮尾轮（turn 4）点击跳转：flash 应落在轮 4 自己的用户行 ───────────────
const t0 = Date.now()
await page.locator('[data-turnbar-seg]').nth(3).click() // #4（无轮尾但有用户行）
let ft4 = null
let txt4 = null
const tPoll = Date.now()
while (Date.now() - tPoll < 4000 && (ft4 === null || txt4 === null)) {
  if (ft4 === null) ft4 = await flashTurn()
  if (txt4 === null) {
    const f = await page.evaluate(() => {
      const el = document.querySelector('[data-turnbar-flash]')
      return el ? el.textContent.slice(0, 30) : null
    })
    if (f !== null) txt4 = f
  }
  await sleep(120)
}
const dt4 = ((Date.now() - t0) / 1000).toFixed(1)
record('B3-jump-to-turn-4-own-row', txt4 !== null && txt4.includes('先做 A 组'),
  `flash="${txt4}" afterTail=${ft4} took=${dt4}s`)

await browser.close()
console.log('\nDONE batch3')
