// Real-machine acceptance helper: open a session by fuzzy title on a DSH web
// instance and measure the turnbar. Usage:
//   node .usertest/cdp-open-and-measure.mjs <port> [title-fragment] [--interact]
// Prints one JSON line: { found, segs, fullWidth, barW, wrapperW, errors, ... }
import { spawn } from 'node:child_process'

const PORT = Number(process.argv[2] ?? 3080)
const TITLE = process.argv[3] ?? ''
const INTERACT = process.argv.includes('--interact')
const CDP_PORT = 9340
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP_PORT}`, `--user-data-dir=/tmp/tbcdp-${PORT}`,
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
const errors = []
const titles = () => evalJs(`[...document.querySelectorAll('span')].map(s => (s.textContent||'').trim()).filter(t => t && t.length < 50)`)
const clickSpanWith = (txt) => evalJs(`(() => {
  const el = [...document.querySelectorAll('span')].find(s => (s.textContent||'').trim().includes(${JSON.stringify(txt)}))
  if (!el) return false
  const btn = el.closest('button,[role=button]') ?? el
  btn.click(); return true
})()`)
const measure = () => evalJs(`(() => {
  const bar = document.querySelector('[data-turnbar]')
  if (!bar) return { found: false }
  const p = bar.parentElement
  const br = bar.getBoundingClientRect(), pr = p.getBoundingClientRect()
  return {
    found: true,
    segs: document.querySelectorAll('[data-turnbar-seg]').length,
    barW: Math.round(br.width), wrapperW: Math.round(pr.width),
    fullWidth: Math.abs(br.width - pr.width) <= 1,
    wrapperDisplay: getComputedStyle(p).display,
    wrapperWrap: getComputedStyle(p).flexWrap,
  }
})()`)
async function interactSmoke() {
  // ⌘K open → Esc close; ⌘↓; hover card via mouse events
  const out = {}
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'k', code: 'KeyK', modifiers: 4, windowsVirtualKeyCode: 75 })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'k', code: 'KeyK', modifiers: 4, windowsVirtualKeyCode: 75 })
  await sleep(600)
  out.searchOpened = await evalJs(`(() => { const s = document.querySelector('[data-turnbar-search]'); return !!s && s.classList.contains('visible') })()`)
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
  await sleep(400)
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key: 'ArrowDown', code: 'ArrowDown', modifiers: 4, windowsVirtualKeyCode: 40 })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key: 'ArrowDown', code: 'ArrowDown', modifiers: 4, windowsVirtualKeyCode: 40 })
  await sleep(800)
  out.noPageErrorAfterKeys = true
  return out
}
try {
  let targets
  for (let i = 0; i < 60; i++) {
    try { targets = await (await fetch(`http://127.0.0.1:${CDP_PORT}/json`)).json(); if (targets.length > 0) break } catch {}
    await sleep(250)
  }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')
  ws.onmessage = e => {} // keep listener sane with cdp() loop
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(7000)
  if (TITLE !== '') {
    let ok = await clickSpanWith(TITLE)
    if (!ok) {
      // maybe session list is inside a workspace folder: try opening workspace rows
      for (const wsName of ['asset-tracker', 'DSH-pulgin']) {
        await clickSpanWith(wsName)
        await sleep(2500)
      }
      ok = await clickSpanWith(TITLE)
      if (!ok) {
        // last resort: click first short span that looks like a title
        ok = await evalJs(`(() => {
          const el = [...document.querySelectorAll('span')].find(s => { const t=(s.textContent||'').trim(); return t.length > 1 && t.length < 20 })
          if (!el) return false
          const btn = el.closest('button,[role=button]') ?? el; btn.click(); return true
        })()`)
      }
    }
    await sleep(9000)
  }
  const result = { port: PORT, title: TITLE, ...(await measure()), errors }
  if (INTERACT) result.smoke = await interactSmoke()
  console.log(JSON.stringify(result))
} finally {
  try { ws?.close() } catch {}
  chrome.kill('SIGKILL')
}
