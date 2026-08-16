/**
 * dsh-turnbar · client half（浏览器端，官方 client 通道）：
 * 经官方 list 插槽 conversation.composer.dock 注入全景轮次条（composer 停靠区，
 * 官方 StatsLine 同族）。props 由插槽框架注入：useSession/sessionId 等
 * （session standard kit）。
 *
 * 数据：优先 host 半区路由 /plugins/dsh-turnbar/state（全量轮次图，含元信息），
 * 拉不到时退化为客户端 store 推导（仅已加载窗口内的轮次）——双源合并，单源可活。
 * 跳转：目标轮不在窗口内时循环 loadOlder()（session 契约方法）直至行出现，
 * 再按 dsh-navbar 验证过的配方写 scrollTop（0811 起程序化写入即读者输入，
 * 不再被 follow 拉回），最后对目标行打 2.5s 高亮 flash。
 */
import React from 'react'
import { planSegments, type SegmentSpec, type TurnLite } from './grouping'

const STYLE_ID = 'dsh-turnbar-style'
const CSS = `
[data-turnbar] {
  display: flex; align-items: center; gap: 2px;
  width: 100%; padding: 3px 8px; box-sizing: border-box;
}
[data-turnbar-seg] {
  flex: 1 1 0; min-width: 2px; height: 8px; padding: 0; border: none;
  border-radius: 2px; cursor: pointer;
  background: rgba(128, 128, 140, .35);
  transition: transform .12s ease, background .12s ease;
}
[data-turnbar-seg].has-user { background: rgba(128, 128, 140, .6); }
[data-turnbar-seg]:hover { transform: scaleY(1.8); background: var(--dsw-alias-text-accent, #4c9aff); }
[data-turnbar-seg].running {
  background: var(--dsw-alias-text-accent, #4c9aff);
  animation: turnbar-pulse 1.2s ease-in-out infinite;
}
@keyframes turnbar-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
[data-turnbar-flash] {
  outline: 2px solid var(--dsw-alias-text-accent, #4c9aff);
  outline-offset: 2px;
  border-radius: 6px;
  animation: turnbar-flash 2.5s ease-out forwards;
}
@keyframes turnbar-flash { 0% { background-color: rgba(76, 154, 255, .18) } 70% { background-color: rgba(76, 154, 255, .12) } 100% { background-color: transparent } }
@media (prefers-reduced-motion: reduce) {
  [data-turnbar-seg], [data-turnbar-flash] { transition: none; animation: none; }
}
`

// ─── DOM 定位（与官方 DOM 契约及 dsh-navbar 验证过的配方对齐） ────────────────

