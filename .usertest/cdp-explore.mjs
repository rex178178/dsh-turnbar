// Explore sidebar structure & open a session step by step.
import { spawn } from 'node:child_process'
const PORT = 9334
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/tbcdp2',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let ws
const idGen = (() => { let i = 0; return () => ++i })()
async function cdp(method, params = {}) {
  const id = idGen()
  ws.send(JSON.stringify({ id, method, params }))
  for (;;) {
    const msg = await new Promise(r => ws.onmessage = e => r(JSON.parse(e.data)))
    if (msg.id === id) return msg.result
  }
}
async function evalJs(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r.result.value
}
const dump = async () => evalJs(`(() => ({
  spans: [...document.querySelectorAll('span')].map(s => (s.textContent||'').trim()).filter(t => t && t.length < 50).slice(0, 60),
  buttons: [...document.querySelectorAll('button,[role=button]')].map(b => (b.getAttribute('aria-label')||b.textContent||'').trim()).filter(t => t && t.length < 50).slice(0, 60),
}))()`)
try {
  let targets
  for (let i = 0; i < 40; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json(); if (targets.length > 0) break } catch {}
    await sleep(250)
  }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Page.navigate', { url: 'http://127.0.0.1:3080/' })
  await sleep(7000)
  console.log('step0:', JSON.stringify(await dump(), null, 0))
  // click a workspace row containing 'asset' or 'DSH-pulgin'
  const clickSpan = async (txt) => evalJs(`(() => {
    const el = [...document.querySelectorAll('span')].find(s => (s.textContent||'').trim().includes('${txt}'))
    if (!el) return false
    const btn = el.closest('button,[role=button]') ?? el
    btn.click(); return true
  })()`)
  console.log('click ws:', await clickSpan('asset'))
  await sleep(3000)
  console.log('step1:', JSON.stringify(await dump(), null, 0))
} finally {
  try { ws?.close() } catch {}
  chrome.kill('SIGKILL')
}
