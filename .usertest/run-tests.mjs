/**
 * dsh-turnbar 真机用户测试（Playwright + 系统 Chrome，测试实例 127.0.0.1:8791）
 * 测试会话：修复股市信号看板（session-e40715b8，22 轮 / 5.9MB）
 * 结果写入 .usertest/results.json（每步追加，崩溃不丢已测项）。
 */
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
  const entry = { name, pass, detail, at: new Date().toISOString() }
  results.push(entry)
  save()
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail.slice(0, 300) : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))

const sleep = ms => new Promise(r => setTimeout(r, ms))

await page.goto('http://127.0.0.1:8791/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4000)

// ── T1 打开测试会话（侧栏默认折叠，先展开） ───────────────────────────────────
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
const sessionTitle = page.locator('span.YDXeBa_title', { hasText: '修复股市信号看板' }).first()
const canOpen = await sessionTitle.count() > 0
record('T1-open-session-title-visible', canOpen)
if (canOpen) {
  await sessionTitle.click()
  await page.waitForTimeout(9000) // 5.9MB 会话渲染
}

// ── T2 进度条渲染 ────────────────────────────────────────────────────────────
const barCount = await page.locator('[data-turnbar]').count()
record('T2-turnbar-renders', barCount === 1, `count=${barCount}`)
const segs = page.locator('[data-turnbar-seg]')
const segCount = await segs.count()
record('T2-segment-count-22', segCount === 22, `segments=${segCount}`)
if (segCount > 0) {
  // title 属性已移除（原生 tooltip 与自定义悬停卡双提示）——标签改由 aria-label 承载
  const firstAria = await segs.first().getAttribute('aria-label')
  const lastAria = await segs.last().getAttribute('aria-label')
  record('T2-segment-labels', firstAria === 'jump to turn #1' && lastAria === `jump to turn #${segCount}`,
    `first=${firstAria} last=${lastAria}`)
  const noTitle = (await segs.first().getAttribute('title')) === null
  record('T2-no-native-title', noTitle, `title=${await segs.first().getAttribute('title')}`)
  record('T2-segment-aria', firstAria === 'jump to turn #1', `aria=${firstAria}`)
  const runningCount = await segs.locator('.running').count()
  record('T2-no-running-pulse-on-historic', runningCount === 0, `running=${runningCount}`)
}

// ── T3 悬停预览卡 ────────────────────────────────────────────────────────────
if (segCount >= 12) {
  const seg12 = segs.nth(11) // 轮 12
  const box = await seg12.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(400) // 120ms 悬停延迟 + 余量
    const visible = await page.locator('[data-turnbar-card].visible').count()
    record('T3-hover-card-visible', visible === 1, `visible=${visible}`)
    const cardText = (await page.locator('[data-turnbar-card]').textContent()) ?? ''
    record('T3-hover-card-has-head', cardText.includes('#12'), cardText.slice(0, 120))
    // 切换零延迟：直接移到第 8 段
    const seg8 = segs.nth(7)
    const box8 = await seg8.boundingBox()
    if (box8) {
      await page.mouse.move(box8.x + box8.width / 2, box8.y + box8.height / 2)
      await sleep(60) // 已可见 → 零延迟切换
      const cardText2 = (await page.locator('[data-turnbar-card]').textContent()) ?? ''
      record('T3-hover-card-switch-instant', cardText2.includes('#8'), cardText2.slice(0, 100))
    }
    // 移出 → 100ms 宽限后隐藏
    await page.mouse.move(720, 40)
    await sleep(350)
    const visibleAfter = await page.locator('[data-turnbar-card].visible').count()
    record('T3-hover-card-hides-after-leave', visibleAfter === 0, `visible=${visibleAfter}`)
  } else {
    record('T3-hover-card-visible', false, 'segment bounding box null')
  }
}

