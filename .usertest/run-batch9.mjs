/** 竞态统计：点击段 #3 × 4（每次全新加载会话） */
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

const outcomes = []
for (let i = 0; i < 4; i++) {
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
      break
    }
  }
  await page.locator('[data-turnbar-seg]').nth(2).click()
  let ft = null
  const t1 = Date.now()
  while (Date.now() - t1 < 5000 && ft === null) { ft = await flashTurn(); await sleep(120) }
  outcomes.push(ft)
  console.log(`click run ${i + 1}: flash afterTail=${ft}`)
}
record('B9-click-race-4runs', outcomes.filter(x => x === '3').length >= 3,
  `runs=${JSON.stringify(outcomes)} correct=${outcomes.filter(x => x === '3').length}/4`)
await browser.close()
console.log('\nDONE batch9')
