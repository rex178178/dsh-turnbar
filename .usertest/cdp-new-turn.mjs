// C10/C11 real-machine check on the test instance: new session (0 turns → no bar),
// send one message, wait for 1 turn → bar with 1 segment.
import { spawn } from 'node:child_process'
const PORT = Number(process.argv[2] ?? 8791), CDP = 9343
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-new',
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
  // new session
  console.log('new session clicked:', await evalJs(`(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => x.getAttribute('aria-label') === '新建会话'); if (!b) return false; b.click(); return true })()`))
  await sleep(6000)
  const zero = await evalJs(`(() => ({ hasBar: !!document.querySelector('[data-turnbar]'), hasTa: !!document.querySelector('textarea') }))()`)
  console.log('0-turn state:', JSON.stringify(zero))
  // type + send
  const typed = await evalJs(`(() => {
    const ta = document.querySelector('textarea')
    if (!ta) return false
    ta.focus()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta, 'hi, one turn check')
    ta.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  console.log('typed:', typed)
  await sleep(800)
  console.log('send clicked:', await evalJs(`(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => x.getAttribute('aria-label') === '发送消息'); if (!b) return false; b.click(); return true })()`))
  // poll for the bar
  let found = null
  for (let i = 0; i < 40; i++) {
    await sleep(5000)
    const st = await evalJs(`(() => {
      const bar = document.querySelector('[data-turnbar]')
      if (!bar) return null
      const p = bar.parentElement
      const br = bar.getBoundingClientRect(), pr = p.getBoundingClientRect()
      return { segs: document.querySelectorAll('[data-turnbar-seg]').length, running: !!document.querySelector('[data-turnbar-seg].running'), barW: Math.round(br.width), wrapperW: Math.round(pr.width), fullWidth: Math.abs(br.width - pr.width) <= 1 }
    })()`)
    if (st !== null) { console.log(`poll ${i}:`, JSON.stringify(st)); if (st.segs >= 1 && !st.running) { found = st; break } }
  }
  console.log('FINAL:', JSON.stringify(found))
} finally { try { ws?.close() } catch {}; chrome.kill('SIGKILL') }
