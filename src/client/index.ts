/**
 * dsh-turnbar · client half（浏览器端，官方 client 通道）：
 * 经官方 list 插槽 conversation.composer.dock 注入全景轮次条 + 悬停预览卡 + 拖动 scrub
 * + playhead 阅读位置指示 + Esc 返回原位 toast。
 *
 * 数据：优先 host 半区路由 /plugins/dsh-turnbar/state（live store → sidecar →
 * 持久化回填，全量轮次图含富元信息），拉不到时退化为客户端 store 推导。
 * 交互：悬停 120ms 出卡（已可见时切换零延迟）；按住拖动 >4px 进入 scrub，
 * 卡片实时跟随最近轮次，松手跳转；点击直接跳转（自动 loadOlder → scrollTop → flash）；
 * 滚动时 playhead 跟随视口中央所在轮（rAF 节流）；跳转后 Esc/点击返回原位（5s toast）。
 * 悬停/scrub/playhead 状态全部走命令式 DOM（ref + 单例），指针/滚动零 React 重渲染。
 */
import React from 'react'
import { isEmptyTurn, planSegments, type SegmentSpec } from './grouping'
import { buildCardModel, buildGroupCardModel, ensureCard, type CardHandle, type CardTurn } from './card'
import { disposeToast, initToast, showReturnToast } from './toast'
import { disposeSearch, toggleSearch } from './search'

const STYLE_ID = 'dsh-turnbar-style'
const CSS = `
[data-turnbar] {
  position: relative;
  display: flex; align-items: center; gap: 2px;
  width: 100%; padding: 3px 8px; box-sizing: border-box;
  user-select: none; -webkit-user-select: none; touch-action: none;
}
[data-turnbar-playhead] {
  position: absolute; top: 3px; bottom: 3px; left: 8px; width: 4px;
  z-index: 1; pointer-events: none; opacity: 0;
  border-radius: 3px;
  /* 阅读位置段高亮：半透明盖 + 底部实色条（视频播放器式当前段指示） */
  background: rgba(76, 154, 255, .2);
  background: color-mix(in srgb, var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4c9aff) 20%, transparent);
  box-shadow: inset 0 -2px 0 var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4c9aff);
  transition: transform .08s linear, opacity .15s ease, width .08s linear;
}
[data-turnbar-seg] {
  flex: 1 1 0; min-width: 2px; height: 8px; padding: 0; border: none;
  border-radius: 2px; cursor: pointer;
  background: rgba(128, 128, 140, .35);
  transition: transform .12s ease, background .12s ease;
}
[data-turnbar-seg].has-user { background: rgba(128, 128, 140, .6); }
[data-turnbar-seg].ghost {
  background: rgba(128, 128, 140, .14);
  cursor: default;
}
[data-turnbar-seg].ghost:hover {
  transform: none;
  background: rgba(128, 128, 140, .14);
}
[data-turnbar-seg]:hover, [data-turnbar-seg].scrub-target {
  transform: scaleY(1.8); background: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4c9aff);
}
[data-turnbar-seg].running {
  background: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4c9aff);
  animation: turnbar-pulse 1.2s ease-in-out infinite;
}
@keyframes turnbar-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
[data-turnbar-search-btn] {
  flex: 0 0 auto; width: 24px; height: 14px; padding: 0; border: none;
  border-radius: 3px; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  background: transparent;
  color: var(--dsw-alias-label-tertiary, #888);
  transition: background .12s ease, color .12s ease;
}
[data-turnbar-search-btn]:hover {
  background: rgba(128, 128, 140, .18);
  color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4c9aff);
}
[data-turnbar-flash] {
  outline: 2px solid var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4c9aff);
  outline-offset: 2px; border-radius: 6px;
  animation: turnbar-flash 2.5s ease-out forwards;
}
@keyframes turnbar-flash { 0% { background-color: rgba(76, 154, 255, .18) } 70% { background-color: rgba(76, 154, 255, .12) } 100% { background-color: transparent } }
[data-turnbar-card] {
  position: fixed; z-index: 910; width: 320px; max-width: calc(100vw - 16px);
  box-sizing: border-box; padding: 10px 14px; border-radius: 12px;
  font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.55;
  color: var(--dsw-alias-label-primary, #eee);
  background: var(--dsw-alias-bg-overlay, #2C2C2E);
  box-shadow: var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,.35));
  pointer-events: none; white-space: pre-wrap; word-break: break-word;
  opacity: 0; transform: translateY(4px);
  transition: opacity .15s cubic-bezier(.2,0,0,1), transform .15s cubic-bezier(.2,0,0,1);
}
[data-turnbar-card].visible { opacity: 1; transform: translateY(0); }
[data-turnbar-card] .tb-head {
  display: flex; gap: 8px; align-items: baseline;
  color: var(--dsw-alias-label-secondary, #aaa); font-size: 11px; margin-bottom: 4px;
}
[data-turnbar-card] .tb-user {
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
  margin-bottom: 4px;
}
[data-turnbar-card] .tb-assistant {
  color: var(--dsw-alias-label-secondary, #bbb); font-size: 11px;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
[data-turnbar-card] .tb-meta {
  color: var(--dsw-alias-label-tertiary, #888); font-size: 11px; margin-top: 6px;
}
[data-turnbar-toast] {
  position: fixed; left: 16px; bottom: 20px; z-index: 920;
  display: flex; align-items: center; gap: 10px;
  padding: 8px 14px; border-radius: 10px;
  font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.4;
  color: var(--dsw-alias-label-primary, #eee);
  background: var(--dsw-alias-bg-overlay, #2C2C2E);
  box-shadow: var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,.35));
  cursor: pointer; user-select: none;
  opacity: 0; transform: translateY(6px); pointer-events: none;
  transition: opacity .15s ease, transform .15s ease;
}
[data-turnbar-toast].visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
[data-turnbar-toast] .tb-toast-return { color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4c9aff); }
[data-turnbar-search] {
  position: fixed; top: 15%; left: 50%; z-index: 930;
  width: 480px; max-width: calc(100vw - 32px); box-sizing: border-box;
  border-radius: 14px; overflow: hidden;
  font-family: system-ui, sans-serif;
  background: var(--dsw-alias-bg-overlay, #2C2C2E);
  box-shadow: var(--dsw-shadow-lv3, 0 12px 32px rgba(0,0,0,.45));
  opacity: 0; transform: translate(-50%, -8px); pointer-events: none;
  transition: opacity .15s ease, transform .15s ease;
}
[data-turnbar-search].visible { opacity: 1; transform: translate(-50%, 0); pointer-events: auto; }
[data-turnbar-search] .tb-search-box input {
  width: 100%; box-sizing: border-box; padding: 13px 16px;
  background: transparent; border: none; outline: none;
  color: var(--dsw-alias-label-primary, #eee); font-size: 14px; font-family: inherit;
  border-bottom: 1px solid rgba(128, 128, 140, .25);
}
[data-turnbar-search] .tb-search-list { max-height: 320px; overflow-y: auto; padding: 6px; }
[data-turnbar-search] .tb-search-count {
  padding: 2px 10px 4px; font-size: 11px;
  color: var(--dsw-alias-label-tertiary, #888);
}
[data-turnbar-search] .tb-search-row {
  display: block; width: 100%; text-align: left;
  background: transparent; border: none; border-radius: 8px; padding: 8px 10px;
  cursor: pointer; color: var(--dsw-alias-label-primary, #eee); font-family: inherit;
}
[data-turnbar-search] .tb-search-row.active { background: rgba(76, 154, 255, .15); }
[data-turnbar-search] .tb-search-row-head {
  font-size: 11px; color: var(--dsw-alias-brand-primary-new-colorprimary-new-color, #4c9aff); margin-bottom: 2px;
}
[data-turnbar-search] .tb-search-row-body {
  font-size: 12px; line-height: 1.5;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
[data-turnbar-search] .tb-search-empty {
  padding: 14px; font-size: 12px; text-align: center;
  color: var(--dsw-alias-label-tertiary, #888);
}
@media (prefers-reduced-motion: reduce) {
  [data-turnbar-seg], [data-turnbar-card], [data-turnbar-flash] { transition: none; animation: none; }
}
`

