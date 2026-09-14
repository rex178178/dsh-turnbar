// 探针 2：页面网络层——插件 client bundle 是否被请求/是否 404；插件清单路由形态。
import { spawn } from 'node:child_process'
const PORT = Number(process.env.TB_PORT ?? 8791), CDP = Number(process.env.TB_CDP ?? 9347)
const TOKEN = process.env.TB_TOKEN ?? ''
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-probe2',
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
  const responses = []
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.method === 'Network.responseReceived') {
      const u = m.params?.response?.url ?? ''
      if (u.includes('plugin') || u.includes('turnbar') || u.includes('module') || u.includes('bundle')) {
        responses.push({ status: m.params.response.status, url: u.slice(0, 140) })
      }
    }
  }
  const url = `http://127.0.0.1:${PORT}/${TOKEN ? `?token=${TOKEN}` : ''}`
  await cdp('Page.navigate', { url })
  await sleep(9000)
  const res = await evalJs(`(async () => {
    const perf = performance.getEntriesByType('resource').map(e => e.name).filter(n => n.includes('plugin') || n.includes('turnbar') || n.includes('module'))
    // 探测若干可能的插件清单/模块路由
    const tries = {}
    for (const p of ['/plugins', '/api/plugins', '/plugins/manifest', '/api/plugin-modules', '/plugins/dsh-turnbar/client.js', '/plugins/dsh-turnbar/state?sessionId=x']) {
      try { const r = await fetch(p, { credentials: 'include' }); tries[p] = r.status } catch (e) { tries[p] = String(e).slice(0, 60) }
    }
    return { perfCount: perf.length, perf: perf.slice(0, 12), tries }
  })()`)
  console.log('--- network responses (plugin/turnbar/module/bundle) ---')
  for (const r of responses.slice(0, 20)) console.log(r.status, r.url)
  console.log('--- in-page fetch probes ---')
  console.log(JSON.stringify(res.tries, null, 2))
  console.log('--- perf entries ---')
  console.log(JSON.stringify(res.perf, null, 2))
} finally {
  try { ws?.close() } catch {}
  chrome.kill()
}
