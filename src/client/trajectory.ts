/**
 * 轨迹视图联动（v0.3）：⌘/Alt+点击进度条段 → 切到官方轨迹视图并定位该轮。
 *
 * 配方（对齐 dsh-chat-outline 验证过的 DOM/快照契约，rc.6/rc.7 实证）：
 * - session.getSnapshot().views.get('trajectory') → eventNodes（kind/turn/step/seq）；
 * - 轨迹表行 tr[data-trajectory-row-key] = encodeURIComponent(recordId)：
 *   user 行 `user\0seq\0{seq}`、assistant 行 `assistant\0{turn}\0{step}`（\0 → %00）；
 * - 视图切换：按文案候选找 tab 元素点击；>100 行虚拟化 → 按目标 seq 占比先跳再逼近。
 * 任何一步失败返回 false，调用方回落对话内跳转——降级不崩溃。
 */

const TRAJECTORY_TAB_LABELS = ['轨迹', 'Trajectory', 'trajectory', 'Trace']

interface TrajectoryNodeLike {
  readonly kind?: unknown
  readonly turn?: unknown
  readonly step?: unknown
  readonly seq?: unknown
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => window.setTimeout(resolve, ms))
}

function num(value: unknown): number | null {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

function rowByKeyPrefix(prefix: string): HTMLElement | null {
  try {
    return document.querySelector(`tr[data-trajectory-row-key^="${prefix}"]`) as HTMLElement | null
  } catch { return null }
}

function paneOf(el: HTMLElement | null): HTMLElement | null {
  let n = el
  while (n !== null) {
    const s = getComputedStyle(n)
    if (s.overflowY === 'auto' || s.overflowY === 'scroll') return n
    n = n.parentElement
  }
  return null
}

function firstTrajectoryRow(): HTMLElement | null {
  return document.querySelector<HTMLElement>('tr[data-trajectory-row-key]')
}

/** 点击文案匹配的轨迹 tab（候选集中式维护，dsh 文案变更只改这里）。 */
async function switchToTrajectoryTab(): Promise<boolean> {
  for (const label of TRAJECTORY_TAB_LABELS) {
    let tabs: HTMLElement[]
    try {
      tabs = [...document.querySelectorAll<HTMLElement>('button, [role="tab"], [role="button"], a')]
    } catch { return false }
    const tab = tabs.find(el => {
      try {
        return el.offsetParent !== null && (el.textContent ?? '').trim() === label
      } catch { return false }
    })
    if (tab !== undefined) {
      tab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
      // 表格渲染等待（≤2s）：行出现即成功。
      for (let i = 0; i < 16; i++) {
        await sleep(120)
        if (firstTrajectoryRow() !== null) return true
      }
      return false
    }
  }
  return false
}

function flashRow(row: HTMLElement): void {
  row.setAttribute('data-turnbar-flash', '')
  window.setTimeout(() => row.removeAttribute('data-turnbar-flash'), 2500)
}

export async function jumpToTrajectory(session: unknown, turn: number): Promise<boolean> {
  try {
    // 1. 快照取 eventNodes：目标轮的节点（user 优先）+ 全量 seq 范围（比例跳位用）。
    let nodes: readonly TrajectoryNodeLike[] = []
    let target: TrajectoryNodeLike | undefined
    let minSeq = Infinity
    let maxSeq = -Infinity
    try {
      const getSnapshot = (session as { getSnapshot?: () => unknown } | null | undefined)?.getSnapshot
      if (typeof getSnapshot === 'function') {
        const snapshot = getSnapshot.call(session) as
          | { views?: { get?: (key: string) => { eventNodes?: unknown } | undefined } }
          | null
        const traj = snapshot?.views?.get?.('trajectory')
        if (Array.isArray(traj?.eventNodes)) nodes = traj.eventNodes as TrajectoryNodeLike[]
      }
    } catch { /* 快照不可用：仍可尝试纯 DOM 路径 */ }
    for (const node of nodes) {
      const seq = num(node.seq)
      if (seq !== null) {
        minSeq = Math.min(minSeq, seq)
        maxSeq = Math.max(maxSeq, seq)
      }
      if (num(node.turn) === turn && target === undefined) target = node
    }
    const userTarget = nodes.find(n => num(n.turn) === turn && n.kind === 'user')
    if (userTarget !== undefined) target = userTarget

    // 2. 轨迹视图不在前台 → 切 tab。
    if (firstTrajectoryRow() === null) {
      const switched = await switchToTrajectoryTab()
      if (!switched) return false
    }

    // 3. 精确 key 查行：user 按 seq、assistant 按 turn 前缀（前缀含 %00 分隔，无跨轮误配）。
    const seq = target !== undefined ? num(target.seq) : null
    let row: HTMLElement | null = null
    if (target?.kind === 'user' && seq !== null) {
      row = rowByKeyPrefix(encodeURIComponent(`user\0seq\0${seq}`))
    }
    if (row === null) {
      row = rowByKeyPrefix(encodeURIComponent(`assistant\0${turn}\0`))
    }
    if (row === null && seq !== null) {
      row = rowByKeyPrefix(encodeURIComponent(`user\0seq\0${seq}`))
    }

    // 4. 虚拟化未命中：按目标 seq 占比先跳大致位置再轮询逼近（≤10 次）。
    if (row === null && Number.isFinite(minSeq) && Number.isFinite(maxSeq) && maxSeq > minSeq) {
      const pane = paneOf(firstTrajectoryRow())
      if (pane !== null) {
        const fraction = Math.min(0.95, Math.max(0.05, ((seq ?? 0) - minSeq) / (maxSeq - minSeq)))
        pane.scrollTop = Math.round(fraction * Math.max(0, pane.scrollHeight - pane.clientHeight))
        for (let i = 0; i < 10 && row === null; i++) {
          await sleep(120)
          const assistantKey = encodeURIComponent(`assistant\0${turn}\0`)
          const userKey = seq !== null ? encodeURIComponent(`user\0seq\0${seq}`) : null
          row = rowByKeyPrefix(assistantKey) ?? (userKey !== null ? rowByKeyPrefix(userKey) : null)
        }
      }
    }
    if (row === null) return false

    // 5. pane 内居中 + 高亮（不动外层页面滚动）。
    const pane = paneOf(row)
    if (pane !== null) {
      const rowRect = row.getBoundingClientRect()
      const paneRect = pane.getBoundingClientRect()
      const top = pane.scrollTop + rowRect.top - paneRect.top - (pane.clientHeight - rowRect.height) / 2
      pane.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
    } else {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
    flashRow(row)
    return true
  } catch {
    return false
  }
}