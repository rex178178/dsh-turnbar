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

  it('accounts for every real user message (source.kind=user, trigger + steering + dangling)', () => {
    // 与 fold 同口径：缺失 source 视为用户消息；plugin/skill-catalog/agent-instructions/goal 均为系统回显。
    const realUsers = fixture.events.filter(e =>
      e.type === 'user/message' && ((e.data as any)?.source?.kind ?? 'user') === 'user',
    ).length
    const attached = state.turns.reduce(
      (n, turn) => n + (turn.userFirstLine !== '' ? 1 : 0) + turn.steeringCount,
      0,
    )
    expect(attached + state.danglingUserCount).toBe(realUsers)
  })

  it('ignores system-echo user messages (plugin/skill-catalog/agent-instructions)', () => {
    const ev = (type: string, data: unknown, seq = 0): SessionEventLike =>
      ({ type, seq, time: seq * 1000, data })
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      ev('user/message', { content: '真实问题', source: { kind: 'user' } }, 2),
      ev('user/message', { content: 'The approval policy changed', source: { kind: 'plugin' } }, 3),
      ev('user/message', { content: 'skill 目录注入', source: { kind: 'skill-catalog' } }, 4),
      ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '回复' }] } }, 5),
      ev('turn/end', { turn: 1, reason: 'done' }, 6),
    ])
    expect(state.turns[0]?.userFirstLine).toBe('真实问题')
    expect(state.turns[0]?.steeringCount).toBe(0)
    expect(state.turns[0]?.searchUser).toBe('真实问题')
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

  it('captures full search text (v0.2) beyond the preview first line', () => {
    const ev = (type: string, data: unknown, seq = 0): SessionEventLike =>
      ({ type, seq, time: seq * 1000, data })
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      ev('user/message', { content: '第一句。\n第二句是关键的约束条件。' }, 2),
      ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '回复正文。\n还有更多内容。' }] } }, 3),
      ev('turn/end', { turn: 1, reason: 'done' }, 4),
    ])
    const turn = state.turns[0]
    expect(turn?.userFirstLine).toBe('第一句。 第二句是关键的约束条件。'.slice(0, 160))
    expect(turn?.searchUser).toContain('第二句是关键的约束条件')
    expect(turn?.searchAssistant).toContain('还有更多内容')
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

  it('records end reason from object-form turn/end reason (dsh 现行格式)', () => {
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      ev('user/message', { content: '问题', source: { kind: 'user' } }, 2),
      ev('turn/end', { turn: 1, reason: { kind: 'aborted', reason: { kind: 'user' } } }, 3),
    ])
    expect(state.turns[0]?.endReason).toBe('aborted')
  })

  it('keeps string-form end reason for backward compatibility', () => {
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      ev('user/message', { content: '问题', source: { kind: 'user' } }, 2),
      ev('turn/end', { turn: 1, reason: 'done' }, 3),
    ])
    expect(state.turns[0]?.endReason).toBe('done')
  })
})

describe('SessionFold goal-round attribution（v0.2.3）', () => {
  const ev = (type: string, data: unknown, seq = 0): SessionEventLike =>
    ({ type, seq, time: seq * 1000, data })
  const goalRound = (objective: string, seq: number): SessionEventLike =>
    ev('user/message', {
      content: [{ type: 'text', text: `<goal_round>\nObjective: "${objective}"\nRound: 1/256\n</goal_round>` }],
      source: { kind: 'goal', goalId: 'g-1', revision: 1, round: 1 },
    }, seq)

  it('goal round becomes the trigger first line of its turn (用户 /goal 输入)', () => {
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      goalRound('做完整的用户测试，然后把你找到的问题都记下来', 2),
      ev('user/message', { content: 'The approval policy changed', source: { kind: 'plugin' } }, 3),
      ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '开始' }] } }, 4),
      ev('turn/end', { turn: 1, reason: 'aborted' }, 5),
    ])
    expect(state.turns[0]?.userFirstLine).toBe('做完整的用户测试，然后把你找到的问题都记下来')
    expect(state.turns[0]?.searchUser).toContain('用户测试')
    expect(state.turns[0]?.steeringCount).toBe(0)
  })

  it('a second goal round in the same turn counts as steering', () => {
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      goalRound('目标 A', 2),
      goalRound('目标 A', 3),
      ev('turn/end', { turn: 1, reason: 'completed' }, 4),
    ])
    expect(state.turns[0]?.userFirstLine).toBe('目标 A')
    expect(state.turns[0]?.steeringCount).toBe(1)
  })

  it('goal echo without extractable objective stays filtered (format drift 兜底)', () => {
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      ev('user/message', { content: [{ type: 'text', text: 'SYNTH-USER-149060' }], source: { kind: 'goal' } }, 2),
      ev('turn/end', { turn: 1, reason: 'completed' }, 3),
    ])
    expect(state.turns[0]?.userFirstLine).toBe('')
    expect(state.turns[0]?.steeringCount).toBe(0)
  })

  it('queued goal round is claimed by the next turn like a queued user input', () => {
    const state = foldSessionEvents([
      goalRound('先排队的目标', 1),
      ev('turn/start', { turn: 1 }, 2),
      ev('turn/end', { turn: 1, reason: 'completed' }, 3),
    ])
    expect(state.turns[0]?.userFirstLine).toBe('先排队的目标')
    expect(state.danglingUserCount).toBe(0)
  })

  it('records contextUsed as the last request input tokens of the turn (v0.3)', () => {
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      ev('user/message', { content: '算一下', source: { kind: 'user' } }, 2),
      ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '第一步' }] }, usage: { inputTokens: 10_000, outputTokens: 500 } }, 3),
      ev('assistant/message', { turn: 1, step: 2, message: { role: 'assistant', content: [{ type: 'text', text: '第二步' }] }, usage: { inputTokens: 22_000, outputTokens: 300 } }, 4),
      ev('turn/end', { turn: 1, reason: 'done' }, 5),
    ])
    // 后写覆盖取末值；tokenIn 仍是累计。
    expect(state.turns[0]?.contextUsed).toBe(22_000)
    expect(state.turns[0]?.tokenIn).toBe(32_000)
  })

  it('keeps contextUsed undefined when no usage is present (v0.3)', () => {
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      ev('user/message', { content: '没有 usage 的会话', source: { kind: 'user' } }, 2),
      ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '回' }] } }, 3),
      ev('turn/end', { turn: 1, reason: 'done' }, 4),
    ])
    expect(state.turns[0]?.contextUsed).toBeUndefined()
  })

  it('extracts goal chapter label defensively and keeps todo breaks without label (v0.3)', () => {
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      ev('goal/change', { objective: '让插件更耐用' }, 2),
      ev('todo/write', { items: [] }, 3),
      ev('turn/end', { turn: 1, reason: 'done' }, 4),
    ])
    const goal = state.chapterBreaks.find(b => b.kind === 'goal')
    const todo = state.chapterBreaks.find(b => b.kind === 'todo')
    expect(goal).toMatchObject({ turn: 1, kind: 'goal', label: '让插件更耐用' })
    expect(todo?.kind).toBe('todo')
    expect(todo?.label).toBeUndefined()
  })

  it('goal/change without extractable text leaves label undefined (v0.3)', () => {
    const state = foldSessionEvents([
      ev('turn/start', { turn: 1 }, 1),
      ev('goal/change', { id: 'none-text-field' }, 2),
    ])
    expect(state.chapterBreaks[0]?.label).toBeUndefined()
  })
})
