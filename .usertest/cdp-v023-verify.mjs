// v0.2.3 验收：首末轮跳转 / goal 轮首句 / flash 可视性 / scrub 高亮对位。
// 前提：8791 实例已起（cwd=/Users/rexli/DSH-pulgin，插件 link 安装），真实会话「继续」（18 轮）。
import { spawn } from 'node:child_process'
const PORT = 8791, CDP = 9346
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-v023',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore', })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let ws
const idGen = (() => { let i = 0; return () => ++i })()
async function cdp(method, params = {}) {
  const id = idGen(); ws.send(JSON.stringify({ id, method, params }))
  for (;;) { const m = await new Promise(r => ws.onmessage = e => r(JSON.parse(e.data))); if (m.id === id) return m.result }
}
async function evalJs(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 400))
  return r.result.value
}
const flowInfo = () => evalJs(`(() => {
  const f = document.querySelector('[data-chat-flow]')
  let n = f, scroller = null
  while (n) { const s = getComputedStyle(n); if (s.overflowY === 'auto' || s.overflowY === 'scroll') { scroller = n; break } n = n.parentElement }
  const flash = document.querySelector('[data-turnbar-flash]')
  const tails = [...f.querySelectorAll('[data-turn-tail]')].map(t => Number(t.getAttribute('data-turn-tail')))
  const flashRect = flash ? flash.getBoundingClientRect() : null
  const scrollerRect = scroller ? scroller.getBoundingClientRect() : null
  return {
    scrollTop: scroller ? scroller.scrollTop : -1,
    scrollHeight: scroller ? scroller.scrollHeight : -1,
    clientHeight: scroller ? scroller.clientHeight : -1,
    tails,
    flash: flash ? {
      text: (flash.textContent || '').trim().slice(0, 60),
      kind: flash.closest('[data-chat-flow-key]')?.getAttribute('data-chat-flow-kind') ?? null,
      top: flashRect.top, bottom: flashRect.bottom,
      scrollerTop: scrollerRect ? scrollerRect.top : null,
      scrollerBottom: scrollerRect ? scrollerRect.bottom : null,
      fullyVisible: scrollerRect ? flashRect.top >= scrollerRect.top - 0.5 && flashRect.bottom <= scrollerRect.bottom + 0.5 : null,
      userRowsAbove: (() => {
        if (!flash) return -1
        const item = flash.closest('[data-chat-flow-key]')
        let n2 = item ? item.previousElementSibling : null, count = 0
        while (n2) { if (n2.querySelector('[data-time-hover-root] [class*="bubble"]')) count++; n2 = n2.previousElementSibling }
        return count
      })(),
    } : null,
  }
})()`)
const clickSeg = i => evalJs(`(() => { const segs = document.querySelectorAll('[data-turnbar-seg]'); if (segs.length <= ${i}) return false; segs[${i}].click(); return true })()`)

