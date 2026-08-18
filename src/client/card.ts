/**
 * 悬停预览卡（单例 DOM，navbar 同款自渲染范式——不依赖 portal）：
 * 信息架构按 PLAN.md §5.1——头部（轮号/角色/相对时间）、用户首句 2 行 clamp、
 * 助手首段 2 行 clamp、meta 行（🔧 工具 · 📄 文件 · token · 补充轮次）。
 * 填充用 textContent（零 innerHTML，内容不可注入）；定位 clamp 视口 + 顶部不足翻转。
 */

import { formatContextLine, occupancyOf, type ContextLine } from './context'

export interface CardTurn {
  readonly index: number
  readonly userFirstLine?: string
  readonly assistantFirstLine?: string
  readonly startedAt?: number
  readonly tokenIn?: number
  readonly tokenOut?: number
  /** 该轮最后一次请求的输入 token（v0.3 上下文余量用）。 */
  readonly contextUsed?: number
  readonly toolCallCount?: number
  readonly fileChanges?: readonly string[]
  readonly steeringCount?: number
  readonly running?: boolean
  /** turn/end 的 reason.kind（如 aborted）。 */
  readonly endReason?: string
}

export interface CardModel {
  readonly head: string
  readonly user: string
  readonly assistant: string
  readonly meta: string
  /** 上下文余量行（v0.3）：数据不可得时 undefined（整行不渲染）。 */
  readonly context?: ContextLine
  /** 轨迹快捷键提示行（v0.3 F6.1）：幽灵段等不可跳场景由调用方置空。 */
  readonly hint?: string
}

/** buildCardModel 的第二参：兼容旧签名传时间戳（测试），新语义传选项对象。 */
export type CardModelOpts = number | { contextWindow?: number; now?: number }

export function formatRelativeTime(at: number | undefined, now = Date.now()): string {
  if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return ''
  const diff = Math.max(0, now - at)
  if (diff < 60_000) return '刚刚'
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`
  const d = new Date(at)
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const mi = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${mi}`
}

export function formatTokens(turn: CardTurn): string {
  const inn = typeof turn.tokenIn === 'number' ? turn.tokenIn : 0
  const out = typeof turn.tokenOut === 'number' ? turn.tokenOut : 0
  const total = inn + out
  if (total <= 0) return ''
  return `~${compact(total)} tok`
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`
  return String(n)
}

function optsOf(opts: CardModelOpts | undefined): { contextWindow: number | undefined; now: number } {
  return typeof opts === 'number'
    ? { contextWindow: undefined, now: opts }
    : { contextWindow: opts?.contextWindow, now: opts?.now ?? Date.now() }
}

export function buildCardModel(turn: CardTurn, opts?: CardModelOpts): CardModel {
  const { contextWindow, now } = optsOf(opts)
  const parts: string[] = [`#${turn.index}`]
  const rel = formatRelativeTime(turn.startedAt, now)
  if (rel !== '') parts.push(rel)
  if (turn.running === true) parts.push('运行中')
  const head = parts.join(' · ')
  // 上下文余量行（v0.3）：该轮最后一次请求时的占用——scrub 扫过即见"那一刻还剩多少"。
  // 先于幽灵判断计算：已终止的空轮照样消耗过上下文，占用信息真实可显示。
  const context = formatContextLine(occupancyOf(turn.contextUsed, contextWindow), contextWindow)

  // 幽灵轮：无任何内容（被终止的系统注入轮）——卡片只做说明，不假装有内容。
  if ((turn.userFirstLine ?? '') === '' && (turn.assistantFirstLine ?? '') === '' && (turn.toolCallCount ?? 0) <= 0) {
    return {
      head,
      user: '',
      assistant: '该轮已终止，无对话内容',
      meta: '',
      context: context ?? undefined,
    }
  }

  const metaParts: string[] = []
  if (typeof turn.toolCallCount === 'number' && turn.toolCallCount > 0) {
    metaParts.push(`🔧 ${turn.toolCallCount}`)
  }
  const files = turn.fileChanges?.length ?? 0
  if (files > 0) metaParts.push(`📄 ${files}`)
  const tok = formatTokens(turn)
  if (tok !== '') metaParts.push(tok)
  if (typeof turn.steeringCount === 'number' && turn.steeringCount > 0) {
    metaParts.push(`+${turn.steeringCount} 补充`)
  }
  // 真实用户中止轮（有内容但被取消）：标记出来，避免看起来像正常完成的轮。
  if (turn.endReason === 'aborted') metaParts.push('⏹ 已中止')
  return {
    head,
    user: turn.userFirstLine ?? '',
    assistant: turn.assistantFirstLine ?? '',
    meta: metaParts.join(' · '),
    context: context ?? undefined,
  }
}

