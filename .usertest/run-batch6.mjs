/** 批次 6：route 拦截——160 轮分组模式 / state 404 降级 / 空会话 / 卡片边缘定位 */
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
const sleep = ms => new Promise(r => setTimeout(r, ms))

const fakeTurns = (n) => Array.from({ length: n }, (_, i) => ({
  id: `s#${i + 1}`, index: i + 1, role: 'user',
  userFirstLine: i % 3 === 0 ? '' : `用户问题 ${i + 1} 的一些内容`,
  assistantFirstLine: `助手回答 ${i + 1}`,
  startedAt: 1755000000000 + i * 60000, tokenIn: 100 + i, tokenOut: 200 + i,
  toolCallCount: i % 4 === 0 ? 3 : 0, fileChanges: [], steeringCount: 0,
}))

// ── G1 分组模式（160 轮 → ≤40 段） ────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const sessionId = 'session-e40715b8-43e6-4166-bb07-983e15b941f4'
  await page.route(`**/plugins/dsh-turnbar/state**`, async route => {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ state: { sessionId, turns: fakeTurns(160), chapterBreaks: [] } }) })
  })
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
  const segCount = await page.locator('[data-turnbar-seg]').count()
  record('G1-group-mode-seg-count', segCount <= 40 && segCount > 1, `segments=${segCount}`)
  const firstLabel = await page.locator('[data-turnbar-seg]').first().getAttribute('aria-label')
  record('G1-group-label-range', /#\d+–#\d+/.test(firstLabel ?? ''), `label=${firstLabel}`)
  // 组卡片悬停
  const seg = page.locator('[data-turnbar-seg]').first()
  const box = await seg.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(400)
    const card = (await page.locator('[data-turnbar-card]').textContent().catch(() => '')) ?? ''
    record('G1-group-card-content', /#\d+–#\d+ · \d+ 轮/.test(card), card.slice(0, 120))
    await page.mouse.move(720, 40)
  }
  await page.close()
}

// ── G2 state 404 → store 降级渲染 ─────────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.route(`**/plugins/dsh-turnbar/state**`, async route => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'x' }) })
  })
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
  const segCount = await page.locator('[data-turnbar-seg]').count()
  record('G2-fallback-store-renders', segCount >= 2, `segments=${segCount} (store 窗口轮次)`)
  await page.close()
}

// ── G3 空会话：无进度条、⌘K 无操作 ───────────────────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://127.0.0.1:8791/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(4000)
  const newBtn = page.locator('button.hHd-Xa_newSession').first()
  if ((await newBtn.count()) === 0) record('G3-fresh-session-no-bar', false, 'new-session button not found')
  await newBtn.click()
  await page.waitForTimeout(2500)
  const barCount = await page.locator('[data-turnbar]').count()
  record('G3-fresh-session-no-bar', barCount === 0, `bar=${barCount}`)
  await page.keyboard.press('Meta+k')
  await sleep(500)
  const panel = await page.locator('[data-turnbar-search].visible').count()
  record('G3-fresh-cmdk-noop', panel === 0, `panel=${panel}`)
  await page.close()
}

// ── G4 卡片边缘定位 clamp（第一段与最后一段悬停） ────────────────────────────
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
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
  const segs = page.locator('[data-turnbar-seg]')
  const first = await segs.first().boundingBox()
  const last = await segs.last().boundingBox()
  let within = true
  if (first) {
    await page.mouse.move(first.x + first.width / 2, first.y + first.height / 2)
    await sleep(400)
    const cb = await page.locator('[data-turnbar-card]').boundingBox()
    within = within && cb !== null && cb.x >= 0 && cb.x + cb.width <= 1440
    record('G4-card-clamp-first-seg', cb !== null && cb.x >= 0 && cb.x + cb.width <= 1440, JSON.stringify(cb))
  }
  if (last) {
    await page.mouse.move(last.x + last.width / 2, last.y + last.height / 2)
    await sleep(300)
    const cb = await page.locator('[data-turnbar-card]').boundingBox()
    within = within && cb !== null && cb.x >= 0 && cb.x + cb.width <= 1440
    record('G4-card-clamp-last-seg', cb !== null && cb.x >= 0 && cb.x + cb.width <= 1440, JSON.stringify(cb))
  }
  await page.close()
}

await browser.close()
console.log('\nDONE batch6')
