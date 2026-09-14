// 探针：dsh 0.1.5-rc.1 兼容性诊断——Web UI 会话列表 / 插件 client 半区 / state 路由调用链。
import { spawn } from 'node:child_process'
const PORT = Number(process.env.TB_PORT ?? 8791), CDP = Number(process.env.TB_CDP ?? 9347)
const TOKEN = process.env.TB_TOKEN ?? ''
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
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 400))
  return r.result.value
}
try {
  let targets
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); if (targets.length > 0) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')
  const url = `http://127.0.0.1:${PORT}/${TOKEN ? `?token=${TOKEN}` : ''}`
  await cdp('Page.navigate', { url })
  await sleep(8000)

  const probe = await evalJs(`(async () => {
    const out = {}
    out.title = document.title
    out.turnbarBar = !!document.querySelector('[data-turnbar-bar],[data-turnbar-seg]')
    out.turnbarSegs = document.querySelectorAll('[data-turnbar-seg]').length
    out.moduleLoaderMarks = {
      turnbarClient: !!document.querySelector('[data-turnbar-root],[class*="turnbar"]'),
    }
    out.storageKeys = Object.keys(localStorage).slice(0, 20)
    out.current = localStorage.getItem('dsh.sessions.current')
    // 从页面内 fetch 会话列表（带浏览器自身的鉴权状态）
    try {
      const r = await fetch('/api/sessions', { credentials: 'include' })
      out.apiSessionsStatus = r.status
      if (r.ok) {
        const j = await r.json()
        const arr = Array.isArray(j) ? j : (j.sessions ?? j.items ?? j.data ?? [])
        out.apiSessionsCount = arr.length
        out.apiSessionsSample = arr.slice(0, 5).map(s => s?.id ?? s?.sessionId ?? JSON.stringify(s).slice(0, 60))
        out.hasRepro = arr.some(s => (s?.id ?? s?.sessionId ?? '').includes('31ed62b0'))
      } else { out.apiSessionsBody = (await r.text()).slice(0, 120) }
    } catch (e) { out.apiSessionsErr = String(e).slice(0, 120) }
    // state 路由（插件数据面）
    try {
      const r2 = await fetch('/plugins/dsh-turnbar/state?sessionId=session-31ed62b0-7d87-435f-95c9-6f9b6e9896a9', { credentials: 'include' })
      out.stateStatus = r2.status
    } catch (e) { out.stateErr = String(e).slice(0, 120) }
    // 侧栏会话行文案样本
    out.sidebarSpans = [...document.querySelectorAll('span')]
      .map(s => (s.textContent || '').trim()).filter(t => t && t.length < 24).slice(0, 30)
    return out
  })()`)
  console.log(JSON.stringify(probe, null, 2))
} finally {
  try { ws?.close() } catch {}
  chrome.kill()
}
