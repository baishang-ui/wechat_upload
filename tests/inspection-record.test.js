const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createMockRecord,
  normalizeTenValues,
  updateMeasurement,
  updateSampleJudgement,
  validateRecord,
} = require('../miniprogram/domain/inspection-record')

test('normalizeTenValues pads and truncates values to ten entries', () => {
  assert.deepEqual(normalizeTenValues(['1', '2']), ['1', '2', '', '', '', '', '', '', '', ''])
  assert.deepEqual(
    normalizeTenValues(Array.from({ length: 12 }, (_, index) => String(index))),
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  )
})

test('createMockRecord produces a table matching the ten-sample report layout', () => {
  const record = createMockRecord()

  assert.equal(record.productType, 'steel_brush')
  assert.equal(record.sampleJudgements.length, 10)
  assert.ok(record.rows.length > 0)
  assert.ok(record.rows.every((row) => row.measurements.length === 10))
})

test('updateMeasurement changes one cell without mutating the source record', () => {
  const record = createMockRecord()
  const updated = updateMeasurement(record, 0, 2, '0.26')

  assert.equal(record.rows[0].measurements[2], 'OK')
  assert.equal(updated.rows[0].measurements[2], '0.26')
  assert.notEqual(updated, record)
  assert.notEqual(updated.rows[0], record.rows[0])
})

test('updateSampleJudgement changes one sample result immutably', () => {
  const record = createMockRecord()
  const updated = updateSampleJudgement(record, 1, 'NG')

  assert.equal(record.sampleJudgements[1], 'OK')
  assert.equal(updated.sampleJudgements[1], 'NG')
})

test('validateRecord reports required fields and accepts a complete record', () => {
  const record = createMockRecord()
  assert.deepEqual(validateRecord(record), [])
  assert.deepEqual(validateRecord({ ...record, customer: '', model: '' }), ['客户', '型号/规格'])
})
