import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { normalizeApiRecord } from '../miniprogram/domain/inspection-record'
import {
  HISTORY_STORAGE_KEY,
  LEGACY_HISTORY_STORAGE_KEY,
  StoredInspectionRecord,
} from '../miniprogram/domain/inspection-history'
import {
  deleteInspectionHistory,
  HistoryStorageAdapter,
  loadInspectionHistory,
  markHistoryFailed,
  markHistorySynced,
  markHistorySyncing,
  saveHistorySyncState,
  saveInspectionHistory,
} from '../miniprogram/services/history-service'

const UUID = '550e8400-e29b-41d4-a716-446655440000'

function createRecord(customer = '客户A') {
  return normalizeApiRecord({
    report_title: '钢丝刷检验记录单', customer, supplier: '供应商A',
    model_spec: '100x20', inspection_date: '2026-07-21',
    items: [{ name: '材质', measurements: ['OK'] }], sample_judgements: ['OK'],
  })
}

function createStoredRecord(): StoredInspectionRecord {
  return {
    id: 'IR-10', clientRecordId: UUID, sourceType: 'standalone',
    taskId: null, itemId: null, imagePath: '/saved/existing.jpg',
    rawContent: '{}', record: createRecord(), createdAt: 10, updatedAt: 10,
    syncStatus: 'local', syncError: '',
  }
}

function createAdapter(initial: unknown = []) {
  const storage = new Map<string, unknown>([[HISTORY_STORAGE_KEY, initial]])
  const savedTemporaryPaths: string[] = []
  const removedPaths: string[] = []
  const adapter: HistoryStorageAdapter & {
    storage: Map<string, unknown>
    savedTemporaryPaths: string[]
    removedPaths: string[]
  } = {
    storage, savedTemporaryPaths, removedPaths,
    getStorage: (key) => storage.get(key),
    setStorage: (key, records) => { storage.set(key, records) },
    removeStorage: (key) => { storage.delete(key) },
    createUuid: () => UUID,
    saveFile: async (temporaryPath) => {
      savedTemporaryPaths.push(temporaryPath)
      return '/saved/report.jpg'
    },
    removeFile: async (filePath) => { removedPaths.push(filePath) },
  }
  return adapter
}

test('loadInspectionHistory migrates v1 storage and writes v2', () => {
  const legacy = {
    id: 'IR-1', imagePath: '/saved/1.jpg', rawContent: '{}', record: createRecord(),
    createdAt: 1, updatedAt: 1, syncStatus: 'local',
  }
  const adapter = createAdapter()
  adapter.storage.delete(HISTORY_STORAGE_KEY)
  adapter.storage.set(LEGACY_HISTORY_STORAGE_KEY, [legacy])
  const records = loadInspectionHistory(adapter)
  assert.equal(records[0].clientRecordId, UUID)
  assert.deepEqual(adapter.storage.get(HISTORY_STORAGE_KEY), records)
  assert.equal(adapter.storage.has(LEGACY_HISTORY_STORAGE_KEY), true)
})

test('saveInspectionHistory persists a new image and stable record', async () => {
  const adapter = createAdapter()
  const stored = await saveInspectionHistory({
    imagePath: '/tmp/report.jpg', rawContent: '{"result":true}', record: createRecord(),
  }, '', adapter, 100)
  assert.equal(stored.imagePath, '/saved/report.jpg')
  assert.equal(stored.clientRecordId, UUID)
  assert.deepEqual(adapter.savedTemporaryPaths, ['/tmp/report.jpg'])
})



test('saveInspectionHistory supports a server-backed record without a local image', async () => {
  const adapter = createAdapter()
  const stored = await saveInspectionHistory({
    imagePath: '',
    rawContent: '',
    record: createRecord(),
    sourceType: 'purchase_order',
    taskId: 20,
    itemId: 21,
  }, '', adapter, 150)
  assert.equal(stored.imagePath, '')
  assert.equal(stored.taskId, 20)
  assert.equal(stored.itemId, 21)
  assert.deepEqual(adapter.savedTemporaryPaths, [])
})

test('saveInspectionHistory updates without changing clientRecordId', async () => {
  const existing = createStoredRecord()
  const adapter = createAdapter([existing])
  const stored = await saveInspectionHistory({
    imagePath: '/tmp/replacement.jpg', rawContent: '{"updated":true}',
    record: createRecord('已修改客户'),
  }, existing.id, adapter, 200)
  assert.equal(stored.clientRecordId, existing.clientRecordId)
  assert.equal(stored.imagePath, existing.imagePath)
  assert.deepEqual(adapter.savedTemporaryPaths, [])
})

test('sync helpers update only state and server identifiers', () => {
  const existing = createStoredRecord()
  const adapter = createAdapter([existing])
  markHistorySyncing(existing.id, adapter, 20)
  const failed = markHistoryFailed(existing.id, '网络连接失败', adapter, 30)
  const synced = markHistorySynced(existing.id, 8, 9, adapter, 40)
  assert.equal(failed?.imagePath, existing.imagePath)
  assert.equal(failed?.syncError, '网络连接失败')
  assert.equal(synced?.syncStatus, 'synced')
  assert.equal(synced?.taskId, 8)
  assert.equal(synced?.itemId, 9)
})


test('saveHistorySyncState persists server ids without replacing local report data', () => {
  const existing = createStoredRecord()
  const adapter = createAdapter([existing])
  const updated = saveHistorySyncState({
    ...existing,
    taskId: 20,
    itemId: 21,
    syncStatus: 'syncing',
    syncError: '',
    record: createRecord('不应覆盖'),
    imagePath: '/other.jpg',
    updatedAt: 50,
  }, adapter)
  assert.equal(updated?.taskId, 20)
  assert.equal(updated?.itemId, 21)
  assert.equal(updated?.record.customer, existing.record.customer)
  assert.equal(updated?.imagePath, existing.imagePath)
})

test('deleteInspectionHistory removes failed record image', async () => {
  const existing = { ...createStoredRecord(), syncStatus: 'failed' as const }
  const adapter = createAdapter([existing])
  await deleteInspectionHistory(existing.id, adapter)
  assert.deepEqual(loadInspectionHistory(adapter), [])
  assert.deepEqual(adapter.removedPaths, [existing.imagePath])
})
