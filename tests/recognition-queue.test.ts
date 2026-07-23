import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { createMockRecord } from '../miniprogram/domain/inspection-record'
import {
  appendRecognitionQueue,
  completeQueueItem,
  createRecognitionQueueItem,
  failQueueItem,
  getNextQueuedItem,
  getRecognitionProgress,
  getQueueStats,
  markQueueItemActive,
  markQueueItemRecognizing,
  removeQueueItem,
  requestQueueItemSkip,
  retryQueueItem,
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

test('queue selects the first queued item and allows only one active item', () => {
  const queue = [item('first', 1), item('second', 2)]
  assert.equal(getNextQueuedItem(queue)?.id, 'first')
  const active = markQueueItemActive(queue, 'first')
  const rejectedSecond = markQueueItemActive(active, 'second')
  assert.equal(rejectedSecond.find((entry) => entry.id === 'first')?.status, 'preparing')
  assert.equal(rejectedSecond.find((entry) => entry.id === 'second')?.status, 'queued')
  const recognizing = markQueueItemRecognizing(active, 'first')
  assert.equal(recognizing[0].status, 'recognizing')
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


test('recognition progress maps every queue status to a stable stage percentage', () => {
  assert.equal(getRecognitionProgress('queued'), 10)
  assert.equal(getRecognitionProgress('preparing'), 35)
  assert.equal(getRecognitionProgress('recognizing'), 70)
  assert.equal(getRecognitionProgress('ready'), 100)
  assert.equal(getRecognitionProgress('failed'), 70)
  assert.equal(getRecognitionProgress('skipped'), 0)
})

test('queue item progress follows every status transition', () => {
  let queue = [item('progress', 1)]
  assert.equal(queue[0].progress, 10)
  queue = markQueueItemActive(queue, 'progress')
  assert.equal(queue[0].progress, 35)
  queue = markQueueItemRecognizing(queue, 'progress')
  assert.equal(queue[0].progress, 70)
  queue = failQueueItem(queue, 'progress', 'network')
  assert.equal(queue[0].progress, 70)
  queue = retryQueueItem(queue, 'progress')
  assert.equal(queue[0].progress, 10)
})
