/** 批次 2：scrub 拖动 / ⌘K 搜索 / ⌘↑⌘↓ / playhead / 5s 轮询稳定性 */
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
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail.slice(0, 300) : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))
const sleep = ms => new Promise(r => setTimeout(r, ms))

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
const segCount = await segs.count()
record('B2-segments-ready', segCount === 22, `segments=${segCount}`)

// ── S1 拖动 scrub（>4px 进入，卡片跟随，松手跳转） ───────────────────────────
if (segCount >= 15) {
  const from = segs.nth(4)   // #5
  const to = segs.nth(14)    // #15
  const bFrom = await from.boundingBox()
  const bTo = await to.boundingBox()
  if (bFrom && bTo) {
    const sx = bFrom.x + bFrom.width / 2, sy = bFrom.y + bFrom.height / 2
    const tx = bTo.x + bTo.width / 2, ty = bTo.y + bTo.height / 2
    await page.mouse.move(sx, sy)
    await page.mouse.down()
    await page.mouse.move((sx + tx) / 2, (sy + ty) / 2, { steps: 4 })
    await sleep(150)
    // scrub 中：卡片跟随最近段
    const midText = (await page.locator('[data-turnbar-card]').textContent()) ?? ''
    const scrubTargets = await page.locator('[data-turnbar-seg].scrub-target').count()
    record('S1-scrub-card-follows', /#1[0-5]/.test(midText), midText.slice(0, 80))
    record('S1-scrub-highlight', scrubTargets === 1, `scrub-target=${scrubTargets}`)
    await page.mouse.move(tx, ty, { steps: 6 })
    await sleep(100)
    await page.mouse.up()
    await sleep(2000)
    const toast = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
    const toastVisible = await page.locator('[data-turnbar-toast].visible').count()
    record('S1-scrub-release-jumps', toastVisible === 1 && toast.includes('#15'), `toast="${toast.slice(0, 60)}"`)
    // 松手后卡片应隐藏、scrub 高亮清理
    const cardVisible = await page.locator('[data-turnbar-card].visible').count()
    const scrubLeft = await page.locator('[data-turnbar-seg].scrub-target').count()
    record('S1-scrub-cleanup', cardVisible === 0 && scrubLeft === 0, `card=${cardVisible} scrub=${scrubLeft}`)
  } else {
    record('S1-scrub-release-jumps', false, 'bounding box null')
  }
}

// ── S2 ⌘K 搜索 ───────────────────────────────────────────────────────────────
await page.keyboard.press('Meta+k')
await sleep(500)
const searchVisible = await page.locator('[data-turnbar-search].visible').count()
record('S2-cmdk-opens-panel', searchVisible === 1, `visible=${searchVisible}`)
const focused = await page.evaluate(() => document.activeElement?.getAttribute('data-turnbar-search-input') === '')
record('S2-input-focused', focused === true, `focused=${focused}`)

await page.locator('[data-turnbar-search-input]').fill('看板')
await sleep(700) // 150ms 防抖 + fetch
const rows = page.locator('[data-turnbar-search-row]')
const rowCount = await rows.count()
record('S2-search-results', rowCount > 0, `rows=${rowCount}`)
const firstHead = rowCount > 0 ? ((await rows.first().locator('.tb-search-row-head').textContent()) ?? '') : ''
const firstBody = rowCount > 0 ? ((await rows.first().locator('.tb-search-row-body').textContent()) ?? '') : ''
record('S2-result-format', firstHead.startsWith('#'), `head=${firstHead} body=${firstBody.slice(0, 60)}`)
record('S2-snippet-contains-needle', firstBody.includes('看板'), firstBody.slice(0, 80))

// ↑↓ 选行 + Enter 跳转（先读 active 再按键，避免读到按键后的值）
const activeBefore = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-turnbar-search-row]')]
  return rows.findIndex(r => r.classList.contains('active'))
})
await page.keyboard.press('ArrowDown')
const activeAfterDown = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-turnbar-search-row]')]
  return rows.findIndex(r => r.classList.contains('active'))
})
record('S2-arrow-down-moves-active', activeAfterDown === (activeBefore + 1) % rowCount,
  `before=${activeBefore} after=${activeAfterDown}`)

const pickedHead = rowCount > 0 ? ((await rows.nth(activeAfterDown).locator('.tb-search-row-head').textContent()) ?? '') : ''
await page.keyboard.press('Enter')
await sleep(2500)
const panelClosed = await page.locator('[data-turnbar-search].visible').count()
const jumpToast = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
record('S2-enter-jumps-and-closes', panelClosed === 0 && jumpToast.includes(pickedHead),
  `picked=${pickedHead} toast="${jumpToast.slice(0, 50)}"`)

