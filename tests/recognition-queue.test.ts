import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { createMockRecord } from '../miniprogram/domain/inspection-record'
import {
  appendRecognitionQueue,
  claimQueuedRecognitionItems,
  completeQueueItem,
  createRecognitionQueueItem,
  failQueueItem,
  getNextQueuedItem,
  getRecognitionProgress,
  getTimedRecognitionProgress,
  getQueueStats,
  RECOGNITION_PROGRESS_DURATION_MS,
  markQueueItemActive,
  markQueueItemRecognizing,
  MAX_CONCURRENT_RECOGNITIONS,
  removeQueueItem,
  requestQueueItemSkip,
  retryQueueItem,
  updateQueueItem,
} from '../miniprogram/domain/recognition-queue'
import { createEmptyReviewHints, normalizeRecognitionConfidence } from '../miniprogram/domain/recognition-review'

function item(id: string, createdAt: number, sourceType: 'standalone' | 'purchase_order' = 'standalone') {
  return createRecognitionQueueItem({
    id,
    imagePath: `/tmp/${id}.jpg`,
    createdAt,
    sourceType,
    taskId: sourceType === 'purchase_order' ? 8 : null,
    itemId: sourceType === 'purchase_order' ? 9 : null,
    taskPrefill: sourceType === 'purchase_order' ? createMockRecord() : null,
  })
}

test('queue appends in order and caps unfinished tasks at ten', () => {
  const inputs = Array.from({ length: 12 }, (_, index) => item(`q${index}`, index))
  const queue = appendRecognitionQueue([], inputs)
  assert.equal(queue.length, 10)
  assert.deepEqual(queue.map((entry) => entry.id), inputs.slice(0, 10).map((entry) => entry.id))
})

test('queue claims the first two queued items and leaves later items waiting', () => {
  const queue = [item('first', 1), item('second', 2), item('third', 3)]
  const claimed = claimQueuedRecognitionItems(queue)

  assert.equal(MAX_CONCURRENT_RECOGNITIONS, 2)
  assert.deepEqual(claimed.claimed.map((entry) => entry.id), ['first', 'second'])
  assert.deepEqual(
    claimed.queue.map((entry) => entry.status),
    ['preparing', 'preparing', 'queued'],
  )
  assert.equal(getQueueStats(claimed.queue).active, 2)
})

test('queue fills exactly one released recognition slot', () => {
  const initial = claimQueuedRecognitionItems([
    item('first', 1),
    item('second', 2),
    item('third', 3),
  ])
  const released = failQueueItem(initial.queue, 'first', 'network')
  const replenished = claimQueuedRecognitionItems(released)

  assert.deepEqual(replenished.claimed.map((entry) => entry.id), ['third'])
  assert.deepEqual(
    replenished.queue.map((entry) => entry.status),
    ['failed', 'preparing', 'preparing'],
  )
})

test('markQueueItemActive respects a configurable concurrency cap', () => {
  const queue = [item('first', 1), item('second', 2)]
  const first = markQueueItemActive(queue, 'first', 1)
  const blocked = markQueueItemActive(first, 'second', 1)

  assert.deepEqual(blocked.map((entry) => entry.status), ['preparing', 'queued'])
})

test('failed items do not block the next queued item and retry reuses the id', () => {
  const queue = [item('first', 1), item('second', 2)]
  const failed = failQueueItem(markQueueItemActive(queue, 'first'), 'first', 'network')
  assert.equal(getNextQueuedItem(failed)?.id, 'second')
  const retried = retryQueueItem(failed, 'first')
  const first = retried.find((entry) => entry.id === 'first')
  assert.equal(first?.id, 'first')
  assert.equal(first?.status, 'queued')
  assert.equal(first?.error, '')
})

test('completion stores result and review hints', () => {
  const queue = markQueueItemRecognizing(markQueueItemActive([item('first', 1)], 'first'), 'first')
  const result = {
    imageId: 'image-1',
    rawContent: '{}',
    record: createMockRecord(),
    confidence: normalizeRecognitionConfidence(undefined, 1),
  }
  const completed = completeQueueItem(queue, 'first', result, createEmptyReviewHints())
  assert.equal(completed[0].status, 'ready')
  assert.equal(completed[0].result?.imageId, 'image-1')
})

