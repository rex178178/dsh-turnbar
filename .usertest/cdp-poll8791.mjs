import { spawn } from 'node:child_process'
const PORT = 8791, CDP = 9344
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-poll',
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
  // open session search dialog and click 继续
  await evalJs(`(() => { const b = [...document.querySelectorAll('button,[role=button]')].find(x => x.getAttribute('aria-label') === '搜索会话'); b?.click(); return true })()`)
  await sleep(2500)
  console.log('click 继续:', await evalJs(`(() => { const el = [...document.querySelectorAll('span')].find(s => (s.textContent||'').trim() === '继续'); if (!el) return false; const btn = el.closest('button,[role=button]') ?? el; btn.click(); return true })()`))
  let final = null
  for (let i = 0; i < 24; i++) {
    await sleep(5000)
    const st = await evalJs(`(() => {
      const bar = document.querySelector('[data-turnbar]')
      if (!bar) return null
      const p = bar.parentElement
      const br = bar.getBoundingClientRect(), pr = p.getBoundingClientRect()
      return { segs: document.querySelectorAll('[data-turnbar-seg]').length, running: !!document.querySelector('[data-turnbar-seg].running'), barW: Math.round(br.width), wrapperW: Math.round(pr.width), fullWidth: pr.width > 0 && Math.abs(br.width - pr.width) <= 1, wrapperDisplay: getComputedStyle(p).display, wrapperWrap: getComputedStyle(p).flexWrap }
    })()`)
    if (st !== null) { console.log(`poll ${i}:`, JSON.stringify(st)); if (st.segs >= 2 && !st.running && st.barW > 0) { final = st; break } }
  }
  console.log('FINAL:', JSON.stringify(final))
} finally { try { ws?.close() } catch {}; chrome.kill('SIGKILL') }
