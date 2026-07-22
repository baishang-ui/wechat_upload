import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { normalizeApiRecord } from '../miniprogram/domain/inspection-record'
import {
  createStandaloneInspection,
  draftToInspectionRecord,
  inspectionRecordToDraft,
  recognizeInspectionFile,
  saveInspectionDraft,
} from '../miniprogram/services/quality-inspection-service'

function createCompleteRecord() {
  return normalizeApiRecord({
    report_title: '钢丝刷检验记录单',
    customer: '客户A',
    supplier: '供应商A',
    trademark: 'BINIC',
    order_number: 'PO-1',
    model_spec: '100x20',
    arrival_quantity: '1000',
    inspection_date: '2026-07-22',
    items: [{
      name: '材质',
      standard: '图纸要求',
      specification: '高碳钢',
      measurements: ['OK', 'OK', 'NG'],
    }],
    sample_judgements: ['OK', 'OK', 'NG'],
    notes: '到货抽检',
    reviewer: '审核员',
    inspector: '检验员',
  })
}

test('inspectionRecordToDraft preserves ten-column rows and miniprogram metadata', () => {
  const record = createCompleteRecord()
  const draft = inspectionRecordToDraft(record)
  assert.equal(draft.inspection_records[0].row_key, record.rows[0].id)
  assert.equal(draft.inspection_records[0].project, record.rows[0].item)
  assert.deepEqual(draft.inspection_records[0].sample_data, record.rows[0].measurements)
  assert.deepEqual(draft.inspection_records[0].measurement_standards, {
    '规格': record.rows[0].specification,
  })
  assert.equal(draft.inspection_records[0].decision, 'NG')
  assert.equal(
    draft.ai_workbench_result.schema_version,
    'miniprogram-inspection/v1',
  )
  assert.deepEqual(
    draft.ai_workbench_result.sample_judgements,
    record.sampleJudgements,
  )
})

test('draftToInspectionRecord restores miniprogram metadata and web draft fallback', () => {
  const record = createCompleteRecord()
  const restored = draftToInspectionRecord(inspectionRecordToDraft(record))
  assert.equal(restored.customer, record.customer)
  assert.equal(restored.rows[0].id, record.rows[0].id)
  assert.deepEqual(restored.sampleJudgements, record.sampleJudgements)

  const webDraft = inspectionRecordToDraft(record)
  webDraft.ai_workbench_result = {}
  const fallback = draftToInspectionRecord(webDraft, {
    customer_name: '任务客户',
    supplier_name: '任务供应商',
    signed_date: '2026-07-20',
  }, {
    material_name: '钢丝刷',
    spec_desc: '80x20',
  })
  assert.equal(fallback.customer, '任务客户')
  assert.equal(fallback.supplier, '任务供应商')
  assert.equal(fallback.model, '80x20')
})



test('draftToInspectionRecord accepts server detail records field', () => {
  const record = createCompleteRecord()
  const outgoing = inspectionRecordToDraft(record)
  const serverDraft = {
    records: outgoing.inspection_records,
    ai_workbench_result: outgoing.ai_workbench_result,
    ai_workbench_images: ['data:image/jpeg;base64,YQ=='],
  }
  const restored = draftToInspectionRecord(serverDraft)
  assert.equal(restored.rows.length, 1)
  assert.equal(restored.rows[0].item, record.rows[0].item)
  assert.deepEqual(restored.rows[0].measurements, record.rows[0].measurements)
})

test('createStandaloneInspection sends stable client id to the standalone endpoint', async () => {
  const calls: Array<Record<string, unknown>> = []
  const request = async <T>(options: Record<string, unknown>): Promise<T> => {
    calls.push(options)
    return {
      task_id: 10,
      item_id: 11,
      task: { id: 10, items: [{ id: 11 }] },
    } as T
  }
  await createStandaloneInspection(
    '550e8400-e29b-41d4-a716-446655440000',
    createCompleteRecord(),
    request,
  )
  assert.equal(
    calls[0].path,
    '/customer-orders/api/quality-inspections/standalone',
  )
  assert.equal(
    (calls[0].data as Record<string, unknown>).client_record_id,
    '550e8400-e29b-41d4-a716-446655440000',
  )
})

test('draft save and recognition use shared backend paths', async () => {
  const requestCalls: Array<Record<string, unknown>> = []
  const uploadCalls: Array<Record<string, unknown>> = []
  const request = async <T>(options: Record<string, unknown>): Promise<T> => {
    requestCalls.push(options)
    return {} as T
  }
  const upload = async <T>(options: Record<string, unknown>): Promise<T> => {
    uploadCalls.push(options)
    return { record: {}, raw_content: '{}' } as T
  }
  await saveInspectionDraft(1, 2, inspectionRecordToDraft(createCompleteRecord()), request)
  await recognizeInspectionFile('/tmp/report.jpg', upload)
  assert.equal(
    requestCalls[0].path,
    '/customer-orders/api/purchase-orders/quality-inspections/1/items/2/draft',
  )
  assert.equal(
    uploadCalls[0].path,
    '/api/miniprogram/quality-inspections/recognize',
  )
})

test('encodeTaskQuery always requests purchase-order tasks for the pending tab', () => {
  const { encodeTaskQuery } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  assert.equal(
    encodeTaskQuery({
      page: 2,
      pageSize: 20,
      search: 'PO-1',
      status: 'pending',
      sourceType: 'purchase_order',
    }),
    'page=2&page_size=20&search=PO-1&status=pending&source_type=purchase_order',
  )
})

