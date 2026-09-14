// 探针 3：localStorage['dsh.sessions.current'] 直达配方在 dsh 0.1.5-rc.1 上是否仍有效。
import { spawn } from 'node:child_process'
const PORT = Number(process.env.TB_PORT ?? 8791), CDP = Number(process.env.TB_CDP ?? 9348)
const TOKEN = process.env.TB_TOKEN ?? ''
const SID = 'session-31ed62b0-7d87-435f-95c9-6f9b6e9896a9'
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-probe3',
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
  await cdp('Page.enable'); await cdp('Runtime.enable'); await cdp('Network.enable')
  const stateFetches = []
  const apiErrors = []
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.method === 'Network.requestWillBeSent') {
      const u = m.params?.request?.url ?? ''
      if (u.includes('/plugins/dsh-turnbar/')) stateFetches.push(decodeURIComponent(u.slice(u.indexOf('/plugins'), u.length)).slice(0, 150))
    }
    if (m.method === 'Network.responseReceived') {
      const u = m.params?.response?.url ?? ''
      const s = m.params?.response?.status ?? 0
      if (u.includes('/api/') && s >= 400) apiErrors.push(`${s} ${u.slice(u.indexOf('/api/'), u.length).slice(0, 120)}`)
    }
  }
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/${TOKEN ? `?token=${TOKEN}` : ''}` })
  await sleep(6000)
  // 写入目标会话 + 刷新（v0.3 直达配方）
  await evalJs(`localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId: SID }))})`)
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  // 长等待 + 轮询：给大日志加载/迁移留足时间（验收脚本同款轮询节奏）
  let last = null
  for (let i = 0; i < 10; i++) {
    await sleep(4000)
    last = await evalJs(`(() => ({
      segs: document.querySelectorAll('[data-turnbar-seg]').length,
      flowRows: document.querySelectorAll('[data-chat-flow] > *').length,
      tails: document.querySelectorAll('[data-turn-tail]').length,
    }))()`)
    if (last.tails > 0) break
  }
  const out = await evalJs(`(() => ({
    current: localStorage.getItem('dsh.sessions.current'),
    segs: document.querySelectorAll('[data-turnbar-seg]').length,
    flowRows: document.querySelectorAll('[data-chat-flow] > *').length,
    tails: document.querySelectorAll('[data-turn-tail]').length,
    flowText: (document.querySelector('[data-chat-flow]')?.textContent ?? '').trim().slice(0, 200),
  }))()`)
  console.log('after recipe (polled):', JSON.stringify(out, null, 2))
  console.log('turnbar route requests:', JSON.stringify(stateFetches.slice(0, 6), null, 2))
  console.log('api >=400 responses:', JSON.stringify(apiErrors.slice(0, 10), null, 2))
} finally {
  try { ws?.close() } catch {}
  chrome.kill()
}
