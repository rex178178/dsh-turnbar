/**
 * 轮次精确锚定（v0.2.3）：store 的权威轮次索引 chat.locations.getTurn(N)
 * 给出该轮有序节点 key 列表，DOM flowItem 自带 data-chat-flow-key/-kind——
 * 按位对齐即可精确定位，不再依赖「上一个/下一个轮尾」区间启发式。
 *
 * 区间法的两个盲区（真机「继续」会话实测）：
 * - 前一轮 aborted 无 closing → 不渲染 data-turn-tail（vendor TurnTailNodeView
 *   只渲染壳）→ 点 #11 区间溢进 turn 10，错取 turn 10 的触发行；
 * - goal 轮（/goal 输入渲染为 context 行、无用户气泡）→ 点 #3 区间内没有
 *   用户行，锚点落到意外的 tool 行。
 */

/** 一轮的有序节点表（已过滤到 DOM 上存在的行）。 */
export interface FlowEntry {
  readonly key: string
  /** flowItem 的 data-chat-flow-kind（user/context/assistant/tool-call/turn-tail/…）。 */
  readonly kind: string
}

/** 内容行：出现即说明触发消息（若有）已错过——goal 轮的 context 回显不算内容。 */
const CONTENT_KINDS = new Set(['assistant', 'tool-call', 'tool-result', 'turn-tail', 'turn-error', 'model-retry', 'compaction', 'turn-max-tokens'])

/**
 * 从一轮的有序节点表选跳转锚下标：
 * - 首个 user 行出现在任何内容行之前 → 它就是触发消息，锚它；
 * - 否则（goal 轮：context 行打头；纯工具轮：内容行打头）→ 锚该轮第一行。
 * 表为空返回 -1。
 */
export function pickTurnAnchor(entries: readonly FlowEntry[]): number {
  let first = -1
  for (let i = 0; i < entries.length; i++) {
    const kind = entries[i]?.kind ?? ''
    if (first === -1) first = i
    if (kind === 'user') return i
    if (CONTENT_KINDS.has(kind)) break
  }
  return first
}