export function buildGroupCardModel(turns: readonly CardTurn[], opts?: CardModelOpts): CardModel {
  const { contextWindow } = optsOf(opts)
  const first = turns[0]
  const last = turns[turns.length - 1]
  const users = turns.map(t => t.userFirstLine ?? '').filter(s => s !== '').slice(0, 3)
  // 组卡取末轮占用：组结束后上下文所处的状态。
  const context = last !== undefined
    ? formatContextLine(occupancyOf(last.contextUsed, contextWindow), contextWindow)
    : null
  return {
    head: `#${first?.index ?? '?'}–#${last?.index ?? '?'} · ${turns.length} 轮`,
    user: users.map((line, i) => `${i + 1}. ${line}`).join('\n'),
    assistant: '拖动经过逐轮预览，或在 ⌘K 中精确搜索',
    meta: '',
    context: context ?? undefined,
  }
}

// ─── 单例卡片 DOM ────────────────────────────────────────────────────────────

const CARD_ID = 'dsh-turnbar-card'

export interface CardHandle {
  el: HTMLElement
  show(): void
  hide(): void
  fill(model: CardModel): void
  position(anchor: DOMRect): void
}

export function ensureCard(): CardHandle {
  const existing = document.getElementById(CARD_ID)
  if (existing !== null) return wrap(existing as HTMLElement)
  const el = document.createElement('div')
  el.id = CARD_ID
  el.setAttribute('data-turnbar-card', '')
  el.setAttribute('role', 'tooltip')
  // 不设 display:none：固定定位 + pointer-events:none，不挡任何东西；
  // 可见性完全由 .visible class 的 opacity/transform 过渡管理（D4 曾因
  // 内联 display:none 永不移除导致卡片永远不可见——勿再引入）。
  document.body.appendChild(el)
  return wrap(el)
}

function wrap(el: HTMLElement): CardHandle {
  return {
    el,
    show(): void { el.style.display = 'block' },
    hide(): void { el.classList.remove('visible') },
    fill(model: CardModel): void {
      el.replaceChildren()
      const head = document.createElement('div')
      head.className = 'tb-head'
      head.textContent = model.head
      el.appendChild(head)
      if (model.user !== '') {
        const user = document.createElement('div')
        user.className = 'tb-user'
        user.textContent = model.user
        el.appendChild(user)
      }
      if (model.assistant !== '') {
        const assistant = document.createElement('div')
        assistant.className = 'tb-assistant'
        assistant.textContent = model.assistant
        el.appendChild(assistant)
      }
      if (model.context !== undefined && model.context !== null) {
        const ctx = document.createElement('div')
        ctx.className = `tb-context${model.context.level !== 'normal' ? ` tb-context-${model.context.level}` : ''}`
        ctx.textContent = model.context.text
        el.appendChild(ctx)
      }
      if (model.hint !== undefined && model.hint !== '') {
        const hint = document.createElement('div')
        hint.className = 'tb-hint'
        hint.textContent = model.hint
        el.appendChild(hint)
      }
      if (model.meta !== '') {
        const meta = document.createElement('div')
        meta.className = 'tb-meta'
        meta.textContent = model.meta
        el.appendChild(meta)
      }
    },
    position(anchor: DOMRect): void {
      el.style.left = '0px'
      el.style.top = '0px'
      const w = el.offsetWidth
      const h = el.offsetHeight
      const vw = window.innerWidth
      const vh = window.innerHeight
      const left = Math.max(8, Math.min(vw - w - 8, anchor.left + anchor.width / 2 - w / 2))
      // 优先悬停目标上方 8px；顶部空间不足 220px 时翻转到下方。
      const top = anchor.top - h - 8 >= 8 ? anchor.top - h - 8 : anchor.bottom + 8
      el.style.left = `${Math.round(left)}px`
      el.style.top = `${Math.round(Math.max(8, Math.min(vh - h - 8, top)))}px`
    },
  }
}
