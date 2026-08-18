import { describe, expect, it } from 'vitest'
import { CONTEXT_CRIT, CONTEXT_WARN, formatContextLine, latestOccupancy, occupancyOf } from '../src/client/context'

describe('occupancyOf', () => {
  it('derives used/window and clamps to 0..1', () => {
    expect(occupancyOf(62_000, 100_000)).toBeCloseTo(0.62)
    expect(occupancyOf(999_999, 100_000)).toBe(1)
  })
  it('returns null when either side is missing or non-positive', () => {
    expect(occupancyOf(0, 100_000)).toBeNull()
    expect(occupancyOf(-5, 100_000)).toBeNull()
    expect(occupancyOf(undefined, 100_000)).toBeNull()
    expect(occupancyOf(62_000, undefined)).toBeNull()
    expect(occupancyOf(62_000, 0)).toBeNull()
  })
})

describe('formatContextLine', () => {
  it('formats percent and remaining tokens', () => {
    expect(formatContextLine(0.62, 100_000)).toEqual({ text: '上下文 62% · 余 38k', level: 'normal' })
    expect(formatContextLine(0.995, 100_000)?.text).toBe('上下文 100% · 余 500') // 余量用实数 compact
  })
  it('warns at 80% and goes critical at 95% thresholds (v0.3)', () => {
    expect(formatContextLine(CONTEXT_WARN, 100_000)?.level).toBe('warn')
    expect(formatContextLine(CONTEXT_CRIT, 100_000)?.level).toBe('crit')
    expect(formatContextLine(0.99, 100_000)?.text).toBe('上下文 99% · 余 1k')
  })
  it('hides when occupancy is not derivable', () => {
    expect(formatContextLine(null, 100_000)).toBeNull()
    expect(formatContextLine(0.62, undefined)).not.toBeNull() // 无窗口：只显示百分比
    expect(formatContextLine(0.62, undefined)?.text).toBe('上下文 62%')
  })
})

describe('latestOccupancy', () => {
  it('takes the last turn carrying contextUsed', () => {
    const turns = [
      { contextUsed: 20_000 },
      {},
      { contextUsed: 82_000 },
    ]
    expect(latestOccupancy(turns, 100_000)).toBeCloseTo(0.82)
  })
  it('returns null when no turn has context data', () => {
    expect(latestOccupancy([{}, {}], 100_000)).toBeNull()
    expect(latestOccupancy([{ contextUsed: 20_000 }], undefined)).toBeNull()
  })
})