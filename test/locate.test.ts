import { describe, expect, it } from 'vitest'
import { pickTurnAnchor, type FlowEntry } from '../src/client/locate'

const e = (key: string, kind: string): FlowEntry => ({ key, kind })

describe('pickTurnAnchor（权威索引锚定，v0.2.3）', () => {
  it('常规轮：首个 user 行即触发消息', () => {
    const entries = [e('u1', 'user'), e('a1', 'assistant'), e('t1', 'turn-tail')]
    expect(pickTurnAnchor(entries)).toBe(0)
  })

  it('user 行前可有 context 回显（goal/agent-instructions），仍锚 user', () => {
    const entries = [e('c1', 'context'), e('c2', 'context'), e('u1', 'user'), e('a1', 'assistant')]
    expect(pickTurnAnchor(entries)).toBe(2)
  })

  it('goal 轮（无 user 行）：锚该轮第一行（context 回显）', () => {
    const entries = [e('c1', 'context'), e('a1', 'assistant'), e('tc', 'tool-call'), e('t1', 'turn-tail')]
    expect(pickTurnAnchor(entries)).toBe(0)
  })

  it('纯工具轮：锚首个内容行', () => {
    const entries = [e('a1', 'assistant'), e('tc', 'tool-call'), e('t1', 'turn-tail')]
    expect(pickTurnAnchor(entries)).toBe(0)
  })

  it('内容行出现后的 user 行是 steering/后续输入，不抢锚（防错位高亮）', () => {
    const entries = [e('c1', 'context'), e('a1', 'assistant'), e('s1', 'user'), e('a2', 'assistant')]
    expect(pickTurnAnchor(entries)).toBe(0)
  })

  it('空表返回 -1', () => {
    expect(pickTurnAnchor([])).toBe(-1)
  })

  it('只有 user 行的运行中轮：锚 user', () => {
    const entries = [e('u1', 'user')]
    expect(pickTurnAnchor(entries)).toBe(0)
  })
})
