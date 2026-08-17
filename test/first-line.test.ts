import { describe, expect, it } from 'vitest'
import { firstLine, goalObjective, stripMarkdownLite, userFirstLine } from '../src/core/first-line'

describe('stripMarkdownLite', () => {
  it('replaces fenced code blocks with a line count', () => {
    const text = '先看这段\n```ts\nconst a = 1\nconst b = 2\n```\n然后继续'
    expect(stripMarkdownLite(text)).toBe('先看这段 ‹code 2 行› 然后继续')
  })

  it('replaces images and unwraps links', () => {
    expect(stripMarkdownLite('看[这个文档](https://example.com)和![截图](https://x/y.png)')).toBe('看这个文档和‹image›')
  })

  it('collapses whitespace', () => {
    expect(stripMarkdownLite('a\n\n   b\t\tc')).toBe('a b c')
  })
})

describe('firstLine truncation', () => {
  it('keeps short text as-is', () => {
    expect(firstLine('短句', 10)).toBe('短句')
  })
  it('truncates to max with ellipsis', () => {
    expect(firstLine('x'.repeat(300), 160).length).toBe(160)
    expect(firstLine('x'.repeat(300), 160).endsWith('…')).toBe(true)
  })
})

describe('userFirstLine over content shapes', () => {
  it('handles plain string content', () => {
    expect(userFirstLine('直接字符串')).toBe('直接字符串')
  })
  it('joins text blocks', () => {
    expect(userFirstLine([{ type: 'text', text: '块一' }, { type: 'image' }, { type: 'text', text: '块二' }])).toBe('块一 块二')
  })
  it('returns empty string for nothing usable', () => {
    expect(userFirstLine([{ type: 'image' }])).toBe('')
    expect(userFirstLine(undefined)).toBe('')
  })
})

describe('goalObjective（v0.2.3：goal 轮回显提取用户真实输入）', () => {
  const wrap = (objective: string): unknown => [{
    type: 'text',
    text: `<goal_round>\nObjective: "${objective}"\nRound: 1/256\n\nContinue working toward the objective.\n</goal_round>`,
  }]

  it('extracts the quoted objective incl. CJK/punctuation', () => {
    expect(goalObjective(wrap('测试一下我们刚做的这个Turn Bar 的 DSH 的插件，有没有哪些问题？')))
      .toBe('测试一下我们刚做的这个Turn Bar 的 DSH 的插件，有没有哪些问题？')
    expect(goalObjective(wrap('multi\nline objective'))).toBe('multi\nline objective')
  })

  it('accepts string content too', () => {
    expect(goalObjective('<goal_round>\nObjective: "纯字符串"')).toBe('纯字符串')
  })

  it('returns empty for non-goal-round payloads (format drift → filtered as echo)', () => {
    expect(goalObjective(wrap(''))).toBe('')
    expect(goalObjective([{ type: 'text', text: 'SYNTH-USER-149060' }])).toBe('')
    expect(goalObjective('普通用户消息')).toBe('')
    expect(goalObjective(null)).toBe('')
  })
})
