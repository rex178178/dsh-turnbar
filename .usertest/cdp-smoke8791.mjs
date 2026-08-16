import { spawn } from 'node:child_process'
const PORT = 8791, CDP = 9345
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-smoke',
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
const key = async (key, code, vk, modifiers = 0) => {
  await cdp('Input.dispatchKeyEvent', { type: 'keyDown', key, code, modifiers, windowsVirtualKeyCode: vk })
  await cdp('Input.dispatchKeyEvent', { type: 'keyUp', key, code, modifiers, windowsVirtualKeyCode: vk })
}
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
  for (let i = 0; i < 24; i++) {
    await sleep(5000)
    const segs = await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`)
    if (segs >= 2) break
  }
  const out = {}
  out.segs = await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`)
  // 1. hover first segment → card visible
  await evalJs(`(() => {
    const seg = document.querySelector('[data-turnbar-seg]')
    const r = seg.getBoundingClientRect()
    seg.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 2, clientY: r.top + 2, pointerId: 1, pointerType: 'mouse', buttons: 0 }))
    return true
  })()`)
  await sleep(600)
  out.hoverCardVisible = await evalJs(`(() => { const c = document.querySelector('[data-turnbar-card]'); return !!c && c.classList.contains('visible') })()`)
  // 2. click segment 2 → scroll changes
  out.scrollBefore = await evalJs(`(() => { const f = document.querySelector('[data-chat-flow]'); let n = f; while (n) { const s = getComputedStyle(n); if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop; n = n.parentElement } return 0 })()`)
  await evalJs(`(() => { const segs = document.querySelectorAll('[data-turnbar-seg]'); if (segs.length >= 2) segs[1].click(); return true })()`)
  await sleep(2500)
  out.scrollAfter = await evalJs(`(() => { const f = document.querySelector('[data-chat-flow]'); let n = f; while (n) { const s = getComputedStyle(n); if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n.scrollTop; n = n.parentElement } return 0 })()`)
  out.jumpScrollChanged = Math.abs(out.scrollAfter - out.scrollBefore) > 8
  out.returnToastVisible = await evalJs(`(() => { const t = document.querySelector('[data-turnbar-toast]'); return !!t && t.classList.contains('visible') })()`)
  // 3. ⌘K open → Esc close
  await key('k', 'KeyK', 75, 4)
  await sleep(600)
  out.searchOpened = await evalJs(`(() => { const s = document.querySelector('[data-turnbar-search]'); return !!s && s.classList.contains('visible') })()`)
  await key('Escape', 'Escape', 27)
  await sleep(400)
  out.searchClosed = await evalJs(`(() => { const s = document.querySelector('[data-turnbar-search]'); return !s || !s.classList.contains('visible') })()`)
  // 4. ⌘↓ navigation doesn't break (bar still present, no crash)
  await key('ArrowDown', 'ArrowDown', 40, 4)
  await sleep(800)
  out.barStill = await evalJs(`!!document.querySelector('[data-turnbar]')`)
  console.log('SMOKE:', JSON.stringify(out))
} finally { try { ws?.close() } catch {}; chrome.kill('SIGKILL') }
