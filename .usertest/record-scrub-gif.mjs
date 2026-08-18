// 录制 v0.3 演示 GIF 的帧序列：复现会话上依次演示
// ① 悬停卡片（含上下文余量+提示行）→ ② 拖动 scrub 扫过全景条 → ③ 落点跳转 flash
// → ④ ⌘K 搜索命中落图。产物回传给 ffmpeg 合成 GIF（见下方执行命令备注）。
// 输出：/tmp/turnbar-gif/frames/ 下的 PNG 序列。
import { spawn } from 'node:child_process'
import { mkdirSync } from 'node:fs'
const PORT = 8791, CDP = 9348
const SID = 'session-31ed62b0-7d87-435f-95c9-6f9b6e9896a9'
const OUT = '/tmp/turnbar-gif/frames'
mkdirSync(OUT, { recursive: true })
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-gif',
  '--no-first-run', '--no-default-browser-check', '--hide-scrollbars', 'about:blank',
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
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r.result.value
}
let frameNo = 0
async function snap() {
  frameNo++
  const shot = await cdp('Page.captureScreenshot', { format: 'png' })
  const { writeFileSync } = await import('node:fs')
  writeFileSync(`${OUT}/frame-${String(frameNo).padStart(5, '0')}.png`, Buffer.from(shot.data, 'base64'))
  return frameNo
}

try {
  let targets
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); if (targets.length > 0) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Emulation.setDeviceMetricsOverride', { width: 1280, height: 820, deviceScaleFactor: 2, mobile: false })
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(6000)
  await evalJs(`localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId: SID }))})`)
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(9000)
  let segs = await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`)
  for (let i = 0; i < 15 && segs < 2; i++) { await sleep(1000); segs = await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`) }
  if (segs < 2) throw new Error('bar not ready: ' + segs)

  // ① 悬停首段：卡片（余量行 + 提示行）静置 6 帧
  await evalJs(`(() => {
    const bar = document.querySelector('[data-turnbar]')
    const segs = document.querySelectorAll('[data-turnbar-seg]')
    const r = segs[1].getBoundingClientRect()
    bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
  })()`)
  await sleep(500)
  for (let i = 0; i < 6; i++) { await snap(); await sleep(120) }

  // ② 拖动 scrub：从段 0 起匀速扫到段 15（拖动中卡片跟随）
  await evalJs(`(() => {
    const bar = document.querySelector('[data-turnbar]')
    bar.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: bar.getBoundingClientRect().left + 8, clientY: bar.getBoundingClientRect().top + 8, pointerId: 1, pointerType: 'mouse', buttons: 1 }))
  })()`)
  const N = 16
  for (let i = 1; i <= N; i++) {
    await evalJs(`(() => {
      const bar = document.querySelector('[data-turnbar]')
      const r = bar.getBoundingClientRect()
      const x = r.left + 8 + (r.width - 64 - 8) * (${i} / ${N})
      const y = r.top + 8
      bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: x, clientY: y, pointerId: 1, pointerType: 'mouse', buttons: 1 }))
    })()`)
    await sleep(120)
    await snap()
  }
  // 松手 → 跳转（长距离 → 分页 + flash）
  await evalJs(`(() => {
    const bar = document.querySelector('[data-turnbar]')
    const r = bar.getBoundingClientRect()
    bar.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.right - 40, clientY: r.top + 8, pointerId: 1, pointerType: 'mouse', buttons: 0 }))
  })()`)
  await sleep(1600)
  for (let i = 0; i < 5; i++) { await snap(); await sleep(200) }

  // ③ ⌘K 搜索 → 命中落图（.hit 琥珀段）
  await evalJs(`document.querySelector('[data-turnbar-search-btn]').click()`)
  await sleep(300)
  await evalJs(`(() => {
    const input = document.querySelector('[data-turnbar-search-input]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, 'Turn Bar')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(1000)
  for (let i = 0; i < 6; i++) { await snap(); await sleep(150) }
  await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(300)
  for (let i = 0; i < 3; i++) { await snap(); await sleep(150) }

  console.log(`frames: ${frameNo} → ${OUT}`)
  process.exit(0)
} catch (e) {
  console.error('RECORD ERROR:', e.message)
  process.exit(1)
}