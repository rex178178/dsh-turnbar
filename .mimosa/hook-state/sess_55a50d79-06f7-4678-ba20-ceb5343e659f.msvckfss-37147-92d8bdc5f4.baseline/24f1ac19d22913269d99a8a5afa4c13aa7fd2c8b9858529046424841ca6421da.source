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
import { planSegments, segmentCenterPercent, type SegmentSpec } from './grouping'
import { buildCardModel, buildGroupCardModel, ensureCard, type CardHandle, type CardTurn } from './card'
import { disposeToast, initToast, showReturnToast } from './toast'

const STYLE_ID = 'dsh-turnbar-style'
const CSS = `
[data-turnbar] {
  position: relative;
  display: flex; align-items: center; gap: 2px;
  width: 100%; padding: 3px 8px; box-sizing: border-box;
  user-select: none; -webkit-user-select: none; touch-action: none;
}
[data-turnbar-playhead] {
  position: absolute; top: -3px; bottom: -3px; width: 2px; left: 0;
  background: var(--dsw-alias-text-accent, #4c9aff);
  border-radius: 1px; pointer-events: none; opacity: 0;
  transition: transform .08s linear, opacity .15s ease;
}
[data-turnbar-seg] {
  flex: 1 1 0; min-width: 2px; height: 8px; padding: 0; border: none;
  border-radius: 2px; cursor: pointer;
  background: rgba(128, 128, 140, .35);
  transition: transform .12s ease, background .12s ease;
}
[data-turnbar-seg].has-user { background: rgba(128, 128, 140, .6); }
[data-turnbar-seg]:hover, [data-turnbar-seg].scrub-target {
  transform: scaleY(1.8); background: var(--dsw-alias-text-accent, #4c9aff);
}
[data-turnbar-seg].running {
  background: var(--dsw-alias-text-accent, #4c9aff);
  animation: turnbar-pulse 1.2s ease-in-out infinite;
}
@keyframes turnbar-pulse { 0%,100% { opacity: 1 } 50% { opacity: .45 } }
[data-turnbar-flash] {
  outline: 2px solid var(--dsw-alias-text-accent, #4c9aff);
  outline-offset: 2px; border-radius: 6px;
  animation: turnbar-flash 2.5s ease-out forwards;
}
@keyframes turnbar-flash { 0% { background-color: rgba(76, 154, 255, .18) } 70% { background-color: rgba(76, 154, 255, .12) } 100% { background-color: transparent } }
[data-turnbar-card] {
  position: fixed; z-index: 910; width: 320px; max-width: calc(100vw - 16px);
  box-sizing: border-box; padding: 10px 14px; border-radius: 12px;
  font-family: system-ui, sans-serif; font-size: 12px; line-height: 1.55;
  color: var(--dsw-alias-text-1, #eee);
  background: var(--dsw-hovercard-bg, #2C2C2E);
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
  color: var(--dsw-alias-text-1, #eee);
  background: var(--dsw-hovercard-bg, #2C2C2E);
  box-shadow: var(--dsw-shadow-lv3, 0 8px 24px rgba(0,0,0,.35));
  cursor: pointer; user-select: none;
  opacity: 0; transform: translateY(6px); pointer-events: none;
  transition: opacity .15s ease, transform .15s ease;
}
[data-turnbar-toast].visible { opacity: 1; transform: translateY(0); pointer-events: auto; }
[data-turnbar-toast] .tb-toast-return { color: var(--dsw-alias-text-accent, #4c9aff); }
@media (prefers-reduced-motion: reduce) {
  [data-turnbar-seg], [data-turnbar-card], [data-turnbar-flash] { transition: none; animation: none; }
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

/** 定位 turn N 的触发消息行：从 turn-tail N 向前走到上一轮尾，区间内第一条 user 行。 */
function userRowOfTurn(turn: number): HTMLElement | null {
  const flow = flowEl()
  if (flow === null) return null
  const tail = flow.querySelector(`[data-turn-tail="${turn}"]`)
  if (tail === null) return null
  let el: Element | null = tail
  while (el !== null) {
    if (el !== tail && el.hasAttribute('data-turn-tail')) break
    if (isUserRow(el)) return el as HTMLElement
    el = el.previousElementSibling
  }
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
  const btn = flow?.querySelector<HTMLButtonElement>('button')
  const older = btn !== null && btn !== undefined && btn.textContent !== null
    && /earlier|加载更早|更早/i.test(btn.textContent)
    ? btn
    : null
  older?.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
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

  return { sessionId, turns, hasMoreRef, sessionRef }
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
  const { turns, hasMoreRef, sessionRef, sessionId } = useTurnbarData(props?.useSession)
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
    const tails = [...flow.querySelectorAll<HTMLElement>('[data-turn-tail]')]
    let best = -1
    let bestDist = Number.POSITIVE_INFINITY
    for (const tail of tails) {
      const turn = Number(tail.getAttribute('data-turn-tail'))
      if (!Number.isFinite(turn)) continue
      const r = tail.getBoundingClientRect()
      const d = Math.abs(r.top + r.height / 2 - centerY)
      if (d < bestDist) { bestDist = d; best = turn }
    }
    return best
  }

  const paintPlayhead = (): void => {
    const playhead = playheadRef.current
    const bar = barRef.current
    if (playhead === null || bar === null) return
    const activeTurn = computeActiveTurn()
    if (activeTurn < 0) { playhead.style.opacity = '0'; return }
    const idx = turnsRef.current.findIndex((t: SidecarTurn) => t.index === activeTurn)
    if (idx < 0) { playhead.style.opacity = '0'; return }
    const pct = segmentCenterPercent(idx, turnsRef.current.length)
    // 内容区 = 内宽（左右 8px padding），transform 位移保持 GPU 合成。
    const usable = bar.offsetWidth - 16
    playhead.style.transform = `translateX(${(pct / 100) * usable}px)`
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
    const child = bar.children[segmentIndex] as HTMLElement | undefined
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
    const rel = (x - rect.left - 8) / Math.max(1, rect.width - 16)
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
    if (segment !== undefined) jump(segment)
  }

  // ── 跳转 ──────────────────────────────────────────────────────────────────
  const jump = (segment: SegmentSpec): void => {
    void (async () => {
      const targetTurn = segment.turns[0]?.index ?? 1
      const scroller = scrollerOf(flowEl())
      const prevTop = scroller?.scrollTop ?? 0
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
          ].filter(Boolean).join(' ') || undefined,
          title: segment.label,
          'aria-label': `jump to turn ${segment.label}`,
          onClick: () => { if (!suppressClickRef.current) jump(segment) },
        }),
      ),
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
    }
  },
}
