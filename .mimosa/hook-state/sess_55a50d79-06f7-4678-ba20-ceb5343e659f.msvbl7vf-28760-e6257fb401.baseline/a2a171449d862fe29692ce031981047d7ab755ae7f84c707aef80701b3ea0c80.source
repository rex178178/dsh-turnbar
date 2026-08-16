/**
 * dsh-turnbar · Node half：
 * 1. 订阅 session/event firehose → TurnStore（内存 + sidecar 原子落盘）；
 * 2. webServer 注册同源 JSON 路由 GET /plugins/dsh-turnbar/state?sessionId=…
 *    （client 半区拉全量轮次图；live store 优先，sidecar 兜底）。
 * 全部 dsh 交互做能力探测与异常吞没——任何失败只降级，绝不向 dsh 主循环抛异常。
 * inject 声明 webServer：web profile 必有；无 webServer 的 profile 中插件保持
 * 待激活（cordis 语义）而非崩溃——正是我们要的优雅降级。
 */
import { TurnStore } from './core/turn-store'
import type { SessionEventLike } from './core/types'

export const name = 'dsh-turnbar'
export const version = '0.1.0'
export const inject: string[] = ['webServer', 'sessionPersistence']
export const Config = undefined

interface MinimalCtx {
  on(event: string, handler: (session: unknown, event: unknown) => void): unknown
  off?(event: string, handler: unknown): void
  webServer?: {
    register(route: {
      kind: 'exact'
      path: string
      handler: (req: { url?: string }, res: {
        statusCode: number
        setHeader(name: string, value: string): void
        end(body?: string): void
      }) => void | Promise<void>
    }): () => void
  }
  sessionPersistence?: {
    inspect?(id: string): Promise<{ events: unknown[] }>
    load?(id: string): Promise<{ events: unknown[] }>
  }
}

export function apply(ctx: unknown): (() => void) | undefined {
  const c = ctx as MinimalCtx | undefined
  if (typeof c?.on !== 'function') return

  const stores = new Map<string, TurnStore>()
  const storeOf = (sessionId: string): TurnStore => {
    let store = stores.get(sessionId)
    if (store === undefined) {
      store = new TurnStore({ sessionId })
      stores.set(sessionId, store)
    }
    return store
  }

  const onEvent = (session: unknown, event: unknown): void => {
    try {
      const sessionId = (session as { id?: unknown } | null)?.id
      if (typeof sessionId !== 'string' || sessionId === '') return
      if (event === null || typeof event !== 'object') return
      storeOf(sessionId).ingest(event as SessionEventLike)
    } catch (error) {
      console.error('[dsh-turnbar] ingest failed:', error)
    }
  }
  c.on('session/event', onEvent)

  // 同源数据路由：client 半区 fetch('/plugins/dsh-turnbar/state?sessionId=…')。
  let disposeRoute: (() => void) | undefined
  try {
    disposeRoute = c.webServer?.register({
      kind: 'exact',
      path: '/plugins/dsh-turnbar/state',
      handler: async (req, res) => {
        try {
          const sessionId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('sessionId') ?? ''
          // 三级供给：live store（本进程事件）→ sidecar → 持久化层整会话回填。
          let state = stores.get(sessionId)?.state ?? TurnStore.load(sessionId)
          if (state === null && sessionId !== '') {
            const inspection = await c.sessionPersistence?.inspect?.(sessionId).catch(() => undefined)
            const events = inspection?.events
            if (Array.isArray(events) && events.length > 0) {
              const backfill = new TurnStore({ sessionId, persist: false })
              for (const event of events) backfill.ingestQuiet(event as SessionEventLike)
              state = backfill.state
            }
          }
          if (state === null || sessionId === '') {
            res.statusCode = 404
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: 'session not recorded' }))
            return
          }
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ state }))
        } catch {
          try { res.statusCode = 500; res.end() } catch { /* 响应可能已发出 */ }
        }
      },
    })
  } catch (error) {
    // 路由冲突（重复注册）等场景：数据层照常工作，仅 client 拿不到全量图。
    console.error('[dsh-turnbar] state route failed:', error)
  }

  return () => {
    try { c.off?.('session/event', onEvent) } catch { /* 卸载期上下文可能已失效 */ }
    try { disposeRoute?.() } catch { /* 同上 */ }
    for (const store of stores.values()) {
      try { store.save() } catch { /* 尽力持久化 */ }
    }
    stores.clear()
  }
}
