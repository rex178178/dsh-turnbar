// v0.2.3 验收：首末轮跳转 / goal 轮首句 / flash 可视性 / scrub 高亮对位。
// 前提：目标实例已起（默认 8791，可用 TB_PORT 覆盖），真实会话「继续」（18 轮）。
import { spawn } from 'node:child_process'
const PORT = Number(process.env.TB_PORT ?? 8791), CDP = Number(process.env.TB_CDP ?? 9346)
// 0.1.5 起 web 服务要求 ?token= 鉴权（token 见实例启动日志）；旧版留空即可。
const TOKEN = process.env.TB_TOKEN ?? ''
const BASE = `http://127.0.0.1:${PORT}/${TOKEN ? `?token=${TOKEN}` : ''}`
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
  await cdp('Page.navigate', { url: BASE })
  await sleep(6000)
  // 强制打开复现会话（v0.3 起：避免干净 profile 打开新会话导致 0 轮无条）。
  await evalJs(`localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId: 'session-31ed62b0-7d87-435f-95c9-6f9b6e9896a9' }))})`)
  await cdp('Page.navigate', { url: BASE })
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
    // v0.3.2：直达配方为主（上面已写 dsh.sessions.current 并刷新），侧栏搜索降级为
    // 可选兜底——搜不到但目标会话确在开（current key 未被改写 + 会话流有内容）就继续；
    // 新版 Web UI 侧栏改版不再拖垮验收。
    const direct = await evalJs(`(() => {
      const flow = document.querySelector('[data-chat-flow]')
      return {
        cur: localStorage.getItem('dsh.sessions.current') ?? '',
        hasFlow: !!flow,
        flowChildren: flow ? flow.children.length : 0,
      }
    })()`)
    console.log('sidebar search missed; direct recipe state:', JSON.stringify(direct))
    if (!(direct.cur.includes('31ed62b0') && direct.hasFlow && direct.flowChildren > 0)) {
      console.log('session 「继续」 not found; spans:', JSON.stringify(await evalJs(`[...document.querySelectorAll('span')].map(s => (s.textContent||'').trim()).filter(t => t && t.length < 30).slice(0, 40)`)))
      throw new Error('cannot open session 继续 (sidebar + direct recipe both failed)')
    }
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

  // ── F. #3（goal 轮）与 #11（前一轮无轮尾）：权威索引定位 ──
  // 注：E 的 pointerup 留下 200ms suppressClick 窗口，先等它过期再点。
  await sleep(500)
  out.f3 = null; out.f11 = null
  await evalJs(`document.querySelector('[data-turnbar-flash]')?.removeAttribute('data-turnbar-flash')`)
  await clickSeg(2)  // #3
  for (let i = 0; i < 40; i++) { await sleep(300); if (await evalJs(`!!document.querySelector('[data-turnbar-flash]')`)) break }
  await sleep(300)
  out.f3 = await flowInfo()
  console.log('F3. click #3:', JSON.stringify(out.f3.flash))
  await evalJs(`document.querySelector('[data-turnbar-flash]')?.removeAttribute('data-turnbar-flash')`)
  await clickSeg(10)  // #11
  for (let i = 0; i < 40; i++) { await sleep(300); if (await evalJs(`!!document.querySelector('[data-turnbar-flash]')`)) break }
  await sleep(300)
  out.f11 = await flowInfo()
  console.log('F11. click #11:', JSON.stringify(out.f11.flash))

  // ── 汇总判定 ──
  const pass = []
  pass.push(['18 segments', out.segCount === 18])
  pass.push(['A 末轮 <2000ms 且 flash 落在用户行(含"不用查了")', out.lastTurn.ms < 2000 && (out.lastTurn.flash?.text ?? '').includes('不用查了')])
  pass.push(['B 首轮到顶 且 flash 完全可视 且 上方无用户行', out.firstTurn.scrollTop < 80 && out.firstTurn.flash?.fullyVisible === true && out.firstTurn.flash?.userRowsAbove === 0])
  pass.push(['C 中段 #7 落用户行(含"有几个改进")', (out.midTurn.flash?.text ?? '').includes('有几个改进')])
  pass.push(['D 卡片#1 用户句含"用户测试"', (out.hoverCardUser ?? '').includes('用户测试')])
  pass.push(['E scrub 高亮 = 指针段(idx 5)', out.scrub.highlightedIndex === 5])
  pass.push(['F3 #3 flash 存在 且 落 turn 3 区间（goal 上下文行，非用户行、非"继续"）', out.f3.flash != null && out.f3.flash.kind !== 'user' && !(out.f3.flash.text ?? '').startsWith('继续')])
  pass.push(['F11 #11 落 turn 11 触发行(含"我换Pro模型推进吧")', (out.f11.flash?.text ?? '').includes('我换Pro模型推进吧')])
  console.log('\n==== VERDICT ====')
  for (const [name, ok] of pass) console.log(`${ok ? '✅' : '❌'} ${name}`)
  if (pass.some(([, ok]) => !ok)) { console.log('RESULT: FAIL'); process.exitCode = 1 } else console.log('RESULT: PASS')
} finally { try { ws?.close() } catch {}; chrome.kill('SIGKILL') }
