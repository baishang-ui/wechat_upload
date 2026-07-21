import test from 'node:test'
import assert from 'node:assert/strict'

import {
  createMockRecord,
  normalizeApiRecord,
  normalizeTenValues,
  updateMeasurement,
  updateSampleJudgement,
  validateRecord,
} from '../miniprogram/domain/inspection-record'

function createCompleteRecord() {
  return normalizeApiRecord({
    report_title: '钢丝刷检验记录单',
    customer: '客户A',
    supplier: '供应商A',
    model_spec: '100x20',
    inspection_date: '2026-07-21',
    items: [{ name: '材质', standard: '图纸要求', specification: '钢丝', measurements: ['OK', 'OK', 'OK'] }],
    sample_judgements: ['OK', 'OK', 'OK'],
  })
}

test('normalizeTenValues pads and truncates values to ten entries', () => {
  assert.deepEqual(normalizeTenValues(['1', '2']), ['1', '2', '', '', '', '', '', '', '', ''])
  assert.deepEqual(
    normalizeTenValues(Array.from({ length: 12 }, (_, index) => String(index))),
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  )
})

test('createMockRecord creates an empty ten-sample form state', () => {
  const record = createMockRecord()
  assert.equal(record.rows.length, 0)
  assert.equal(record.sampleJudgements.length, 10)
})

test('updateMeasurement changes one cell without mutating the source record', () => {
  const record = createCompleteRecord()
  const updated = updateMeasurement(record, 0, 2, '0.26')

  assert.equal(record.rows[0].measurements[2], 'OK')
  assert.equal(updated.rows[0].measurements[2], '0.26')
  assert.notEqual(updated, record)
  assert.notEqual(updated.rows[0], record.rows[0])
})

test('updateSampleJudgement changes one sample result immutably', () => {
  const record = createCompleteRecord()
  const updated = updateSampleJudgement(record, 1, 'NG')

  assert.equal(record.sampleJudgements[1], 'OK')
  assert.equal(updated.sampleJudgements[1], 'NG')
})

test('validateRecord reports required fields and accepts a complete record', () => {
  const record = createCompleteRecord()
  assert.deepEqual(validateRecord(record), [])
  assert.deepEqual(validateRecord({ ...record, customer: '', model: '' }), ['客户', '型号/规格'])
})
