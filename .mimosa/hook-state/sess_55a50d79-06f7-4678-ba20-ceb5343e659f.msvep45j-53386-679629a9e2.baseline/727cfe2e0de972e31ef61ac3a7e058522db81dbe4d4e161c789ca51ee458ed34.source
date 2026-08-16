import { describe, expect, it } from 'vitest'
import { planSegments, segmentCenterPercent, type TurnLite } from '../src/client/grouping'

const mk = (n: number, user = true): TurnLite[] =>
  Array.from({ length: n }, (_, i) => ({ index: i + 1, userFirstLine: user ? `u${i}` : '' }))

describe('planSegments', () => {
  it('one segment per turn below the group threshold', () => {
    const segs = planSegments(mk(150))
    expect(segs).toHaveLength(150)
    expect(segs[0]).toMatchObject({ kind: 'turn', from: 1, to: 1, hasUser: true })
  })

  it('aggregates to at most 40 segments above the threshold', () => {
    for (const n of [151, 500, 800, 1000]) {
      const segs = planSegments(mk(n))
      expect(segs.length).toBeLessThanOrEqual(40)
      expect(segs.length).toBeGreaterThanOrEqual(20)
      // 覆盖连续且无缝：首段从 1 开始，末段到 n，相邻段衔接。
      expect(segs[0]?.from).toBe(1)
      expect(segs[segs.length - 1]?.to).toBe(n)
      for (let i = 1; i < segs.length; i++) {
        expect(segs[i]?.from).toBe(segs[i - 1]!.to + 1)
      }
      expect(segs.every(s => s.turns.length >= 2 && s.kind === 'group')).toBe(true)
    }
  })

  it('propagates hasUser and running into group specs', () => {
    const turns: TurnLite[] = mk(200).map((t, i) => (i === 150 ? { ...t, running: true, userFirstLine: '' } : t))
    turns[3] = { ...turns[3]!, userFirstLine: 'x' }
    const segs = planSegments(turns)
    expect(segs.some(s => s.running)).toBe(true)
    expect(segs.every(s => s.hasUser)).toBe(true)
  })

  it('handles empty input', () => {
    expect(planSegments([])).toEqual([])
  })
})

describe('segmentCenterPercent', () => {
  it('maps segment index to center percent within [0,100]', () => {
    expect(segmentCenterPercent(0, 22)).toBeCloseTo(100 / 22 / 2)
    expect(segmentCenterPercent(21, 22)).toBeCloseTo(100 - 100 / 22 / 2)
    expect(segmentCenterPercent(11, 22)).toBeCloseTo((11.5 / 22) * 100)
  })
  it('clamps out-of-range index and guards empty count', () => {
    expect(segmentCenterPercent(-3, 10)).toBeCloseTo(5)
    expect(segmentCenterPercent(99, 10)).toBeCloseTo(95)
    expect(segmentCenterPercent(0, 0)).toBe(0)
  })
})
