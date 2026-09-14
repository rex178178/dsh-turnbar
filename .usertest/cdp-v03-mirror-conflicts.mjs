// 生产镜像全场景专项（v0.3 · turnbar-mirror profile）：
// 验证 turnbar 与生产全家桶（navbar / web-ui-all(live-stats) / usage-stats / aegis / dshmarket）
// 共存：dock 不挤压、⌘K/⌘↑↓ 键位不互抢、DOM 跳转锚点不互踩、悬停卡正常、无页面崩溃。
// 用法：node .usertest/cdp-v03-mirror-conflicts.mjs（实例在 8794，用 TB_PORT/TB_CDP 覆盖）
import { spawn } from 'node:child_process'
const SID = 'session-31ed62b0-7d87-435f-95c9-6f9b6e9896a9'
const PORT = Number(process.env.TB_PORT ?? 8794), CDP = Number(process.env.TB_CDP ?? 9352)
// 0.1.5 起 web 服务要求 ?token= 鉴权（token 见实例启动日志）；旧版留空即可。
const TOKEN = process.env.TB_TOKEN ?? ''
const BASE = `http://127.0.0.1:${PORT}/${TOKEN ? `?token=${TOKEN}` : ''}`
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, `--user-data-dir=/tmp/tbcdp-mirror-${Date.now()}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank',
], { stdio: 'ignore' })
const sleep = ms => new Promise(r => setTimeout(r, ms))
let ws
const idGen = (() => { let i = 0; return () => ++i })()
async function cdp(method, params = {}) {
  const id = idGen()
  return new Promise(res => {
    const onMsg = e => { const d = JSON.parse(e.data); if (d.id === id) { ws.removeEventListener('message', onMsg); res(d) } }
    ws.addEventListener('message', onMsg)
    ws.send(JSON.stringify({ id, method, params }))
  })
}
// 所有求值一律返回 JSON 字符串：returnByValue 序列化对象/元素有 -32000 坑（已踩）。
// cdp() 返回整条消息；Runtime.evaluate 的 RemoteObject 在 r.result.result。
async function evalJs(expression) {
  for (let attempt = 0; ; attempt++) {
    const r = await cdp('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
    if (r !== undefined && r !== null) {
      if (r.error) throw new Error('Runtime.evaluate: ' + JSON.stringify(r.error).slice(0, 160))
      const rt = r.result
      if (rt?.exceptionDetails) throw new Error('eval threw: ' + JSON.stringify(rt.exceptionDetails).slice(0, 160))
      const remote = rt?.result ?? {}
      // 发后就弃的表达式（dispatchEvent 等）返回 undefined → 归一为哨兵 'ok'
      if (remote.type === 'undefined') return 'ok'
      if (typeof remote.value === 'string') return remote.value
      if (attempt >= 2) throw new Error('eval not-string: ' + JSON.stringify(r).slice(0, 160))
      await sleep(200)
      continue
    }
    if (attempt >= 2) throw new Error('eval no result 3x')
    await sleep(250)
  }
}
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`) }

