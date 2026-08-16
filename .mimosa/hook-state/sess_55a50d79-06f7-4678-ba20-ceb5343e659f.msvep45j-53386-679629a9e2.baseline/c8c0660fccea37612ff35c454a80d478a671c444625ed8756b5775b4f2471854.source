import { describe, expect, it } from 'vitest'
import { apply } from '../src/index'
import { TurnStore } from '../src/core/turn-store'
import { dshHome } from '../src/core/turn-store'
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

interface RecordedRoute {
  kind: string
  path: string
  handler: (req: { url?: string }, res: MockRes) => void | Promise<void>
}
class MockRes {
  statusCode = 0
  body = ''
  headers: Record<string, string> = {}
  setHeader(name: string, value: string): void { this.headers[name] = value }
  end(body = ''): void { this.body += body }
}

function harness() {
  const routes = new Map<string, RecordedRoute>()
  const ctx = {
    on: (_e: string, h: (s: unknown, e: unknown) => void) => {
      ;(ctx as any)._h = h
      return h
    },
    off: () => {},
    _h: undefined as ((s: unknown, e: unknown) => void) | undefined,
    webServer: {
      register(route: RecordedRoute) {
        routes.set(route.path, route)
        return () => routes.delete(route.path)
      },
    },
  }
  const dispose = apply(ctx)
  const fire = (session: unknown, event: unknown): void => {
    ;(ctx as any)._h?.(session, event)
  }
  return { ctx, routes, fire, dispose: dispose ?? (() => {}) }
}

const ev = (type: string, data: unknown, seq: number) => ({ type, seq, time: seq * 1000, data })

describe('node half: firehose + state route', () => {
  it('serves live store state over the registered route', async () => {
    const h = harness()
    expect(h.routes.has('/plugins/dsh-turnbar/state')).toBe(true)

    h.fire({ id: 'session-live' }, ev('turn/start', { turn: 1 }, 1))
    h.fire({ id: 'session-live' }, ev('user/message', { content: '把登录页改成 TS' }, 2))
    h.fire({ id: 'session-live' }, ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: 'done' }] }, usage: { inputTokens: 5, outputTokens: 3 } }, 3))
    h.fire({ id: 'session-live' }, ev('turn/end', { turn: 1, reason: 'done' }, 4))

    const res = new MockRes()
    await h.routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/plugins/dsh-turnbar/state?sessionId=session-live' }, res as any)
    expect(res.statusCode).toBe(200)
    const state = JSON.parse(res.body).state
    expect(state.sessionId).toBe('session-live')
    expect(state.turns).toHaveLength(1)
    expect(state.turns[0]).toMatchObject({ index: 1, userFirstLine: '把登录页改成 TS', tokenIn: 5, tokenOut: 3 })
    h.dispose()
  })

  it('falls back to the sidecar for sessions not live in memory', async () => {
    const root = join(dshHome(), 'plugins', 'dsh-turnbar', 'sessions')
    const path = join(root, 'session-sidecar.jsonl')
    mkdirSync(root, { recursive: true })
    try {
      const store = new TurnStore({ sessionId: 'session-sidecar' })
      store.ingest(ev('turn/start', { turn: 1 }, 1))
      store.ingest(ev('turn/end', { turn: 1, reason: 'done' }, 2))
      writeFileSync(path, `${JSON.stringify({ type: 'turnbar/state', v: 1, state: store.state })}\n`, 'utf8')

      const h = harness()
      const res = new MockRes()
      await h.routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-sidecar' }, res as any)
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).state.turns).toHaveLength(1)
      h.dispose()
    } finally {
      rmSync(path, { force: true })
      expect(existsSync(path)).toBe(false)
    }
  })

  it('404s for unknown sessions and never throws', async () => {
    const h = harness()
    const res = new MockRes()
    await h.routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=nope' }, res as any)
    expect(res.statusCode).toBe(404)

    // 缺 webServer：apply 仍应正常返回销毁器（数据层照跑）。
    const dispose2 = apply({ on: () => {}, off: () => {} })
    expect(typeof dispose2).toBe('function')
    dispose2?.()
    h.dispose()
  })

  it('L2 degradation: persistence inspect throwing yields 404, not a crash', async () => {
    const routes = new Map<string, RecordedRoute>()
    const ctx = {
      on: (_e: string, h: (s: unknown, e: unknown) => void) => { (ctx as any)._h = h; return h },
      off: () => {},
      _h: undefined as ((s: unknown, e: unknown) => void) | undefined,
      webServer: {
        register(route: RecordedRoute) {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
      sessionPersistence: {
        inspect: async () => { throw new Error('storage exploded') },
      },
    }
    const dispose = apply(ctx)
    const res = new MockRes()
    // 路由内吞掉 inspect 异常 → 按 L2 降级返回 404（无回填，不崩）。
    await routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-boom' }, res as any)
    expect(res.statusCode).toBe(404)
    dispose?.()
  })

  it('search route matches full user text and assistant text (v0.2 ⌘K)', async () => {
    const h = harness()
    expect(h.routes.has('/plugins/dsh-turnbar/search')).toBe(true)
    h.fire({ id: 'session-search' }, ev('turn/start', { turn: 1 }, 1))
    h.fire({ id: 'session-search' }, ev('user/message', { content: '把登录页改成 TypeScript' }, 2))
    h.fire({ id: 'session-search' }, ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '已完成组件拆分' }] }, usage: { inputTokens: 1, outputTokens: 1 } }, 3))
    h.fire({ id: 'session-search' }, ev('turn/start', { turn: 2 }, 4))
    h.fire({ id: 'session-search' }, ev('user/message', { content: '搜索一下这个约束' }, 5))
    h.fire({ id: 'session-search' }, ev('turn/end', { turn: 2, reason: 'done' }, 6))

    const hit = new MockRes()
    await h.routes.get('/plugins/dsh-turnbar/search')!.handler(
      { url: '/plugins/dsh-turnbar/search?sessionId=session-search&q=TypeScript' }, hit as any)
    expect(hit.statusCode).toBe(200)
    const matches = JSON.parse(hit.body).matches
    expect(matches).toHaveLength(1)
    expect(matches[0].turn).toBe(1)
    expect(matches[0].userSnippet).toContain('TypeScript')

    // 助手侧文本可命中、大小写不敏感
    const hit2 = new MockRes()
    await h.routes.get('/plugins/dsh-turnbar/search')!.handler(
      { url: '/x?sessionId=session-search&q=组件拆分' }, hit2 as any)
    expect(JSON.parse(hit2.body).matches[0].turn).toBe(1)

    // 无命中 → 空数组；缺参数 → 400
    const miss = new MockRes()
    await h.routes.get('/plugins/dsh-turnbar/search')!.handler(
      { url: '/x?sessionId=session-search&q=zzz' }, miss as any)
    expect(JSON.parse(miss.body).matches).toEqual([])
    const bad = new MockRes()
    await h.routes.get('/plugins/dsh-turnbar/search')!.handler({ url: '/x?sessionId=' }, bad as any)
    expect(bad.statusCode).toBe(400)
    h.dispose()
  })
})
