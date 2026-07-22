import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { normalizeApiRecord } from '../miniprogram/domain/inspection-record'
import {
  MAX_HISTORY_RECORDS,
  parseHistory,
  removeHistoryRecord,
  StoredInspectionRecord,
  updateSyncState,
  upsertHistory,
} from '../miniprogram/domain/inspection-history'

const UUID = '550e8400-e29b-41d4-a716-446655440000'

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
    clientRecordId: `${UUID.slice(0, -4)}${String(index).padStart(4, '0')}`,
    sourceType: 'standalone',
    taskId: null,
    itemId: null,
    imagePath: `/saved/${index}.jpg`,
    rawContent: `{"index":${index}}`,
    record: createRecord(`客户${index}`),
    createdAt: index,
    updatedAt: index,
    syncStatus: 'local',
    syncError: '',
  }
}

test('parseHistory rejects malformed local storage', () => {
  assert.deepEqual(parseHistory('broken'), [])
  assert.deepEqual(parseHistory([{ id: 1 }]), [])
})

test('parseHistory migrates v1 records to stable client ids', () => {
  const legacy = {
    id: 'IR-100',
    imagePath: '/saved/100.jpg',
    rawContent: '{}',
    record: createRecord(),
    createdAt: 100,
    updatedAt: 100,
    syncStatus: 'local',
  }
  const records = parseHistory([legacy], () => UUID)
  assert.equal(records[0].clientRecordId, UUID)
  assert.equal(records[0].sourceType, 'standalone')
  assert.equal(records[0].syncStatus, 'local')
  assert.equal(records[0].taskId, null)
  assert.equal(records[0].itemId, null)
})

test('sync transitions preserve local report data', () => {
  const local = createStoredRecord(100)
  const syncing = updateSyncState(
    local,
    { syncStatus: 'syncing', syncError: '' },
    200,
  )
  const failed = updateSyncState(
    syncing,
    { syncStatus: 'failed', syncError: '网络连接失败' },
    300,
  )
  const synced = updateSyncState(
    failed,
    { syncStatus: 'synced', syncError: '', taskId: 8, itemId: 9 },
    400,
  )
  assert.equal(failed.imagePath, local.imagePath)
  assert.equal(failed.record.customer, local.record.customer)
  assert.deepEqual(
    { status: synced.syncStatus, task: synced.taskId, item: synced.itemId },
    { status: 'synced', task: 8, item: 9 },
  )
})

test('parseHistory recovers interrupted syncing records as failed', () => {
  const syncing = { ...createStoredRecord(1), syncStatus: 'syncing' as const }
  const record = parseHistory([syncing], () => UUID)[0]
  assert.equal(record.syncStatus, 'failed')
  assert.equal(record.syncError, '上次同步未完成，请重试')
})

test('upsertHistory adds and sorts a new local record', () => {
  const result = upsertHistory([], {
    imagePath: '/saved/new.jpg',
    rawContent: '{}',
    record: createRecord(),
  }, 200, '', () => UUID)
  assert.equal(result.records[0].id, 'IR-200')
  assert.equal(result.records[0].clientRecordId, UUID)
  assert.equal(result.records[0].syncStatus, 'local')
})

test('upsertHistory updates without changing stable identifiers', () => {
  const existing = createStoredRecord(100)
  const result = upsertHistory([existing], {
    imagePath: '/tmp/replacement.jpg',
    rawContent: '{"updated":true}',
    record: createRecord('已修改客户'),
  }, 300, existing.id, () => 'unused')
  assert.equal(result.records[0].id, existing.id)
  assert.equal(result.records[0].clientRecordId, existing.clientRecordId)
  assert.equal(result.records[0].imagePath, existing.imagePath)
  assert.equal(result.records[0].createdAt, existing.createdAt)
  assert.equal(result.records[0].record.customer, '已修改客户')
})

test('upsertHistory trims beyond thirty and reports images to remove', () => {
  const records = Array.from(
    { length: MAX_HISTORY_RECORDS },
    (_, index) => createStoredRecord(index + 1),
  )
  const result = upsertHistory(records, {
    imagePath: '/saved/new.jpg',
    rawContent: '{}',
    record: createRecord(),
  }, 500, '', () => UUID)
  assert.equal(result.records.length, MAX_HISTORY_RECORDS)
  assert.deepEqual(result.removedImagePaths, ['/saved/1.jpg'])
})

test('removeHistoryRecord returns the deleted image path', () => {
  const existing = createStoredRecord(100)
  const result = removeHistoryRecord([existing], existing.id)
  assert.deepEqual(result.records, [])
  assert.deepEqual(result.removedImagePaths, [existing.imagePath])
})