test('task item prefill keeps supplier and product values', () => {
  const { taskItemToInspectionRecord } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const task = {
    id: 10,
    customer_name: '客户A',
    supplier_name: '供应商A',
    signed_date: '2026-07-22',
    items: [{
      id: 11,
      material_name: '钢丝刷',
      spec_desc: '100x20',
      quantity: 1000,
      unit: 'Pcs',
    }],
  }
  const record = taskItemToInspectionRecord(task, task.items[0])
  assert.equal(record.customer, task.customer_name)
  assert.equal(record.supplier, task.supplier_name)
  assert.equal(record.model, task.items[0].spec_desc)
  assert.equal(record.arrivalQuantity, String(task.items[0].quantity))
})

function createSyncRecord(sourceType: 'standalone' | 'purchase_order' = 'standalone') {
  return {
    id: 'IR-1',
    clientRecordId: '550e8400-e29b-41d4-a716-446655440000',
    sourceType,
    taskId: sourceType === 'purchase_order' ? 30 : null,
    itemId: sourceType === 'purchase_order' ? 31 : null,
    imagePath: '/saved/report.jpg',
    rawContent: '{}',
    record: createCompleteRecord(),
    createdAt: 1,
    updatedAt: 1,
    syncStatus: 'local' as const,
    syncError: '',
  }
}

test('standalone sync creates once, saves draft, then marks local record synced', async () => {
  const { syncStoredInspection } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const calls: string[] = []
  const result = await syncStoredInspection(createSyncRecord(), {
    createStandalone: async () => {
      calls.push('create')
      return { task_id: 20, item_id: 21, task: { id: 20 } }
    },
    saveDraft: async () => { calls.push('draft') },
    updateState: async (record) => record,
    imageToDataUrl: async () => 'data:image/jpeg;base64,YQ==',
  })
  assert.deepEqual(calls, ['create', 'draft'])
  assert.equal(result.syncStatus, 'synced')
  assert.equal(result.taskId, 20)
  assert.equal(result.itemId, 21)
})

test('failed sync retains ids, image and record for retry', async () => {
  const { syncStoredInspection } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const local = createSyncRecord()
  const result = await syncStoredInspection(local, {
    createStandalone: async () => { throw new Error('网络连接失败') },
    saveDraft: async () => undefined,
    updateState: async (record) => record,
    imageToDataUrl: async () => 'data:image/jpeg;base64,YQ==',
  })
  assert.equal(result.syncStatus, 'failed')
  assert.equal(result.clientRecordId, local.clientRecordId)
  assert.equal(result.imagePath, local.imagePath)
  assert.deepEqual(result.record, local.record)
  assert.equal(result.syncError, '网络连接失败')
})

test('purchase-order sync skips task creation and overwrites selected item draft', async () => {
  const { syncStoredInspection } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const calls: string[] = []
  await syncStoredInspection(createSyncRecord('purchase_order'), {
    createStandalone: async () => {
      calls.push('create')
      return { task_id: 0, item_id: 0, task: { id: 0 } }
    },
    saveDraft: async (taskId, itemId) => { calls.push(`draft:${taskId}:${itemId}`) },
    updateState: async (record) => record,
    imageToDataUrl: async () => 'data:image/jpeg;base64,YQ==',
  })
  assert.deepEqual(calls, ['draft:30:31'])
})

test('merged history deduplicates synced local records by task and item', () => {
  const { mergeInspectionHistory } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const local = {
    ...createSyncRecord(),
    taskId: 10,
    itemId: 11,
    syncStatus: 'synced' as const,
    updatedAt: 100,
  }
  const remote = {
    task_id: 10,
    item_id: 11,
    source_type: 'standalone' as const,
    updated_at: '2026-07-22T12:00:00Z',
    material_name: '钢丝刷',
  }
  const merged = mergeInspectionHistory([local], [remote])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].origin, 'remote')
})

test('merged history keeps failed local records and sorts newest first', () => {
  const { mergeInspectionHistory } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const local = {
    ...createSyncRecord(),
    syncStatus: 'failed' as const,
    syncError: '网络连接失败',
    updatedAt: Date.parse('2026-07-22T13:00:00Z'),
  }
  const remote = {
    task_id: 20,
    item_id: 21,
    source_type: 'purchase_order' as const,
    updated_at: '2026-07-22T12:00:00Z',
    material_name: '钢丝刷',
  }
  const merged = mergeInspectionHistory([local], [remote])
  assert.equal(merged[0].origin, 'local')
  assert.equal(merged[0].syncStatus, 'failed')
})


test('history request explicitly includes all source types', async () => {
  const { listInspectionHistory } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const calls: Array<Record<string, unknown>> = []
  const request = async <T>(options: Record<string, unknown>): Promise<T> => {
    calls.push(options)
    return { items: [], total: 0, page: 2, page_size: 50 } as T
  }
  await listInspectionHistory(2, 50, request)
  assert.equal(
    calls[0].path,
    '/customer-orders/api/purchase-orders/quality-inspections/history-records?page=2&page_size=50&source_type=all',
  )
})

test('sync without a local image preserves existing server draft images', async () => {
  const { syncStoredInspection } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const local = {
    ...createSyncRecord('purchase_order'),
    imagePath: '',
  }
  let uploadedImages: string[] = []
  let imageRead = false
  const result = await syncStoredInspection(local, {
    createStandalone: async () => { throw new Error('不应创建任务') },
    saveDraft: async (_taskId, _itemId, payload) => {
      uploadedImages = payload.ai_workbench_images
    },
    updateState: async (record) => record,
    imageToDataUrl: async () => {
      imageRead = true
      return 'data:image/jpeg;base64,bG9jYWw='
    },
    loadExistingImages: async () => ['data:image/jpeg;base64,c2VydmVy'],
  })
  assert.equal(result.syncStatus, 'synced')
  assert.equal(imageRead, false)
  assert.deepEqual(uploadedImages, ['data:image/jpeg;base64,c2VydmVy'])
})