// ─── DOM 定位（与官方 DOM 契约及 dsh-navbar 验证过的配方对齐） ────────────────

function flowEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-chat-flow=""]')
}

/** 进度条段区可用宽度：总宽 - 左右 padding(16) - 搜索按钮宽 - 段/按钮间隙(2)。 */
function barUsableWidth(bar: HTMLElement): number {
  const btn = bar.querySelector<HTMLElement>('[data-turnbar-search-btn]')
  const btnW = btn !== null && btn !== undefined ? btn.offsetWidth : 0
  return Math.max(1, bar.offsetWidth - 16 - btnW - 2)
}

function scrollerOf(flow: HTMLElement | null): HTMLElement | null {
  let n: HTMLElement | null = flow
  while (n !== null) {
    const s = getComputedStyle(n)
    if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n
    n = n.parentElement
  }
  return null
}

/** user 消息行判据（navbar 同款）：有 data-time-hover-root、非 turn-tail、气泡结构。 */
function isUserRow(el: Element): el is HTMLElement {
  return el.hasAttribute('data-time-hover-root')
    && !el.hasAttribute('data-turn-tail')
    && el.querySelector('[class*="bubble"]') !== null
}

/** 流顶部是否还有「加载更早/加载中…」按钮（= 上方仍有或正在加载历史）。
 * 全量扫描 flow 内按钮并匹配任一状态文案——只取第一个按钮 + 单状态正则
 * 会在「加载中…」或顶部按钮被内容按钮顶替时误判（跨分页跳转竞态根因之一）。 */
function loadEarlierButton(flow: HTMLElement | null): HTMLButtonElement | null {
  if (flow === null) return null
  for (const b of flow.querySelectorAll<HTMLButtonElement>('button')) {
    const t = b.textContent ?? ''
    if (/更早|earlier|加载中|loading/i.test(t)) return b
  }
  return null
}

