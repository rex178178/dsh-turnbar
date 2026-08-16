import { spawn } from 'node:child_process'
const PORT = 8791, CDP = 9342
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-nav',
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
  if (r.exceptionDetails) throw new Error('eval: ' + JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r.result.value
}
try {
  let targets
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); if (targets.length > 0) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(8000)
  const btn = await evalJs(`[...document.querySelectorAll('button,[role=button]')].map(b => ({ a: b.getAttribute('aria-label'), t: (b.textContent||'').trim().slice(0,24) })).filter(x => x.a || x.t).slice(0, 30)`)
  console.log('buttons:', JSON.stringify(btn, null, 0))
  console.log('click search:', await evalJs(`(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => x.getAttribute('aria-label') === '搜索会话'); if (!b) return false; b.click(); return true })()`))
  await sleep(3000)
  console.log('titles after search:', await evalJs(`[...document.querySelectorAll('span')].map(s => (s.textContent||'').trim()).filter(t => t && t.length < 40).slice(0, 30)`))
} finally { try { ws?.close() } catch {}; chrome.kill('SIGKILL') }
