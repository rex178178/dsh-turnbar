// Open a real session via 搜索会话 flow.
import { spawn } from 'node:child_process'
const PORT = 9335
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/tbcdp3',
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
const spans = () => evalJs(`[...document.querySelectorAll('span')].map(s => (s.textContent||'').trim()).filter(t => t && t.length < 50)`)
const clickText = (txt) => evalJs(`(() => {
  const el = [...document.querySelectorAll('span')].find(s => (s.textContent||'').trim() === '${txt}')
  if (!el) return false
  const btn = el.closest('button,[role=button]') ?? el; btn.click(); return true
})()`)
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
  console.log('click 搜索会话:', await clickText('搜索会话'))
  await sleep(2500)
  const s1 = await spans()
  console.log('after search click:', JSON.stringify(s1.slice(0, 50)))
  // try typing into any visible input
  const typed = await evalJs(`(() => {
    const inputs = [...document.querySelectorAll('input')].filter(i => i.offsetParent !== null)
    if (inputs.length === 0) return false
    const i = inputs[0]
    i.focus()
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(i, '收到')
    i.dispatchEvent(new Event('input', { bubbles: true }))
    return true
  })()`)
  console.log('typed:', typed)
  await sleep(2500)
  console.log('after typing:', JSON.stringify((await spans()).slice(0, 60)))
  const clicked = await evalJs(`(() => {
    const el = [...document.querySelectorAll('span')].find(s => (s.textContent||'').trim().includes('收到'))
    if (!el) return false
    const btn = el.closest('button,[role=button]') ?? el; btn.click(); return true
  })()`)
  console.log('click session:', clicked)
  await sleep(9000)
  const r = await evalJs(`(() => {
    const bar = document.querySelector('[data-turnbar]')
    if (!bar) return { found: false }
    const p = bar.parentElement
    const br = bar.getBoundingClientRect(), pr = p.getBoundingClientRect()
    const pcs = getComputedStyle(p), bcs = getComputedStyle(bar)
    return {
      found: true,
      barRect: { w: Math.round(br.width), h: Math.round(br.height) },
      parentRect: { w: Math.round(pr.width) },
      parentStyle: { display: pcs.display, flexDirection: pcs.flexDirection, flexWrap: pcs.flexWrap },
      barStyle: { width: bcs.width, flexBasis: bcs.flexBasis, flexShrink: bcs.flexShrink },
      segs: document.querySelectorAll('[data-turnbar-seg]').length,
      siblings: [...p.children].map(c => { const cr = c.getBoundingClientRect(); return { attr: c.getAttribute('data-slot') || c.getAttribute('data-dsh-live-tps') || c.getAttribute('data-turnbar') || '', w: Math.round(cr.width), x: Math.round(cr.x) } }),
    }
  })()`)
  console.log(JSON.stringify(r, null, 1))
} finally {
  try { ws?.close() } catch {}
  chrome.kill('SIGKILL')
}
