import { describe, expect, it } from 'vitest'
import { firstLine, stripMarkdownLite, userFirstLine } from '../src/core/first-line'

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
