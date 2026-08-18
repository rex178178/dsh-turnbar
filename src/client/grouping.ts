/**
 * 进度条分段规划（纯逻辑）：≤150 轮一轮一段；>150 轮按 ceil(n/40) 分组，
 * 保证条上可交互段数 ≤ maxSegments（PLAN.md §5.5：永不滑动窗口，聚合代替）。
 */
export interface TurnLite {
  readonly index: number
  readonly userFirstLine?: string
  readonly assistantFirstLine?: string
  readonly toolCallCount?: number
  readonly running?: boolean
}

/** 进度条可见阈值：≥1 轮显示（单轮会话也显示 1 段，0 轮新会话隐藏）。 */
export const MIN_VISIBLE_TURNS = 1
export function shouldShowTurnbar(turnCount: number): boolean {
  return turnCount >= MIN_VISIBLE_TURNS
}

/** 幽灵轮：无用户首句、无助手首段、无工具调用的空轮（如被终止的系统注入轮）。
 * 进度条上置灰、不可点击，hover 提示"已终止"。 */
export function isEmptyTurn(t: TurnLite): boolean {
  return (t.userFirstLine ?? '') === ''
    && (t.assistantFirstLine ?? '') === ''
    && (t.toolCallCount ?? 0) <= 0
}

export interface SegmentSpec {
  /** 单轮 or 聚合组（组内连续）。 */
  readonly kind: 'turn' | 'group'
  readonly from: number
  readonly to: number
  readonly turns: readonly TurnLite[]
  readonly hasUser: boolean
  readonly running: boolean
  readonly label: string
  /** 幽灵轮段（无内容，置灰不可点）。 */
  readonly ghost: boolean
}

export function planSegments(
  turns: readonly TurnLite[],
  maxSegments = 40,
  groupThreshold = 150,
): SegmentSpec[] {
  if (turns.length === 0) return []
  if (turns.length <= groupThreshold) {
    return turns.map(turn => ({
      kind: 'turn' as const,
      from: turn.index,
      to: turn.index,
      turns: [turn],
      hasUser: (turn.userFirstLine ?? '') !== '',
      running: turn.running === true,
      label: `#${turn.index}`,
      ghost: isEmptyTurn(turn),
    }))
  }
  const groupSize = Math.max(2, Math.ceil(turns.length / maxSegments))
  const segments: SegmentSpec[] = []
  for (let start = 0; start < turns.length; start += groupSize) {
    const chunk = turns.slice(start, start + groupSize)
    segments.push({
      kind: 'group',
      from: chunk[0]!.index,
      to: chunk[chunk.length - 1]!.index,
      turns: chunk,
      hasUser: chunk.some(turn => (turn.userFirstLine ?? '') !== ''),
      running: chunk.some(turn => turn.running === true),
      label: `#${chunk[0]!.index}–#${chunk[chunk.length - 1]!.index}`,
      ghost: chunk.every(turn => isEmptyTurn(turn)),
    })
  }
  return segments
}

/** 第 index 段（0-based）中心的水平百分比位置（0–100），playhead 定位用。 */
export function segmentCenterPercent(index: number, count: number): number {
  if (count <= 0) return 0
  const i = Math.max(0, Math.min(count - 1, index))
  return ((i + 0.5) / count) * 100
}

/** 章节断点输入（v0.3 章节刻度）。 */
export interface ChapterBreakLite {
  readonly turn: number
  readonly kind: 'goal' | 'todo'
}

/** 章节刻度位置（v0.3）：只渲染 goal 断点（todo/write 高频、噪声大，只记录不渲染），
 * 对齐到「以断点轮开头」的段的左缘（0–100 百分比）；无对齐段时跳过该断点。 */
export function chapterTickPercents(
  breaks: readonly ChapterBreakLite[],
  segments: readonly { from: number }[],
): number[] {
  const goals = breaks.filter(b => b.kind === 'goal')
  if (goals.length === 0 || segments.length === 0) return []
  const out: number[] = []
  for (const b of goals) {
    const idx = segments.findIndex(seg => seg.from === b.turn)
    if (idx < 0) continue
    out.push((idx / segments.length) * 100)
  }
  return out
}
