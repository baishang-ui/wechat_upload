import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeApiRecord } from '../miniprogram/domain/inspection-record'
import {
  MAX_HISTORY_RECORDS,
  parseHistory,
  removeHistoryRecord,
  StoredInspectionRecord,
  upsertHistory,
} from '../miniprogram/domain/inspection-history'

function createRecord(customer = '客户A') {
  return normalizeApiRecord({
    report_title: '钢丝刷检验记录单',
    customer,
    supplier: '供应商A',
    model_spec: '100x20',
    inspection_date: '2026-07-21',
    items: [{ name: '材质', measurements: ['OK'] }],
    sample_judgements: ['OK'],
  })
}

function createStoredRecord(index: number): StoredInspectionRecord {
  return {
    id: `IR-${index}`,
    imagePath: `/saved/${index}.jpg`,
    rawContent: `{"index":${index}}`,
    record: createRecord(`客户${index}`),
    createdAt: index,
    updatedAt: index,
    syncStatus: 'local',
  }
}

test('parseHistory rejects malformed local storage', () => {
  assert.deepEqual(parseHistory('broken'), [])
  assert.deepEqual(parseHistory([{ id: 1 }]), [])
})

test('upsertHistory adds and sorts a new local record', () => {
  const result = upsertHistory([], {
    imagePath: '/saved/new.jpg',
    rawContent: '{}',
    record: createRecord(),
  }, 200)

  assert.equal(result.records[0].id, 'IR-200')
  assert.equal(result.records[0].createdAt, 200)
  assert.equal(result.records[0].updatedAt, 200)
  assert.equal(result.records[0].syncStatus, 'local')
})

test('upsertHistory updates without changing id, image, or created time', () => {
  const existing = createStoredRecord(100)
  const result = upsertHistory([existing], {
    imagePath: '/tmp/replacement.jpg',
    rawContent: '{"updated":true}',
    record: createRecord('已修改客户'),
  }, 300, existing.id)

  assert.equal(result.records[0].id, existing.id)
  assert.equal(result.records[0].imagePath, existing.imagePath)
  assert.equal(result.records[0].createdAt, existing.createdAt)
  assert.equal(result.records[0].updatedAt, 300)
  assert.equal(result.records[0].record.customer, '已修改客户')
})

test('upsertHistory trims beyond thirty and reports images to remove', () => {
  const records = Array.from({ length: MAX_HISTORY_RECORDS }, (_, index) => createStoredRecord(index + 1))
  const result = upsertHistory(records, {
    imagePath: '/saved/new.jpg',
    rawContent: '{}',
    record: createRecord(),
  }, 500)

  assert.equal(result.records.length, MAX_HISTORY_RECORDS)
  assert.equal(result.records[0].id, 'IR-500')
  assert.deepEqual(result.removedImagePaths, ['/saved/1.jpg'])
})

test('removeHistoryRecord returns the deleted image path', () => {
  const existing = createStoredRecord(100)
  const result = removeHistoryRecord([existing], existing.id)

  assert.deepEqual(result.records, [])
  assert.deepEqual(result.removedImagePaths, [existing.imagePath])
})
