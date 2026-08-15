/**
 * TurnStore：SessionFold 的持久化外壳。
 * sidecar 落盘在 <DSH_HOME>/plugins/dsh-turnbar/sessions/<sessionId>.jsonl（单行全量快照，
 * 原子写）；回填（D5）与 UI 桥（D3/D4）都从这里取状态。
 */
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { SessionFold } from './fold'
import type { SessionEventLike, SessionNavState } from './types'

export function dshHome(): string {
  return process.env.DSH_HOME ?? join(homedir(), '.dsh')
}

export interface TurnStoreOptions {
  readonly sessionId: string
  readonly root?: string
  readonly persist?: boolean
}

function sanitizeSegment(id: string): string {
  return id.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export class TurnStore {
  private readonly fold = new SessionFold()
  private readonly persistEnabled: boolean
  private readonly root: string

  constructor(private readonly opts: TurnStoreOptions) {
    this.persistEnabled = opts.persist ?? true
    this.root = opts.root ?? join(dshHome(), 'plugins', 'dsh-turnbar', 'sessions')
  }

  get sessionId(): string {
    return this.opts.sessionId
  }

  get sidecarPath(): string {
    return join(this.root, `${sanitizeSegment(this.opts.sessionId)}.jsonl`)
  }

  ingest(event: SessionEventLike): void {
    this.fold.push(event)
    // 每轮收尾（及标题更新）落一次盘；流式事件只进内存。
    if (event.type === 'turn/end' || event.type === 'session/title') this.save()
  }

  get state(): SessionNavState {
    return this.fold.snapshot(this.opts.sessionId)
  }

  save(): void {
    if (!this.persistEnabled) return
    const line = `${JSON.stringify({ type: 'turnbar/state', v: 1, state: this.state })}\n`
    mkdirSync(this.root, { recursive: true })
    const tmp = `${this.sidecarPath}.tmp`
    writeFileSync(tmp, line, 'utf8')
    renameSync(tmp, this.sidecarPath)
  }

  static load(sessionId: string, root?: string): SessionNavState | null {
    const store = new TurnStore({ sessionId, root, persist: false })
    if (!existsSync(store.sidecarPath)) return null
    try {
      const parsed = JSON.parse(readFileSync(store.sidecarPath, 'utf8')) as
        | { type: 'turnbar/state'; v: number; state: SessionNavState }
        | null
      return parsed !== null && parsed.type === 'turnbar/state' ? parsed.state : null
    } catch {
      return null
    }
  }
}
