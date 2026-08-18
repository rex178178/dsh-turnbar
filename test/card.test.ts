import { describe, expect, it } from 'vitest'
import { buildCardModel, buildGroupCardModel, formatRelativeTime, formatTokens } from '../src/client/card'

const NOW = Date.UTC(2026, 7, 16, 12, 0, 0) // 2026-08-16 12:00 UTC

describe('formatRelativeTime', () => {
  it('buckets by minute/hour/day then falls back to date', () => {
    expect(formatRelativeTime(undefined, NOW)).toBe('')
    expect(formatRelativeTime(NOW - 10_000, NOW)).toBe('刚刚')
    expect(formatRelativeTime(NOW - 5 * 60_000, NOW)).toBe('5 分钟前')
    expect(formatRelativeTime(NOW - 3 * 3_600_000, NOW)).toBe('3 小时前')
    expect(formatRelativeTime(NOW - 26 * 3_600_000, NOW)).toMatch(/^\d{2}-\d{2} \d{2}:\d{2}$/)
  })
  it('never shows the future', () => {
    expect(formatRelativeTime(NOW + 60_000, NOW)).toBe('刚刚')
  })
})

describe('formatTokens', () => {
  it('hides when absent and compacts otherwise', () => {
    expect(formatTokens({ index: 1 })).toBe('')
    expect(formatTokens({ index: 1, tokenIn: 900, tokenOut: 99 })).toBe('~999 tok')
    expect(formatTokens({ index: 1, tokenIn: 900, tokenOut: 200 })).toBe('~1.1k tok')
    expect(formatTokens({ index: 1, tokenIn: 2_400_000, tokenOut: 0 })).toBe('~2.4M tok')
  })
})

describe('buildCardModel', () => {
  it('assembles head/user/assistant/meta with only present parts', () => {
    const model = buildCardModel({
      index: 42,
      userFirstLine: '把登录页改成 TypeScript',
      assistantFirstLine: '已完成组件拆分',
      startedAt: NOW - 7_200_000,
      tokenIn: 3_500, tokenOut: 700,
      toolCallCount: 12,
      fileChanges: ['/a.ts', '/b.ts', '/c.ts'],
      steeringCount: 1,
    }, NOW)
    expect(model.head).toBe('#42 · 2 小时前')
    expect(model.user).toBe('把登录页改成 TypeScript')
    expect(model.assistant).toBe('已完成组件拆分')
    expect(model.meta).toBe('🔧 12 · 📄 3 · ~4.2k tok · +1 补充')
  })
  it('degenerate turn yields minimal card', () => {
    const model = buildCardModel({ index: 1 }, NOW)
    expect(model.head).toBe('#1')
    expect(model.user).toBe('')
    expect(model.meta).toBe('')
  })
  it('marks running turns', () => {
    expect(buildCardModel({ index: 3, running: true }, NOW).head).toBe('#3 · 运行中')
  })
})

describe('buildGroupCardModel', () => {
  it('lists up to three user lines with range header', () => {
    const model = buildGroupCardModel([
      { index: 180, userFirstLine: '修一下构建' },
      { index: 181, userFirstLine: '' },
      { index: 182, userFirstLine: '再来一条' },
      { index: 183, userFirstLine: '第三条会出现' },
      { index: 184, userFirstLine: '第五条不该出现' },
    ])
    expect(model.head).toBe('#180–#184 · 5 轮')
    expect(model.user).toBe('1. 修一下构建\n2. 再来一条\n3. 第三条会出现')
  })
})

describe('context fuel line (v0.3)', () => {
  it('renders occupancy when both contextUsed and window are present', () => {
    const model = buildCardModel({ index: 1, contextUsed: 62_000 }, { contextWindow: 100_000 })
    expect(model.context).toEqual({ text: '上下文 62% · 余 38k', level: 'normal' })
  })
  it('hides when context window is unknown (L1 degrade)', () => {
    expect(buildCardModel({ index: 1, contextUsed: 62_000 }).context).toBeUndefined()
    expect(buildCardModel({ index: 1 }).context).toBeUndefined()
  })
  it('escalates warn and crit levels at thresholds', () => {
    expect(buildCardModel({ index: 1, contextUsed: 80_000 }, { contextWindow: 100_000 }).context?.level).toBe('warn')
    expect(buildCardModel({ index: 1, contextUsed: 95_000 }, { contextWindow: 100_000 }).context?.level).toBe('crit')
  })
  it('group card takes the last turn occupancy', () => {
    const model = buildGroupCardModel(
      [{ index: 1 }, { index: 2, contextUsed: 82_000 }],
      { contextWindow: 100_000 },
    )
    expect(model.context?.text).toBe('上下文 82% · 余 18k')
  })
})

describe('history-compatible opts signature (v0.3)', () => {
  it('still accepts a naked timestamp as second arg for head time', () => {
    const model = buildCardModel({ index: 9, startedAt: NOW - 7_200_000 }, NOW)
    expect(model.head).toBe('#9 · 2 小时前')
    expect(model.context).toBeUndefined()
  })
})
