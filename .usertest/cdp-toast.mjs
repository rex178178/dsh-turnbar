import { spawn } from 'node:child_process'
const PORT = 8791, CDP = 9346
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-toast',
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
const toastState = () => evalJs(`(() => { const t = document.getElementById('dsh-turnbar-toast'); return t ? { cls: t.className, text: t.textContent } : null })()`)
try {
  let targets
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); if (targets.length > 0) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(8000)
  await evalJs(`(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => x.getAttribute('aria-label') === '搜索会话'); b?.click(); return true })()`)
  await sleep(2500)
  await evalJs(`(() => { const el = [...document.querySelectorAll('span')].find(s => (s.textContent||'').trim() === '继续'); if (!el) return false; const btn = el.closest('button,[role=button]') ?? el; btn.click(); return true })()`)
  for (let i = 0; i < 24; i++) { await sleep(5000); if (await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`) >= 2) break }
  console.log('toast before:', JSON.stringify(await toastState()))
  await evalJs(`(() => { const segs = document.querySelectorAll('[data-turnbar-seg]'); segs[Math.min(2, segs.length-1)].click(); return true })()`)
  for (const ms of [800, 2000, 4200]) {
    await sleep(ms === 800 ? 800 : ms - 2000)
    console.log(`toast at +${ms}ms:`, JSON.stringify(await toastState()))
  }
  console.log('toast at +7000ms:', JSON.stringify(await toastState()))
} finally { try { ws?.close() } catch {}; chrome.kill('SIGKILL') }
