/**
 * 上下文余量派生（v0.3，纯逻辑）：
 * 占用 = 该轮最后一次请求的 inputTokens ÷ 会话 contextWindow。
 * 任一数据缺失 → null → 整行隐藏（不估算、不误导，L1 降级原则）。
 */

export const CONTEXT_WARN = 0.8
export const CONTEXT_CRIT = 0.95

export type ContextLevel = 'normal' | 'warn' | 'crit'

export interface ContextLine {
  readonly text: string
  readonly level: ContextLevel
}

export function occupancyOf(used: number | undefined, contextWindow: number | undefined): number | null {
  if (typeof used !== 'number' || !Number.isFinite(used) || used <= 0) return null
  if (typeof contextWindow !== 'number' || !Number.isFinite(contextWindow) || contextWindow <= 0) return null
  return Math.min(1, Math.max(0, used / contextWindow))
}

function compact(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`
  return String(n)
}

/** "上下文 62% · 余 38k"；≥80% warn、≥95% crit。 */
export function formatContextLine(
  occupancy: number | null,
  contextWindow: number | undefined,
): ContextLine | null {
  if (occupancy === null) return null
  const pct = Math.round(occupancy * 100)
  const remaining = typeof contextWindow === 'number' && contextWindow > 0
    ? Math.max(0, contextWindow - Math.round(contextWindow * occupancy))
    : null
  const rest = remaining !== null ? ` · 余 ${compact(remaining)}` : ''
  const level: ContextLevel = occupancy >= CONTEXT_CRIT ? 'crit' : occupancy >= CONTEXT_WARN ? 'warn' : 'normal'
  return { text: `上下文 ${pct}%${rest}`, level }
}

/** 末轮占用（条尾警示用）：取最后一个携带 contextUsed 的轮。 */
export function latestOccupancy(
  turns: readonly { contextUsed?: number }[],
  contextWindow: number | undefined,
): number | null {
  for (let i = turns.length - 1; i >= 0; i--) {
    const occ = occupancyOf(turns[i]?.contextUsed, contextWindow)
    if (occ !== null) return occ
  }
  return null
}