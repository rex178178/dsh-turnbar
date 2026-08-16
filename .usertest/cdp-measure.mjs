// Measure the dock coexistence geometry on the local repro page:
//   A) baseline (live-stats merge active, no turnbar compat CSS)  → squeeze repro
//   B) with turnbar compat CSS                                    → fix verified
//   C) compat CSS but NO live-stats (TPS removed, merge rules off) → solo look preserved
//   D) stress: compat CSS + a hostile third plugin row-flip        → still full width
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const PORT = 9336
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${PORT}`, '--user-data-dir=/tmp/tbcdp4',
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
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 400))
  return r.result.value
}
const COMPAT_CSS = `
div[data-slot="conversation.composer.dock"][data-slot="conversation.composer.dock"]:has(> [data-turnbar]) {
  display: flex !important;
  flex-direction: row !important;
  flex-wrap: wrap !important;
  align-items: center;
  justify-content: center;
  width: 100% !important;
  box-sizing: border-box;
}
div[data-slot="conversation.composer.dock"][data-slot="conversation.composer.dock"] > [data-turnbar][data-turnbar] {
  flex: 0 0 100% !important;
  order: 1000;
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
  margin: 0 !important;
  padding: 3px 8px !important;
  box-sizing: border-box;
}
div[data-slot="conversation.composer.dock"][data-slot="conversation.composer.dock"]:has(> [data-turnbar]):has(> *:not([role="tooltip"]):nth-child(3)) > *:not([data-turnbar]):not([role="tooltip"]) {
  flex: 0 1 auto;
  max-width: 620px;
  min-width: 0;
}
`
const HOSTILE_CSS = `
div[data-slot="conversation.composer.dock"]:has(> [data-third-party]) {
  display: flex !important; flex-direction: row; flex-wrap: nowrap; width: 100%;
}
div[data-slot="conversation.composer.dock"] > [data-third-party] { flex: 0 0 260px; }
`
const measure = () => evalJs(`(() => {
  const bar = document.querySelector('[data-turnbar]')
  const p = bar.parentElement
  const br = bar.getBoundingClientRect(), pr = p.getBoundingClientRect()
  const pcs = getComputedStyle(p), bcs = getComputedStyle(bar)
  const kids = [...p.children].map(c => {
    const r = c.getBoundingClientRect()
    return { id: c.id || c.getAttribute('data-dsh-live-tps') || c.getAttribute('data-third-party') || c.getAttribute('data-turnbar'), x: Math.round(r.x), w: Math.round(r.width), y: Math.round(r.y) }
  })
  return {
    barW: Math.round(br.width), barX: Math.round(br.x),
    wrapperW: Math.round(pr.width),
    wrapper: { display: pcs.display, wrap: pcs.flexWrap, dir: pcs.flexDirection },
    barFlex: { basis: bcs.flexBasis, shrink: bcs.flexShrink, order: bcs.order },
    kids,
    fullWidth: Math.abs(br.width - pr.width) <= 1 && bar.children.length > 0,
  }
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
  await cdp('Page.navigate', { url: 'file://' + join(here, 'layout-repro.html') })
  await sleep(1500)

  console.log('A baseline (live-stats merge, no compat):', JSON.stringify(await measure()))

  await evalJs(`(() => { const s = document.createElement('style'); s.id='compat'; s.textContent = ${JSON.stringify(COMPAT_CSS)}; document.head.appendChild(s); return true })()`)
  await sleep(400)
  console.log('B compat CSS on:', JSON.stringify(await measure()))

  await evalJs(`(() => {
    document.querySelector('[data-dsh-live-tps]')?.remove()
    document.getElementById('compat')?.remove()
    const s = document.createElement('style'); s.id='compat2'; s.textContent = ${JSON.stringify(COMPAT_CSS)}; document.head.appendChild(s)
    return true
  })()`)
  await sleep(400)
  console.log('C compat, no live-stats (solo look):', JSON.stringify(await measure()))

  await evalJs(`(() => {
    const third = document.createElement('div'); third.setAttribute('data-third-party',''); third.textContent = '3rd plugin 260px'
    const p = document.querySelector('[data-turnbar]').parentElement
    p.insertBefore(third, p.children[2])
    const s = document.createElement('style'); s.id='hostile'; s.textContent = ${JSON.stringify(HOSTILE_CSS)}; document.head.appendChild(s)
    return true
  })()`)
  await sleep(400)
  console.log('D stress: hostile 3rd plugin:', JSON.stringify(await measure()))
} finally {
  try { ws?.close() } catch {}
  chrome.kill('SIGKILL')
}
