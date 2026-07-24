import { InspectionRecord } from './inspection-record'
import {
  RecognitionConfidencePayload,
  RecognitionReviewHints,
} from './recognition-review'

export const MAX_RECOGNITION_QUEUE_SIZE = 10
export const MAX_CONCURRENT_RECOGNITIONS = 2
export const RECOGNITION_PROGRESS_DURATION_MS = 6_000
const RECOGNITION_PROGRESS_START = 8

export interface RecognitionProgressProfile {
  earlyTarget: number
  middleTarget: number
  lateTarget: number
  sixSecondTarget: number
  tailCeiling: number
  tailRate: number
}

function stableHash(value: string): number {
  let hash = 2_166_136_261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16_777_619)
  }
  return hash >>> 0
}

function profileInteger(id: string, key: string, min: number, max: number): number {
  const span = max - min + 1
  return min + (stableHash(`${id}:${key}`) % span)
}

export function getRecognitionProgressProfile(id: string): RecognitionProgressProfile {
  return {
    earlyTarget: profileInteger(id, 'early', 12, 16),
    middleTarget: profileInteger(id, 'middle', 29, 38),
    lateTarget: profileInteger(id, 'late', 58, 67),
    sixSecondTarget: profileInteger(id, 'six', 84, 91),
    tailCeiling: profileInteger(id, 'ceiling', 95, 98),
    tailRate: profileInteger(id, 'tail-rate', 100, 155) / 100,
  }
}

function interpolate(start: number, end: number, ratio: number): number {
  return start + (end - start) * ratio
}

export function getTimedRecognitionProgress(
  elapsedMs: number,
  durationMs = RECOGNITION_PROGRESS_DURATION_MS,
  profile = getRecognitionProgressProfile('default'),
): number {
  const safeDuration = Math.max(1, durationMs)
  const elapsed = Math.max(0, elapsedMs)
  const ratio = elapsed / safeDuration

  if (ratio <= 0.25) {
    return Math.round(interpolate(RECOGNITION_PROGRESS_START, profile.earlyTarget, ratio / 0.25))
  }
  if (ratio <= 0.5) {
    return Math.round(interpolate(profile.earlyTarget, profile.middleTarget, (ratio - 0.25) / 0.25))
  }
  if (ratio <= 0.75) {
    return Math.round(interpolate(profile.middleTarget, profile.lateTarget, (ratio - 0.5) / 0.25))
  }
  if (ratio <= 1) {
    return Math.round(interpolate(profile.lateTarget, profile.sixSecondTarget, (ratio - 0.75) / 0.25))
  }

  const tailElapsed = ratio - 1
  const tailRatio = 1 - Math.exp(-profile.tailRate * tailElapsed)
  return Math.min(
    profile.tailCeiling,
    Math.round(interpolate(profile.sixSecondTarget, profile.tailCeiling, tailRatio)),
  )
}

export type RecognitionQueueStatus =
  | 'queued'
  | 'preparing'
  | 'recognizing'
  | 'ready'
  | 'failed'
  | 'skipped'

export function getRecognitionProgress(status: RecognitionQueueStatus): number {
  switch (status) {
    case 'queued': return 0
    case 'preparing': return RECOGNITION_PROGRESS_START
    case 'recognizing': return RECOGNITION_PROGRESS_START
    case 'ready': return 100
    case 'failed': return 0
    case 'skipped': return 0
  }
}

export interface RecognitionQueueResult {
  imageId: string
  rawContent: string
  record: InspectionRecord
  confidence: RecognitionConfidencePayload
}

export interface RecognitionQueueItem {
  id: string
  imagePath: string
  createdAt: number
  status: RecognitionQueueStatus
  progress: number
  progressProfile: RecognitionProgressProfile
  stage: string
  sourceType: 'standalone' | 'purchase_order'
  taskId: number | null
  itemId: number | null
  taskPrefill: InspectionRecord | null
  result: RecognitionQueueResult | null
  reviewHints: RecognitionReviewHints | null
  error: string
  skipRequested: boolean
}