function loadEarlierVisible(flow: HTMLElement | null): boolean {
  return loadEarlierButton(flow) !== null
}

/**
 * 定位 turn N 的触发消息行（区间法，鲁棒于"纯工具轮不渲染轮尾"）：
 * 从下一个存在的轮尾（>N）向前走到上一个轮尾（<N），区间内第一条 user 行
 * 即触发消息。区间无下界（目标轮之前的轮未加载）且上方仍有历史时返回 null
 * ——此时"窗口顶部行"不是第一轮，调用方必须继续翻页（v0.2 曾因此把
 * 点击第一段错误落在窗口顶部行上）。
 *
 * ⚠️ 兄弟层：dsh 现行 DOM 把每一行包在 flowItem（[data-chat-flow-key]）里，
 * 轮尾/用户行不是同一父级的兄弟——必须在 flowItem 层走查，再在各自
 * flowItem 内找用户行（旧版直接 previousElementSibling 会在 slot 内空转，
 * 曾致跳转永远落回 nthUserRow 兜底）。
 */
function userRowOfTurn(turn: number): HTMLElement | null {
  const flow = flowEl()
  if (flow === null) return null
  const tails = [...flow.querySelectorAll<HTMLElement>('[data-turn-tail]')]
  const next = tails.find(t => Number(t.getAttribute('data-turn-tail')) > turn)
  if (next === undefined) return null
  const prev = [...tails].reverse().find(t => Number(t.getAttribute('data-turn-tail')) < turn)
  if (prev === undefined && loadEarlierVisible(flow)) return null
  // 无下界且顶部无「更早」按钮时，仅当首个轮尾就是第 1 轮才可信（真·已到顶）。
  // 否则可能是最后一页的局部提交（轮尾尚未渲染完）——此刻走查会溢到流顶
  // （曾致搜索跳 #3 落在轮 1/轮 5），必须视为未就绪。
  if (prev === undefined) {
    const firstTurn = Number(tails[0]?.getAttribute('data-turn-tail'))
    if (firstTurn !== 1) return null
  }
  const nextItem = next.closest<HTMLElement>('[data-chat-flow-key]')
  const prevItem = prev !== undefined ? prev.closest<HTMLElement>('[data-chat-flow-key]') : null
  if (nextItem === null) return null
  const found: HTMLElement[] = []
  let item: Element | null = nextItem
  while (item !== null && item !== prevItem) {
    for (const row of item.querySelectorAll<HTMLElement>('[data-time-hover-root]')) {
      if (isUserRow(row)) { found.push(row); break }
    }
    item = item.previousElementSibling
  }
  // found 按"从后向前"收集；最后一个 = 文档序第一条 = 触发消息。
  return found[found.length - 1] ?? null
}

function nthUserRow(n: number): HTMLElement | null {
  const flow = flowEl()
  if (flow === null) return null
  const rows = [...flow.querySelectorAll<HTMLElement>('[data-time-hover-root]')].filter(isUserRow)
  return rows[Math.max(0, Math.min(rows.length - 1, n))] ?? null
}

/**
 * 目标轮没有用户行的锚点（纯工具轮不渲染用户行，userRowOfTurn 恒 null）：
 * 自身有轮尾 → 锚轮尾行；否则锚前一轮尾所在 flowItem 的下一个 flowItem
 * （= 目标轮区间第一行）。这样跳 #4（纯工具轮）会落在轮 4 的区间内，
 * 而不是错误地高亮下一轮的用户行。
 */
function turnAnchorRow(turn: number): HTMLElement | null {
  const flow = flowEl()
  if (flow === null) return null
  const tails = [...flow.querySelectorAll<HTMLElement>('[data-turn-tail]')]
  const own = tails.find(t => Number(t.getAttribute('data-turn-tail')) === turn)
  if (own !== undefined) return own
  const prev = [...tails].reverse().find(t => Number(t.getAttribute('data-turn-tail')) < turn)
  if (prev !== undefined) {
    // 行在 flowItem 层，prev 轮尾自身的 nextElementSibling 是 slot 内的 null
    const prevItem = prev.closest<HTMLElement>('[data-chat-flow-key]')
    const nextItem = prevItem?.nextElementSibling
    if (nextItem !== null && nextItem !== undefined) return nextItem as HTMLElement
  }
  return null
}

/** 目标轮区间的走查边界是否已齐备（prev/next 轮尾都在）。
 * 局部提交期间边界缺失：此时接受锚点会落在轮尾上而非用户行（搜索跳 #3
 * 曾稳定落在 tail-3——视图停在轮尾而不是触发消息）。 */
function intervalBounded(turn: number): boolean {
  const flow = flowEl()
  if (flow === null) return false
  const tails = [...flow.querySelectorAll<HTMLElement>('[data-turn-tail]')]
  if (!tails.some(t => Number(t.getAttribute('data-turn-tail')) > turn)) return false
  if (turn === 1) return true
  return tails.some(t => Number(t.getAttribute('data-turn-tail')) < turn)
}

