import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildInspectionTableExport,
  serializeInspectionTableExport,
} from '../miniprogram/domain/inspection-export'
import { InspectionRecord } from '../miniprogram/domain/inspection-record'

function createRecord(): InspectionRecord {
  return {
    productType: 'steel_brush',
    customer: '客户A',
    supplier: '供应商A',
    trademark: 'BINIC',
    orderNumber: 'SO-001',
    model: '100x20',
    arrivalQuantity: '500',
    inspectionDate: '2026-07-21',
    rows: [{
      id: 'internal-row-id',
      item: '外径',
      requirement: '符合图纸',
      specification: '100±1',
      measurements: ['100.1', '99.9'],
      lowConfidenceFields: ['measurements.2'],
    }],
    sampleJudgements: ['OK', 'NG'],
    notes: '抽检',
    reviewer: '审核人',
    inspector: '检验员',
    lowConfidenceFields: ['customer'],
  }
}

test('buildInspectionTableExport creates a stable single-table contract', () => {
  const exported = buildInspectionTableExport(createRecord(), {
    recordId: 'IR-1000',
    exportedAt: '2026-07-21T02:30:00.000Z',
  })

  assert.equal(exported.schema, 'inspection-table/v1')
  assert.equal(exported.record_id, 'IR-1000')
  assert.equal(exported.exported_at, '2026-07-21T02:30:00.000Z')
  assert.deepEqual(exported.meta, {
    product_type: 'steel_brush',
    customer: '客户A',
    supplier: '供应商A',
    trademark: 'BINIC',
    order_number: 'SO-001',
    model: '100x20',
    arrival_quantity: '500',
    inspection_date: '2026-07-21',
    notes: '抽检',
    reviewer: '审核人',
    inspector: '检验员',
  })
  assert.deepEqual(
    exported.table.columns.map((column) => column.key),
    ['item', 'requirement', 'specification', ...Array.from({ length: 10 }, (_, index) => `sample_${index + 1}`)],
  )
  assert.deepEqual(exported.table.rows[0], {
    item: '外径',
    requirement: '符合图纸',
    specification: '100±1',
    sample_1: '100.1',
    sample_2: '99.9',
    sample_3: '',
    sample_4: '',
    sample_5: '',
    sample_6: '',
    sample_7: '',
    sample_8: '',
    sample_9: '',
    sample_10: '',
  })
  assert.deepEqual(exported.table.rows.at(-1), {
    item: '判定',
    requirement: '',
    specification: '',
    sample_1: 'OK',
    sample_2: 'NG',
    sample_3: '',
    sample_4: '',
    sample_5: '',
    sample_6: '',
    sample_7: '',
    sample_8: '',
    sample_9: '',
    sample_10: '',
  })
})

test('serializeInspectionTableExport emits readable JSON without internal fields', () => {
  const exported = buildInspectionTableExport(createRecord(), {
    recordId: '',
    exportedAt: '2026-07-21T02:30:00.000Z',
  })
  const json = serializeInspectionTableExport(exported)

  assert.equal(exported.record_id, null)
  assert.equal(json, `${JSON.stringify(exported, null, 2)}\n`)
  assert.equal(json.includes('internal-row-id'), false)
  assert.equal(json.includes('lowConfidenceFields'), false)
})
