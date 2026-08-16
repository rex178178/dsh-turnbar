import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { foldSessionEvents } from '../src/core/fold'
import type { SessionEventLike } from '../src/core/types'

interface Fixture {
  source: string
  stats: {
    turns: number
    userMessages: number
    assistantMessages: number
    toolCalls: number
    fileToolCalls: number
    goal: number
    todo: number
    other: Record<string, number>
  }
  events: SessionEventLike[]
}

const fixture = JSON.parse(
  readFileSync(new URL('./fixtures/long-session.json', import.meta.url), 'utf8'),
) as Fixture

describe('SessionFold on sanitized real session', () => {
  const state = foldSessionEvents(fixture.events, 'fixture-session')

  it('produces one turn per turn/start', () => {
    expect(state.turns.length).toBe(fixture.stats.turns)
    const indexes = state.turns.map(turn => turn.index)
    expect([...indexes].sort((a, b) => a - b)).toEqual(indexes)
  })

  it('accounts for every tool call', () => {
    const toolTotal = state.turns.reduce((n, turn) => n + turn.toolCallCount, 0)
    expect(toolTotal).toBe(fixture.stats.toolCalls)
  })

  it('accounts for every user message (trigger + steering + dangling)', () => {
    const attached = state.turns.reduce(
      (n, turn) => n + (turn.userFirstLine !== '' ? 1 : 0) + turn.steeringCount,
      0,
    )
    expect(attached + state.danglingUserCount).toBe(fixture.stats.userMessages)
  })

  it('captures token usage and file changes from tool calls', () => {
    expect(state.turns.some(turn => turn.tokenIn > 0)).toBe(true)
    expect(state.turns.some(turn => turn.tokenOut > 0)).toBe(true)
    // 该真实会话未使用 str_replace_editor（fileToolCalls=0），文件改动路径聚合在
    // turn-store.test 的合成用例中验证；此处验证计数守恒与路径来源约束。
    const fileTotal = state.turns.reduce((n, turn) => n + turn.fileChanges.length, 0)
    expect(fileTotal).toBe(fixture.stats.fileToolCalls)
    expect(state.turns.every(turn => turn.fileChanges.every(f => f.startsWith('/synth/')))).toBe(true)
  })

  it('records chapter break signals', () => {
    expect(state.chapterBreaks.length).toBe(fixture.stats.goal + fixture.stats.todo)
  })
})

describe('SessionFold user-message attribution (synthetic)', () => {
  const ev = (type: string, data: unknown, seq = 0): SessionEventLike =>
    ({ type, seq, time: seq * 1000, data })

  it('queued input becomes the trigger of the next turn', () => {
    const state = foldSessionEvents([
      ev('user/message', { content: '第一个要求' }, 1),
      ev('turn/start', { turn: 1 }, 2),
      ev('turn/end', { turn: 1, reason: 'done' }, 3),
    ])
    expect(state.turns.length).toBe(1)
    expect(state.turns[0]?.userFirstLine).toBe('第一个要求')
    expect(state.danglingUserCount).toBe(0)
  })

  it('mid-turn input counts as steering, post-turn input dangles', () => {
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      ev('user/message', { content: '触发消息' }, 2),
      ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '回复' }] }, usage: { inputTokens: 10, outputTokens: 5 } }, 3),
      ev('user/message', { content: '追加补充' }, 4),
      ev('turn/end', { turn: 1, reason: 'done' }, 5),
      ev('user/message', { content: '排队中的下一条' }, 6),
    ])
    expect(state.turns[0]?.userFirstLine).toBe('触发消息')
    expect(state.turns[0]?.steeringCount).toBe(1)
    expect(state.turns[0]?.tokenIn).toBe(10)
    expect(state.turns[0]?.tokenOut).toBe(5)
    expect(state.danglingUserCount).toBe(1)
  })

  it('ignores chunk rows and unknown events', () => {
    const state = foldSessionEvents([
      ev('text-chunks', { turn: 1, step: 1, texts: ['x'.repeat(10000)] }, 1),
      ev('reasoning-chunks', { turn: 1, step: 1, texts: [] }, 2),
      ev('command/run', { name: 'permission' }, 3),
      ev('turn/start', { turn: 1 }, 4),
      ev('turn/end', { turn: 1, reason: 'done' }, 5),
    ])
    expect(state.turns.length).toBe(1)
    expect(state.turns[0]?.toolCallCount).toBe(0)
    expect(state.turns[0]?.assistantFirstLine).toBe('')
  })
})