// 无结果 + Esc 关闭
await page.keyboard.press('Meta+k')
await sleep(400)
await page.locator('[data-turnbar-search-input]').fill('zzzz-no-such-text-999')
await sleep(700)
const empty = (await page.locator('.tb-search-empty').textContent().catch(() => '')) ?? ''
record('S2-empty-result-message', empty.includes('没有匹配'), `msg="${empty}"`)
await page.keyboard.press('Escape')
await sleep(300)
const closedByEsc = await page.locator('[data-turnbar-search].visible').count()
record('S2-esc-closes-panel', closedByEsc === 0, `visible=${closedByEsc}`)

// ── S3 ⌘↑/⌘↓ 逐轮导航 ────────────────────────────────────────────────────────
// 当前 playhead 基准 = 上次跳转到的轮（搜索选中的那轮）
const toastBeforeNav = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
const currentTurnMatch = toastBeforeNav.match(/#(\d+)/)
if (currentTurnMatch) {
  const cur = Number(currentTurnMatch[1])
  await page.keyboard.press('Meta+ArrowUp')
  await sleep(2500)
  const navToast = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
  record('S3-meta-arrowup-jumps-prev', navToast.includes(`#${Math.max(1, cur - 1)}`),
    `cur=#${cur} toast="${navToast.slice(0, 50)}"`)
  await page.keyboard.press('Meta+ArrowDown')
  await sleep(2500)
  const navToast2 = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
  record('S3-meta-arrowdown-jumps-next', navToast2.includes(`#${cur}`),
    `toast="${navToast2.slice(0, 50)}"`)
} else {
  record('S3-meta-arrowup-jumps-prev', false, 'no prior jump toast to anchor')
}

// 有内容的输入框聚焦时 ⌘↑/⌘↓ 不劫持（光标移动，不产生新跳转 toast）；
// 空编辑器允许导航（搜索关闭后焦点回空 composer 时键盘导航仍可用——焦点陷阱修复的语义）
const toastTextBeforeEdit = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
await page.evaluate(() => {
  const ta = document.querySelector('textarea')
  ta?.focus()
  // 填入内容 = 真实输入语境
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(ta, '正在输入的内容')
  ta?.dispatchEvent(new Event('input', { bubbles: true }))
})
await sleep(300)
await page.keyboard.press('Meta+ArrowUp')
await sleep(800)
const toastTextWhileEditing = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
record('S3-no-hijack-while-typing', toastTextWhileEditing === toastTextBeforeEdit,
  `before="${toastTextBeforeEdit.slice(0, 24)}" after="${toastTextWhileEditing.slice(0, 24)}"`)
// 清空后回到空编辑器：⌘↑ 应恢复导航（不吞键）
await page.evaluate(() => {
  const ta = document.querySelector('textarea')
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  setter?.call(ta, '')
  ta?.dispatchEvent(new Event('input', { bubbles: true }))
})
await sleep(300)
await page.keyboard.press('Meta+ArrowUp')
await sleep(2000)
const toastAfterEmpty = (await page.locator('[data-turnbar-toast]').textContent().catch(() => '')) ?? ''
record('S3-empty-editor-allows-nav', toastAfterEmpty !== toastTextBeforeEdit,
  `before="${toastTextBeforeEdit.slice(0, 24)}" after="${toastAfterEmpty.slice(0, 24)}"`)

// ── S4 playhead ──────────────────────────────────────────────────────────────
const playhead = page.locator('[data-turnbar-playhead]')
const phBefore = await playhead.getAttribute('style')
// 点击第一段跳到最顶 → playhead 应接近 0%
await segs.first().click()
await sleep(6000)
const phTop = await playhead.getAttribute('style')
const pctOf = s => { const m = /translateX\(([\d.-]+)px\)/.exec(s || ''); return m ? Number(m[1]) : null }
const barW = await page.locator('[data-turnbar]').evaluate(el => el.offsetWidth - 16)
const topPct = pctOf(phTop) !== null ? (pctOf(phTop) / barW * 100).toFixed(1) : '?'
record('S4-playhead-at-top-after-jump-1', pctOf(phTop) !== null && pctOf(phTop) / barW < 0.12,
  `before="${phBefore}" after="${phTop}" pct=${topPct}%`)
const phOpacity = await playhead.evaluate(el => getComputedStyle(el).opacity)
record('S4-playhead-visible', phOpacity === '1', `opacity=${phOpacity}`)

// ── S5 5s 轮询稳定性（无重渲染抖动） ─────────────────────────────────────────
const segCountBeforePoll = await segs.count()
await sleep(6500)
const segCountAfterPoll = await segs.count()
record('S5-polling-stable', segCountBeforePoll === segCountAfterPoll,
  `before=${segCountBeforePoll} after=${segCountAfterPoll}`)

record('B2-console-errors', errors.length === 0, errors.slice(0, 5).join(' | '))
await browser.close()
console.log('\nDONE batch2')
