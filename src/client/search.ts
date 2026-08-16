/**
 * ⌘K 会话内搜索面板（v0.2）：纯 DOM 单例（与卡片/toast 同范式）。
 * 打开后输入即搜（150ms 防抖），结果行显示轮号 + 命中上下文片段；
 * Enter/点击跳转，↑/↓ 选行，Esc 关闭。搜索端点走 host 半区 /search。
 */

const PANEL_ID = 'dsh-turnbar-search'

export interface SearchMatch {
  turn: number
  userSnippet: string
  assistantSnippet: string
}

interface SearchState {
  el: HTMLElement | null
  input: HTMLInputElement | null
  list: HTMLElement | null
  sessionId: string
  debounce: number | null
  results: SearchMatch[]
  activeIndex: number
  onPick: ((turn: number) => void) | null
  seq: number
  /** 打开面板前的焦点元素：关闭时归还，否则焦点滞留隐藏输入框会吞掉
   *  ⌘↑/⌘↓ 与 toast 的 Esc 返回（曾致搜索后键盘导航整体失效）。 */
  restoreFocus: HTMLElement | null
}

const state: SearchState = {
  el: null, input: null, list: null, sessionId: '',
  debounce: null, results: [], activeIndex: 0, onPick: null, seq: 0, restoreFocus: null,
}

function ensureEl(): HTMLElement | null {
  if (state.el !== null && state.el.isConnected) return state.el
  if (typeof document === 'undefined') return null
  const existing = document.getElementById(PANEL_ID)
  if (existing !== null) { state.el = existing as HTMLElement; return state.el }
  const el = document.createElement('div')
  el.id = PANEL_ID
  el.setAttribute('data-turnbar-search', '')
  const box = document.createElement('div')
  box.className = 'tb-search-box'
  const input = document.createElement('input')
  input.type = 'text'
  input.placeholder = '搜索这个会话…'
  input.setAttribute('data-turnbar-search-input', '')
  input.addEventListener('input', onInput) // 懒创建时绑定一次
  const list = document.createElement('div')
  list.className = 'tb-search-list'
  list.setAttribute('data-turnbar-search-list', '')
  box.appendChild(input)
  el.append(box, list)
  document.body.appendChild(el)
  state.el = el
  state.input = input
  state.list = list
  return el
}

async function runSearch(): Promise<void> {
  const q = state.input?.value.trim() ?? ''
  const list = state.list
  if (list === null) return
  if (q === '' || state.sessionId === '') {
    renderResults([])
    return
  }
  const seq = ++state.seq
  try {
    const res = await fetch(
      `/plugins/dsh-turnbar/search?sessionId=${encodeURIComponent(state.sessionId)}&q=${encodeURIComponent(q)}`,
    )
    if (!res.ok) { renderResults([]); return }
    const json = await res.json()
    if (seq !== state.seq) return // 过期响应丢弃
    renderResults(Array.isArray(json?.matches) ? json.matches as SearchMatch[] : [])
  } catch { renderResults([]) }
}

function renderResults(matches: SearchMatch[]): void {
  const list = state.list
  if (list === null) return
  state.results = matches
  state.activeIndex = 0
  list.replaceChildren()
  if (matches.length === 0) {
    const empty = document.createElement('div')
    empty.className = 'tb-search-empty'
    empty.textContent = '没有匹配的轮次'
    list.appendChild(empty)
    return
  }
  // 结果计数行（不参与 ↑↓ 选择）
  const count = document.createElement('div')
  count.className = 'tb-search-count'
  count.textContent = `${matches.length} 条结果`
  list.appendChild(count)
  matches.forEach((m, i) => {
    const row = document.createElement('button')
    row.type = 'button'
    row.className = 'tb-search-row'
    row.setAttribute('data-turnbar-search-row', '')
    const head = document.createElement('div')
    head.className = 'tb-search-row-head'
    head.textContent = `#${m.turn}`
    const body = document.createElement('div')
    body.className = 'tb-search-row-body'
    const text = m.userSnippet !== '' ? m.userSnippet : m.assistantSnippet
    body.textContent = text !== '' ? text : '（该轮无文本）'
    row.append(head, body)
    if (i === 0) row.classList.add('active')
    row.addEventListener('click', () => pick(i))
    list.appendChild(row)
  })
}

function pick(index: number): void {
  const match = state.results[index]
  if (match === undefined) return
  const fn = state.onPick // 先取引用：closeSearchPanel 会清空 onPick
  closeSearchPanel()
  try { fn?.(match.turn) } catch { /* 跳转失败不致命 */ }
}

export function toggleSearch(sessionId: string, onPick: (turn: number) => void): void {
  if (state.el !== null && state.el.classList.contains('visible')) {
    closeSearchPanel()
    return
  }
  if (sessionId === '') return
  const el = ensureEl()
  if (el === null) return
  ensureListeners() // 面板内键位（Enter/Esc/↑↓）依赖 window 捕获监听——勿漏挂
  // 记录当前焦点：关闭时归还（Esc 关闭后焦点归位，勿滞留隐藏输入框）
  const ae = document.activeElement
  state.restoreFocus = ae instanceof HTMLElement && ae !== el && ae !== document.body ? ae : null
  state.sessionId = sessionId
  state.onPick = onPick
  state.results = []
  state.activeIndex = 0
  state.seq++
  if (state.input !== null) state.input.value = ''
  renderResults([])
  el.classList.add('visible')
  state.input?.focus()
}

export function closeSearchPanel(): void {
  state.seq++
  if (state.debounce !== null) {
    window.clearTimeout(state.debounce)
    state.debounce = null
  }
  state.el?.classList.remove('visible')
  state.onPick = null
  // 焦点归还：避免 ⌘↑/⌘↓ 与 toast Esc 被隐藏输入框的 editable 判定吞掉。
  const target = state.restoreFocus
  state.restoreFocus = null
  if (target !== null) {
    try { target.focus() } catch { /* 元素可能已卸载 */ }
  } else {
    try { (document.activeElement as HTMLElement | null)?.blur?.() } catch { /* 忽略 */ }
  }
}

function onInput(): void {
  if (state.debounce !== null) window.clearTimeout(state.debounce)
  state.debounce = window.setTimeout(() => { state.debounce = null; void runSearch() }, 150)
}

function onKey(event: KeyboardEvent): void {
  if (state.el === null || !state.el.classList.contains('visible')) return
  const list = state.list
  if (list === null) return
  if (event.key === 'Escape') {
    event.preventDefault()
    closeSearchPanel()
    return
  }
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault()
    const rows = [...list.querySelectorAll<HTMLElement>('[data-turnbar-search-row]')]
    if (rows.length === 0) return
    const delta = event.key === 'ArrowDown' ? 1 : -1
    state.activeIndex = (state.activeIndex + delta + rows.length) % rows.length
    rows.forEach((r, i) => r.classList.toggle('active', i === state.activeIndex))
    // 长结果列表：高亮行滚入视野，避免 ↑↓ 走到屏外看不到选中行
    rows[state.activeIndex]?.scrollIntoView({ block: 'nearest' })
    return
  }
  if (event.key === 'Enter') {
    event.preventDefault()
    pick(state.activeIndex)
  }
}

let wired = false
function ensureListeners(): void {
  if (wired) return
  wired = true
  window.addEventListener('keydown', onKey, true)
}

export function disposeSearch(): void {
  closeSearchPanel()
  state.el?.remove()
  state.el = null
  state.input = null
  state.list = null
  window.removeEventListener('keydown', onKey, true)
  wired = false
}