export interface RecognitionQueueStats {
  active: number
  queued: number
  ready: number
  failed: number
  total: number
}

export interface CreateRecognitionQueueItemInput {
  id: string
  imagePath: string
  createdAt: number
  sourceType: 'standalone' | 'purchase_order'
  taskId: number | null
  itemId: number | null
  taskPrefill: InspectionRecord | null
}

function cloneRecord(record: InspectionRecord | null): InspectionRecord | null {
  if (!record) return null
  return {
    ...record,
    rows: record.rows.map((row) => ({
      ...row,
      measurements: [...row.measurements],
      lowConfidenceFields: [...row.lowConfidenceFields],
    })),
    sampleJudgements: [...record.sampleJudgements],
    lowConfidenceFields: [...record.lowConfidenceFields],
  }
}

export function createRecognitionQueueItem(
  input: CreateRecognitionQueueItemInput,
): RecognitionQueueItem {
  return {
    id: input.id,
    imagePath: input.imagePath,
    createdAt: input.createdAt,
    status: 'queued',
    progress: getRecognitionProgress('queued'),
    progressProfile: getRecognitionProgressProfile(input.id),
    stage: '等待识别',
    sourceType: input.sourceType,
    taskId: input.taskId,
    itemId: input.itemId,
    taskPrefill: cloneRecord(input.taskPrefill),
    result: null,
    reviewHints: null,
    error: '',
    skipRequested: false,
  }
}

function isUnfinished(item: RecognitionQueueItem): boolean {
  return item.status !== 'skipped'
}

export function appendRecognitionQueue(
  queue: RecognitionQueueItem[],
  additions: RecognitionQueueItem[],
  maxSize = MAX_RECOGNITION_QUEUE_SIZE,
): RecognitionQueueItem[] {
  const remaining = Math.max(0, maxSize - queue.filter(isUnfinished).length)
  return [...queue, ...additions.slice(0, remaining)]
}

export function getNextQueuedItem(
  queue: RecognitionQueueItem[],
): RecognitionQueueItem | undefined {
  return queue.find((item) => item.status === 'queued')
}

export function updateQueueItem(
  queue: RecognitionQueueItem[],
  id: string,
  update: Partial<RecognitionQueueItem>,
): RecognitionQueueItem[] {
  return queue.map((item) => {
    if (item.id !== id) return item
    const next = { ...item, ...update }
    const statusChanged = update.status !== undefined && update.status !== item.status
    const progress = update.progress !== undefined
      ? Math.min(100, Math.max(0, Math.round(update.progress)))
      : statusChanged
        ? getRecognitionProgress(next.status)
        : item.progress
    return { ...next, progress }
  })
}

function getActiveRecognitionCount(queue: RecognitionQueueItem[]): number {
  return queue.filter((item) => (
    item.status === 'preparing' || item.status === 'recognizing'
  )).length
}

export function markQueueItemActive(
  queue: RecognitionQueueItem[],
  id: string,
  maxConcurrent = MAX_CONCURRENT_RECOGNITIONS,
): RecognitionQueueItem[] {
  const selected = queue.find((item) => item.id === id)
  if (
    !selected
    || selected.status !== 'queued'
    || getActiveRecognitionCount(queue) >= Math.max(1, maxConcurrent)
  ) {
    return queue
  }
  return updateQueueItem(queue, id, {
    status: 'preparing',
    stage: '正在处理图片',
    error: '',
    skipRequested: false,
  })
}

export interface ClaimedRecognitionQueueItems {
  queue: RecognitionQueueItem[]
  claimed: RecognitionQueueItem[]
}

