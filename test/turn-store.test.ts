import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import { TurnStore } from '../src/core/turn-store'
import type { SessionEventLike } from '../src/core/types'

const roots: string[] = []
const newRoot = (): string => {
  const root = mkdtempSync(join(tmpdir(), 'turnbar-test-'))
  roots.push(root)
  return root
}
afterEach(() => {
  for (const root of roots.splice(0)) rmSync(root, { recursive: true, force: true })
})

const ev = (type: string, data: unknown, seq: number): SessionEventLike =>
  ({ type, seq, time: seq * 1000, data })

describe('TurnStore sidecar round-trip', () => {
  it('saves on turn/end and loads back identical state', () => {
    const root = newRoot()
    const store = new TurnStore({ sessionId: 'session-abc', root })
    store.ingest(ev('turn/start', { turn: 1 }, 1))
    store.ingest(ev('user/message', { content: '改一下登录页' }, 2))
    store.ingest(ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '已完成' }] }, usage: { inputTokens: 100, outputTokens: 50 } }, 3))
    store.ingest(ev('tool/call', { turn: 1, step: 1, callId: 'c1', name: 'str_replace_editor', arguments: '{"command":"create","path":"/src/login.tsx"}' }, 4))
    store.ingest(ev('turn/end', { turn: 1, reason: 'done' }, 5))

    const loaded = TurnStore.load('session-abc', root)
    expect(loaded).not.toBeNull()
    expect(loaded?.turns.length).toBe(1)
    expect(loaded?.turns[0]).toEqual(store.state.turns[0])
    expect(loaded?.turns[0]?.fileChanges).toEqual(['/src/login.tsx'])
  })

  it('does not count read-only file tool commands as changes', () => {
    const root = newRoot()
    const store = new TurnStore({ sessionId: 'session-ro', root })
    store.ingest(ev('turn/start', { turn: 1 }, 1))
    store.ingest(ev('tool/call', { turn: 1, step: 1, callId: 'c1', name: 'str_replace_editor', arguments: '{"command":"view","path":"/src/a.ts"}' }, 2))
    store.ingest(ev('turn/end', { turn: 1, reason: 'done' }, 3))
    expect(store.state.turns[0]?.toolCallCount).toBe(1)
    expect(store.state.turns[0]?.fileChanges).toEqual([])
  })

  it('skips persistence when disabled', () => {
    const root = newRoot()
    const store = new TurnStore({ sessionId: 'session-np', root, persist: false })
    store.ingest(ev('turn/start', { turn: 1 }, 1))
    store.ingest(ev('turn/end', { turn: 1, reason: 'done' }, 2))
    expect(TurnStore.load('session-np', root)).toBeNull()
  })

  it('returns null for missing or corrupt sidecar', () => {
    const root = newRoot()
    expect(TurnStore.load('session-missing', root)).toBeNull()
  })

  it('v0.3.1: save() merges with prior sidecar (重启后新 fold 不冲掉历史)', () => {
    const root = newRoot()
    const store = new TurnStore({ sessionId: 'session-merge', root })
    store.ingest(ev('turn/start', { turn: 1 }, 1))
    store.ingest(ev('user/message', { content: '历史问题', source: { kind: 'user' } }, 2))
    store.ingest(ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '历史回复' }] } }, 3))
    store.ingest(ev('turn/end', { turn: 1, reason: 'done' }, 4))
    // 模拟重启：新 store 同 root、只收到新事件（turn 19 起）→ 保存不得冲掉 turn 1
    const restarted = new TurnStore({ sessionId: 'session-merge', root })
    restarted.ingest(ev('turn/start', { turn: 19 }, 5))
    restarted.ingest(ev('user/message', { content: '新问题', source: { kind: 'user' } }, 6))
    restarted.ingest(ev('turn/end', { turn: 19, reason: 'done' }, 7))
    const loaded = TurnStore.load('session-merge', root)
    expect(loaded?.turns.map(t => t.index)).toEqual([1, 19])
    expect(loaded?.turns[0]?.userFirstLine).toBe('历史问题')
    expect(loaded?.turns[1]?.userFirstLine).toBe('新问题')
  })
})