test('skip marks active work for discard and removes queued work immediately', () => {
  const queue = [item('active', 1), item('queued', 2)]
  const active = markQueueItemActive(queue, 'active')
  const requested = requestQueueItemSkip(active, 'active')
  assert.equal(requested[0].skipRequested, true)
  const removed = requestQueueItemSkip(requested, 'queued')
  assert.equal(removed.find((entry) => entry.id === 'queued')?.status, 'skipped')
})

test('purchase context is copied when the queue item is created', () => {
  const prefill = createMockRecord()
  prefill.customer = '原客户'
  const queued = createRecognitionQueueItem({
    id: 'purchase',
    imagePath: '/tmp/purchase.jpg',
    createdAt: 1,
    sourceType: 'purchase_order',
    taskId: 8,
    itemId: 9,
    taskPrefill: prefill,
  })
  prefill.customer = '后来修改'
  assert.equal(queued.taskId, 8)
  assert.equal(queued.itemId, 9)
  assert.equal(queued.taskPrefill?.customer, '原客户')
})

test('stats and removal reflect active ready and failed items', () => {
  let queue = [item('active', 1), item('ready', 2), item('failed', 3), item('queued', 4)]
  queue = markQueueItemActive(queue, 'active')
  queue = completeQueueItem(queue, 'ready', {
    imageId: 'image-2',
    rawContent: '{}',
    record: createMockRecord(),
    confidence: normalizeRecognitionConfidence(undefined, 1),
  }, createEmptyReviewHints())
  queue = failQueueItem(queue, 'failed', 'bad')
  assert.deepEqual(getQueueStats(queue), { active: 1, queued: 1, ready: 1, failed: 1, total: 4 })
  assert.equal(removeQueueItem(queue, 'ready').length, 3)
  assert.equal(removeQueueItem(queue, 'active').length, 4)
})


test('timed recognition progress starts slowly and accelerates within six seconds', () => {
  assert.equal(RECOGNITION_PROGRESS_DURATION_MS, 6_000)
  assert.equal(getTimedRecognitionProgress(-1), 8)
  assert.equal(getTimedRecognitionProgress(0), 8)
  assert.equal(getTimedRecognitionProgress(750), 12)
  assert.equal(getTimedRecognitionProgress(1_500), 15)
  assert.equal(getTimedRecognitionProgress(2_250), 24)
  assert.equal(getTimedRecognitionProgress(3_000), 32)
  assert.equal(getTimedRecognitionProgress(3_750), 47)
  assert.equal(getTimedRecognitionProgress(4_500), 62)
  assert.equal(getTimedRecognitionProgress(5_250), 77)
  assert.equal(getTimedRecognitionProgress(6_000), 92)
  assert.equal(getTimedRecognitionProgress(12_000), 92)
})

test('timed recognition progress scales checkpoints for a custom duration', () => {
  assert.equal(getTimedRecognitionProgress(3_000, 12_000), 15)
  assert.equal(getTimedRecognitionProgress(6_000, 12_000), 32)
  assert.equal(getTimedRecognitionProgress(9_000, 12_000), 62)
  assert.equal(getTimedRecognitionProgress(12_000, 12_000), 92)
})

test('recognition progress preserves timer updates across status transitions', () => {
  let queue = [item('progress', 1)]
  assert.equal(getRecognitionProgress('queued'), 0)
  assert.equal(queue[0].progress, 0)

  queue = markQueueItemActive(queue, 'progress')
  assert.equal(queue[0].progress, 8)
  queue = updateQueueItem(queue, 'progress', { progress: 40 })
  assert.equal(queue[0].progress, 40)
  queue = markQueueItemRecognizing(queue, 'progress')
  assert.equal(queue[0].progress, 40)
  queue = failQueueItem(queue, 'progress', 'network')
  assert.equal(queue[0].progress, 40)
  queue = retryQueueItem(queue, 'progress')
  assert.equal(queue[0].progress, 0)
})

test('completed recognition progress reaches one hundred immediately', () => {
  let queue = markQueueItemRecognizing(markQueueItemActive([item('done', 1)], 'done'), 'done')
  queue = updateQueueItem(queue, 'done', { progress: 55 })
  queue = completeQueueItem(queue, 'done', {
    imageId: 'image-done',
    rawContent: '{}',
    record: createMockRecord(),
    confidence: normalizeRecognitionConfidence(undefined, 1),
  }, createEmptyReviewHints())
  assert.equal(queue[0].progress, 100)
})
