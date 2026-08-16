/**
 * SessionFold：把 session 事件流（firehose 或持久化日志）增量折叠为轮次记录。
 * 纯逻辑、零 dsh 依赖——两条数据通道（ctx.on('session/event') 实时 /
 * sessionPersistence 回填）都喂给同一个 fold。
 *
 * 事件依据（dsh @0.1.0-rc.5，packages/core/session/src/types.ts 的 SessionEventMap）：
 * turn/start {turn} / turn/end {turn, reason} —— 轮次边界是一等公民；
 * user/message {content, source, role, id}（无 turn 号，按位置归属）；
 * assistant/message {turn, step, message, usage}；
 * tool/call {turn, step, callId, name, arguments}。
 */
import { assistantFirstLine, assistantSearchText, userFirstLine, userSearchText } from './first-line'
import type { ChapterBreak, SessionEventLike, SessionNavState, TurnRecord, TurnRole } from './types'

/** 文件修改类工具注册表（name → 路径参数键 + 只读命令）。扩展点：dsh 工具名变更只改这里。 */
const FILE_TOOLS: Record<string, { pathKeys: string[]; skipCommands?: string[] }> = {
  str_replace_editor: { pathKeys: ['path'], skipCommands: ['view'] },
}

function extractFilePath(toolName: unknown, argsRaw: unknown): string | null {
  const spec = FILE_TOOLS[String(toolName)]
  if (spec === undefined) return null
  let args: Record<string, unknown> = {}
  if (typeof argsRaw === 'string') {
    try { args = JSON.parse(argsRaw) as Record<string, unknown> } catch { return null }
  } else if (argsRaw !== null && typeof argsRaw === 'object') {
    args = argsRaw as Record<string, unknown>
  }
  if (spec.skipCommands !== undefined && spec.skipCommands.includes(String(args.command))) return null
  for (const key of spec.pathKeys) {
    const value = args[key]
    if (typeof value === 'string' && value !== '') return value
  }
  return null
}

interface TurnDraft {
  index: number
  role: TurnRole
  userFirstLine: string
  assistantFirstLine: string
  searchUser: string
  searchAssistant: string
  startedAt: number
  endedAt?: number
  tokenIn: number
  tokenOut: number
  toolCallCount: number
  fileChanges: string[]
  steeringCount: number
  endReason?: string
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {}
}

export class SessionFold {
  private sessionId = ''
  private title: string | undefined
  private createdAt: number | undefined
  private cwd: string | undefined
  private model: string | undefined
  private contextWindow: number | undefined
  private readonly drafts = new Map<number, TurnDraft>()
  private readonly order: number[] = []
  /** 尚无轮次可归属的用户消息（会话开头的排队输入，等待下一个 turn/start 认领）。 */
  private readonly pendingUsers: string[] = []
  private readonly pendingUsersFull: string[] = []
  private readonly chapterBreaks: ChapterBreak[] = []
  private lastStarted: number | null = null

