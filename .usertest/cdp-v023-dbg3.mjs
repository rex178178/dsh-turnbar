// F3 深挖：#3 的 jump 到底发生了什么。dump turn 3 区间行 + 长轮询 flash。
import { spawn } from 'node:child_process'
const CDP = 9349
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-dbg3',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let ws
const idGen = (() => { let i = 0; return () => ++i })()
async function cdp(method, params = {}) {
  const id = idGen(); ws.send(JSON.stringify({ id, method, params }))
  for (;;) { const m = await new Promise(r => ws.onmessage = e => r(JSON.parse(e.data))); if (m.id === id) return m.result }
}
async function evalJs(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) return { __err: JSON.stringify(r.exceptionDetails).slice(0, 200) }
  return r.result.value
}
try {
  let targets
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); if (targets.length > 0) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Page.navigate', { url: 'http://127.0.0.1:8791/' })
  await sleep(8000)
  await evalJs(`(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => x.getAttribute('aria-label') === '搜索会话'); b?.click(); return true })()`)
  await sleep(1500)
  await evalJs(`(() => { const input = document.querySelector('input[placeholder*="搜索会话"]'); if (!input) return false; const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set; setter.call(input, '继续'); input.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
  await sleep(2500)
  await evalJs(`(() => { const spans = [...document.querySelectorAll('span')].filter(s => (s.textContent||'').trim() === '继续'); if (spans.length === 0) return false; const row = spans[0].closest('button,[role=button],li,[class*="row"],[class*="session"]') ?? spans[0]; row.click(); return true })()`)
  for (let i = 0; i < 30; i++) { await sleep(4000); const n = await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`); if (n >= 15) break }
  // 先点 #0 触发全量分页（与正式验收同路径）
  await evalJs(`document.querySelectorAll('[data-turnbar-seg]')[0].click()`)
  for (let i = 0; i < 30; i++) { await sleep(1000); const st = await evalJs(`(() => { const f = document.querySelector('[data-chat-flow]'); let n = f; while (n) { const s = getComputedStyle(n); if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop; n = n.parentElement } return -1 })()`); if (st === 0) break }
  console.log('seg#3 class:', await evalJs(`document.querySelectorAll('[data-turnbar-seg]')[2]?.className`))
  console.log('turn3 interval rows:', JSON.stringify(await evalJs(`(() => {
    const f = document.querySelector('[data-chat-flow]')
    const items = [...f.querySelectorAll('[data-chat-flow-key]')]
    const i2 = items.findIndex(i => i.querySelector('[data-turn-tail="2"]'))
    const i3 = items.findIndex(i => i.querySelector('[data-turn-tail="3"]'))
    return { i2, i3, rows: items.slice(i2 + 1, i3 + 1).map(i => ({ kind: i.getAttribute('data-chat-flow-kind'), text: (i.textContent||'').trim().slice(0, 36) })) }
  })()`), null, 1))
  // 点 #3，长轮询
  await evalJs(`document.querySelector('[data-turnbar-flash]')?.removeAttribute('data-turnbar-flash')`)
  const scrollTop0 = await evalJs(`(() => { const f = document.querySelector('[data-chat-flow]'); let n = f; while (n) { const s = getComputedStyle(n); if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop; n = n.parentElement } return -1 })()`)
  await evalJs(`document.querySelectorAll('[data-turnbar-seg]')[2].click()`)
  for (let t = 0; t < 25000; t += 400) {
    await sleep(400)
    const st = await evalJs(`(() => { const f = document.querySelector('[data-chat-flow]'); let n = f; while (n) { const s = getComputedStyle(n); if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop; n = n.parentElement } return -1 })()`)
    const flash = await evalJs(`(() => { const el = document.querySelector('[data-turnbar-flash]'); if (!el) return null; const item = el.closest('[data-chat-flow-key]'); return { kind: item?.getAttribute('data-chat-flow-kind'), text: (el.textContent||'').trim().slice(0, 40) } })()`)
    if (flash || (t > 4000 && Math.abs(st - scrollTop0) > 8)) { console.log(`t=${t}ms scrollTop=${st} flash=`, JSON.stringify(flash)); if (flash) break }
  }
} finally { try { ws?.close() } catch {}; chrome.kill('SIGKILL') }
