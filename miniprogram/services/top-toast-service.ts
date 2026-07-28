export type TopToastType = 'success' | 'error' | 'warning' | 'info'

export interface TopToastOptions {
  message?: string
  title?: string
  type?: TopToastType
  icon?: 'success' | 'none'
  duration?: number
}

export interface TopToastEvent {
  id: number
  message: string
  type: TopToastType
  duration: number
}

export interface TopToastStack {
  expanded: TopToastEvent[]
  stacked: TopToastEvent[]
}

type TopToastListener = (event: TopToastEvent) => void

const DEFAULT_DURATION_MS = 2600
const MIN_DURATION_MS = 1200
const MAX_DURATION_MS = 6000
const listeners: TopToastListener[] = []
let nextToastId = 1

function inferToastType(message: string): TopToastType {
  if (/失败|错误|失效|无法|异常/.test(message)) return 'error'
  if (/请|注意|核对|最多|不支持|正在|未完成/.test(message)) return 'warning'
  return 'info'
}

function normalizeDuration(duration: number | undefined): number {
  if (!Number.isFinite(duration)) return DEFAULT_DURATION_MS
  return Math.min(MAX_DURATION_MS, Math.max(MIN_DURATION_MS, Math.round(duration as number)))
}

export function subscribeTopToast(listener: TopToastListener): () => void {
  listeners.push(listener)
  let subscribed = true
  return () => {
    if (!subscribed) return
    subscribed = false
    const index = listeners.lastIndexOf(listener)
    if (index >= 0) listeners.splice(index, 1)
  }
}

export function showTopToast(options: TopToastOptions): TopToastEvent {
  const message = String(options.message ?? options.title ?? '').trim() || '操作完成'
  const type = options.type || (options.icon === 'success' ? 'success' : inferToastType(message))
  const event: TopToastEvent = {
    id: nextToastId,
    message,
    type,
    duration: normalizeDuration(options.duration),
  }
  nextToastId += 1
  listeners[listeners.length - 1]?.(event)
  return event
}


export function partitionTopToastStack(events: readonly TopToastEvent[]): TopToastStack {
  const newestFirst = [...events].reverse()
  return {
    expanded: newestFirst.slice(0, 2),
    stacked: newestFirst.slice(2),
  }
}
