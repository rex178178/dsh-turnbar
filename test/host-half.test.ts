import { describe, expect, it } from 'vitest'
import { apply } from '../src/index'
import { TurnStore } from '../src/core/turn-store'
import { dshHome } from '../src/core/turn-store'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
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

  it('recovers via readRaw when inspect rejects a torn/corrupt log (rc.7 strict validation)', async () => {
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
        inspect: async () => { throw new Error('corrupt Zstandard session log: complete frame contains a torn JSONL record') },
        readRaw: async () => ({
          content: [
            JSON.stringify(ev('turn/start', { turn: 1 }, 1)),
            JSON.stringify(ev('user/message', { content: '继续' }, 2)),
            JSON.stringify(ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '好' }] } }, 3)),
            JSON.stringify(ev('turn/end', { turn: 1, reason: 'aborted' }, 4)),
            '{"type":"user/message","seq":5,"time":5000,"data":{"content":[{"type":"text","text":"半截记', // torn line → skipped
          ].join('\n'),
        }),
      },
    }
    const dispose = apply(ctx)
    const res = new MockRes()
    await routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-torn' }, res as any)
    expect(res.statusCode).toBe(200)
    const state = JSON.parse(res.body).state
    expect(state.turns).toHaveLength(1)
    expect(state.turns[0]).toMatchObject({ index: 1, userFirstLine: '继续', endReason: 'aborted' })
    dispose?.()
  })

  it('readRaw with no recoverable lines still degrades to 404', async () => {
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
        inspect: async () => ({ events: [] }),
        readRaw: async () => ({ content: '}torn garbage only{' }),
      },
    }
    const dispose = apply(ctx)
    const res = new MockRes()
    await routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-garbage' }, res as any)
    expect(res.statusCode).toBe(404)
    dispose?.()
  })

  it('integrity-first: no sidecar + partial live → serves full persistence history (v0.3.1)', async () => {
    // 用临时 DSH_HOME 隔离，避免污染真实 sidecar 目录
    const home = mkdtempSync(join(tmpdir(), 'tb-dsh-integrity-'))
    const prev = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      const routes = new Map<string, RecordedRoute>()
      const ctx: any = {
        on: (_e: string, h: unknown) => { ctx._h = h; return h },
        off: () => {},
        webServer: {
          register(route: RecordedRoute) {
            routes.set(route.path, route)
            return () => routes.delete(route.path)
          },
        },
        // 持久化 = dsh 会话日志，含至当前的全部事件（含"重启后新轮"）
        sessionPersistence: {
          inspect: async () => ({
            events: [
              ev('turn/start', { turn: 1 }, 1),
              ev('user/message', { content: '历史第一问', source: { kind: 'user' } }, 2),
              ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '历史回复' }] }, usage: { inputTokens: 1, outputTokens: 1 } }, 3),
              ev('turn/end', { turn: 1, reason: 'done' }, 4),
              ev('turn/start', { turn: 2 }, 5),
              ev('user/message', { content: '历史第二问', source: { kind: 'user' } }, 6),
              ev('turn/end', { turn: 2, reason: 'done' }, 7),
              ev('turn/start', { turn: 19 }, 1000),
              ev('user/message', { content: '新问题', source: { kind: 'user' } }, 1001),
              ev('turn/end', { turn: 19, reason: 'done' }, 1002),
            ],
          }),
        },
      }
      const dispose = apply(ctx)
      // 模拟重启窗口：live 先收到"进行中的新轮 19"（只 start+user，未 end → 不触发 save，
      // 无 sidecar）——正是"sidecar 缺失 + live 半截"的时刻。
      ctx._h({ id: 'session-integrity' }, ev('turn/start', { turn: 19 }, 1000))
      ctx._h({ id: 'session-integrity' }, ev('user/message', { content: '新问题', source: { kind: 'user' } }, 1001))
      const res = new MockRes()
      await routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-integrity' }, res as any)
      expect(res.statusCode).toBe(200)
      const state = JSON.parse(res.body).state
      // 完整性优先：半截 live 不得冒充完整——返回持久化的完整历史 1..2 + 进行中的 19
      expect(state.turns.map((t: { index: number }) => t.index)).toEqual([1, 2, 19])
      expect(state.turns[0].userFirstLine).toBe('历史第一问')
      expect(state.turns[2].userFirstLine).toBe('新问题')
      dispose?.()
    } finally {
      if (prev === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prev
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('v0.3.1: inspect half-read that folds to 0 turns falls back to readRaw', async () => {
    const home = mkdtempSync(join(tmpdir(), 'tb-dsh-halfread-'))
    const prev = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      const routes = new Map<string, RecordedRoute>()
      const ctx: any = {
        on: (_e: string, h: unknown) => { ctx._h = h; return h },
        off: () => {},
        webServer: {
          register(route: RecordedRoute) {
            routes.set(route.path, route)
            return () => routes.delete(route.path)
          },
        },
        sessionPersistence: {
          // 模拟大/仍在写入日志的半读：inspect 只给出无轮次的杂项事件
          inspect: async () => ({ events: [ev('session', {}, 1), ev('chunk', { part: 1 }, 2)] }),
          readRaw: async () => ({
            content: [
              JSON.stringify(ev('turn/start', { turn: 3 }, 10)),
              JSON.stringify(ev('user/message', { content: '裸读兜底的内容', source: { kind: 'user' } }, 11)),
              JSON.stringify(ev('turn/end', { turn: 3, reason: 'done' }, 12)),
            ].join('\n'),
          }),
        },
      }
      const dispose = apply(ctx)
      const res = new MockRes()
      await routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-halfread' }, res as any)
      expect(res.statusCode).toBe(200)
      const state = JSON.parse(res.body).state
      expect(state.turns.map((t: { index: number }) => t.index)).toEqual([3])
      expect(state.turns[0].userFirstLine).toBe('裸读兜底的内容')
      dispose?.()
    } finally {
      if (prev === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prev
      rmSync(home, { recursive: true, force: true })
    }
  })

  // ---- v0.3.2：dsh 0.1.5+ 句柄制新链（open→read→close）----

  const handleCtx = (persistence: Record<string, unknown>) => {
    const routes = new Map<string, RecordedRoute>()
    const ctx: any = {
      on: (_e: string, h: unknown) => { ctx._h = h; return h },
      off: () => {},
      webServer: {
        register(route: RecordedRoute) {
          routes.set(route.path, route)
          return () => routes.delete(route.path)
        },
      },
      sessionPersistence: persistence,
    }
    return { routes, ctx }
  }

  const handleEvents = (): unknown[] => [
    ev('turn/start', { turn: 1 }, 1),
    ev('user/message', { content: '句柄链回填的历史问题', source: { kind: 'user' } }, 2),
    ev('assistant/message', { turn: 1, step: 1, message: { role: 'assistant', content: [{ type: 'text', text: '历史回复' }] }, usage: { inputTokens: 1, outputTokens: 1 } }, 3),
    ev('turn/end', { turn: 1, reason: 'done' }, 4),
  ]

  it('v0.3.2: handle chain open→read(0) backfills history and always closes the handle', async () => {
    const home = mkdtempSync(join(tmpdir(), 'tb-dsh-handle-'))
    const prev = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      let closed = 0
      let openedAccess = ''
      const { routes, ctx } = handleCtx({
        open: async (id: string, access: string) => {
          expect(id).toBe('session-handle')
          openedAccess = access
          return {
            read: async () => ({ events: handleEvents() }),
            close: async () => { closed++ },
          }
        },
      })
      const dispose = apply(ctx)
      const res = new MockRes()
      await routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-handle' }, res as any)
      expect(res.statusCode).toBe(200)
      expect(openedAccess).toBe('read')
      const state = JSON.parse(res.body).state
      expect(state.turns).toHaveLength(1)
      expect(state.turns[0]).toMatchObject({ index: 1, userFirstLine: '句柄链回填的历史问题' })
      expect(closed).toBe(1)
      dispose?.()
    } finally {
      if (prev === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prev
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('v0.3.2: open NotFound falls through to the legacy inspect chain', async () => {
    const home = mkdtempSync(join(tmpdir(), 'tb-dsh-notfound-'))
    const prev = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      const { routes, ctx } = handleCtx({
        open: async () => { throw new Error('SessionPersistenceNotFoundError') },
        inspect: async () => ({ events: handleEvents() }),
      })
      const dispose = apply(ctx)
      const res = new MockRes()
      await routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-notfound' }, res as any)
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).state.turns[0].userFirstLine).toBe('句柄链回填的历史问题')
      dispose?.()
    } finally {
      if (prev === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prev
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('v0.3.2: read Corruption → 404, handle closed, and NOT seeded (next request retries)', async () => {
    let closed = 0
    let readAttempts = 0
    const { routes, ctx } = handleCtx({
      open: async () => ({
        read: async () => {
          readAttempts++
          throw new Error('SessionPersistenceCorruptionError')
        },
        close: async () => { closed++ },
      }),
    })
    const dispose = apply(ctx)
    for (let i = 0; i < 2; i++) {
      const res = new MockRes()
      await routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-corrupt' }, res as any)
      expect(res.statusCode).toBe(404)
    }
    expect(readAttempts).toBe(2)
    expect(closed).toBe(2)
    dispose?.()
  })

  it('v0.3.2: handle read whose events fold to 0 turns is discarded (half-read defense) → 404', async () => {
    let closed = 0
    const { routes, ctx } = handleCtx({
      open: async () => ({
        read: async () => ({ events: [ev('session', {}, 1), ev('chunk', { part: 1 }, 2)] }),
        close: async () => { closed++ },
      }),
    })
    const dispose = apply(ctx)
    const res = new MockRes()
    await routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-halfhandle' }, res as any)
    expect(res.statusCode).toBe(404)
    expect(closed).toBe(1)
    dispose?.()
  })

  it('v0.3.2: close() throwing never affects the backfill result', async () => {
    const home = mkdtempSync(join(tmpdir(), 'tb-dsh-close-'))
    const prev = process.env.DSH_HOME
    process.env.DSH_HOME = home
    try {
      const { routes, ctx } = handleCtx({
        open: async () => ({
          read: async () => ({ events: handleEvents() }),
          close: async () => { throw new Error('close exploded') },
        }),
      })
      const dispose = apply(ctx)
      const res = new MockRes()
      await routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-closethrow' }, res as any)
      expect(res.statusCode).toBe(200)
      expect(JSON.parse(res.body).state.turns).toHaveLength(1)
      dispose?.()
    } finally {
      if (prev === undefined) delete process.env.DSH_HOME
      else process.env.DSH_HOME = prev
      rmSync(home, { recursive: true, force: true })
    }
  })

  it('v0.3.2: handle read returning an empty array falls silently to the (absent) old chain → 404', async () => {
    let closed = 0
    const { routes, ctx } = handleCtx({
      open: async () => ({
        read: async () => ({ events: [] }),
        close: async () => { closed++ },
      }),
    })
    const dispose = apply(ctx)
    const res = new MockRes()
    await routes.get('/plugins/dsh-turnbar/state')!.handler({ url: '/x?sessionId=session-emptyhandle' }, res as any)
    expect(res.statusCode).toBe(404)
    expect(closed).toBe(1)
    dispose?.()
  })
})
