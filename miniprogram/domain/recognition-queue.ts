import { InspectionRecord } from './inspection-record'
import {
  RecognitionConfidencePayload,
  RecognitionReviewHints,
} from './recognition-review'

export const MAX_RECOGNITION_QUEUE_SIZE = 10

export type RecognitionQueueStatus =
  | 'queued'
  | 'preparing'
  | 'recognizing'
  | 'ready'
  | 'failed'
  | 'skipped'

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
  return queue.map((item) => item.id === id ? { ...item, ...update } : item)
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
