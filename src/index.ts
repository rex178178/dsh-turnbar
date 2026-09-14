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
import { mergeNavStates } from './core/merge'
import type { SessionEventLike, SessionNavState } from './core/types'

export const name = 'dsh-turnbar'
export const version = '0.3.2'
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
    /** rc.7：裸读日志文本（{meta, filename, content}），不做逐行校验。 */
    readRaw?(id: string): Promise<{ content?: unknown } | undefined>
    /** 0.1.5+：句柄制（先登记借阅证再翻阅）。read 缺省 length = 读到日志末尾（一次全量）；
     *  close 幂等，成功/失败路径都必须还证；NotFound/Corruption/Unsupported 抛错。 */
    open?(id: string, access: 'read' | 'write'): Promise<{
      read(offset?: number, length?: number): Promise<{ events?: unknown } | undefined>
      close(): Promise<void>
    }>
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

  // 三级供给：live store（本进程事件）→ sidecar → 持久化层整会话回填（缓存复用）。
  // 回填两段：inspect（结构校验，rc.7 对半截记录/seq 缺口的日志会抛错——
  // 真机「继续」会话曾整条 404）→ readRaw 裸读（跳过校验，逐行解析时丢弃坏行，
  // 恢复完整已提交前缀）。
  const backfillFrom = (sessionId: string, events: unknown[]): SessionNavState | null => {
    if (!Array.isArray(events) || events.length === 0) return null
    const backfill = new TurnStore({ sessionId, persist: false })
    for (const event of events) backfill.ingestQuiet(event as SessionEventLike)
    stores.set(sessionId, backfill) // 缓存：state 与 search 共享一次回填
    return backfill.state
  }
  // 半读防御探活：纯折叠出轮次才算完整事件集（大/仍在写入的日志可能只给出折 0 轮的
  // 半读，弃用——不缓存半读当完整）。新链（0.1.5+）与旧链（inspect）共用同一判定。
  const probeTurnCount = (sessionId: string, events: unknown[]): number => {
    const probe = new TurnStore({ sessionId, persist: false })
    for (const event of events) probe.ingestQuiet(event as SessionEventLike)
    return probe.state.turns.length
  }
  // 从持久化层整体回填；成功时把完整 store 缓存为 live。链序即兼容（同一 dsh 上新旧
  // API 互斥存在）：
  // ① 新链（dsh 0.1.5+ 句柄制）：open('read') → read(0) 全量 → close 还证（幂等，
  //    成功/失败路径都必须调）。NotFound / Corruption / Unsupported 契约即 fail-closed
  //    （绝不给坏数据），无 readRaw 可兜 → 落旧链（新版无旧链 → 维持 404）。
  // ② 旧链（≤0.1.1-rc.x 原样保留）：inspect 结构校验（rc.7 对半截/seq 缺口日志抛错）
  //    → readRaw 裸读（逐行解析丢坏行，恢复已提交前缀）。
  // ③ 全部落空 → null → 404。防重问：成功后才记 seeded（失败不封——不锁死整进程）。
  const seeded = new Set<string>()
  const backfillFromPersistence = async (sessionId: string): Promise<SessionNavState | null> => {
    if (seeded.has(sessionId)) return null
    const result = await (async (): Promise<SessionNavState | null> => {
      const sp = c.sessionPersistence
      if (typeof sp?.open === 'function') {
        try {
          const handle = await sp.open(sessionId, 'read')
          try {
            const events: unknown = (await handle.read(0))?.events
            if (Array.isArray(events) && events.length > 0) {
              if (probeTurnCount(sessionId, events) > 0) return backfillFrom(sessionId, events)
              // 静默 404 无法区分"接口没接通"与"事件格式漂移"——留一行排查入口。
              console.warn('[dsh-turnbar] persistence probe folded 0 turns:', sessionId)
            }
          } finally {
            try { await handle.close() } catch { /* 还证失败绝不影响数据结果 */ }
          }
        } catch { /* NotFound / Corruption / Unsupported → 落旧链 */ }
      }
      const inspection = await sp?.inspect?.(sessionId).catch(() => undefined)
      if (Array.isArray(inspection?.events) && inspection.events.length > 0) {
        if (probeTurnCount(sessionId, inspection.events) > 0) return backfillFrom(sessionId, inspection.events)
      }
      // inspect 失败/为空/半读（rc.7 严格校验：corrupt log / torn record / seq gap）→ 裸读。
      try {
        const raw = await c.sessionPersistence?.readRaw?.(sessionId).catch(() => undefined)
        const text = (raw as { content?: unknown } | undefined)?.content
        if (typeof text === 'string') {
          const recovered: unknown[] = []
          for (const line of text.split('\n')) {
            if (line.trim() === '') continue
            try {
              const parsed = JSON.parse(line) as unknown
              if (parsed !== null && typeof parsed === 'object') recovered.push(parsed)
            } catch { /* 半截/损坏行跳过——恢复已提交前缀 */ }
          }
          if (recovered.length > 0) return backfillFrom(sessionId, recovered)
        }
      } catch { /* 裸读兜底失败：维持 404 降级 */ }
      return null
    })()
    if (result !== null) seeded.add(sessionId)
    return result
  }
  // 完整性优先的会话状态装配（v0.3.1，防"半截 live 冒充完整"）：
  // 1) sidecar 在 → 历史有保障 → 合并 sidecar+live 直接返回（历史+新轮）；
  // 2) sidecar 缺失但 live 已有轮次（重启后只收到新轮的半截态）→ 先向持久化要完整版，
  //    拿得到（并缓存为 live）用完整版，持久化也没有才退回 live；
  // 3) 两边都空 → 交给持久化（含 readRaw 兜底），拿不到 → null → 404。
  const stateOf = async (sessionId: string): Promise<SessionNavState | null> => {
    if (sessionId === '') return null
    const live = stores.get(sessionId)?.state ?? null
    const sidecar = TurnStore.load(sessionId) ?? null
    if (sidecar !== null) return mergeNavStates(sidecar, live)
    if ((live?.turns.length ?? 0) > 0) {
      const backfilled = await backfillFromPersistence(sessionId)
      return backfilled ?? live
    }
    return backfillFromPersistence(sessionId)
  }

  // 同源数据路由：client 半区 fetch('/plugins/dsh-turnbar/state?sessionId=…')。
  let disposeRoute: (() => void) | undefined
  try {
    disposeRoute = c.webServer?.register({
      kind: 'exact',
      path: '/plugins/dsh-turnbar/state',
      handler: async (req, res) => {
        try {
          const sessionId = new URL(req.url ?? '/', 'http://localhost').searchParams.get('sessionId') ?? ''
          const state = await stateOf(sessionId)
          if (state === null) {
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

  // ⌘K 搜索路由：不区分大小写子串匹配用户全文 + 助手首段，返回命中轮号与片段。
  let disposeSearchRoute: (() => void) | undefined
  try {
    disposeSearchRoute = c.webServer?.register({
      kind: 'exact',
      path: '/plugins/dsh-turnbar/search',
      handler: async (req, res) => {
        try {
          const url = new URL(req.url ?? '/', 'http://localhost')
          const sessionId = url.searchParams.get('sessionId') ?? ''
          const q = (url.searchParams.get('q') ?? '').trim()
          if (sessionId === '' || q === '') {
            res.statusCode = 400
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: 'sessionId and q required' }))
            return
          }
          const state = await stateOf(sessionId)
          if (state === null) {
            res.statusCode = 404
            res.setHeader('content-type', 'application/json; charset=utf-8')
            res.end(JSON.stringify({ error: 'session not recorded' }))
            return
          }
          const needle = q.toLowerCase()
          const matches = state.turns
            .filter(turn => {
              const u = (turn.searchUser ?? '').toLowerCase()
              const a = (turn.searchAssistant ?? '').toLowerCase()
              return u.includes(needle) || a.includes(needle)
            })
            .map(turn => ({
              turn: turn.index,
              userSnippet: snippetAround(turn.searchUser ?? '', q),
              assistantSnippet: snippetAround(turn.searchAssistant ?? '', q),
            }))
            .slice(0, 50)
          res.statusCode = 200
          res.setHeader('content-type', 'application/json; charset=utf-8')
          res.end(JSON.stringify({ query: q, matches }))
        } catch {
          try { res.statusCode = 500; res.end() } catch { /* 响应可能已发出 */ }
        }
      },
    })
  } catch (error) {
    console.error('[dsh-turnbar] search route failed:', error)
  }

  return () => {
    try { c.off?.('session/event', onEvent) } catch { /* 卸载期上下文可能已失效 */ }
    try { disposeRoute?.() } catch { /* 同上 */ }
    try { disposeSearchRoute?.() } catch { /* 同上 */ }
    for (const store of stores.values()) {
      try { store.save() } catch { /* 尽力持久化 */ }
    }
    stores.clear()
  }
}

/** 命中上下文片段：定位首个命中（不区分大小写），前后各 30 字符。 */
function snippetAround(text: string, query: string): string {
  if (text === '' || query === '') return ''
  const idx = text.toLowerCase().indexOf(query.toLowerCase())
  if (idx < 0) return text.slice(0, 60)
  const start = Math.max(0, idx - 30)
  const end = Math.min(text.length, idx + query.length + 30)
  return `${start > 0 ? '…' : ''}${text.slice(start, end)}${end < text.length ? '…' : ''}`
}