function flowEl(): HTMLElement | null {
  return document.querySelector<HTMLElement>('[data-chat-flow=""]')
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

/**
 * 定位 turn N 的触发消息行：从 turn-tail N 向前走到 turn-tail N-1（或列表头），
 * 区间内第一条 user 行即触发消息（区间内后到的 user 行是 steering）。
 */
function userRowOfTurn(turn: number): HTMLElement | null {
  const flow = flowEl()
  if (flow === null) return null
  const tail = flow.querySelector(`[data-turn-tail="${turn}"]`)
  if (tail === null) return null
  let el: Element | null = tail
  while (el !== null) {
    if (el !== tail && el.hasAttribute('data-turn-tail')) break // 进入上一轮区间，停
    if (isUserRow(el)) return el as HTMLElement
    el = el.previousElementSibling
  }
  // 兜底：区间内没找到 user 行（折叠/异常形态）→ 跳轮尾本身。
  return tail as HTMLElement
}

function nthUserRow(n: number): HTMLElement | null {
  const flow = flowEl()
  if (flow === null) return null
  const rows = [...flow.querySelectorAll<HTMLElement>('[data-time-hover-root]')].filter(isUserRow)
  return rows[Math.max(0, Math.min(rows.length - 1, n))] ?? null
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

interface TurnBarProps {
  useSession?: (selector: (s: any) => any) => any
  /** session standard kit 里的会话服务实例（loadOlder 的家）。 */
  session?: { loadOlder?: () => Promise<void> | void }
}

interface SidecarTurn {
  index: number
  userFirstLine?: string
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
  const views: any = safeSelect((s: any) => s?.views)

  const hasMoreRef = React.useRef(false)
  const viewsRef = React.useRef(null)
  hasMoreRef.current = hasMore
  viewsRef.current = views

  const [metaTurns, setMetaTurns] = React.useState(null as SidecarTurn[] | null)
  React.useEffect(() => {
    if (typeof sessionId !== 'string' || sessionId === '') return
    let alive = true
    const load = async (): Promise<void> => {
      try {
        const res = await fetch(`/plugins/dsh-turnbar/state?sessionId=${encodeURIComponent(sessionId)}`)
        if (!res.ok) return
        const json = await res.json()
        if (alive && Array.isArray(json?.state?.turns)) setMetaTurns(json.state.turns)
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

  // 轮次列表：sidecar（全量）优先；退化为 store 的已加载窗口推导。
  const turns: TurnLite[] = React.useMemo(() => {
    if (metaTurns !== null && metaTurns.length > 0) {
      return metaTurns.map((t: SidecarTurn, i: number) => ({
        index: typeof t.index === 'number' ? t.index : i + 1,
        userFirstLine: t.userFirstLine ?? '',
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
      userFirstLine: '',
      running: running && i === all.length - 1,
    }))
  }, [metaTurns, nodes, running])

  return { sessionId, turns, hasMoreRef, viewsRef, session: safeSelect((s: any) => s?.session) }
}

/** 触发一页历史加载：优先 session 契约方法，DOM 的 Load earlier 按钮兜底。 */
function loadOnePage(sessionRef: { current: any }): Promise<void> | void {
  const service = sessionRef.current
  if (typeof service?.loadOlder === 'function') {
    try { return service.loadOlder() } catch { /* 落到 DOM 兜底 */ }
  }
  const flow = flowEl()
  const btn = flow?.querySelector<HTMLButtonElement>('button')
  // Load earlier 按钮是流容器里唯一的按钮（分页控件），无 data 锚点，按位置取。
  const older = btn !== null && btn !== undefined && btn.textContent !== null
    && /earlier|加载更早|更早/i.test(btn.textContent)
    ? btn
    : null
  older?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

const TurnBar = function TurnBar(props: TurnBarProps | undefined): any {
  const { turns, hasMoreRef, session } = useTurnbarData(props?.useSession)
  const sessionRef = React.useRef(null)
  sessionRef.current = session ?? props?.session ?? null

  if (turns.length < 2) return null
  const segments: SegmentSpec[] = planSegments(turns)

  const jump = (segment: SegmentSpec): void => {
    void (async () => {
      const targetTurn = segment.turns[0]?.index ?? 1
      let row = userRowOfTurn(targetTurn)
      // 目标轮不在已加载窗口：拉历史直至行出现（上限 40 页，防呆）。
      for (let i = 0; row === null && hasMoreRef.current && i < 40; i++) {
        try { await loadOnePage(sessionRef) } catch { break }
        await new Promise(resolve => window.setTimeout(resolve, 120))
        row = userRowOfTurn(targetTurn)
      }
      if (row === null) row = nthUserRow(segments.indexOf(segment))
      if (row === null) return
      jumpToRow(row)
      flashRow(row)
    })()
  }

  return React.createElement(
    'div',
    { 'data-turnbar': '', role: 'navigation', 'aria-label': 'conversation turns' },
    segments.map(segment =>
      React.createElement('button', {
        key: segment.label,
        type: 'button',
        'data-turnbar-seg': '',
        className: [
          segment.hasUser ? 'has-user' : '',
          segment.running ? 'running' : '',
        ].filter(Boolean).join(' ') || undefined,
        title: segment.label,
        'aria-label': `jump to turn ${segment.label}`,
        onClick: () => jump(segment),
      }),
    ),
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
    }
  },
}
