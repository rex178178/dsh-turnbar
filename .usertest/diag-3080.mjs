import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 200)) })
page.on('pageerror', e => errors.push('PAGEERROR: ' + String(e).slice(0, 200)))
await page.goto('http://127.0.0.1:3080/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(5000)
const info = await page.evaluate(() => {
  const bar = document.querySelector('[data-turnbar]')
  const segs = document.querySelectorAll('[data-turnbar-seg]').length
  const btn = document.querySelector('[data-turnbar-search-btn]')
  // 侧栏会话标题
  const titles = [...document.querySelectorAll('span.YDXeBa_title')].map(x => x.textContent.trim()).slice(0, 10)
  // composer dock 区域（找 textarea 的祖先结构）
  const ta = document.querySelector('textarea')
  let dockInfo = 'no-textarea'
  if (ta) {
    let el = ta.parentElement
    const chain = []
    for (let i = 0; i < 8 && el; i++) {
      chain.push(`${el.tagName}.${(el.className || '').toString().slice(0, 30)}`)
      el = el.parentElement
    }
    dockInfo = chain.join(' < ')
  }
  return { barExists: bar !== null, segs, searchBtn: btn !== null, titles, dockInfo }
})
console.log(JSON.stringify(info, null, 1))
console.log('console errors:', errors.slice(0, 5))
await browser.close()
