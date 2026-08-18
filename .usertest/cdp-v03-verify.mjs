// v0.3.0 真机验收：章节刻度 / 悬停余量卡+提示行 / 搜索落图 / 轨迹联动 / 首跳教学 toast。
// 前提：目标实例已起（默认 8791，可用 TB_PORT/TB_CDP 覆盖）。
// 用热 profile（复用 cdp-v023 的 user-data-dir：Web UI 记住的最后一个会话即复现会话「继续」）。
import { spawn } from 'node:child_process'
const PORT = Number(process.env.TB_PORT ?? 8791), CDP = Number(process.env.TB_CDP ?? 9346)
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', `--remote-debugging-port=${CDP}`, '--user-data-dir=/tmp/tbcdp-v023',
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
  if (r.exceptionDetails) throw new Error('eval failed: ' + JSON.stringify(r.exceptionDetails).slice(0, 300))
  return r.result.value
}
const results = []
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? '✅' : '❌'} ${name}${detail ? ' — ' + detail : ''}`) }

const SID = 'session-31ed62b0-7d87-435f-95c9-6f9b6e9896a9'

try {
  let targets
  for (let i = 0; i < 40; i++) { try { targets = await (await fetch(`http://127.0.0.1:${CDP}/json`)).json(); if (targets.length > 0) break } catch {} await sleep(250) }
  ws = new WebSocket(targets.find(t => t.type === 'page').webSocketDebuggerUrl)
  await new Promise(r => ws.onopen = r)
  await cdp('Page.enable'); await cdp('Runtime.enable')
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(6000)
  // 打开复现会话：Web UI 用 localStorage['dsh.sessions.current'] 记录当前会话。
  await evalJs(`localStorage.setItem('dsh.sessions.current', ${JSON.stringify(JSON.stringify({ sessionId: SID }))})`)
  await cdp('Page.navigate', { url: `http://127.0.0.1:${PORT}/` })
  await sleep(8000)

  // 0. 等进度条就绪（复现会话 18 轮）；冷/新会话 15s 内不出条则判失败
  let segCount = 0
  for (let i = 0; i < 15 && segCount === 0; i++) {
    segCount = await evalJs(`document.querySelectorAll('[data-turnbar-seg]').length`) ?? 0
    if (segCount === 0) await sleep(1000)
  }
  check('进度条就绪（复现会话轮次已加载）', segCount >= 2, `${segCount} 段`)
  if (segCount < 2) { console.log('VERDICT: FAIL (无可用会话)'); process.exit(0) }

  // 1. 章节刻度：goal 断点渲染为 [data-turnbar-chapter]
  const ticks = await evalJs(`[...document.querySelectorAll('[data-turnbar-chapter]')].map(t => t.getAttribute('data-pct')).join(',')`)
  check('章节刻度：goal 段渲染刻度条', ticks.split(',').filter(x => x !== '').length >= 1, `pct: ${ticks}`)

  // 2. 悬停卡：余量行 + 轨迹提示行
  await evalJs(`(() => {
    const bar = document.querySelector('[data-turnbar]')
    const segs = document.querySelectorAll('[data-turnbar-seg]')
    if (!bar || segs.length === 0) return false
    const r = segs[0].getBoundingClientRect()
    bar.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }))
    return true
  })()`)
  await sleep(500)
  const card = await evalJs(`(() => {
    const el = document.getElementById('dsh-turnbar-card')
    if (!el) return null
    const ctx = el.querySelector('.tb-context')
    const hint = el.querySelector('.tb-hint')
    return { ctx: ctx ? ctx.textContent : null, hint: hint ? hint.textContent : null, visible: el.classList.contains('visible') }
  })()`)
  check('悬停卡：轨迹提示行常驻', card !== null && card.visible === true && card.hint !== null && card.hint.includes('轨迹'), card ? card.hint : 'card null')
  check('悬停卡：余量行显示占用', card !== null && card.ctx !== null && /上下文/.test(card.ctx ?? ''), card ? card.ctx : 'card null')

  // 3. 条尾警示 class（本会话占用极低 → 不应出现，测「不误报」）
  const barClass = await evalJs(`document.querySelector('[data-turnbar]').className`)
  check('条尾警示：低占用会话不误报', !/ctx-(warn|crit)/.test(barClass), barClass.trim() === '' ? '无警示 class' : barClass)

  // 4. 搜索落图：⌘K 面板输入 → .hit 段；Esc 关闭 → 清除
  await evalJs(`document.querySelector('[data-turnbar-search-btn]').click()`)
  await sleep(300)
  await evalJs(`(() => {
    const input = document.querySelector('[data-turnbar-search-input]')
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, 'Turn Bar')
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })()`)
  await sleep(1000)
  const hits = await evalJs(`document.querySelectorAll('[data-turnbar-seg].hit').length`)
  const hitRows = await evalJs(`document.querySelectorAll('[data-turnbar-search-row]').length`)
  check('搜索落图：命中段标 .hit', hits > 0, `${hits} 段命中（${hitRows} 条结果）`)
  await evalJs(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await sleep(400)
  const hitsAfterClose = await evalJs(`document.querySelectorAll('[data-turnbar-seg].hit').length`)
  check('搜索落图：关闭面板后清除标记', hitsAfterClose === 0, `残留 ${hitsAfterClose}`)

  // 5. 轨迹联动：Alt+点击段 1（切轨迹视图或回落对话内跳转——两者均算通过）
  await evalJs(`(() => { localStorage.clear(); const segs = document.querySelectorAll('[data-turnbar-seg]'); segs[1].dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, altKey: true })); return segs.length })()`)
  await sleep(3500)
  const traj = await evalJs(`(() => {
    const tr = document.querySelector('tr[data-trajectory-row-key]')
    const flash = document.querySelector('[data-turnbar-flash]')
    return {
      inTrajectory: tr !== null,
      rowCount: tr !== null ? tr.closest('table').querySelectorAll('tr[data-trajectory-row-key]').length : 0,
      flashInTrajectory: flash !== null && tr !== null && tr.closest('table').contains(flash),
      flashAnywhere: flash !== null,
    }
  })()`)
  check('轨迹联动：切到轨迹视图或回落对话跳转', traj.inTrajectory || traj.flashAnywhere, JSON.stringify(traj))
  // 若已切到轨迹视图，切回对话视图再继续（点「对话/聊天」tab 按文案兜底）
  await evalJs(`(() => { if (document.querySelector('tr[data-trajectory-row-key]')) { const els = [...document.querySelectorAll('button, [role="tab"], a')]; const t = els.find(e => ['对话','聊天','Chat','chat'].includes((e.textContent||'').trim()) && e.offsetParent !== null); if (t) t.click(); } return true })()`)
  await sleep(2500)

  // 6. 首跳教学 toast：清 localStorage 后首次真实跳转出提示；第二次不再出
  await evalJs(`(() => { localStorage.removeItem('dsh-turnbar:hint-traj'); const t = document.getElementById('dsh-turnbar-toast'); if (t) t.classList.remove('visible'); const segs = document.querySelectorAll('[data-turnbar-seg]'); segs[segs.length - 3]?.click(); return true })()`)
  await sleep(4000)
  const toast1 = await evalJs(`(() => { const t = document.getElementById('dsh-turnbar-toast'); const ex = t && t.querySelector('.tb-toast-extra'); return { visible: !!t && t.classList.contains('visible'), extra: ex ? ex.textContent : null } })()`)
  check('教学 toast：首次跳转带轨迹提示', toast1.visible === true && toast1.extra !== null && toast1.extra.includes('轨迹'), toast1.extra)
  await evalJs(`(() => { const t = document.getElementById('dsh-turnbar-toast'); if (t) t.classList.remove('visible'); const segs = document.querySelectorAll('[data-turnbar-seg]'); segs[segs.length - 2]?.click(); return true })()`)
  await sleep(3000)
  const toast2 = await evalJs(`(() => { const t = document.getElementById('dsh-turnbar-toast'); const ex = t && t.querySelector('.tb-toast-extra'); return { visible: !!t && t.classList.contains('visible'), extra: ex ? ex.textContent : null } })()`)
  check('教学 toast：仅出现一次（二次跳转无提示）', toast2.visible === true && toast2.extra === null, toast2.extra === null ? '第二次跳转无提示行' : (toast2.extra ?? '首次标记未写回'))

  const failed = results.filter(r => !r.ok)
  console.log(`\n==== VERDICT ====`)
  console.log(failed.length === 0 ? 'RESULT: PASS' : `RESULT: FAIL (${failed.length}/${results.length})`)
  process.exit(0)
} catch (e) {
  console.error('SCRIPT ERROR:', e.message)
  process.exit(1)
}