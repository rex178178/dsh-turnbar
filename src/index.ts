/**
 * dsh-turnbar · Node half：订阅 session/event firehose，把轮次记录喂进 TurnStore sidecar。
 * UI 在 client half（src/client/index.ts）。全部 dsh 交互做能力探测与异常吞没——
 * 任何失败只降级（L2：无回填；L4：无导航），绝不向 dsh 主循环抛异常。
 */
import { TurnStore } from './core/turn-store'
import type { SessionEventLike } from './core/types'

export const name = 'dsh-turnbar'
export const version = '0.1.0'
export const inject: string[] = []
export const Config = undefined

export function apply(ctx: unknown): (() => void) | undefined {
  const c = ctx as { on?: (event: string, handler: (session: unknown, event: unknown) => void) => unknown; off?: (event: string, handler: unknown) => void } | undefined
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

  return () => {
    try { c.off?.('session/event', onEvent) } catch { /* 卸载期上下文可能已失效 */ }
    for (const store of stores.values()) {
      try { store.save() } catch { /* 尽力持久化 */ }
    }
    stores.clear()
  }
}
