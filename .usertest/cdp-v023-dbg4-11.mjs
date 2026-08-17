// 调试：#4 / #11 跳转落点。dump 全部用户行文本序列 + 点击后 flash 落点。
import { spawn } from 'node:child_process'
const CDP = 9348
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-dbg411',
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
const userRows = () => evalJs(`(() => {
  const f = document.querySelector('[data-chat-flow]')
  if (!f) return null
  return [...f.querySelectorAll('[data-time-hover-root]')].filter(el =>
    el.hasAttribute('data-time-hover-root') && !el.hasAttribute('data-turn-tail')
    && el.querySelector('[class*="bubble"]')
  ).map(el => {
    const item = el.closest('[data-chat-flow-key]')
    return { key: item?.getAttribute('data-chat-flow-key'), kind: item?.getAttribute('data-chat-flow-kind'), text: (el.textContent||'').trim().slice(0, 40) }
  })
})()`)
const flashInfo = () => evalJs(`(() => {
  const f = document.querySelector('[data-turnbar-flash]')
  if (!f) return null
  const item = f.closest('[data-chat-flow-key]')
  return { key: item?.getAttribute('data-chat-flow-key'), kind: item?.getAttribute('data-chat-flow-kind'), text: (f.textContent||'').trim().slice(0, 50) }
})()`)
const clickSeg = i => evalJs(`(() => { const segs = document.querySelectorAll('[data-turnbar-seg]'); if (segs.length <= ${i}) return false; segs[${i}].click(); return true })()`)
async function jumpAndReport(idx, label) {
  await evalJs(`document.querySelector('[data-turnbar-flash]')?.removeAttribute('data-turnbar-flash')`)
  await clickSeg(idx)
  for (let i = 0; i < 30; i++) { await sleep(300); if (await evalJs(`!!document.querySelector('[data-turnbar-flash]')`)) break }
  await sleep(300)
  console.log(`${label}:`, JSON.stringify(await flashInfo()))
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
  console.log('segs:', await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`))
  // 先到顶（加载全量），用户行序列才完整
  await clickSeg(0)
  for (let i = 0; i < 30; i++) { await sleep(1000); const st = await evalJs(`(() => { const f = document.querySelector('[data-chat-flow]'); let n = f; while (n) { const s = getComputedStyle(n); if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop; n = n.parentElement } return -1 })()`); if (st === 0) break }
  console.log('user rows (full):', JSON.stringify(await userRows(), null, 1))
  await jumpAndReport(2, 'click #3 (idx2)')
  await jumpAndReport(10, 'click #11 (idx10)')
  console.log('flash neighbors #11:', JSON.stringify(await evalJs(`(() => { const f = document.querySelector('[data-turnbar-flash]'); if (!f) return null; const item = f.closest('[data-chat-flow-key]'); const out = []; let n = item; for (let i = 0; i < 3 && n; i++) { n = n.previousElementSibling; if (n) out.unshift({ kind: n.getAttribute('data-chat-flow-kind'), text: (n.textContent||'').trim().slice(0,30) }) } out.push({ kind: item.getAttribute('data-chat-flow-kind'), text: (item.textContent||'').trim().slice(0,30), SELF: true }); n = item.nextElementSibling; if (n) out.push({ kind: n.getAttribute('data-chat-flow-kind'), text: (n.textContent||'').trim().slice(0,30) }); return out })()`)))
} finally { try { ws?.close() } catch {}; chrome.kill('SIGKILL') }
