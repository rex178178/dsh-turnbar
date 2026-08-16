/** 快速回归：合并剩余批次的核心未覆盖断言，单遍跑完（~3 分钟） */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'fast-regression.json')
mkdirSync(__dirname, { recursive: true })
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const save = () => writeFileSync(OUT, JSON.stringify(results, null, 2))
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail, at: new Date().toISOString() })
  save()
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail.slice(0, 200) : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function expandSidebar (page) {
  await page.evaluate(() => {
    const titles = [...document.querySelectorAll('span.YDXeBa_title')]
    const at = titles.find(s => (s.textContent || '').trim() === 'asset-tracker')
    if (at) { const el = at.closest('button, [role="button"], div'); el?.click() }
  })
  await page.waitForTimeout(1200)
  await page.evaluate(() => {
    const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('展开其余'))
    if (b) b.click()
  })
  await page.waitForTimeout(1200)
}

// ═══ R1：真实会话——toast 5s 自动隐藏 + 边界钳制 + scrub ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://127.0.0.1:8791/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3500)
  await expandSidebar(page)
  await page.locator('span.YDXeBa_title', { hasText: '修复股市信号看板' }).first().click()
  await page.waitForTimeout(8000)

  // toast 5s 自动隐藏
  await page.locator('[data-turnbar-seg]').nth(10).click()
  await sleep(6000)
  const toastVisible = await page.locator('[data-turnbar-toast].visible').count()
  record('R1-toast-autohides-5s', toastVisible === 0, `visible@6s=${toastVisible}`)

  // ⌘↑ 在轮 1 钳制
  await page.locator('[data-turnbar-seg]').first().click()
  await sleep(4000)
  await page.keyboard.press('Meta+ArrowUp')
  await sleep(1500)
  const upToast = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
  record('R1-meta-up-clamps-at-1', !upToast.includes('#0'), `toast="${upToast.slice(0, 30)}"`)

  // ⌘↓ 在轮 22 钳制
  await page.locator('[data-turnbar-seg]').last().click()
  await sleep(4000)
  await page.keyboard.press('Meta+ArrowDown')
  await sleep(1500)
  const downToast = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
  record('R1-meta-down-clamps-at-22', !downToast.includes('#23'), `toast="${downToast.slice(0, 30)}"`)

  // scrub：从段 3 拖到段 10 松手跳转
  const segs = page.locator('[data-turnbar-seg]')
  const b3 = await segs.nth(2).boundingBox()
  const b10 = await segs.nth(9).boundingBox()
  await page.mouse.move(b3.x + b3.width / 2, b3.y + b3.height / 2)
  await page.mouse.down()
  await page.mouse.move(b10.x + b10.width / 2, b10.y + b10.height / 2, { steps: 8 })
  await page.mouse.up()
  await sleep(2500)
  const scrubToast = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
  record('R1-scrub-release-jumps', scrubToast.includes('#10'), `toast="${scrubToast.slice(0, 30)}"`)
  await page.close()
}

// ═══ R2：160 轮分组模式（route 拦截）+ 降级 + 空会话 ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const fakeTurns = Array.from({ length: 160 }, (_, i) => ({
    id: `s#${i + 1}`, index: i + 1, role: 'user',
    userFirstLine: i % 3 === 0 ? '' : `用户问题 ${i + 1}`,
    assistantFirstLine: `助手回答 ${i + 1}`,
    startedAt: 1755000000000 + i * 60000, tokenIn: 1, tokenOut: 2,
    toolCallCount: 0, fileChanges: [], steeringCount: 0,
  }))
  await page.route('**/plugins/dsh-turnbar/state**', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ state: { sessionId: 's', turns: fakeTurns, chapterBreaks: [] } }) })
  })
  await page.goto('http://127.0.0.1:8791/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3500)
  await expandSidebar(page)
  await page.locator('span.YDXeBa_title', { hasText: '修复股市信号看板' }).first().click()
  await page.waitForTimeout(5000)
  const segCount = await page.locator('[data-turnbar-seg]').count()
  record('R2-group-mode-40-segments', segCount === 40, `segments=${segCount}`)
  const label = await page.locator('[data-turnbar-seg]').first().getAttribute('aria-label')
  record('R2-group-label', /#\d+–#\d+/.test(label ?? ''), `label=${label}`)
  await page.close()
}
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.route('**/plugins/dsh-turnbar/state**', async route => {
    await route.fulfill({ status: 404, contentType: 'application/json', body: JSON.stringify({ error: 'x' }) })
  })
  await page.goto('http://127.0.0.1:8791/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3500)
  await expandSidebar(page)
  await page.locator('span.YDXeBa_title', { hasText: '修复股市信号看板' }).first().click()
  await page.waitForTimeout(8000)
  const segCount = await page.locator('[data-turnbar-seg]').count()
  record('R2-fallback-store-renders', segCount >= 2, `segments=${segCount}`)
  await page.close()
}
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://127.0.0.1:8791/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(3500)
  await page.locator('button.hHd-Xa_newSession').first().click()
  await page.waitForTimeout(2000)
  const bar = await page.locator('[data-turnbar]').count()
  const btn = await page.locator('[data-turnbar-search-btn]').count()
  record('R2-fresh-session-no-bar', bar === 0 && btn === 0, `bar=${bar} btn=${btn}`)
  await page.close()
}

await browser.close()
const fail = results.filter(r => !r.pass).length
console.log(`\nDONE fast-regression: ${results.length - fail}/${results.length} passed`)
