/** 首句提取：把消息 content（块数组或字符串）压成一行纯文本预览。采集时一次完成，渲染零成本。 */

const FENCE = /```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g
const LINK = /\[([^\]]*)\]\([^)]*\)/g
/** goal 轮回显格式（vendor goal-round-driver）：Objective 引号内即用户 `/goal` 的真实输入。 */
const GOAL_OBJECTIVE = /<goal_round>\s*Objective:\s*"([^"]+)"/

export function stripMarkdownLite(text: string): string {
  return text
    .replace(FENCE, (_m, body: string) => `‹code ${body.split('\n').filter(l => l.trim() !== '').length} 行›`)
    .replace(IMAGE, '‹image›')
    .replace(LINK, '$1')
    .replace(/\s+/g, ' ')
    .trim()
}

export function firstLine(text: string, max: number): string {
  const s = stripMarkdownLite(text)
  return s.length <= max ? s : `${s.slice(0, Math.max(0, max - 1))}…`
}

function blocksToText(content: unknown): string {
  if (typeof content === 'string') return content
  if (Array.isArray(content)) {
    const parts: string[] = []
    for (const block of content) {
      if (block !== null && typeof block === 'object' && typeof (block as { text?: unknown }).text === 'string') {
        parts.push((block as { text: string }).text)
      }
    }
    return parts.join(' ')
  }
  if (content !== null && typeof content === 'object') {
    const text = (content as { text?: unknown }).text
    if (typeof text === 'string') return text
  }
  return ''
}

export function userFirstLine(content: unknown, max = 160): string {
  return firstLine(blocksToText(content), max)
}

/** goal 轮回显（source.kind='goal'）里提取用户真实输入：`<goal_round>` 包装的
 * Objective 引号文本。提不出（格式变更/非 goal 轮）返回 ''，调用方按非用户消息跳过。 */
export function goalObjective(content: unknown): string {
  return blocksToText(content).match(GOAL_OBJECTIVE)?.[1] ?? ''
}

export function assistantFirstLine(message: unknown, max = 200): string {
  if (message === null || typeof message !== 'object') return ''
  return firstLine(blocksToText((message as { content?: unknown }).content), max)
}

/** 搜索用全文（v0.2 ⌘K）：仅剥 markdown 语法，保留内容与换行，截断保护。 */
export function searchText(content: unknown, max: number): string {
  const raw = blocksToText(content)
  const stripped = raw
    .replace(FENCE, ' ')
    .replace(IMAGE, ' ')
    .replace(LINK, '$1')
    .replace(/[ \t]+/g, ' ')
    .trim()
  return stripped.length <= max ? stripped : stripped.slice(0, max)
}

export function userSearchText(content: unknown, max = 4000): string {
  return searchText(content, max)
}

export function assistantSearchText(message: unknown, max = 2000): string {
  if (message === null || typeof message !== 'object') return ''
  return searchText((message as { content?: unknown }).content, max)
}