try {
  let targets
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); if (targets.length > 0) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(8000)

  // 打开「继续」会话（18 轮）：搜索会话 → 输入过滤 → 点会话行
  await evalJs(`(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => x.getAttribute('aria-label') === '搜索会话'); b?.click(); return true })()`)
  await sleep(1500)
  await evalJs(`(() => {
    const input = document.querySelector('input[placeholder*="搜索会话"]')
    if (!input) return false
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, '继续')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  await sleep(2500)
  const opened = await evalJs(`(() => {
    const spans = [...document.querySelectorAll('span')].filter(s => (s.textContent||'').trim() === '继续')
    if (spans.length === 0) return false
    const row = spans[0].closest('button,[role=button],li,[class*="row"],[class*="session"]') ?? spans[0]
    row.click(); return true
  })()`)
  if (!opened) {
    console.log('session 「继续」 not found; spans:', JSON.stringify(await evalJs(`[...document.querySelectorAll('span')].map(s => (s.textContent||'').trim()).filter(t => t && t.length < 30).slice(0, 40)`)))
    throw new Error('cannot open session 继续')
  }
  for (let i = 0; i < 30; i++) { await sleep(4000); const n = await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`); if (n >= 15) break }
  const out = {}
  out.segCount = await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`)
  console.log('segments:', out.segCount)

  // ── A. 末轮（seg[17]）：必须 2s 内完成，不触发全量翻页 ──
  let t0 = Date.now()
  await clickSeg(out.segCount - 1)
  let waited = 0
  while (Date.now() - t0 < 6000) {
    await sleep(200); waited = Date.now() - t0
    if (await evalJs(`!!document.querySelector('[data-turnbar-flash]')`)) break
  }
  out.lastTurn = { ms: waited, ...(await flowInfo()) }
  console.log('A. last turn:', JSON.stringify(out.lastTurn))

  // ── B. 首轮（seg[0]，goal 轮）：落轮 1 区间（flash 上方无用户行）且完全可视 ──
  t0 = Date.now()
  await clickSeg(0)
  waited = 0
  while (Date.now() - t0 < 15000) {
    await sleep(300); waited = Date.now() - t0
    const fi = await flowInfo()
    if (fi.flash && fi.scrollTop < 80) break   // 到顶且 flash 出现
  }
  out.firstTurn = { ms: waited, ...(await flowInfo()) }
  console.log('B. first turn:', JSON.stringify(out.firstTurn))

  // ── C. 中段轮回归（#7「有几个改进的点」） ──
  await evalJs(`document.querySelector('[data-turnbar-flash]')?.removeAttribute('data-turnbar-flash')`)  // 清掉 B 的残留 flash
  await clickSeg(6)
  for (let i = 0; i < 40; i++) {
    await sleep(300)
    const fresh = await evalJs(`(() => { const f = document.querySelector('[data-turnbar-flash]'); if (!f) return null; const r = f.getBoundingClientRect(); return r.top > -1000 && r.top < 3000 })()`)
    if (fresh === true) break   // 视口附近的新 flash 才算数
  }
  await sleep(400)
  out.midTurn = await flowInfo()
  console.log('C. mid turn:', JSON.stringify(out.midTurn))

  // ── D. 悬停卡 #1 显示 goal Objective 用户句（fold 修复） ──
  await evalJs(`(() => { const seg = document.querySelector('[data-turnbar-seg]'); const r = seg.getBoundingClientRect(); seg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 2, clientY: r.top + 2, pointerId: 9, pointerType: 'mouse', buttons: 0 })); return true })()`)
  await sleep(600)
  out.hoverCardUser = await evalJs(`(() => { const c = document.querySelector('[data-turnbar-card] .tb-user'); return c ? c.textContent.slice(0, 50) : null })()`)
  console.log('D. hover card #1 user line:', JSON.stringify(out.hoverCardUser))

  // ── E. scrub 高亮对位：按住第 3 段拖到第 6 段，scrub-target 必须在第 6 段 ──
  await evalJs(`(() => {
    const bar = document.querySelector('[data-turnbar]')
    const segs = [...bar.querySelectorAll('[data-turnbar-seg]')]
    if (segs.length < 7) return { skip: true }
    const r3 = segs[2].getBoundingClientRect(), r6 = segs[5].getBoundingClientRect()
    const mk = (type, x, buttons) => new PointerEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: r3.top + 4, pointerId: 5, pointerType: 'mouse', isPrimary: true, buttons })
    bar.dispatchEvent(mk('pointerdown', r3.left + 2, 1))
    bar.dispatchEvent(mk('pointermove', r3.left + 12, 1))   // 越过 4px 阈值进入 scrub
    bar.dispatchEvent(mk('pointermove', r6.left + 2, 1))    // 拖到第 6 段
    return true
  })()`)
  await sleep(400)   // 高亮在 rAF 回调里落 class，异步等一拍再读
  out.scrub = await evalJs(`(() => {
    const segs = [...document.querySelectorAll('[data-turnbar-seg]')]
    const idx = segs.findIndex(s => s.classList.contains('scrub-target'))
    return { highlightedIndex: idx, expect: 5 }
  })()`)
  await evalJs(`(() => { const bar = document.querySelector('[data-turnbar]'); bar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, clientX: 0, clientY: 0, pointerId: 5, pointerType: 'mouse', isPrimary: true, buttons: 0 })) ; return true })()`)
  console.log('E. scrub highlight:', JSON.stringify(out.scrub))

  // ── 汇总判定 ──
  const pass = []
  pass.push(['18 segments', out.segCount === 18])
  pass.push(['A 末轮 <2000ms 且 flash 落在用户行(含"不用查了")', out.lastTurn.ms < 2000 && (out.lastTurn.flash?.text ?? '').includes('不用查了')])
  pass.push(['B 首轮到顶 且 flash 完全可视 且 上方无用户行', out.firstTurn.scrollTop < 80 && out.firstTurn.flash?.fullyVisible === true && out.firstTurn.flash?.userRowsAbove === 0])
  pass.push(['C 中段 #7 落用户行(含"有几个改进")', (out.midTurn.flash?.text ?? '').includes('有几个改进')])
  pass.push(['D 卡片#1 用户句含"用户测试"', (out.hoverCardUser ?? '').includes('用户测试')])
  pass.push(['E scrub 高亮 = 指针段(idx 5)', out.scrub.highlightedIndex === 5])
  console.log('\n==== VERDICT ====')
  for (const [name, ok] of pass) console.log(`${ok ? '✅' : '❌'} ${name}`)
  if (pass.some(([, ok]) => !ok)) { console.log('RESULT: FAIL'); process.exitCode = 1 } else console.log('RESULT: PASS')
} finally { try { ws?.close() } catch {}; chrome.kill('SIGKILL') }
