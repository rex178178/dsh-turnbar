/** dsh 会话事件的最小结构视图（对官方 `SessionEvent` 的宽松映射，按 seq 顺序流入）。 */
export interface SessionEventLike {
  readonly type: string
  readonly seq?: number
  readonly time?: number
  readonly data?: unknown
  readonly [key: string]: unknown
}

export type TurnRole = 'user' | 'assistant' | 'agent'

/** 一个轮次 = 一次 turn/start..turn/end（用户提交起，至下一次提交前的全部活动）。 */
export interface TurnRecord {
  readonly id: string
  /** 展示序号（= 事件流 turn 号）。 */
  readonly index: number
  readonly role: TurnRole
  /** 触发该轮的用户输入首句（markdown 已剥离，≤160 字符）。 */
  readonly userFirstLine: string
  /** 助手回复首段（仅首个文本块，≤200 字符）。 */
  readonly assistantFirstLine: string
  readonly startedAt: number
  readonly endedAt?: number
  readonly tokenIn: number
  readonly tokenOut: number
  readonly toolCallCount: number
  /** 文件修改类工具触碰过的路径（str_replace_editor 非 view 命令）。 */
  readonly fileChanges: readonly string[]
  /** 轮内追加的 steering 用户消息数（不含触发消息）。 */
  readonly steeringCount: number
  readonly endReason?: string
}

/** 章节切分信号（V1 用：任务边界）。先记录，分段规则后续叠加。 */
export interface ChapterBreak {
  readonly seq: number
  readonly turn: number
  readonly kind: 'goal' | 'todo'
}

export interface SessionNavState {
  readonly sessionId: string
  readonly title?: string
  readonly createdAt?: number
  readonly cwd?: string
  readonly model?: string
  readonly contextWindow?: number
  readonly turns: readonly TurnRecord[]
  /** 尚未归属任何轮次的用户消息（如会话末尾排队中的输入）。 */
  readonly danglingUserCount: number
  readonly chapterBreaks: readonly ChapterBreak[]
}
