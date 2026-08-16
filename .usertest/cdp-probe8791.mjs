// Probe 8791: dump titles, click a session, dump post-click DOM state.
import { spawn } from 'node:child_process'
const PORT = 8791, CDP = 9341
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-probe',
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
const dump = () => evalJs(`(() => ({
  titles: [...document.querySelectorAll('span')].map(s => (s.textContent||'').trim()).filter(t => t && t.length < 50).slice(0, 40),
  hasDock: !!document.querySelector('[data-slot="conversation.composer.dock"]'),
  hasTurnbar: !!document.querySelector('[data-turnbar]'),
  hasTextarea: !!document.querySelector('textarea'),
  hasChatFlow: !!document.querySelector('[data-chat-flow]'),
  bodyText: document.body.innerText.slice(0, 300),
}))()`)
try {
  let targets
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); if (targets.length > 0) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(8000)
  console.log('before:', JSON.stringify(await dump(), null, 1))
  const clicked = await evalJs(`(() => {
    const el = [...document.querySelectorAll('span')].find(s => (s.textContent||'').trim().includes('继续'))
    if (!el) return false
    const btn = el.closest('button,[role=button]') ?? el; btn.click(); return true
  })()`)
  console.log('clicked 继续:', clicked)
  await sleep(10000)
  console.log('after:', JSON.stringify(await dump(), null, 1))
} finally {
  try { ws?.close() } catch {}; chrome.kill('SIGKILL')
}
