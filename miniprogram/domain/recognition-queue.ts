import { InspectionRecord } from './inspection-record'
import {
  RecognitionConfidencePayload,
  RecognitionReviewHints,
} from './recognition-review'

export const MAX_RECOGNITION_QUEUE_SIZE = 10
export const RECOGNITION_PROGRESS_DURATION_MS = 6_000
const RECOGNITION_PROGRESS_START = 8
const RECOGNITION_PROGRESS_CEILING = 92
const RECOGNITION_PROGRESS_CHECKPOINTS = [
  { ratio: 0, progress: RECOGNITION_PROGRESS_START },
  { ratio: 0.25, progress: 15 },
  { ratio: 0.5, progress: 32 },
  { ratio: 0.75, progress: 62 },
  { ratio: 1, progress: RECOGNITION_PROGRESS_CEILING },
] as const

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

export function getTimedRecognitionProgress(
  elapsedMs: number,
  durationMs = RECOGNITION_PROGRESS_DURATION_MS,
): number {
  const safeDuration = Math.max(1, durationMs)
  const ratio = Math.min(1, Math.max(0, elapsedMs) / safeDuration)

  for (let index = 1; index < RECOGNITION_PROGRESS_CHECKPOINTS.length; index += 1) {
    const previous = RECOGNITION_PROGRESS_CHECKPOINTS[index - 1]
    const next = RECOGNITION_PROGRESS_CHECKPOINTS[index]
    if (ratio > next.ratio) continue
    const segmentRatio = (ratio - previous.ratio) / (next.ratio - previous.ratio)
    return Math.round(
      previous.progress + (next.progress - previous.progress) * segmentRatio,
    )
  }

  return RECOGNITION_PROGRESS_CEILING
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

function hasActiveItem(queue: RecognitionQueueItem[], exceptId = ''): boolean {
  return queue.some((item) => (
    item.id !== exceptId
    && (item.status === 'preparing' || item.status === 'recognizing')
  ))
}

export function markQueueItemActive(
  queue: RecognitionQueueItem[],
  id: string,
): RecognitionQueueItem[] {
  const selected = queue.find((item) => item.id === id)
  if (!selected || selected.status !== 'queued' || hasActiveItem(queue, id)) return queue
  return updateQueueItem(queue, id, {
    status: 'preparing',
    stage: '正在处理图片',
    error: '',
    skipRequested: false,
  })
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
