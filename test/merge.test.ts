import { describe, expect, it } from 'vitest'
import { mergeNavStates } from '../src/core/merge'
import type { SessionNavState, TurnRecord } from '../src/core/types'

const mk = (index: number, extra: Partial<TurnRecord> = {}): TurnRecord => ({
  id: `s#${index}`,
  index,
  role: 'user',
  userFirstLine: `u${index}`,
  assistantFirstLine: `a${index}`,
  startedAt: index * 1000,
  tokenIn: 0,
  tokenOut: 0,
  toolCallCount: 0,
  fileChanges: [],
  steeringCount: 0,
  ...extra,
})

const st = (turns: TurnRecord[], extra: Partial<SessionNavState> = {}): SessionNavState => ({
  sessionId: 's',
  turns,
  danglingUserCount: 0,
  chapterBreaks: [],
  ...extra,
})

describe('mergeNavStates (v0.3.1 重启后 live 遮蔽副车的修复)', () => {
  it('union：全量 sidecar + 新增 live 轮 → 按 index 升序合并', () => {
    const base = st([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11].map(n => mk(n)))
    const live = st([mk(19), mk(20)])
    const merged = mergeNavStates(base, live)
    expect(merged?.turns.map(t => t.index)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 19, 20])
  })

  it('同轮号 live 覆盖 sidecar（更新后的 endedAt/内容生效）', () => {
    const base = st([mk(5), mk(6)])
    const live = st([mk(5, { endedAt: 9000, assistantFirstLine: 'a5-updated' })])
    const merged = mergeNavStates(base, live)
    const five = merged?.turns.find(t => t.index === 5)
    expect(five?.endedAt).toBe(9000)
    expect(five?.assistantFirstLine).toBe('a5-updated')
    expect(merged?.turns.map(t => t.index)).toEqual([5, 6])
  })

  it('live 为空（重启后只有 session 事件）时仍返回完整 sidecar —— 幽灵轮现象根因', () => {
    const base = st([1, 2, 3].map(n => mk(n)), { contextWindow: 100_000 })
    const emptyLive = st([])
    const merged = mergeNavStates(base, emptyLive)
    expect(merged?.turns.map(t => t.index)).toEqual([1, 2, 3])
    expect(merged?.contextWindow).toBe(100_000)
  })

  it('live 缺失字段回落到 sidecar（contextWindow 等会话级）', () => {
    const base = st([mk(1)], { contextWindow: 100_000, model: 'm1' })
    const live = st([mk(2)])
    const merged = mergeNavStates(base, live)
    expect(merged?.contextWindow).toBe(100_000)
    expect(merged?.model).toBe('m1')
    expect(merged?.turns.map(t => t.index)).toEqual([1, 2])
  })

  it('章节断点按 seq 去重合并', () => {
    const base = st([mk(1)], { chapterBreaks: [{ seq: 10, turn: 1, kind: 'goal' }] })
    const live = st([mk(2)], { chapterBreaks: [{ seq: 10, turn: 1, kind: 'goal' }, { seq: 99, turn: 2, kind: 'todo' }] })
    const merged = mergeNavStates(base, live)
    expect(merged?.chapterBreaks.map(b => b.seq)).toEqual([10, 99])
  })

  it('单一来源/双空边界', () => {
    expect(mergeNavStates(null, null)).toBeNull()
    const l = st([mk(1)])
    expect(mergeNavStates(null, l)?.turns.map(t => t.index)).toEqual([1])
    const b = st([mk(2)])
    expect(mergeNavStates(b, null)?.turns.map(t => t.index)).toEqual([2])
  })
})