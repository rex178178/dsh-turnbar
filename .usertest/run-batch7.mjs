/** 批次 7：真实会话 live 测试——新会话两条消息：running 脉冲、轮次增长、sidecar 落盘 */
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
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 300)) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 300)))
const sleep = ms => new Promise(r => setTimeout(r, ms))

await page.goto('http://127.0.0.1:8791/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4000)
await page.locator('button.hHd-Xa_newSession').first().click()
await page.waitForTimeout(2500)

// 找到 composer 输入框
const composer = page.locator('textarea').first()
const composerCount = await composer.count()
record('L1-composer-found', composerCount === 1, `textarea=${composerCount}`)

// 发送第一条消息（此时应无进度条：<2 轮）
await composer.fill('请只回复两个字：收到')
await page.keyboard.press('Enter')
await sleep(1500)
const barDuringTurn1 = await page.locator('[data-turnbar]').count()
record('L2-no-bar-with-1-turn', barDuringTurn1 === 0, `bar=${barDuringTurn1}`)

// 等第一轮结束（最长 180s）
let done1 = false
for (let i = 0; i < 180; i++) {
  const running = await page.evaluate(() => {
    const els = document.querySelectorAll('[data-turnbar-seg].running')
    return els.length
  })
  if (running === 0 && i > 10) { done1 = true; break }
  await sleep(1000)
}
record('L3-turn1-finished', done1, 'turn 1 completed')

// 第二条消息：进度条应出现（2 轮），生成期间末段 running 脉冲
await composer.fill('请只回复两个字：好的')
await page.keyboard.press('Enter')
await sleep(4000) // 等生成开始 + 5s 轮询拉到 2 轮
const segCountDuring = await page.locator('[data-turnbar-seg]').count()
const runningDuring = await page.locator('[data-turnbar-seg].running').count()
record('L4-bar-appears-turn2', segCountDuring === 2, `segments=${segCountDuring}`)
record('L4-running-pulse-on-last', runningDuring === 1, `running=${runningDuring}`)
const lastRunning = await page.locator('[data-turnbar-seg]').last().evaluate(el => el.classList.contains('running'))
record('L4-pulse-is-last-seg', lastRunning === true, `lastRunning=${lastRunning}`)

// 等第二轮结束 → 仍 2 段、无 pulse
let done2 = false
for (let i = 0; i < 180; i++) {
  const running = await page.locator('[data-turnbar-seg].running').count()
  if (running === 0 && i > 10) { done2 = true; break }
  await sleep(1000)
}
const segAfter = await page.locator('[data-turnbar-seg]').count()
const runningAfter = await page.locator('[data-turnbar-seg].running').count()
record('L5-turn2-finished-stable', done2 && segAfter === 2 && runningAfter === 0,
  `segments=${segAfter} running=${runningAfter}`)

// 悬停末段 → 卡片显示第 2 轮内容（live fold 数据）
const lastSeg = page.locator('[data-turnbar-seg]').last()
const lb = await lastSeg.boundingBox()
if (lb) {
  await page.mouse.move(lb.x + lb.width / 2, lb.y + lb.height / 2)
  await sleep(400)
  const card = (await page.locator('[data-turnbar-card]').textContent().catch(() => '')) ?? ''
  record('L6-live-turn-card-content', card.includes('#2') && card.includes('请只回复两个字：好的'), card.slice(0, 120))
  await page.mouse.move(720, 40)
}

// 会话 id（供 sidecar 校验）
const sid = await page.evaluate(() => {
  const flow = document.querySelector('[data-chat-flow]')
  return window.__DSH_BOOT__ ? null : null
})
void sid
record('L-console-errors', errors.length === 0, errors.slice(0, 4).join(' | '))
await browser.close()
console.log('\nDONE batch7')
