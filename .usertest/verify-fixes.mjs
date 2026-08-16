/**
 * verify-fixes.mjs — 11 个 bug 修复的验收断言（RED → GREEN）
 * 跑在 8791 测试实例上（修复后需重启实例 + rebuild client）。
 */
import { chromium } from 'playwright'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const OUT = join(__dirname, 'verify-results.json')
mkdirSync(__dirname, { recursive: true })
const results = existsSync(OUT) ? JSON.parse(readFileSync(OUT, 'utf8')) : []
const save = () => writeFileSync(OUT, JSON.stringify(results, null, 2))
const record = (name, pass, detail = '') => {
  results.push({ name, pass, detail, at: new Date().toISOString() })
  save()
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail.slice(0, 280) : ''}`)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const sleep = ms => new Promise(r => setTimeout(r, ms))

const flashTurn = (page) => page.evaluate(() => {
  const flow = document.querySelector('[data-chat-flow]')
  const flash = document.querySelector('[data-turnbar-flash]')
  if (!flow || !flash) return null
  const tails = [...flow.querySelectorAll('[data-turn-tail]')]
  for (const t of tails) {
    if (t.getBoundingClientRect().top > flash.getBoundingClientRect().top + 5) return t.getAttribute('data-turn-tail')
  }
  return null
})
const flashIsUserRow = (page) => page.evaluate(() => {
  const flash = document.querySelector('[data-turnbar-flash]')
  if (!flash) return null
  return flash.hasAttribute('data-time-hover-root') && !flash.hasAttribute('data-turn-tail')
    && flash.querySelector('[class*="bubble"]') !== null
})
const scrollerTop = (page) => page.evaluate(() => {
  const flow = document.querySelector('[data-chat-flow]')
  let n = flow
  while (n) {
    const s = getComputedStyle(n)
    if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop
    n = n.parentElement
  }
  return -1
})
const activeEl = (page) => page.evaluate(() => {
  const ae = document.activeElement
  return `${ae?.tagName}${ae?.getAttribute('data-turnbar-search-input') !== null ? '(SEARCH-INPUT)' : ''}${ae?.tagName === 'TEXTAREA' ? '(TEXTAREA)' : ''}${ae?.tagName === 'BODY' ? '(BODY)' : ''}${(ae?.className || '').toString().slice(0, 24) ? `.${(ae?.className || '').toString().slice(0, 24)}` : ''}`
})

async function openSession (page) {
  await page.goto('http://127.0.0.1:8791/', { waitUntil: 'domcontentloaded', timeout: 30000 })
  await page.waitForTimeout(4000)
  // 展开 asset-tracker 项目组（重启后默认折叠），再展开「其余会话」
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

// ═══ V1 跨分页跳转竞态：搜索跳 #3 必须落在轮 3（3 次） ═══
for (let i = 0; i < 3; i++) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openSession(page)
  await page.keyboard.press('Meta+k')
  await sleep(400)
  await page.locator('[data-turnbar-search-input]').fill('看板')
  await sleep(700)
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  let ft = null
  const t1 = Date.now()
  while (Date.now() - t1 < 5000 && ft === null) { ft = await flashTurn(page); await sleep(120) }
  record(`V1-search-jump-3-lands-3-run${i + 1}`, ft === '3', `flash afterTail=${ft}`)
  await page.close()
}

// ═══ V2 搜索面板焦点陷阱 ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openSession(page)
  // 点击段 #10 → 跳转 + toast（点击会把焦点放到段按钮上）
  await page.locator('[data-turnbar-seg]').nth(9).click()
  await sleep(3000)
  const posBefore = await scrollerTop(page)
  // ⌘K 打开再 Esc 关闭 → 焦点应归还（不再滞留隐藏输入框）
  await page.keyboard.press('Meta+k')
  await sleep(400)
  await page.locator('[data-turnbar-search-input]').fill('看板')
  await sleep(600)
  await page.keyboard.press('Escape')
  await sleep(300)
  const ae = await activeEl(page)
  record('V2a-focus-restored-after-esc', !ae.includes('SEARCH-INPUT'), `active=${ae}`)
  // 此时 toast 仍可见（5s 内）；Esc 应触发返回（焦点不在输入框 → 不被 isEditable 吞）
  const vis = await page.locator('[data-turnbar-toast].visible').count()
  await page.keyboard.press('Escape')
  await sleep(600)
  const posAfter = await scrollerTop(page)
  record('V2b-toast-esc-return-after-search', vis === 1 && Math.abs(posAfter - posBefore) > 100,
    `posBefore=${posBefore} posAfter=${posAfter} toastVis=${vis}`)
  // 焦点归还后 ⌘↑ 可用
  const pos2 = await scrollerTop(page)
  await page.keyboard.press('Meta+ArrowUp')
  await sleep(2000)
  const pos3 = await scrollerTop(page)
  record('V2c-meta-arrow-works-after-search', Math.abs(pos3 - pos2) > 8, `pos2=${pos2} pos3=${pos3}`)
  await page.close()
}

// ═══ V3 Esc 双动作：面板+toast 同时可见、焦点在 body → Esc 只关面板 ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openSession(page)
  await page.locator('[data-turnbar-seg]').nth(10).click()
  await sleep(3000)
  const posB = await scrollerTop(page)
  await page.keyboard.press('Meta+k')
  await sleep(400)
  await page.evaluate(() => { (document.activeElement || document.body)?.blur() })
  await sleep(200)
  await page.keyboard.press('Escape')
  await sleep(600)
  const panelClosed = await page.locator('[data-turnbar-search].visible').count()
  const posC = await scrollerTop(page)
  record('V3-esc-closes-panel-only', panelClosed === 0 && Math.abs(posC - posB) < 5,
    `panel=${panelClosed} posB=${posB} posC=${posC}`)
  await page.close()
}

// ═══ V4 卡片锚点：各段悬停卡片中心应贴近段中心 ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openSession(page)
  const segs = page.locator('[data-turnbar-seg]')
  const segCount = await segs.count()
  let allOk = true
  for (const idx of [0, 5, 11, segCount - 1]) {
    const seg = segs.nth(idx)
    const box = await seg.boundingBox()
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(400)
    const card = await page.locator('[data-turnbar-card]').boundingBox()
    const segCenter = box.x + box.width / 2
    const cardCenter = card ? card.x + card.width / 2 : null
    const delta = cardCenter !== null ? Math.abs(cardCenter - segCenter) : Infinity
    const segWidth = box.width
    // 中部段：卡片中心应贴近段中心（off-by-one 偏移约一个段宽 48px）；
    // 边缘段：卡片受视口 clamp 限制，只要求不溢出且锚点不落在别的段上。
    const isEdge = idx === 0 || idx === segCount - 1
    let ok = false
    if (isEdge) {
      // 末段卡片被右缘 clamp（320 宽卡片贴 vw-328），偏移 ~112px 属正确行为；
      // 只需不溢出视口、且不在视口外。
      ok = card !== null && card.x >= 0 && card.x + card.width <= 1440
        && delta <= 130
      if (idx === 0) ok = delta <= segWidth / 2 + 15 // 左缘不近边界，应精确居中
    } else {
      ok = delta <= segWidth / 2 + 15
    }
    allOk = allOk && ok
    record(`V4-card-anchor-seg-${idx}`, ok, `delta=${Math.round(delta)}px (segWidth=${Math.round(segWidth)})`)
  }
  record('V4-card-anchor-all', allOk, '')
  await page.close()
}

// ═══ V5 工具轮跳转：turn 4 有用户行（应落在自己的用户行）；turn 6 无用户行/无轮尾（应锚区间首行） ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openSession(page)
  // turn 4：有用户行「先做 A 组…」，flash 应打在它上面（轮 4 无轮尾 → afterTail=5）
  await page.locator('[data-turnbar-seg]').nth(3).click()
  let ft4 = null, txt4 = null, isUser4 = null
  const t1 = Date.now()
  while (Date.now() - t1 < 5000 && (ft4 === null || txt4 === null)) {
    if (ft4 === null) ft4 = await flashTurn(page)
    if (txt4 === null || isUser4 === null) {
      const f = await page.evaluate(() => {
        const el = document.querySelector('[data-turnbar-flash]')
        if (!el) return null
        return {
          text: el.textContent.slice(0, 40),
          isUser: el.hasAttribute('data-time-hover-root') && !el.hasAttribute('data-turn-tail') && el.querySelector('[class*="bubble"]') !== null,
        }
      })
      if (f) { txt4 = f.text; isUser4 = f.isUser }
    }
    await sleep(120)
  }
  record('V5-turn4-lands-on-own-user-row', txt4 !== null && txt4.includes('先做 A 组') && isUser4 === true,
    `text="${txt4}" isUser=${isUser4} afterTail=${ft4}`)
  // turn 6：无轮尾但有用户行（「继续完成b组…」）→ 应精确落在自己的用户行
  // （先等上一跳的 2.5s flash 过期，避免读到陈旧高亮）
  const tWait = Date.now()
  while (Date.now() - tWait < 4000 && (await flashTurn(page)) !== null) await sleep(150)
  await page.locator('[data-turnbar-seg]').nth(5).click()
  let ft6 = null, txt6 = null, isUser6 = null
  const t2 = Date.now()
  while (Date.now() - t2 < 5000 && (ft6 === null || txt6 === null)) {
    if (ft6 === null) ft6 = await flashTurn(page)
    if (txt6 === null || isUser6 === null) {
      const f = await page.evaluate(() => {
        const el = document.querySelector('[data-turnbar-flash]')
        if (!el) return null
        return {
          text: el.textContent.slice(0, 40),
          isUser: el.hasAttribute('data-time-hover-root') && !el.hasAttribute('data-turn-tail') && el.querySelector('[class*="bubble"]') !== null,
        }
      })
      if (f) { txt6 = f.text; isUser6 = f.isUser }
    }
    await sleep(120)
  }
  record('V5-turn6-lands-on-own-user-row', txt6 !== null && txt6.includes('继续完成b组') && isUser6 === true,
    `text="${txt6}" isUser=${isUser6} afterTail=${ft6}`)
  await page.close()
}

// ═══ V6 主题 token：卡片/toast 背景应跟随 dsh token（非暗色 fallback） ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openSession(page)
  const seg = page.locator('[data-turnbar-seg]').nth(10)
  const box = await seg.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await sleep(400)
  const styles = await page.evaluate(() => {
    const card = document.querySelector('[data-turnbar-card]')
    const toast = document.querySelector('[data-turnbar-toast]')
    const bodyCs = getComputedStyle(document.body)
    const cardCs = card ? getComputedStyle(card) : null
    const toastCs = toast ? getComputedStyle(toast) : null
    return {
      overlay: bodyCs.getPropertyValue('--dsw-alias-bg-overlay').trim(),
      label: bodyCs.getPropertyValue('--dsw-alias-label-primary').trim(),
      accent: bodyCs.getPropertyValue('--dsw-alias-brand-primary-new-colorprimary-new-color').trim(),
      cardBg: cardCs ? cardCs.backgroundColor : '',
      cardColor: cardCs ? cardCs.color : '',
      toastBg: toastCs ? toastCs.backgroundColor : '',
    }
  })
  record('V6-card-uses-theme-tokens',
    styles.cardBg === styles.overlay && styles.cardColor === styles.label,
    JSON.stringify(styles))
  record('V6-accent-token-present', styles.accent !== '', styles.accent)
  // toast 是懒创建的：跳一次（含翻页耗时）再查背景
  await page.mouse.move(720, 40)
  await page.locator('[data-turnbar-seg]').nth(5).click()
  await sleep(5000)
  const toastStyles = await page.evaluate(() => {
    const toast = document.querySelector('[data-turnbar-toast]')
    if (!toast) return { toastBg: 'NO-TOAST' }
    return { toastBg: getComputedStyle(toast).backgroundColor }
  })
  const overlayValue = styles.overlay
  record('V6-toast-uses-theme-tokens', toastStyles.toastBg === overlayValue, JSON.stringify(toastStyles))
  await page.close()
}

// ═══ V7 组卡片文案：不再出现「即将上线」 ═══
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
  await openSession(page)
  const seg = page.locator('[data-turnbar-seg]').first()
  const box = await seg.boundingBox()
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await sleep(400)
  const card = (await page.locator('[data-turnbar-card]').textContent().catch(() => '')) ?? ''
  record('V7-group-card-no-stale-copy', !card.includes('即将上线'), card.slice(0, 80))
  await page.close()
}

// ═══ V9 段按钮无 title 原生 tooltip ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openSession(page)
  const titleAttr = await page.locator('[data-turnbar-seg]').first().getAttribute('title')
  record('V9-no-native-title-tooltip', titleAttr === null, `title="${titleAttr}"`)
  await page.close()
}

// ═══ V10 轮询不重建 DOM（跨两个轮询周期段节点同一引用） ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openSession(page)
  const ref1 = await page.evaluate(() => {
    const s = document.querySelectorAll('[data-turnbar-seg]')
    return [...s].map(x => x.__tbId ? x.__tbId : (x.__tbId = Math.random().toString(36).slice(2)))
  })
  await sleep(6500)
  const ref2 = await page.evaluate(() => {
    const s = document.querySelectorAll('[data-turnbar-seg]')
    return [...s].map(x => x.__tbId ?? 'new')
  })
  record('V10-polling-keeps-dom-nodes', ref1.length === ref2.length && ref1.join(',') === ref2.join(','),
    `n=${ref1.length} same=${ref1.join(',') === ref2.join(',')}`)
  await page.close()
}

// ═══ V11 幽灵轮（turn 8）：置灰 + 不可点击 + hover 提示"已终止" ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openSession(page)
  const seg8 = page.locator('[data-turnbar-seg]').nth(7)
  const isGhost = (await seg8.getAttribute('class') ?? '').includes('ghost')
  record('V11-turn8-is-ghost', isGhost, `class=${await seg8.getAttribute('class')}`)
  const aria8 = await seg8.getAttribute('aria-label')
  record('V11-ghost-aria', aria8 !== null && aria8.includes('已终止'), `aria="${aria8}"`)
  // 点击幽灵轮不跳转
  const topBefore = await scrollerTop(page)
  await seg8.click()
  await sleep(1500)
  const topAfter = await scrollerTop(page)
  const toastAfterGhostClick = await page.locator('[data-turnbar-toast].visible').count()
  record('V11-ghost-click-no-jump', Math.abs(topAfter - topBefore) < 5 && toastAfterGhostClick === 0,
    `top ${topBefore}->${topAfter} toast=${toastAfterGhostClick}`)
  // hover 幽灵轮：卡片显示终止提示（且卡片是可见的）
  const box = await seg8.boundingBox()
  if (box) {
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
    await sleep(400)
    const card = (await page.locator('[data-turnbar-card]').textContent().catch(() => '')) ?? ''
    record('V11-ghost-hover-card', card.includes('已终止') || card.includes('无对话内容'), card.slice(0, 80))
    await page.mouse.move(720, 40)
  }
  // 幽灵轮段背景与其他段不同（更浅）
  const ghostBg = await seg8.evaluate(el => getComputedStyle(el).backgroundColor)
  const normalBg = await page.locator('[data-turnbar-seg]').nth(0).evaluate(el => getComputedStyle(el).backgroundColor)
  record('V11-ghost-dimmer-bg', ghostBg !== normalBg, `ghost=${ghostBg} normal=${normalBg}`)
  await page.close()
}

// ═══ V12 playhead 段高亮（宽度=段宽、transform 对齐段左边界） ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openSession(page)
  // 跳到第 3 段
  await page.locator('[data-turnbar-seg]').nth(2).click()
  await sleep(3500)
  const ph = await page.evaluate(() => {
    const el = document.querySelector('[data-turnbar-playhead]')
    const bar = document.querySelector('[data-turnbar]')
    if (!el || !bar) return null
    const cs = getComputedStyle(el)
    const m = /translateX\(([\d.-]+)px\)/.exec(el.style.transform || '')
    return { width: parseFloat(cs.width), x: m ? parseFloat(m[1]) : null, opacity: cs.opacity }
  })
  const segBox = await page.locator('[data-turnbar-seg]').nth(2).boundingBox()
  const barBox = await page.locator('[data-turnbar]').boundingBox()
  const usable = barBox.width - 16 - 24 - 2 // padding + 搜索按钮 + gap
  const segW = usable / 22
  const expectX = segW * 2
  record('V12-playhead-is-wide-segment', ph !== null && ph.width > 10 && ph.width < segW + 2,
    `width=${ph?.width} segW=${segW.toFixed(1)}`)
  record('V12-playhead-aligns-segment-left', ph !== null && ph.x !== null && Math.abs(ph.x - expectX) < 3,
    `x=${ph?.x} expect=${expectX.toFixed(1)}`)
  record('V12-playhead-visible', ph !== null && ph.opacity === '1', `opacity=${ph?.opacity}`)
  await page.close()
}

// ═══ V13 搜索按钮：存在 + 点击打开面板 ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await openSession(page)
  const btn = page.locator('[data-turnbar-search-btn]')
  const btnCount = await btn.count()
  record('V13-search-button-exists', btnCount === 1, `count=${btnCount}`)
  await btn.click()
  await sleep(500)
  const panel = await page.locator('[data-turnbar-search].visible').count()
  record('V13-button-opens-panel', panel === 1, `panel=${panel}`)
  const inputFocused = await page.evaluate(() => document.activeElement?.getAttribute('data-turnbar-search-input') === '')
  record('V13-button-focuses-input', inputFocused === true, `focused=${inputFocused}`)
  await page.keyboard.press('Escape')
  await page.close()
}

// ═══ V14 中止徽标 + 搜索结果计数 ═══
{
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  // 4a：真实中止轮（有内容 + aborted）卡片显示 ⏹ 已中止——用路由拦截构造
  await page.route('**/plugins/dsh-turnbar/state**', async route => {
    const url = new URL(route.request().url())
    const sessionId = url.searchParams.get('sessionId') || 'x'
    const turns = Array.from({ length: 3 }, (_, i) => ({
      id: `s#${i + 1}`, index: i + 1, role: 'user',
      userFirstLine: i === 1 ? '被中止的问题' : `问题 ${i + 1}`,
      assistantFirstLine: i === 1 ? '回复到一半' : `回复 ${i + 1}`,
      startedAt: 1755000000000, tokenIn: 10, tokenOut: 10,
      toolCallCount: i === 1 ? 1 : 0, fileChanges: [], steeringCount: 0,
      endReason: i === 1 ? 'aborted' : undefined,
    }))
    await route.fulfill({ status: 200, contentType: 'application/json',
      body: JSON.stringify({ state: { sessionId, turns, chapterBreaks: [] } }) })
  })
  // route 先于 goto 生效：openSession 的加载与轮询都会被拦截
  await openSession(page)
  await sleep(2500)
  const seg2 = page.locator('[data-turnbar-seg]').nth(1)
  const box2 = await seg2.boundingBox()
  await page.mouse.move(box2.x + box2.width / 2, box2.y + box2.height / 2)
  await sleep(400)
  const card2 = (await page.locator('[data-turnbar-card]').textContent().catch(() => '')) ?? ''
  record('V14-aborted-badge', card2.includes('已中止'), card2.slice(0, 80))
  await page.mouse.move(720, 40)
  // 4b：搜索结果计数行
  await page.keyboard.press('Meta+k')
  await sleep(400)
  await page.locator('[data-turnbar-search-input]').fill('问题')
  await sleep(700)
  const countText = (await page.locator('.tb-search-count').textContent().catch(() => '')) ?? ''
  record('V14-search-count', /\d+ 条结果/.test(countText), `count="${countText}"`)
  await page.close()
}

await browser.close()
console.log('\nDONE verify-fixes')
