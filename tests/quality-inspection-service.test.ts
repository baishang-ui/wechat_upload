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
