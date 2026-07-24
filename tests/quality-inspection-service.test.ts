import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { normalizeApiRecord } from '../miniprogram/domain/inspection-record'
import {
  createStandaloneInspection,
  draftToInspectionRecord,
  inspectionRecordToDraft,
  getInspectionItemDetail,
  recognizeInspectionFile,
  saveInspectionDraft,
  uploadInspectionRowImage,
  QualityInspectionDraftPayload,
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
  const record = {
    ...createCompleteRecord(),
    inspectionDate: '2016.6.24',
  }
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
  assert.equal(draft.ai_workbench_result.inspection_date, '2016-06-24')
  assert.equal(draft.record_merge_mode, 'replace')
  assert.equal(
    inspectionRecordToDraft(record, [], 'matched_only').record_merge_mode,
    'matched_only',
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
  const record = {
    ...createCompleteRecord(),
    inspectionDate: '2016.6.24',
  }
  await createStandaloneInspection(
    '550e8400-e29b-41d4-a716-446655440000',
    record,
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
  assert.equal(
    (calls[0].data as Record<string, unknown>).inspection_date,
    '2016-06-24',
  )
})

test('database-bound serializers reject invalid dates before a request', async () => {
  const record = {
    ...createCompleteRecord(),
    inspectionDate: '2026-02-30',
  }
  const calls: Array<Record<string, unknown>> = []
  const request = async <T>(options: Record<string, unknown>): Promise<T> => {
    calls.push(options)
    return {} as T
  }

  assert.throws(
    () => inspectionRecordToDraft(record),
    /检验日期格式应为 YYYY-MM-DD/,
  )
  assert.throws(
    () => createStandaloneInspection(
      '550e8400-e29b-41d4-a716-446655440000',
      record,
      request,
    ),
    /检验日期格式应为 YYYY-MM-DD/,
  )
  assert.equal(calls.length, 0)
})

test('getInspectionItemDetail loads the online product context endpoint', async () => {
  const calls: Array<Record<string, unknown>> = []
  const request = async <T>(options: Record<string, unknown>): Promise<T> => {
    calls.push(options)
    return {
      task: { id: 12 },
      item: { id: 34 },
      master_product: {},
      customer_product: {},
    } as T
  }

  const detail = await getInspectionItemDetail(12, 34, request)

  assert.deepEqual(calls[0], {
    method: 'GET',
    path: '/customer-orders/api/purchase-orders/quality-inspections/12/items/34',
  })
  assert.equal(detail.item.id, 34)
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
  let savedPayload: QualityInspectionDraftPayload | null = null
  const result = await syncStoredInspection(createSyncRecord(), {
    createStandalone: async () => {
      calls.push('create')
      return { task_id: 20, item_id: 21, task: { id: 20 } }
    },
    saveDraft: async (_taskId, _itemId, payload) => {
      calls.push('draft')
      savedPayload = payload
    },
    updateState: async (record) => record,
    imageToDataUrl: async () => 'data:image/jpeg;base64,YQ==',
  })
  assert.deepEqual(calls, ['create', 'draft'])
  assert.equal(result.syncStatus, 'synced')
  assert.equal(result.taskId, 20)
  assert.equal(result.itemId, 21)
  assert.equal(savedPayload?.record_merge_mode, 'replace')
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
  let savedPayload: QualityInspectionDraftPayload | null = null
  await syncStoredInspection(createSyncRecord('purchase_order'), {
    createStandalone: async () => {
      calls.push('create')
      return { task_id: 0, item_id: 0, task: { id: 0 } }
    },
    saveDraft: async (taskId, itemId, payload) => {
      calls.push(`draft:${taskId}:${itemId}`)
      savedPayload = payload
    },
    updateState: async (record) => record,
    imageToDataUrl: async () => 'data:image/jpeg;base64,YQ==',
  })
  assert.deepEqual(calls, ['draft:30:31'])
  assert.equal(savedPayload?.record_merge_mode, 'matched_only')
})

test('purchase-order zero-match response remains a failed local sync with context intact', async () => {
  const { syncStoredInspection } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const local = createSyncRecord('purchase_order')
  const error = Object.assign(
    new Error('识别结果中没有与所选物料质检项目匹配的数据'),
    { statusCode: 422 },
  )
  const result = await syncStoredInspection(local, {
    createStandalone: async () => ({ task_id: 0, item_id: 0, task: { id: 0 } }),
    saveDraft: async () => { throw error },
    updateState: async (record) => record,
    imageToDataUrl: async () => 'data:image/jpeg;base64,YQ==',
  })
  assert.equal(result.syncStatus, 'failed')
  assert.equal(result.syncError, error.message)
  assert.equal(result.taskId, local.taskId)
  assert.equal(result.itemId, local.itemId)
  assert.equal(result.imagePath, local.imagePath)
  assert.deepEqual(result.record, local.record)
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
    thumbnail_image: 'data:image/jpeg;base64,dGh1bWI=',
  }
  const merged = mergeInspectionHistory([local], [remote])
  assert.equal(merged.length, 1)
  assert.equal(merged[0].origin, 'remote')
  assert.equal(merged[0].imagePath, remote.thumbnail_image)
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

test('synced inspection date updates the cached task card and item draft', () => {
  const {
    applyInspectionDateToTaskItems,
    inspectionRecordToDraft,
  getInspectionItemDetail,
  } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const tasks = [
    {
      id: 10,
      signed_date: '2026-07-23',
      items: [{
        id: 11,
        inspection_draft: inspectionRecordToDraft({
          ...createCompleteRecord(),
          inspectionDate: '2026-07-23',
        }),
      }],
    },
    {
      id: 20,
      signed_date: '2026-07-01',
      items: [{ id: 21 }],
    },
  ]

  const updated = applyInspectionDateToTaskItems(tasks, 10, 11, '2026-07-22')

  assert.equal(updated[0].signed_date, '2026-07-22')
  assert.equal(
    updated[0].items?.[0].inspection_draft?.ai_workbench_result.inspection_date,
    '2026-07-22',
  )
  assert.equal(updated[1], tasks[1])
  assert.equal(tasks[0].signed_date, '2026-07-23')
  assert.equal(
    tasks[0].items?.[0].inspection_draft?.ai_workbench_result.inspection_date,
    '2026-07-23',
  )
})

test('deleteRemoteInspectionRecord uses the item record DELETE endpoint', async () => {
  const { deleteRemoteInspectionRecord } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const calls: Array<Record<string, unknown>> = []
  const request = async <T>(options: Record<string, unknown>): Promise<T> => {
    calls.push(options)
    return {
      task_id: 12,
      item_id: 34,
      deleted_scope: 'record',
    } as T
  }

  const result = await deleteRemoteInspectionRecord(12, 34, request)

  assert.deepEqual(calls[0], {
    method: 'DELETE',
    path: '/customer-orders/api/purchase-orders/quality-inspections/12/items/34/record',
  })
  assert.equal(result.deleted_scope, 'record')
})

test('inspection history refresh policy caches normal visits for thirty seconds', () => {
  const {
    HISTORY_REFRESH_TTL_MS,
    shouldQueueInspectionHistoryRefresh,
    shouldRefreshInspectionHistory,
  } = require('../miniprogram/services/quality-inspection-service') as typeof import('../miniprogram/services/quality-inspection-service')
  const now = 1_000_000

  assert.equal(HISTORY_REFRESH_TTL_MS, 30_000)
  assert.equal(shouldRefreshInspectionHistory(0, now), true)
  assert.equal(shouldRefreshInspectionHistory(now - 29_999, now), false)
  assert.equal(shouldRefreshInspectionHistory(now - 30_000, now), true)
  assert.equal(shouldRefreshInspectionHistory(now - 1_000, now, true), true)
  assert.equal(shouldQueueInspectionHistoryRefresh(true, true, false), true)
  assert.equal(shouldQueueInspectionHistoryRefresh(true, true, true), false)
  assert.equal(shouldQueueInspectionHistoryRefresh(true, false, false), false)
  assert.equal(shouldQueueInspectionHistoryRefresh(false, true, false), false)
})


test('uploadInspectionRowImage sends the row context with the multipart file', async () => {
  const calls: Array<Record<string, unknown>> = []
  const result = await uploadInspectionRowImage(
    10,
    11,
    'appearance',
    '/tmp/appearance.jpg',
    async <T>(options: Record<string, unknown>): Promise<T> => {
      calls.push(options)
      return {
        id: 'image-1',
        url: 'https://example.com/appearance.jpg',
      } as T
    },
  )

  assert.equal(calls[0].path, '/api/miniprogram/quality-inspections/images')
  assert.equal(calls[0].filePath, '/tmp/appearance.jpg')
  assert.equal(calls[0].name, 'file')
  assert.deepEqual(calls[0].formData, {
    task_id: '10',
    item_id: '11',
    row_key: 'appearance',
  })
  assert.equal(result.url, 'https://example.com/appearance.jpg')
})