/** navbar 验证过的跳转配方：wheel 事件兜底旧基线 + 一步写入 scrollTop。 */
function jumpToRow(row: HTMLElement): void {
  const scroller = scrollerOf(flowEl())
  if (scroller === null) return
  scroller.dispatchEvent(new WheelEvent('wheel', { deltaY: -1, bubbles: true, cancelable: true }))
  const target = scroller.scrollTop + row.getBoundingClientRect().top - scroller.getBoundingClientRect().top
  scroller.scrollTop = target
}

function flashRow(row: HTMLElement): void {
  row.setAttribute('data-turnbar-flash', '')
  window.setTimeout(() => row.removeAttribute('data-turnbar-flash'), 2500)
}

// ─── 组件 ────────────────────────────────────────────────────────────────────

/** 是否处于「真实输入语境」：有内容的编辑器或搜索面板输入框。
 * 空编辑器（如刚关闭搜索后的空 composer）不视为输入语境——否则
 * ⌘↑/⌘↓ 与 toast 的 Esc 返回会在焦点回到空输入框后全部失效。 */
function isTypingContext(target: HTMLElement | null): boolean {
  if (target === null) return false
  const tag = target.tagName
  const editable = tag === 'TEXTAREA' || tag === 'INPUT' || target.isContentEditable === true
  if (!editable) return false
  if (target.getAttribute('data-turnbar-search-input') !== null) return true
  if (tag === 'TEXTAREA' || tag === 'INPUT') return ((target as HTMLInputElement).value ?? '') !== ''
  return true
}

interface TurnBarProps {
  useSession?: (selector: (s: any) => any) => any
  /** session standard kit 里的会话服务实例（loadOlder 的家）。 */
  session?: { loadOlder?: () => Promise<void> | void }
}

interface SidecarTurn extends CardTurn {
  index: number
  userFirstLine?: string
  assistantFirstLine?: string
}

/** 触发一页历史加载：优先 session 契约方法，DOM 的 Load earlier 按钮兜底。 */
function loadOnePage(sessionRef: { current: any }): Promise<void> | void {
  const service = sessionRef.current
  if (typeof service?.loadOlder === 'function') {
    try { return service.loadOlder() } catch { /* 落到 DOM 兜底 */ }
  }
  const flow = flowEl()
  const older = loadEarlierButton(flow)
  // 只在按钮就绪（非「加载中…」）时点击；加载中由循环节奏自行等待。
  if (older !== null && /更早|earlier/i.test(older.textContent ?? '')) {
    older.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
  }
}

function useTurnbarData(useSession: ((selector: (s: any) => any) => any) | undefined) {
  const safeSelect = React.useCallback((selector: (s: any) => any): any => {
    if (typeof useSession !== 'function') return undefined
    try { return useSession(selector) } catch { return undefined }
  }, [useSession])

  const sessionId: string | undefined = safeSelect((s: any) => s?.sessionId)
  const running: boolean = safeSelect((s: any) => s?.running) === true
  const nodes: any[] = safeSelect((s: any) => s?.chat?.legacy?.nodes) ?? []
  const hasMore: boolean = safeSelect((s: any) => s?.hasMore) === true

  const hasMoreRef = React.useRef(false)
  const sessionRef = React.useRef(null)
  hasMoreRef.current = hasMore
  sessionRef.current = safeSelect((s: any) => s?.session)

  const [metaTurns, setMetaTurns] = React.useState(null as SidecarTurn[] | null)
  const metaSigRef = React.useRef('')
  React.useEffect(() => {
    if (typeof sessionId !== 'string' || sessionId === '') return
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`/plugins/dsh-turnbar/state?sessionId=${encodeURIComponent(sessionId)}`)
        if (!res.ok) return
        const json = await res.json()
        if (!alive || !Array.isArray(json?.state?.turns)) return
        // 签名不变则不 setState：避免每 5s 轮询无条件换新数组 → 整条重渲染。
        const sig = JSON.stringify(json.state.turns)
        if (sig === metaSigRef.current) return
        metaSigRef.current = sig
        setMetaTurns(json.state.turns)
      } catch { /* host 半区未激活（如旧版 dsh）→ 走 store 推导 */ }
    }
    void load()
    const timer = window.setInterval(load, 5000)
    const onVis = (): void => { if (document.visibilityState === 'visible') void load() }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      alive = false
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVis)
    }
  }, [sessionId])

  // 轮次列表（保留富元信息供卡片使用）：sidecar 全量优先；退化为 store 已加载窗口。
  const turns: SidecarTurn[] = React.useMemo(() => {
    if (metaTurns !== null && metaTurns.length > 0) {
      return metaTurns.map((t: SidecarTurn, i: number) => ({
        ...t,
        index: typeof t.index === 'number' ? t.index : i + 1,
        running: running && i === metaTurns.length - 1,
      }))
    }
    const set = new Set<number>()
    for (const node of nodes) {
      // legacy 视图节点：turn 为顶层字段（kind|seq|messageId|time|turn|step|…）。
      const turn = node?.turn
      if (typeof turn === 'number' && Number.isFinite(turn)) set.add(turn)
    }
    return [...set].sort((a, b) => a - b).map((index: number, i: number, all: number[]) => ({
      index,
      running: running && i === all.length - 1,
    }))
  }, [metaTurns, nodes, running])

  return { sessionId, turns, nodes, hasMoreRef, sessionRef }
}