export function claimQueuedRecognitionItems(
  queue: RecognitionQueueItem[],
  maxConcurrent = MAX_CONCURRENT_RECOGNITIONS,
): ClaimedRecognitionQueueItems {
  const safeMaxConcurrent = Math.max(1, maxConcurrent)
  let nextQueue = queue
  const claimed: RecognitionQueueItem[] = []

  while (getActiveRecognitionCount(nextQueue) < safeMaxConcurrent) {
    const next = getNextQueuedItem(nextQueue)
    if (!next) break
    nextQueue = markQueueItemActive(nextQueue, next.id, safeMaxConcurrent)
    const active = nextQueue.find((item) => item.id === next.id)
    if (!active || active.status !== 'preparing') break
    claimed.push(active)
  }

  return { queue: nextQueue, claimed }
}

export function markQueueItemRecognizing(
  queue: RecognitionQueueItem[],
  id: string,
): RecognitionQueueItem[] {
  const selected = queue.find((item) => item.id === id)
  if (!selected || selected.status !== 'preparing') return queue
  return updateQueueItem(queue, id, {
    status: 'recognizing',
    progress: selected.progress,
    stage: '正在调用视觉大模型',
  })
}

export function completeQueueItem(
  queue: RecognitionQueueItem[],
  id: string,
  result: RecognitionQueueResult,
  reviewHints: RecognitionReviewHints,
): RecognitionQueueItem[] {
  const selected = queue.find((item) => item.id === id)
  if (!selected || selected.skipRequested) {
    return updateQueueItem(queue, id, {
      status: 'skipped',
      stage: '已跳过',
      result: null,
      reviewHints: null,
    })
  }
  return updateQueueItem(queue, id, {
    status: 'ready',
    stage: '待人工审核',
    result,
    reviewHints,
    error: '',
  })
}

export function failQueueItem(
  queue: RecognitionQueueItem[],
  id: string,
  error: string,
): RecognitionQueueItem[] {
  const selected = queue.find((item) => item.id === id)
  if (!selected) return queue
  if (selected.skipRequested) {
    return updateQueueItem(queue, id, {
      status: 'skipped',
      stage: '已跳过',
      error: '',
    })
  }
  return updateQueueItem(queue, id, {
    status: 'failed',
    progress: selected.progress,
    stage: '识别失败',
    error,
  })
}

export function requestQueueItemSkip(
  queue: RecognitionQueueItem[],
  id: string,
): RecognitionQueueItem[] {
  const selected = queue.find((item) => item.id === id)
  if (!selected) return queue
  if (selected.status === 'queued') {
    return updateQueueItem(queue, id, {
      status: 'skipped',
      stage: '已跳过',
      skipRequested: true,
    })
  }
  if (selected.status === 'preparing' || selected.status === 'recognizing') {
    return updateQueueItem(queue, id, {
      stage: '将在当前请求结束后跳过',
      skipRequested: true,
    })
  }
  return queue
}

export function retryQueueItem(
  queue: RecognitionQueueItem[],
  id: string,
): RecognitionQueueItem[] {
  const selected = queue.find((item) => item.id === id)
  if (!selected || selected.status !== 'failed') return queue
  return updateQueueItem(queue, id, {
    status: 'queued',
    stage: '等待识别',
    result: null,
    reviewHints: null,
    error: '',
    skipRequested: false,
  })
}

export function removeQueueItem(
  queue: RecognitionQueueItem[],
  id: string,
): RecognitionQueueItem[] {
  const selected = queue.find((item) => item.id === id)
  if (!selected || selected.status === 'preparing' || selected.status === 'recognizing') return queue
  return queue.filter((item) => item.id !== id)
}

export function getQueueStats(queue: RecognitionQueueItem[]): RecognitionQueueStats {
  return {
    active: queue.filter((item) => item.status === 'preparing' || item.status === 'recognizing').length,
    queued: queue.filter((item) => item.status === 'queued').length,
    ready: queue.filter((item) => item.status === 'ready').length,
    failed: queue.filter((item) => item.status === 'failed').length,
    total: queue.filter(isUnfinished).length,
  }
}
