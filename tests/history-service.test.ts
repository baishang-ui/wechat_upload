import test from 'node:test'
import assert from 'node:assert/strict'

import { normalizeApiRecord } from '../miniprogram/domain/inspection-record'
import { StoredInspectionRecord } from '../miniprogram/domain/inspection-history'
import {
  deleteInspectionHistory,
  HistoryStorageAdapter,
  loadInspectionHistory,
  saveInspectionHistory,
} from '../miniprogram/services/history-service'

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

function createStoredRecord(): StoredInspectionRecord {
  return {
    id: 'IR-10',
    imagePath: '/saved/existing.jpg',
    rawContent: '{}',
    record: createRecord(),
    createdAt: 10,
    updatedAt: 10,
    syncStatus: 'local',
  }
}

function createAdapter(initial: StoredInspectionRecord[] = []) {
  let storage: unknown = initial
  const savedTemporaryPaths: string[] = []
  const removedPaths: string[] = []
  const adapter: HistoryStorageAdapter & {
    savedTemporaryPaths: string[]
    removedPaths: string[]
  } = {
    savedTemporaryPaths,
    removedPaths,
    getStorage: () => storage,
    setStorage: (records) => { storage = records },
    saveFile: async (temporaryPath) => {
      savedTemporaryPaths.push(temporaryPath)
      return '/saved/report.jpg'
    },
    removeFile: async (filePath) => {
      removedPaths.push(filePath)
    },
  }
  return adapter
}

test('saveInspectionHistory persists a new image and record', async () => {
  const adapter = createAdapter()
  const stored = await saveInspectionHistory({
    imagePath: '/tmp/report.jpg',
    rawContent: '{"result":true}',
    record: createRecord(),
  }, '', adapter, 100)

  assert.equal(stored.imagePath, '/saved/report.jpg')
  assert.deepEqual(adapter.savedTemporaryPaths, ['/tmp/report.jpg'])
  assert.equal(loadInspectionHistory(adapter)[0].id, stored.id)
})

test('saveInspectionHistory updates without saving the image again', async () => {
  const existing = createStoredRecord()
  const adapter = createAdapter([existing])
  const stored = await saveInspectionHistory({
    imagePath: '/tmp/replacement.jpg',
    rawContent: '{"updated":true}',
    record: createRecord('已修改客户'),
  }, existing.id, adapter, 200)

  assert.equal(stored.id, existing.id)
  assert.equal(stored.imagePath, existing.imagePath)
  assert.equal(stored.record.customer, '已修改客户')
  assert.deepEqual(adapter.savedTemporaryPaths, [])
})

test('deleteInspectionHistory removes storage entry and saved image', async () => {
  const existing = createStoredRecord()
  const adapter = createAdapter([existing])

  await deleteInspectionHistory(existing.id, adapter)

  assert.deepEqual(loadInspectionHistory(adapter), [])
  assert.deepEqual(adapter.removedPaths, [existing.imagePath])
})
