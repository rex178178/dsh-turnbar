// G4 重启断链 gate（runbook「时序盲区」节，v0.3.2 参数化版）：
// 1) 实例起 → 打开复现会话 → 进度条基线 N 段
// 2) 浏览器仍连着时 kill host → 同端口重启
// 3) 刷新（新 token）→ 断言：仍 ≥N 段、悬停有真实内容（非「该轮已终止」）、state 首轮 index=1
// 用法：node .usertest/cdp-g4-restart.mjs   （TB_PORT/TB_CDP/TB_SID 可覆盖）
import { spawn, execSync } from 'node:child_process'
const PORT = Number(process.env.TB_PORT ?? 8791), CDP = Number(process.env.TB_CDP ?? 9354)
const SID = process.env.TB_SID ?? 'session-31ed62b0-7d87-435f-95c9-6f9b6e9896a9'
const HOST_LOG = process.env.TB_HOST_LOG ?? `${process.env.HOME}/.dsh/turnbar-test.log`
const latestToken = () => {
  try {
    const m = execSync(`grep -o "token=[A-Za-z0-9_-]*" ${HOST_LOG} | tail -1`).toString().trim()
    return m.slice('token='.length)
  } catch { return '' }
}
const sleep = ms => new Promise(r => setTimeout(r, ms))
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tb-g4',
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' })
let ws
const idGen = (() => { let i = 0; return () => ++i })()
async function cdp(method, params = {}) {
  const id = idGen(); ws.send(JSON.stringify({ id, method, params }))
  for (;;) { const m = await new Promise(r => ws.onmessage = e => r(JSON.parse(e.data))); if (m.id === id) return m.result }
}
async function evalJs(expression) {
  const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r.result.value
}
const hostPid = () => Number(execSync(`lsof -ti :${PORT} -sTCP:LISTEN`).toString().trim().split('\n')[0])
const waitPort = async () => { for (let i = 0; i < 40; i++) { try { execSync(`lsof -ti :${PORT} -sTCP:LISTEN`); return } catch {} await sleep(500) } throw new Error('host port never came up') }

try {
  let targets
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); if (targets.length > 0) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')

  // 1) 基线：打开会话，等进度条
  const base = `http://127.0.0.1:${PORT}/?token=${latestToken()}`
  await cdp('Page.navigate', { url: base }); await sleep(6000)
  await evalJs(`localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId: SID }))})`)
  await cdp('Page.navigate', { url: base })
  let baseline = 0
  for (let i = 0; i < 30; i++) { await sleep(2000); baseline = await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`); if (baseline >= 15) break }
  console.log('baseline segments:', baseline)
  if (baseline < 2) { console.log('RESULT: FAIL (无基线)'); process.exit(1) }

  // 2) 浏览器连着时重启 host
  const pid = hostPid()
  console.log('killing host pid', pid, '…')
  execSync(`kill ${pid}`)
  await sleep(2500)
  execSync(`nohup node /Users/rexli/.npm-global/bin/dsh --profile turnbar-test --port ${PORT} >> ${HOST_LOG} 2>&1 &`)
  await waitPort()
  await sleep(2000)
  const base2 = `http://127.0.0.1:${PORT}/?token=${latestToken()}`
  console.log('host restarted, new token len:', latestToken().length)

  // 3) 刷新断言
  await cdp('Page.navigate', { url: base2 })
  let after = 0
  for (let i = 0; i < 30; i++) { await sleep(2000); after = await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`); if (after >= baseline) break }
  await sleep(1000)
  // 悬停第一段：卡片必须有真实用户内容
  const hover = await evalJs(`(() => {
    const seg = document.querySelector('[data-turnbar-seg]')
    if (!seg) return { cardUser: null }
    const r = seg.getBoundingClientRect()
    const bar = document.querySelector('[data-turnbar]')
    bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 2, clientY: r.top + 2, pointerId: 9, pointerType: 'mouse', buttons: 0 }))
    return { ok: true }
  })()`)
  await sleep(800)
  hover.cardUser = await evalJs(`(() => { const c = document.querySelector('[data-turnbar-card] .tb-user'); return c ? c.textContent.slice(0, 60) : null })()`)
  const state = await (await fetch(`http://127.0.0.1:${PORT}/plugins/dsh-turnbar/state?sessionId=${SID}`)).json()
  const firstIndex = state?.state?.turns?.[0]?.index ?? null
  console.log('after-restart segments:', after, '| hover card user:', JSON.stringify(hover.cardUser), '| state first turn index:', firstIndex)
  const ok = after >= baseline && hover.cardUser !== null && hover.cardUser !== '' && !(hover.cardUser ?? '').includes('该轮已终止') && firstIndex === 1
  console.log(ok ? 'RESULT: PASS' : 'RESULT: FAIL')
  if (!ok) process.exitCode = 1
} finally { try { ws?.close() } catch {}; chrome.kill('SIGKILL') }