try {
  let targets
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); if (targets.length > 0) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Page.navigate', { url: BASE })
  await sleep(5000)
  await evalJs(`localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId: SID }))}); 'ok'`)
  await cdp('Page.navigate', { url: BASE })
  // 轮询等进度条就绪（全家桶加载 + 会话回填可能较慢）
  let segs = 0
  for (let i = 0; i < 25 && segs === 0; i++) {
    try { segs = Number(await evalJs(`String(document.querySelectorAll('[data-turnbar-seg]').length)`)) } catch { segs = 0 }
    if (segs === 0) await sleep(1000)
  }
  check('全家桶共存：进度条渲染', segs >= 18, `${segs} 段（期望 ≥18）`)

  // 0. 场景快照（JSON 字符串返回）
  const scene = JSON.parse(await evalJs(`JSON.stringify((() => {
    const bars = document.querySelectorAll('[data-turnbar]')
    const bar = bars[0] ?? null
    // navbar 存活计数基（v0.3.2 适配 0.1.5）：旧版数 data-time-hover-root（dsh 聊天行标记），
    // 0.1.5 起聊天行不再渲染该标记（0 个）→ 改数 kind=user 的聊天行（两代都在）。
    const navRoot = [...document.querySelectorAll('[data-time-hover-root]')].length
      || [...document.querySelectorAll('[data-chat-flow-kind="user"]')].length
    const dock = document.querySelector('div[data-slot="conversation.composer.dock"]') || document.querySelector('[data-slot="conversation.composer.dock"]')
    const barW = bar ? bar.offsetWidth : -1
    const dockW = dock ? dock.offsetWidth : -1
    const fillRatio = dockW > 0 ? barW / dockW : 0
    return { barCount: bars.length, navRoot, dockW, barW, fillRatio }
  })())`))
  check('navbar 同窗存活（DOM 锚点共用但不塌）', scene.navRoot > 0, `${scene.navRoot} 个用户行/悬停根`)
  check('无重复注入：全页仅一条进度条', scene.barCount === 1, `${scene.barCount} 条`)
  check('dock 布局：条独占整行（占比 ≥95%）', scene.fillRatio >= 0.95, `barW/dockW=${scene.barW}/${scene.dockW}=${scene.fillRatio.toFixed(3)}`)

  // 1. ⌘K 打开我们的搜索面板（不被其他插件拦截）
  await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true, cancelable: true })); undefined`)
  await sleep(500)
  const searchOpen = await evalJs(`String(document.getElementById('dsh-turnbar-search') !== null && document.getElementById('dsh-turnbar-search').classList.contains('visible'))`)
  check('⌘K 未被抢键：我们的搜索面板打开', searchOpen === 'true', '')
  await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); undefined`)
  await sleep(250)

  // 2. ⌘↑ 逐轮导航仍工作（有 flash 高亮 = 发生了跳转）
  await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', metaKey: true, bubbles: true, cancelable: true })); undefined`)
  await sleep(1500)
  const stepped = await evalJs(`String(document.querySelector('[data-turnbar-flash]') !== null)`)
  check('⌘↑ 导航未被抢键：跳转发生且有高亮', stepped === 'true', '')

  // 3. 点击 #11 落 user 行（navbar 共存下锚点不互踩）— flash 2.5s 消失，轮询捕获
  await evalJs(`(() => { const s = document.querySelectorAll('[data-turnbar-seg]'); s[10]?.click(); return 'ok' })()`)
  let jump = null
  for (let i = 0; i < 18 && jump === null; i++) {
    await sleep(300)
    try {
      jump = JSON.parse(await evalJs(`JSON.stringify((() => {
        const f = document.querySelector('[data-turnbar-flash]')
        if (!f) return null
        const item = f.closest('[data-chat-flow-key]')
        return { flash: true, kind: item ? item.getAttribute('data-chat-flow-kind') : null,
                 text: (f.textContent || '').trim().slice(0, 40) }
      })())`))
    } catch { jump = null }
  }
  check('点击 #11 落 user 行（锚点不互踩）', jump !== null && jump.flash === true && jump.kind === 'user',
    jump ? `kind=${jump.kind} · "${jump.text}"` : '未捕获到 flash（5.4s 轮询窗口内）')

  // 4. 悬停卡出卡且带轨迹提示行
  await evalJs(`(() => {
    const bar = document.querySelector('[data-turnbar]')
    const segs = document.querySelectorAll('[data-turnbar-seg]')
    if (!bar || segs.length === 0) return 'ok'
    const r = segs[3].getBoundingClientRect()
    bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
    return 'ok'
  })()`)
  await sleep(500)
  const cardOk = await evalJs(`String((() => { const c = document.getElementById('dsh-turnbar-card'); return c !== null && c.classList.contains('visible') && c.querySelector('.tb-hint') !== null })())`)
  check('悬停卡出卡且带轨迹提示行', cardOk === 'true', '')

  // 5. 页面在全部交互后仍健康
  const alive = await evalJs(`document.readyState + ':' + (document.querySelector('[data-turnbar-seg]') !== null)`)
  check('页面交互后仍健康', alive === 'complete:true', alive)

  const failed = results.filter(r => !r.ok)
  console.log(`\n==== VERDICT ====`)
  console.log(failed.length === 0 ? 'RESULT: PASS' : `RESULT: FAIL (${failed.length}/${results.length})`)
  process.exit(failed.length === 0 ? 0 : 1)
} catch (e) {
  console.error('SCRIPT ERROR:', e.message)
  process.exit(1)
}