const HOVER_DELAY_MS = 120
const HIDE_GRACE_MS = 100
const SCRUB_THRESHOLD_PX = 4

interface PointerEventLike {
  clientX: number
  clientY: number
  pointerId: number
  buttons: number
  pointerType: string
  currentTarget: EventTarget & HTMLElement
}

const TurnBar = function TurnBar(props: TurnBarProps | undefined): any {
  const { turns, nodes, hasMoreRef, sessionRef, sessionId } = useTurnbarData(props?.useSession)
  if (sessionRef.current == null && props?.session !== undefined) sessionRef.current = props.session

  const barRef = React.useRef(null as HTMLElement | null)
  const cardRef = React.useRef(null as CardHandle | null)
  const hoverTimerRef = React.useRef(null as number | null)
  const hideTimerRef = React.useRef(null as number | null)
  const cardVisibleRef = React.useRef(false)
  const scrubbingRef = React.useRef(false)
  const scrubStartXRef = React.useRef(0)
  const scrubSegRef = React.useRef(-1)
  const suppressClickRef = React.useRef(false)
  const lastMoveRef = React.useRef(null as { x: number; y: number } | null)
  const rafPendingRef = React.useRef(false)

  // 卸载清理：卡片随条一起移除。（必须在任何条件 return 之前——hook 顺序恒定）
  React.useEffect(() => () => {
    if (hoverTimerRef.current !== null) window.clearTimeout(hoverTimerRef.current)
    if (hideTimerRef.current !== null) window.clearTimeout(hideTimerRef.current)
    cardRef.current?.el.remove()
  }, [])

  // ── playhead：视口中央所在轮 → 进度条指示（hooks 必须在条件 return 之前） ──
  const playheadRef = React.useRef(null as HTMLElement | null)
  const turnsRef = React.useRef(turns)
  turnsRef.current = turns

  const computeActiveTurn = (): number => {
    const flow = flowEl()
    const scroller = scrollerOf(flow)
    if (flow === null || scroller === null) return -1
    const scrollerRect = scroller.getBoundingClientRect()
    if (scrollerRect.height === 0) return -1
    const centerY = scrollerRect.top + scrollerRect.height * 0.5
    // 轮尾标记轮末：视口中央所属轮 = 中央下方第一个轮尾的轮号
    // （中央在轮 N 内容里 ⇔ 中央下方第一个轮尾是 tail-N）。
    // 旧的「最近轮尾」在轮内容前半段会偏上一轮（⌘↑/⌘↓ 基准曾从 #3 跳到 #1
    // 而不是 #2）。注：data-chat-flow-key 的前缀不是轮号，不可用。
    const tails = [...flow.querySelectorAll<HTMLElement>('[data-turn-tail]')]
    for (const tail of tails) {
      const r = tail.getBoundingClientRect()
      if (r.top + r.height / 2 >= centerY) {
        const turn = Number(tail.getAttribute('data-turn-tail'))
        return Number.isFinite(turn) ? turn : -1
      }
    }
    // 中央在所有轮尾下方（会话末尾）：归最后一轮
    const last = Number(tails[tails.length - 1]?.getAttribute('data-turn-tail'))
    return Number.isFinite(last) ? last : -1
  }

  const paintPlayhead = (): void => {
    const playhead = playheadRef.current
    const bar = barRef.current
    if (playhead === null || bar === null) return
    const activeTurn = computeActiveTurn()
    if (activeTurn < 0) { playhead.style.opacity = '0'; return }
    lastActiveTurnRef.current = activeTurn
    const n = turnsRef.current.length
    const idx = turnsRef.current.findIndex((t: SidecarTurn) => t.index === activeTurn)
    if (idx < 0) { playhead.style.opacity = '0'; return }
    // 段高亮盖：宽 = 单段宽（减 1px 缝隙），左边界 = idx 段起点（含搜索按钮宽度补偿）
    const usable = barUsableWidth(bar)
    const segW = usable / n
    playhead.style.width = `${Math.max(2, segW - 1)}px`
    playhead.style.transform = `translateX(${segW * idx}px)`
    playhead.style.opacity = '1'
  }

  const scrollRafRef = React.useRef(false)
  const onScrollerScroll = (): void => {
    if (scrollRafRef.current) return
    scrollRafRef.current = true
    window.requestAnimationFrame(() => {
      scrollRafRef.current = false
      paintPlayhead()
    })
  }

  React.useEffect(() => {
    const flow = flowEl()
    const scroller = scrollerOf(flow)
    if (scroller === null) return
    scroller.addEventListener('scroll', onScrollerScroll, { passive: true })
    window.addEventListener('resize', onScrollerScroll)
    paintPlayhead()
    return () => {
      scroller.removeEventListener('scroll', onScrollerScroll)
      window.removeEventListener('resize', onScrollerScroll)
    }
  }, [sessionId])

  React.useEffect(() => {
    paintPlayhead()
  }, [turns])

  // ── ⌘K 搜索 + ⌘↑/⌘↓ 逐轮导航（全局键位，均在 hooks 区） ─────────────────
  const lastActiveTurnRef = React.useRef(-1)
  const jumpToTurnNumber = (turnNumber: number): void => {
    const segs = planSegments(turnsRef.current)
    const segment = segs.find(s => turnNumber >= s.from && turnNumber <= s.to) ?? segs[0]
    if (segment !== undefined) jump(segment)
  }
  const jumpRef = React.useRef(jumpToTurnNumber)
  jumpRef.current = jumpToTurnNumber

  React.useEffect(() => {
    const onGlobalKey = (e: KeyboardEvent): void => {
      const target = e.target as HTMLElement | null
      const typing = isTypingContext(target)
      const meta = e.metaKey || e.ctrlKey
      if (meta && e.key.toLowerCase() === 'k') {
        // 搜索面板在输入框聚焦时也允许打开（⌘K 是全局命令，Esc 关闭后焦点归位）。
        e.preventDefault()
        toggleSearch(sessionId ?? '', (turn: number) => jumpRef.current(turn))
        return
      }
      if (meta && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
        if (typing) return // 真实输入语境（有内容的编辑器/搜索面板）内的上下键不劫持
        e.preventDefault()
        // 以 playhead 最近一次的实际值为基准（WYSIWYG：看到哪就从哪走）。
        // 导航跳过幽灵轮（无内容、不可跳转的空轮）。
        const navTurns = turnsRef.current.filter((t: SidecarTurn) => !isEmptyTurn(t))
        if (navTurns.length === 0) return
        const cur = lastActiveTurnRef.current >= 0 ? lastActiveTurnRef.current : computeActiveTurn()
        const idx = navTurns.findIndex((t: SidecarTurn) => t.index === cur)
        const base = idx < 0 ? (e.key === 'ArrowUp' ? navTurns.length : -1) : idx
        const nextIdx = Math.max(0, Math.min(navTurns.length - 1, e.key === 'ArrowUp' ? base - 1 : base + 1))
        const next = navTurns[nextIdx]
        if (next !== undefined) jumpRef.current(next.index)
      }
    }
    window.addEventListener('keydown', onGlobalKey, true)
    return () => window.removeEventListener('keydown', onGlobalKey, true)
  }, [sessionId])

  if (turns.length < 2) return null
  const segments: SegmentSpec[] = planSegments(turns)

  const clearHoverTimer = (): void => {
    if (hoverTimerRef.current !== null) {
      window.clearTimeout(hoverTimerRef.current)
      hoverTimerRef.current = null
    }
  }
  const clearHideTimer = (): void => {
    if (hideTimerRef.current !== null) {
      window.clearTimeout(hideTimerRef.current)
      hideTimerRef.current = null
    }
  }

  const showCardFor = (segmentIndex: number, immediate: boolean): void => {
    const segment = segments[segmentIndex]
    const bar = barRef.current
    if (segment === undefined || bar === null) return
    if (cardRef.current === null) cardRef.current = ensureCard()
    const card = cardRef.current
    const model = segment.kind === 'turn'
      ? buildCardModel(segment.turns[0] ?? { index: segment.from })
      : buildGroupCardModel(segment.turns)
    card.fill(model)
    // 锚点必须是段按钮自身：bar.children 里第 0 个是 playhead div，
    // 用 children[segmentIndex] 会整体左移一格、第 1 段直接锚到 playhead
    // （曾致卡片偏差 +944px，挂在进度条最右侧）。
    // 注：bar 来自 any 化 ref，不能带泛型调用 querySelectorAll（TS2347）。
    const segEls = bar.querySelectorAll('[data-turnbar-seg]')
    const child = segEls[segmentIndex] as HTMLElement | undefined
    if (child !== undefined) card.position(child.getBoundingClientRect())
    card.el.classList.add('visible')
    cardVisibleRef.current = true
    void immediate
  }

  const hideCard = (): void => {
    clearHoverTimer()
    clearHideTimer()
    cardRef.current?.el.classList.remove('visible')
    cardVisibleRef.current = false
  }

  const segIndexAtX = (x: number): number => {
    const bar = barRef.current
    if (bar === null) return -1
    const rect = bar.getBoundingClientRect()
    const rel = (x - rect.left - 8) / barUsableWidth(bar)
    if (rel < 0 || rel > 1) return -1
    return Math.min(segments.length - 1, Math.max(0, Math.floor(rel * segments.length)))
  }

  const setScrubHighlight = (segmentIndex: number): void => {
    const bar = barRef.current
    if (bar === null) return
    if (scrubSegRef.current === segmentIndex) return
    const prev = bar.children[scrubSegRef.current] as HTMLElement | undefined
    prev?.classList.remove('scrub-target')
    const next = bar.children[segmentIndex] as HTMLElement | undefined
    next?.classList.add('scrub-target')
    scrubSegRef.current = segmentIndex
  }

  const clearScrubHighlight = (): void => {
    const bar = barRef.current
    if (bar === null) return
    const prev = bar.children[scrubSegRef.current] as HTMLElement | undefined
    prev?.classList.remove('scrub-target')
    scrubSegRef.current = -1
  }

  const onPointerMove = (e: PointerEventLike): void => {
    lastMoveRef.current = { x: e.clientX, y: e.clientY }
    if (rafPendingRef.current) return
    rafPendingRef.current = true
    window.requestAnimationFrame(() => {
      rafPendingRef.current = false
      const move = lastMoveRef.current
      if (move === null || barRef.current === null) return
      const idx = segIndexAtX(move.x)
      if (idx < 0) {
        if (!scrubbingRef.current) scheduleHide()
        return
      }
      clearHideTimer()
      if (scrubbingRef.current) {
        setScrubHighlight(idx)
        showCardFor(idx, true) // scrub 中：卡片零延迟跟随
        return
      }
      if (cardVisibleRef.current) {
        showCardFor(idx, true) // 已可见：切换零延迟、不重播动画
        return
      }
      clearHoverTimer()
      hoverTimerRef.current = window.setTimeout(() => {
        hoverTimerRef.current = null
        showCardFor(idx, true)
      }, HOVER_DELAY_MS)
    })
  }

  const scheduleHide = (): void => {
    clearHideTimer()
    hideTimerRef.current = window.setTimeout(() => {
      hideTimerRef.current = null
      if (!scrubbingRef.current) hideCard()
    }, HIDE_GRACE_MS)
  }

  const onPointerLeave = (): void => {
    if (scrubbingRef.current) return // pointer capture 期间 leave 不可信
    scheduleHide()
  }

  const onPointerDown = (e: PointerEventLike): void => {
    scrubStartXRef.current = e.clientX
    scrubbingRef.current = false
    // 注意：这里绝不能 setPointerCapture——capture 会把后续 click 重定向到
    // 进度条容器，按钮的 onClick 将不再触发（D4 回归根因）。capture 只在
    // 真正进入 scrub 时抓（见 onPointerMoveDown）。
  }

  const onPointerMoveDown = (e: PointerEventLike): void => {
    if ((e.buttons & 1) === 0 && e.pointerType === 'mouse') return
    if (!scrubbingRef.current && Math.abs(e.clientX - scrubStartXRef.current) > SCRUB_THRESHOLD_PX) {
      scrubbingRef.current = true
      clearHoverTimer()
      try { barRef.current?.setPointerCapture(e.pointerId) } catch { /* 拖出窗口时忽略 */ }
    }
    if (scrubbingRef.current) onPointerMove(e)
  }

  const onPointerUp = (e: PointerEventLike): void => {
    if (!scrubbingRef.current) return // 普通点击交给 onClick
    scrubbingRef.current = false
    suppressClickRef.current = true
    window.setTimeout(() => { suppressClickRef.current = false }, 200)
    const idx = segIndexAtX(e.clientX)
    clearScrubHighlight()
    hideCard()
    const segment = segments[idx]
    if (segment !== undefined && !segment.ghost) jump(segment)
  }

  // ── 跳转 ──────────────────────────────────────────────────────────────────
  const jump = (segment: SegmentSpec): void => {
    void (async () => {
      const targetTurn = segment.turns[0]?.index ?? 1
      const scroller = scrollerOf(flowEl())
      const prevTop = scroller?.scrollTop ?? 0
      // 翻页终止条件 = 目标行真正出现（区间法自带"未加载不可信"判定）；
      // 上限 400 页只是防呆（长会话翻页可能 50+ 页，v0.2 的 40 页上限
      // 会让长会话点第一段落不到第一轮）。
      // 竞态防护：hasMore 翻 false 不代表渲染完成——「加载中…」按钮还在时
      // 继续等待；按钮消失后仍可能处于 React 局部提交（轮尾未渲染），
      // 再等两帧复检，避免把局部提交当最终状态。
      let row = userRowOfTurn(targetTurn)
      for (let i = 0; row === null && i < 400; i++) {
        const flow = flowEl()
        const pending = flow !== null && (hasMoreRef.current || loadEarlierVisible(flow))
        if (!pending) {
          // 最后一页可能仍在 React 局部提交（轮尾分批渲染）：轮询等待
          // 直到区间判定可信（userRowOfTurn 非 null，或纯工具轮锚点就绪），
          // 上限 2s。guard（首个轮尾非 1 即视为未就绪）保证等待期不会误取。
          const t0 = Date.now()
          while (Date.now() - t0 < 2000) {
            await new Promise(resolve => window.setTimeout(resolve, 80))
            await new Promise(resolve => window.requestAnimationFrame(() => resolve(undefined)))
            row = userRowOfTurn(targetTurn)
            if (row !== null) break
            // 锚点只在区间边界齐备时接受：有用户行的轮优先等 userRowOfTurn
            // 的精确结果，否则会落在轮尾（曾稳定锚 tail-3）。
            if (intervalBounded(targetTurn)) {
              const anchor = turnAnchorRow(targetTurn)
              if (anchor !== null) { row = anchor; break }
            }
          }
          break
        }
        try { await loadOnePage(sessionRef) } catch { break }
        await new Promise(resolve => window.setTimeout(resolve, 60))
        row = userRowOfTurn(targetTurn)
      }
      // 目标轮无用户行（纯工具轮）：锚到该轮区间内的行（自身轮尾或前一轮尾的下一个 flowItem）。
      if (row === null) row = turnAnchorRow(targetTurn)
      // 最后兜底：按轮号取第 N 个用户行（不依赖 segment 对象身份——
      // 搜索路径的 segment 来自新的 planSegments 调用，indexOf 会得 -1
      // 而错取第 0 行，曾致搜索跳 #3 落在轮 1）。
      if (row === null) row = nthUserRow(Math.max(0, targetTurn - 1))
      if (row === null) return
      jumpToRow(row)
      flashRow(row)
      paintPlayhead()
      // 先跳再判定：diff 需在 scrollTop 写入后计算（D5 曾把判定写在跳转前，
      // 差值恒为 0，toast 永不出现）。
      if (scroller !== null && Math.abs(scroller.scrollTop - prevTop) > 8) {
        showReturnToast(`#${targetTurn}`, () => {
          scroller.scrollTop = prevTop
          paintPlayhead()
        })
      }
    })()
  }

  return React.createElement(
    'div',
    {
      'data-turnbar': '',
      ref: (el: HTMLElement | null): void => { barRef.current = el },
      role: 'navigation',
      'aria-label': 'conversation turns',
      onPointerMove: onPointerMove,
      onPointerLeave: onPointerLeave,
      onPointerDown: onPointerDown,
      onPointerUp: onPointerUp,
      onPointerMoveCapture: onPointerMoveDown,
    },
    [
      React.createElement('div', {
        key: 'playhead',
        'data-turnbar-playhead': '',
        ref: (el: HTMLElement | null): void => { playheadRef.current = el },
      }, null),
      ...segments.map(segment =>
        React.createElement('button', {
          key: segment.label,
          type: 'button',
          'data-turnbar-seg': '',
          className: [
            segment.hasUser ? 'has-user' : '',
            segment.running ? 'running' : '',
            segment.ghost ? 'ghost' : '',
          ].filter(Boolean).join(' ') || undefined,
          // 不设 title：原生 tooltip（~1s）会与 120ms 自定义悬停卡叠成双提示。
          'aria-label': segment.ghost
            ? `turn ${segment.label}（已终止，无内容）`
            : `jump to turn ${segment.label}`,
          onClick: () => {
            if (suppressClickRef.current) return
            if (segment.ghost) return // 幽灵轮无内容不可跳转
            jump(segment)
          },
        }),
      ),
      // ⌘K 搜索的前端入口：进度条右端放大镜按钮
      React.createElement('button', {
        key: 'search-btn',
        type: 'button',
        'data-turnbar-search-btn': '',
        'aria-label': '搜索这个会话（⌘K）',
        onClick: () => {
          if (suppressClickRef.current) return
          toggleSearch(sessionId ?? '', (turn: number) => jumpRef.current(turn))
        },
      }, React.createElement('svg', {
        width: 11, height: 11, viewBox: '0 0 16 16', 'aria-hidden': 'true',
      },
      React.createElement('circle', { cx: 7, cy: 7, r: 4.5, fill: 'none', stroke: 'currentColor', strokeWidth: 1.6 }),
      React.createElement('line', { x1: 10.5, y1: 10.5, x2: 14, y2: 14, stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' }),
      )),
    ],
  )
}

// ─── 插件挂载 ────────────────────────────────────────────────────────────────

export default {
  name: 'dsh-turnbar-client',
  inject: ['slots'] as string[],
  apply(ctx: any): () => void {
    if (typeof document === 'undefined') return () => {}
    if (document.getElementById(STYLE_ID) === null) {
      const style = document.createElement('style')
      style.id = STYLE_ID
      style.textContent = CSS
      document.head.appendChild(style)
    }
    initToast()
    let dispose: (() => void) | undefined
    try {
      dispose = ctx.slots.inject('conversation.composer.dock', () =>
        ctx.slots.register(
          { name: 'conversation.composer.dock', id: 'turnbar', order: 1 },
          TurnBar,
        ))
    } catch (error) {
      console.error('[dsh-turnbar] slot registration failed:', error)
    }
    return () => {
      try { dispose?.() } catch { /* 卸载期上下文可能已失效 */ }
      document.getElementById(STYLE_ID)?.remove()
      document.getElementById('dsh-turnbar-card')?.remove()
      disposeToast()
      disposeSearch()
    }
  },
}
