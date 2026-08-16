import { chromium } from 'playwright'
const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto('http://127.0.0.1:8791/', { waitUntil: 'domcontentloaded', timeout: 30000 })
await page.waitForTimeout(4000)
await page.evaluate(() => {
  const b = [...document.querySelectorAll('button')].find(x => (x.textContent || '').includes('展开其余'))
  if (b) b.click()
})
await page.waitForTimeout(1500)
const titles = await page.evaluate(() => [...document.querySelectorAll('span.YDXeBa_title')].map(x => x.textContent.trim()))
console.log(JSON.stringify(titles, null, 1))
await browser.close()
