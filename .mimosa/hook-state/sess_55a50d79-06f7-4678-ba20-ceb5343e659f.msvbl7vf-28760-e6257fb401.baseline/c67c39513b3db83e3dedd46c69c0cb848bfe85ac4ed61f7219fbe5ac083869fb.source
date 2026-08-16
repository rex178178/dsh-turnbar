/**
 * 进度条分段规划（纯逻辑）：≤150 轮一轮一段；>150 轮按 ceil(n/40) 分组，
 * 保证条上可交互段数 ≤ maxSegments（PLAN.md §5.5：永不滑动窗口，聚合代替）。
 */
export interface TurnLite {
  readonly index: number
  readonly userFirstLine?: string
  readonly running?: boolean
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
    })
  }
  return segments
}