// ── T4 点击第一段：跨分页跳转 + flash + toast ────────────────────────────────
if (segCount > 0) {
  const scrollerBefore = await page.evaluate(() => {
    const flow = document.querySelector('[data-chat-flow]')
    let n = flow
    while (n) {
      const s = getComputedStyle(n)
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') return { top: n.scrollTop, height: n.clientHeight }
      n = n.parentElement
    }
    return { top: -1, height: -1 }
  })
  const t0 = Date.now()
  await segs.first().click()
  // 等翻页 + 跳转 + flash；上限 90s
  let toastVisible = false
  for (let i = 0; i < 90; i++) {
    if ((await page.locator('[data-turnbar-toast].visible').count()) > 0) { toastVisible = true; break }
    await sleep(1000)
  }
  const dt = ((Date.now() - t0) / 1000).toFixed(1)
  record('T4-click-first-jump-toast', toastVisible, `toast in ${dt}s`)
  const toastText = (await page.locator('[data-turnbar-toast]').textContent()) ?? ''
  record('T4-toast-text', toastText.includes('已定位 #1'), toastText.slice(0, 80))
  const flashCount = await page.locator('[data-turnbar-flash]').count()
  record('T4-flash-on-target-row', flashCount >= 1, `flash=${flashCount}`)
  const scrollerAfter = await page.evaluate(() => {
    const flow = document.querySelector('[data-chat-flow]')
    let n = flow
    while (n) {
      const s = getComputedStyle(n)
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop
      n = n.parentElement
    }
    return -1
  })
  record('T4-scroll-moved', Math.abs(scrollerAfter - scrollerBefore.top) > 100,
    `before=${scrollerBefore.top} after=${scrollerAfter}`)

  // ── T5 Esc 返回原位 ────────────────────────────────────────────────────────
  const midTop = scrollerAfter
  await page.keyboard.press('Escape')
  await sleep(500)
  const restored = await page.evaluate(() => {
    const flow = document.querySelector('[data-chat-flow]')
    let n = flow
    while (n) {
      const s = getComputedStyle(n)
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop
      n = n.parentElement
    }
    return -1
  })
  const backDiff = Math.abs(restored - scrollerBefore.top)
  record('T5-esc-restores-position', backDiff < 5, `before=${scrollerBefore.top} restored=${restored} diff=${backDiff}`)
  const toastAfterEsc = await page.locator('[data-turnbar-toast].visible').count()
  record('T5-toast-hidden-after-esc', toastAfterEsc === 0, `visible=${toastAfterEsc}`)
  void midTop

  // ── T6 点击段 → toast 点击返回 ──────────────────────────────────────────────
  const seg10 = segs.nth(9)
  await seg10.click()
  await sleep(2500)
  const toast2 = await page.locator('[data-turnbar-toast].visible').count()
  record('T6-jump-toast-shows-again', toast2 === 1, `visible=${toast2}`)
  const toast2Text = (await page.locator('[data-turnbar-toast]').textContent()) ?? ''
  record('T6-toast-label-10', toast2Text.includes('#10'), toast2Text.slice(0, 60))
  const posAt10 = await page.evaluate(() => {
    const flow = document.querySelector('[data-chat-flow]')
    let n = flow
    while (n) {
      const s = getComputedStyle(n)
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop
      n = n.parentElement
    }
    return -1
  })
  await page.locator('[data-turnbar-toast]').click({ position: { x: 10, y: 10 } })
  await sleep(500)
  const posBack = await page.evaluate(() => {
    const flow = document.querySelector('[data-chat-flow]')
    let n = flow
    while (n) {
      const s = getComputedStyle(n)
      if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop
      n = n.parentElement
    }
    return -1
  })
  record('T6-toast-click-restores', Math.abs(posBack - scrollerBefore.top) < 5,
    `at10=${posAt10} back=${posBack} orig=${scrollerBefore.top}`)
}

// ── 控制台错误汇总 ────────────────────────────────────────────────────────────
record('T-console-errors', errors.length === 0, errors.slice(0, 5).join(' | '))

await browser.close()
console.log('\nDONE. results ->', OUT)
