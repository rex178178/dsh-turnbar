// Live layout diagnosis via raw CDP (no playwright): measure [data-turnbar]
// geometry + dock wrapper computed style + siblings on the running GUI.
import { spawn } from 'node:child_process'

const PORT = 9333
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`,
  '--user-data-dir=/tmp/tbcdp', '--no-first-run', '--no-default-browser-check',
  'about:blank',
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

try {
  // wait for debug endpoint
  let targets
  for (let i = 0; i < 40; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
      if (targets.length > 0) break
    } catch {}
    await sleep(250)
  }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable')
  await cdp('Runtime.enable')
  await cdp('Page.navigate', { url: 'http://127.0.0.1:3080/' })
  await sleep(6000)
  const titles = await evalJs(`[...document.querySelectorAll('span')].map(s => (s.textContent||'').trim()).filter(t => t.length > 0 && t.length < 40).slice(0, 25)`)
  console.log('titles:', JSON.stringify(titles))
  const clicked = await evalJs(`(() => {
    const spans = [...document.querySelectorAll('span')].filter(s => { const t=(s.textContent||'').trim(); return t && t.length < 40 })
    const el = spans.find(s => (s.textContent||'').includes('收到') || (s.textContent||'').includes('修复')) ?? spans.find(s => (s.textContent||'').length < 20)
    if (!el) return false
    const btn = el.closest('button,[role=button]') ?? el
    btn.click(); return true
  })()`)
  console.log('session clicked:', clicked)
  await sleep(8000)
  const r = await evalJs(`(() => {
    const bar = document.querySelector('[data-turnbar]')
    if (!bar) return { found: false, url: location.href, title: document.title }
    const p = bar.parentElement
    const pr = p.getBoundingClientRect(), br = bar.getBoundingClientRect()
    const pcs = getComputedStyle(p), bcs = getComputedStyle(bar)
    return {
      found: true,
      barRect: { w: Math.round(br.width), h: Math.round(br.height), x: Math.round(br.x) },
      parentRect: { w: Math.round(pr.width), h: Math.round(pr.height) },
      parentStyle: { display: pcs.display, flexDirection: pcs.flexDirection, flexWrap: pcs.flexWrap, justifyContent: pcs.justifyContent },
      barStyle: { width: bcs.width, flex: bcs.flex, flexBasis: bcs.flexBasis, flexGrow: bcs.flexGrow, flexShrink: bcs.flexShrink },
      segs: document.querySelectorAll('[data-turnbar-seg]').length,
      siblings: [...p.children].map(c => {
        const cr = c.getBoundingClientRect()
        return { tag: c.tagName, attr: c.getAttribute('data-slot') || c.getAttribute('data-dsh-live-tps') || c.getAttribute('data-turnbar') || (c.className||'').toString().slice(0,24), w: Math.round(cr.width), x: Math.round(cr.x) }
      }),
      statsLine: (() => {
        const st = [...p.children].find(c => !c.hasAttribute('data-turnbar'))
        if (!st) return null
        const r = st.getBoundingClientRect()
        return { w: Math.round(r.width), x: Math.round(r.x) }
      })(),
    }
  })()`)
  console.log(JSON.stringify(r, null, 1))
} finally {
  try { ws?.close() } catch {}
  chrome.kill('SIGKILL')
}
