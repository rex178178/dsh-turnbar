#!/usr/bin/env node
/**
 * 从真实会话生成脱敏测试夹具：保留事件结构 / seq / turn / step / usage / 工具名，
 * 替换一切用户文本载荷（内容 → SYNTH-*）。用法：
 *   node scripts/make-fixture.mjs [input session.jsonl.zstd] [output json]
 */
import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

const input = process.argv[2]
  ?? `${process.env.HOME}/.dsh/sessions/--Users-rexli-asset-tracker--/session-e40715b8-43e6-4166-bb07-983e15b941f4/session.jsonl.zstd`
const output = process.argv[3]
  ?? new URL('../test/fixtures/long-session.json', import.meta.url).pathname

const raw = spawnSync('zstd', ['-dc', input], { maxBuffer: 1 << 28 })
if (raw.status !== 0) {
  console.error('zstd -dc failed:', raw.stderr?.toString())
  process.exit(1)
}

const events = []
const stats = {
  turns: 0, userMessages: 0, assistantMessages: 0, toolCalls: 0,
  fileToolCalls: 0, goal: 0, todo: 0, other: {},
}

function stripBulk(event) {
  const data = event.data
  if (data === null || typeof data !== 'object') return event
  const copy = { ...data }
  if (Array.isArray(copy.texts)) copy.texts = []
  if (typeof copy.args === 'string') copy.args = ''
  if (Array.isArray(copy.messages)) copy.messages = []
  if (typeof copy.system === 'string') copy.system = ''
  if (copy.body !== null && typeof copy.body === 'object') copy.body = {}
  if (Array.isArray(copy.inserted)) copy.inserted = []
  return { ...event, data: copy }
}

for (const line of raw.stdout.toString().split('\n')) {
  if (line.trim() === '') continue
  let event
  try { event = JSON.parse(line) } catch { continue }
  const seq = event.seq ?? 0
  switch (event.type) {
    case 'session':
      events.push({ ...event, cwd: '/synth/workspace' })
      break
    case 'user/message':
      stats.userMessages++
      events.push({ ...event, data: { ...event.data, content: [{ type: 'text', text: `SYNTH-USER-${seq}` }] } })
      break
    case 'assistant/message':
      stats.assistantMessages++
      events.push({
        ...event,
        data: {
          ...event.data,
          message: { ...event.data?.message, content: [{ type: 'text', text: `SYNTH-ASSISTANT-${seq}` }] },
          usage: event.data?.usage,
        },
      })
      break
    case 'tool/call':
      stats.toolCalls++
      if (event.data?.name === 'str_replace_editor') {
        stats.fileToolCalls++
        const command = typeof event.data?.arguments === 'string' && event.data.arguments.includes('"view"') ? 'view' : 'create'
        events.push({ ...event, data: { ...event.data, arguments: JSON.stringify({ command, path: `/synth/file-${seq}.ts` }) } })
      } else {
        events.push({ ...event, data: { ...event.data, arguments: '{}' } })
      }
      break
    case 'turn/start':
      stats.turns++
      events.push(event)
      break
    case 'goal/change':
      stats.goal++
      events.push({ ...event, data: { ...stripBulk(event).data, goal: 'SYNTH-GOAL' } })
      break
    case 'todo/write':
      stats.todo++
      events.push({ ...event, data: { ...event.data, todos: [{ content: 'SYNTH-TODO', status: 'pending' }] } })
      break
    case 'session/title':
      events.push({ ...event, data: { ...event.data, title: 'SYNTH-TITLE' } })
      break
    default:
      stats.other[event.type] = (stats.other[event.type] ?? 0) + 1
      events.push(stripBulk(event))
      break
  }
}

mkdirSync(dirname(output), { recursive: true })
writeFileSync(output, `${JSON.stringify({ source: 'sanitized-real-session', stats, events })}\n`, 'utf8')
console.log(`fixture: ${events.length} events -> ${output}`)
console.log(JSON.stringify(stats))