  push(event: SessionEventLike): void {
    const data = asRecord(event.data)
    const time = typeof event.time === 'number' ? event.time : 0
    const seq = typeof event.seq === 'number' ? event.seq : 0

    switch (event.type) {
      case 'session': {
        if (typeof event.id === 'string') this.sessionId = event.id
        if (typeof event.createdAt === 'number') this.createdAt = event.createdAt
        if (typeof event.cwd === 'string') this.cwd = event.cwd
        break
      }
      case 'session/title': {
        if (typeof data.title === 'string') this.title = data.title
        break
      }
      case 'request/context': {
        if (typeof data.model === 'string') this.model = data.model
        if (typeof data.contextWindow === 'number') this.contextWindow = data.contextWindow
        break
      }
      case 'user/message': {
        // 只认真实用户消息（source.kind === 'user'）：plugin/skill-catalog/
        // agent-instructions 的系统回显（如权限策略变更）不进轮次内容——
        // 否则卡片首句会显示 "The approval policy changed..." 这类噪声。
        // 旧版 dsh 无 source 字段时按用户消息处理（向后兼容）。
        const srcKind = asRecord(data.source)?.kind
        if (typeof srcKind === 'string' && srcKind !== 'user') break
        const line = userFirstLine(data.content)
        const full = userSearchText(data.content)
        const current = this.lastStarted !== null ? this.drafts.get(this.lastStarted) : undefined
        // 轮次进行中：首条即触发消息，其余算 steering；轮已结束或未开始：排队等下一个 turn。
        if (current !== undefined && current.endedAt === undefined) {
          if (current.userFirstLine === '') {
            current.userFirstLine = line
            current.searchUser = full
          } else {
            current.steeringCount++
            if (full !== '') current.searchUser += `\n${full}`
          }
        } else {
          this.pendingUsers.push(line)
          // 排队消息的全文暂存，turn/start 认领时写入。
          this.pendingUsersFull.push(full)
        }
        break
      }
      case 'turn/start': {
        const draft = this.ensure(data.turn, time)
        if (draft === undefined) break
        // 排队中的用户消息被新轮认领：第一条是触发消息，其余是 steering。
        for (let i = 0; i < this.pendingUsers.length; i++) {
          const line = this.pendingUsers[i] ?? ''
          const full = this.pendingUsersFull[i] ?? ''
          if (i === 0 && draft.userFirstLine === '') {
            draft.userFirstLine = line
            draft.searchUser = full
          } else {
            draft.steeringCount++
            if (full !== '') draft.searchUser += `\n${full}`
          }
        }
        this.pendingUsers.length = 0
        this.pendingUsersFull.length = 0
        this.lastStarted = draft.index
        break
      }
      case 'assistant/message': {
        const draft = this.ensure(data.turn, time)
        if (draft === undefined) break
        const usage = asRecord(data.usage)
        if (usage.inputTokens !== undefined || usage.outputTokens !== undefined) {
          draft.tokenIn += typeof usage.inputTokens === 'number' ? usage.inputTokens : 0
          draft.tokenOut += typeof usage.outputTokens === 'number' ? usage.outputTokens : 0
        }
        if (draft.assistantFirstLine === '') {
          draft.assistantFirstLine = assistantFirstLine(data.message)
          draft.searchAssistant = assistantSearchText(data.message)
        }
        break
      }
      case 'tool/call': {
        const draft = this.ensure(data.turn, time)
        if (draft === undefined) break
        draft.toolCallCount++
        const file = extractFilePath(data.name, data.arguments)
        if (file !== null) draft.fileChanges.push(file)
        break
      }
      case 'turn/end': {
        const draft = this.ensure(data.turn, time)
        if (draft === undefined) break
        draft.endedAt = time
        // reason 既可能是字符串（旧版/测试），也可能是对象 {kind:'aborted', reason:{kind:'user'}}
        // （现行 dsh）——对象时取 kind 字段。
        const reason = data.reason
        if (typeof reason === 'string' && reason !== '') {
          draft.endReason = reason
        } else if (reason !== null && typeof reason === 'object') {
          const kind = (reason as { kind?: unknown }).kind
          if (typeof kind === 'string' && kind !== '') draft.endReason = kind
        }
        break
      }
      case 'goal/change':
      case 'todo/write': {
        this.chapterBreaks.push({
          seq,
          turn: this.lastStarted ?? 0,
          kind: event.type === 'goal/change' ? 'goal' : 'todo',
        })
        break
      }
      default:
        // chunk 打包行、command/*、approval/* 等一律忽略。
        break
    }
  }

  private ensure(turn: unknown, time: number): TurnDraft | undefined {
    const index = Number(turn)
    if (!Number.isFinite(index)) return undefined
    let draft = this.drafts.get(index)
    if (draft === undefined) {
      draft = {
        index,
        role: 'user',
        userFirstLine: '',
        assistantFirstLine: '',
        searchUser: '',
        searchAssistant: '',
        startedAt: time,
        tokenIn: 0,
        tokenOut: 0,
        toolCallCount: 0,
        fileChanges: [],
        steeringCount: 0,
      }
      this.drafts.set(index, draft)
      this.order.push(index)
    }
    return draft
  }

  snapshot(sessionIdOverride?: string): SessionNavState {
    const sessionId = sessionIdOverride !== undefined && sessionIdOverride !== '' ? sessionIdOverride : this.sessionId
    const turns: TurnRecord[] = this.order.map(index => {
      const draft = this.drafts.get(index)
      if (draft === undefined) throw new Error(`fold invariant broken: turn ${index} missing`)
      return {
        id: `${sessionId || 'session'}#${draft.index}`,
        index: draft.index,
        role: draft.role,
        userFirstLine: draft.userFirstLine,
        assistantFirstLine: draft.assistantFirstLine,
        searchUser: draft.searchUser,
        searchAssistant: draft.searchAssistant,
        startedAt: draft.startedAt,
        endedAt: draft.endedAt,
        tokenIn: draft.tokenIn,
        tokenOut: draft.tokenOut,
        toolCallCount: draft.toolCallCount,
        fileChanges: draft.fileChanges,
        steeringCount: draft.steeringCount,
        endReason: draft.endReason,
      }
    })
    return {
      sessionId,
      title: this.title,
      createdAt: this.createdAt,
      cwd: this.cwd,
      model: this.model,
      contextWindow: this.contextWindow,
      turns,
      danglingUserCount: this.pendingUsers.length,
      chapterBreaks: this.chapterBreaks,
    }
  }
}

export function foldSessionEvents(events: readonly SessionEventLike[], sessionIdOverride?: string): SessionNavState {
  const fold = new SessionFold()
  for (const event of events) fold.push(event)
  return fold.snapshot(sessionIdOverride)
}
