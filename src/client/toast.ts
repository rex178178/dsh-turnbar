/**
 * 跳转返回 toast（GitHub 跳转线范式，PLAN §5.2）：跳转成功后左下角提示
 * 「已定位 #N · Esc 返回原位」，点击或按 Esc 回到跳转前位置，5s 自动消失。
 * 单例 DOM；输入框聚焦时不劫持 Esc。
 */

const TOAST_ID = 'dsh-turnbar-toast'

interface ToastState {
  el: HTMLElement | null
  timer: number | null
  onReturn: (() => void) | null
}

const state: ToastState = { el: null, timer: null, onReturn: null }

function ensureEl(): HTMLElement | null {
  if (state.el !== null && state.el.isConnected) return state.el
  if (typeof document === 'undefined') return null
  const existing = document.getElementById(TOAST_ID)
  if (existing !== null) {
    state.el = existing as HTMLElement
    return state.el
  }
  const el = document.createElement('div')
  el.id = TOAST_ID
  el.setAttribute('data-turnbar-toast', '')
  el.setAttribute('role', 'status')
  document.body.appendChild(el)
  state.el = el
  return el
}

function isEditable(target: EventTarget | null): boolean {
  if (target === null) return false
  const el = target as HTMLElement
  const tag = el.tagName
  return tag === 'TEXTAREA' || tag === 'INPUT' || (el.isContentEditable === true)
}

/** 真实输入语境（与 client/index.ts 的 isTypingContext 同规则）：
 * 空编辑器不算——搜索关闭后焦点回到空 composer 时 Esc 返回仍应可用。 */
function isTypingContext(target: EventTarget | null): boolean {
  if (target === null) return false
  const el = target as HTMLElement
  if (!isEditable(el)) return false
  if (el.getAttribute('data-turnbar-search-input') !== null) return true
  const tag = el.tagName
  if (tag === 'TEXTAREA' || tag === 'INPUT') return (el as HTMLInputElement).value !== ''
  return true
}

export function showReturnToast(label: string, onReturn: () => void): void {
  const el = ensureEl()
  if (el === null) return
  state.onReturn = onReturn
  el.replaceChildren()
  const text = document.createElement('span')
  text.textContent = `已定位 ${label}`
  const hint = document.createElement('span')
  hint.className = 'tb-toast-return'
  hint.textContent = 'Esc 返回原位'
  el.append(text, hint)
  el.classList.add('visible')
  clearTimeout(state.timer ?? undefined)
  state.timer = window.setTimeout(hideToast, 5000)
}

export function hideToast(): void {
  if (state.timer !== null) {
    window.clearTimeout(state.timer)
    state.timer = null
  }
  state.el?.classList.remove('visible')
  state.onReturn = null
}

function handleKey(event: KeyboardEvent): void {
  if (event.key !== 'Escape') return
  if (state.el === null || !state.el.classList.contains('visible')) return
  if (isTypingContext(event.target)) return
  // 搜索面板（z-index 930 > toast 920）可见时 Esc 归面板独占——
  // 否则一次 Esc 会同时关面板并触发返回滚动（双动作 bug）。
  const panel = document.getElementById('dsh-turnbar-search')
  if (panel !== null && panel.classList.contains('visible')) return
  event.preventDefault()
  const fn = state.onReturn
  hideToast()
  try { fn?.() } catch { /* 恢复失败不致命 */ }
}

function handleClick(event: MouseEvent): void {
  if (state.el === null || !state.el.classList.contains('visible')) return
  if (state.el !== event.target && !state.el.contains(event.target as Node)) return
  const fn = state.onReturn
  hideToast()
  try { fn?.() } catch { /* 同上 */ }
}

let wired = false
function ensureListeners(): void {
  if (wired) return
  wired = true
  window.addEventListener('keydown', handleKey, true)
  window.addEventListener('click', handleClick, true)
}

export function initToast(): void {
  ensureListeners()
}

export function disposeToast(): void {
  hideToast()
  state.el?.remove()
  state.el = null
  window.removeEventListener('keydown', handleKey, true)
  window.removeEventListener('click', handleClick, true)
  wired = false
}
