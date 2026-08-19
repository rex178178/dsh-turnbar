/**
 * 会话状态合并（v0.3.1）：修复"重启后 live store 只收新事件、把完整 sidecar 遮蔽"的 bug。
 *
 * 背景：resume/fork 不重放 firehose（AGENTS 记录），插件进程重启后，某个会话的
 * TurnStore 从空开始只累积新事件；而 sidecar 保留了服务重启前的全部历史轮次。
 * 原 stateOf 的"live 非空即返回"会让浏览器只看到新轮（历史消失）；live 为空时
 * 更会返回空 turns → 客户端退回仅 index 的节点派生 → 全部判为幽灵轮
 * （现象：悬停卡片出现「该轮已终止，无对话内容」）。
 *
 * 合并语义：以 sidecar 为历史基底，live 覆盖同轮号并追加新轮（按 index 升序）；
 * 章节断点按 seq 去重合并；会话级字段 live 优先、缺失回落到 sidecar。
 * 纯函数、零 dsh 依赖、可单测。
 */
import type { ChapterBreak, SessionNavState, TurnRecord } from './types'

function mergeTurns(base: readonly TurnRecord[], live: readonly TurnRecord[]): TurnRecord[] {
  if (base.length === 0) return live.slice()
  if (live.length === 0) return base.slice()
  const byIndex = new Map<number, TurnRecord>()
  for (const t of base) byIndex.set(t.index, t)
  for (const t of live) byIndex.set(t.index, t) // live 覆盖同轮号（更新 endedAt/running 等）
  return [...byIndex.values()].sort((a, b) => a.index - b.index)
}

function mergeBreaks(base: readonly ChapterBreak[], live: readonly ChapterBreak[]): ChapterBreak[] {
  if (base.length === 0) return live.slice()
  if (live.length === 0) return base.slice()
  const bySeq = new Map<number, ChapterBreak>()
  for (const b of base) bySeq.set(b.seq, b)
  for (const b of live) if (!bySeq.has(b.seq)) bySeq.set(b.seq, b)
  return [...bySeq.values()].sort((a, b) => a.seq - b.seq)
}

function orUndef<T>(live: T | undefined, base: T | undefined): T | undefined {
  return live !== undefined ? live : base
}

/** 合并两个状态源；两者都无 → null（等待回填链路）。 */
export function mergeNavStates(
  base: SessionNavState | null,
  live: SessionNavState | null,
): SessionNavState | null {
  if (base === null && live === null) return null
  if (base === null || live === null) return base ?? live
  return {
    sessionId: base.sessionId,
    title: orUndef(live.title, base.title),
    createdAt: orUndef(live.createdAt, base.createdAt),
    cwd: orUndef(live.cwd, base.cwd),
    model: orUndef(live.model, base.model),
    contextWindow: orUndef(live.contextWindow, base.contextWindow),
    turns: mergeTurns(base.turns, live.turns),
    danglingUserCount: orUndef(live.danglingUserCount, base.danglingUserCount) ?? 0,
    chapterBreaks: mergeBreaks(base.chapterBreaks, live.chapterBreaks),
  }
}