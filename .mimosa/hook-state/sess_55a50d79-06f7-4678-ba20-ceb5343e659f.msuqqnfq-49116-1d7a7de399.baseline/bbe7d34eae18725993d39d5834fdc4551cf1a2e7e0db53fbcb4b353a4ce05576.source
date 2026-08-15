/** 首句提取：把消息 content（块数组或字符串）压成一行纯文本预览。采集时一次完成，渲染零成本。 */

const FENCE = /```[a-zA-Z0-9_-]*\n?([\s\S]*?)```/g
const IMAGE = /!\[[^\]]*\]\([^)]*\)/g
const LINK = /\[([^\]]*)\]\([^)]*\)/g

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

export function assistantFirstLine(message: unknown, max = 200): string {
  if (message === null || typeof message !== 'object') return ''
  return firstLine(blocksToText((message as { content?: unknown }).content), max)
}
