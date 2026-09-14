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
  /** DOM 分组场景：kind=turn-tail 时的轮尾属性值（rc.7 索引路径无此信息，缺省）。 */
  readonly tailTurn?: number | null
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

// ── DOM 分组定位（0.1.5 适配）────────────────────────────────────────────────
// 0.1.5 删除了权威轮次索引 chat.locations.getTurn，跳转锚定改由 client 自己
// 从 DOM 重建每轮行清单：0.1.5 的 flow key 里仍藏着轮号，但藏在「类型段的
// 尾随数字」里（`12:turn-process14` → 轮 14、`14:assistant-step13:1` → 轮 13）。
// ⚠️ 行首 `NN:` 是槽位号不是轮号——同一段真机取证里 user 行前缀 13 横跨轮
// 13/14/15 三处（computeActiveTurn 注释亦有"前缀不可用"的烧痕）。解析只取
// 类型段尾数字，绝不取行首槽位号。

/** 分组输入的一行（DOM flowItem 的投影）。 */
export interface GroupRow {
  readonly key: string
  /** flowItem 的 data-chat-flow-kind。 */
  readonly kind: string
  /** kind=turn-tail 时的 data-turn-tail 属性值；其他行/属性缺失传 null。 */
  readonly tailTurn?: number | null
}

/**
 * 从 flow key 的类型段解析轮号（可解析锚只有 turn-process / assistant-step）。
 * turn-tail 的尾随数字（`9:turn-tail12`）未经证实是轮号（可能是节点号），不采信
 * ——turn-tail 一律走 data-turn-tail 属性。user（`13:input-message…`）与
 * tool-call（`9:tool-call call_…`）的 key 均不含轮号。
 */
function turnFromKey(key: string): number | null {
  const m = key.match(/^(?:\d+:)?(?:turn-process|assistant-step)(\d+)/)
  if (m === null) return null
  const n = Number(m[1])
  return Number.isFinite(n) ? n : null
}

/**
 * 一行是否携带可信轮号（= 可作归属/收网锚）。⚠️ 无属性的 turn-tail 壳
 * （aborted 无 closing）不算——真机 #11 实证：壳卡在漏入 user 与触发 user
 * 中间时，把它当锚会把 lastUser 停在漏入行上。
 */
function hasTurnInfo(key: string, kind: string, tailTurn?: number | null): boolean {
  if (kind === 'turn-tail') return tailTurn !== undefined && tailTurn !== null && Number.isFinite(tailTurn)
  return turnFromKey(key) !== null
}

/**
 * 给一次扫描到的全部 flowItem 算所属轮号并按轮分组（文档序保持）。
 * 归属规则（0.1.5 渲染顺序实证：每轮 = user 行 → turn-process N →
 * assistant-step/tool-call → turn-tail N）：
 * - 可解析锚（turn-process/assistant-step 的类型段尾数字、turn-tail 的属性）→ 自身即轮号；
 * - user / context 行恒在本轮 turn-process 之前 → 向后归属到最近一条可解析行
 *   （context 必须与 user 同规则——goal 轮的 context 回显也排在本轮 process 之前，
 *   若向前归属会错扫进上一轮）；
 * - 其余行（tool-call 等）恒在本轮 process 之后 → 向前归属；
 * - 两个方向都无锚（流顶注入行之前/解析全失败）→ 该行弃置，不入组。
 * 返回 Map<轮号, 该轮有序 FlowEntry[]>，直接喂 pickTurnAnchor 选锚。
 */
export function groupTurnRows(rows: readonly GroupRow[]): Map<number, FlowEntry[]> {
  const assigned: (number | null)[] = rows.map(r =>
    r.kind === 'turn-tail' && r.tailTurn !== undefined && r.tailTurn !== null && Number.isFinite(r.tailTurn)
      ? r.tailTurn
      : turnFromKey(r.key),
  )
  // user / context → 向后归属（从尾向头，携带最近的可解析轮号）
  let next: number | null = null
  for (let i = rows.length - 1; i >= 0; i--) {
    const t = assigned[i]
    if (t !== null && t !== undefined) { next = t; continue }
    const kind = rows[i]?.kind ?? ''
    if (kind === 'user' || kind === 'context') assigned[i] = next
  }
  // 其余 → 向前归属（从头向尾）。⚠️ prev 只跟随携带轮号的行（hasTurnInfo）：
  // forward 落组的 user 行不能把自己的组号传给后续"其余"行——否则 aborted 轮
  // 的无属性轮尾壳会跟着漏入 user 一起混进下一轮的组（真机 #11 实证）。
  let prev: number | null = null
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i]
    if (r === undefined) continue
    const t = assigned[i]
    if (t !== null && t !== undefined) {
      if (hasTurnInfo(r.key, r.kind ?? '', r.tailTurn)) prev = t
      continue
    }
    const kind = r.kind ?? ''
    if (kind !== 'user' && kind !== 'context') assigned[i] = prev
  }
  const groups = new Map<number, FlowEntry[]>()
  for (let i = 0; i < rows.length; i++) {
    const turn = assigned[i]
    if (turn === null || turn === undefined) continue
    let list = groups.get(turn)
    if (list === undefined) { list = []; groups.set(turn, list) }
    list.push({ key: rows[i]?.key ?? '', kind: rows[i]?.kind ?? '', tailTurn: rows[i]?.tailTurn ?? null })
  }
  return groups
}

/**
 * DOM 分组专用锚选择（对 pickTurnAnchor 的分组场景修正）：分组表可能混入
 * 「被掏空上一轮」的孤儿 user 行——aborted 轮连 turn-process 都不渲染时，
 * user10 只能向前归属进轮 11 的组（真机 #11 实测：轮 10/11 首句同为
 * 「怎么每次都这么久啊…」开头，取首个 user 会错锚漏入行）。渲染顺序保证
 * 触发 user 紧贴本轮首个可解析锚行之前 → 取锚行之前**最后一个** user 行；
 * 锚行未出现（React 局部提交窗口，漏入行先落组）→ 返回 -1 保持未定位，
 * 交给调用方继续翻页/等待，宁可慢不可错。无 user 行（goal 轮 context 回显
 * / 纯工具轮）→ 与 pickTurnAnchor 同规锚该组第一行。
 * ⚠️ 锚行判定走 hasTurnInfo：无属性的 turn-tail 壳不带轮号，跳过不收网
 * （它若 break，lastUser 会停在它前面的漏入行上——真机 #11 二次实证）。
 */
export function pickGroupAnchor(entries: readonly FlowEntry[]): number {
  let lastUser = -1
  let first = -1
  let anchored = false
  for (let i = 0; i < entries.length; i++) {
    const en = entries[i]
    if (en === undefined) continue
    if (first === -1) first = i
    if (en.kind === 'user') { lastUser = i; continue }
    if (hasTurnInfo(en.key, en.kind, en.tailTurn)) { anchored = true; break }
    if (en.kind === 'turn-tail') continue // 无属性壳：无信息量，不收网也不截停
    if (CONTENT_KINDS.has(en.kind)) break
  }
  if (lastUser !== -1) return anchored ? lastUser : -1
  return first
}
