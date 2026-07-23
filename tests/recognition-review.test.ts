import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { normalizeApiRecord } from '../miniprogram/domain/inspection-record'
import {
  buildRecognitionReviewHints,
  hasUnreviewedDanger,
  markReviewHintReviewed,
  normalizeRecognitionConfidence,
} from '../miniprogram/domain/recognition-review'

function record() {
  return normalizeApiRecord({
    report_title: '钢丝刷检验记录单',
    customer: '客户A',
    supplier: '供应商A',
    model_spec: '100x20',
    arrival_quantity: '100 Pcs',
    inspection_date: '2026-07-23',
    items: [{
      name: '材质',
      standard: '按图纸',
      specification: 'A',
      measurements: ['1.0', '1.1'],
    }],
    sample_judgements: ['OK', 'NG'],
  })
}

test('confidence thresholds classify danger warning and normal exactly', () => {
  const confidence = normalizeRecognitionConfidence({
    fields: {
      customer: 0.59,
      supplier: 0.60,
      model_spec: 0.79,
      inspection_date: 0.80,
    },
    items: [{ name: 0.9, standard: 0.9, specification: 0.9, measurements: [0.9, 0.9] }],
    sample_judgements: [0.9, 0.9],
  }, 1)
  const hints = buildRecognitionReviewHints(record(), confidence)
  assert.equal(hints.fields.customer.level, 'danger')
  assert.equal(hints.fields.supplier.level, 'warning')
  assert.equal(hints.fields.model.level, 'warning')
  assert.equal(hints.fields.inspectionDate.level, 'normal')
})

test('deterministic format failures override high model confidence', () => {
  const invalid = {
    ...record(),
    customer: '',
    supplier: '',
    model: '',
    arrivalQuantity: 'many boxes?',
    inspectionDate: 'not-a-date',
    rows: [{
      ...record().rows[0],
      item: '',
      measurements: ['not-number', '', '', '', '', '', '', '', '', ''],
    }],
  }
  const confidence = normalizeRecognitionConfidence({
    fields: {
      customer: 0.99,
      supplier: 0.99,
      model_spec: 0.99,
      arrival_quantity: 0.99,
      inspection_date: 0.99,
    },
    items: [{ name: 0.99, standard: 0.99, specification: 0.99, measurements: [0.99] }],
    sample_judgements: [0.99],
  }, 1)
  const hints = buildRecognitionReviewHints(invalid, confidence)
  assert.equal(hints.fields.customer.level, 'danger')
  assert.equal(hints.fields.supplier.level, 'danger')
  assert.equal(hints.fields.model.level, 'danger')
  assert.equal(hints.fields.arrivalQuantity.level, 'danger')
  assert.equal(hints.fields.inspectionDate.level, 'danger')
  assert.equal(hints.rows[0].item.level, 'danger')
  assert.equal(hints.rows[0].measurements[0].level, 'danger')
})

test('missing confidence is warning when the value format is acceptable', () => {
  const hints = buildRecognitionReviewHints(
    record(),
    normalizeRecognitionConfidence(undefined, 1),
  )
  assert.equal(hints.fields.customer.level, 'warning')
  assert.equal(hints.rows[0].measurements[0].level, 'warning')
  assert.ok(hints.warningCount > 0)
})

test('reviewing a field clears active risk counts while preserving original score', () => {
  const hints = buildRecognitionReviewHints(record(), normalizeRecognitionConfidence({
    fields: { customer: 0.4, supplier: 0.7 },
  }, 1))
  const reviewed = markReviewHintReviewed(hints, 'record.customer')
  assert.equal(reviewed.fields.customer.score, 0.4)
  assert.equal(reviewed.fields.customer.level, 'danger')
  assert.equal(reviewed.fields.customer.reviewed, true)
  assert.equal(reviewed.fields.customer.cssClass, '')
  assert.equal(reviewed.dangerCount, hints.dangerCount - 1)
  assert.equal(hasUnreviewedDanger(reviewed), reviewed.dangerCount > 0)
})

test('row measurements and sample judgements can be marked reviewed by stable path', () => {
  const hints = buildRecognitionReviewHints(record(), normalizeRecognitionConfidence({
    items: [{ measurements: [0.5] }],
    sample_judgements: [0.7],
  }, 1))
  const measurement = markReviewHintReviewed(hints, 'rows.0.measurements.0')
  const judgement = markReviewHintReviewed(measurement, 'sampleJudgements.0')
  assert.equal(judgement.rows[0].measurements[0].reviewed, true)
  assert.equal(judgement.sampleJudgements[0].reviewed, true)
})

function allOneConfidence() {
  return normalizeRecognitionConfidence({
    fields: {
      customer: 1,
      supplier: 1,
      trademark: 1,
      order_number: 1,
      model_spec: 1,
      arrival_quantity: 1,
      inspection_date: 1,
      notes: 1,
      reviewer: 1,
      inspector: 1,
    },
    items: [{
      name: 1,
      standard: 1,
      specification: 1,
      measurements: Array.from({ length: 10 }, () => 1),
    }],
    sample_judgements: Array.from({ length: 10 }, () => 1),
  }, 1)
}

test('flat all-one confidence is treated as uncalibrated and non-empty OCR fields become warning', () => {
  const hints = buildRecognitionReviewHints(record(), allOneConfidence())
  assert.equal(hints.fields.customer.level, 'warning')
  assert.match(hints.fields.customer.reason, /置信度分布失真/)
  assert.equal(hints.fields.trademark.level, 'normal')
})

test('purchase prefill validates matching fields and marks mismatches danger', () => {
  const recognized = record()
  const expected = { ...record(), customer: 'Customer Expected' }
  const mismatched = buildRecognitionReviewHints(recognized, allOneConfidence(), expected)
  assert.equal(mismatched.fields.customer.level, 'danger')
  assert.match(mismatched.fields.customer.reason, /采购任务数据不一致/)

  const matching = buildRecognitionReviewHints(recognized, allOneConfidence(), record())
  assert.equal(matching.fields.customer.level, 'normal')
  assert.equal(matching.fields.model.level, 'normal')
})

test('measurements outside an explicit specification range are danger', () => {
  const source = record()
  source.rows[0] = {
    ...source.rows[0],
    specification: '10-12 mm',
    measurements: ['13', '11', '', '', '', '', '', '', '', ''],
  }
  const hints = buildRecognitionReviewHints(source, allOneConfidence())
  assert.equal(hints.rows[0].measurements[0].level, 'danger')
  assert.match(hints.rows[0].measurements[0].reason, /规格范围/)
  assert.notEqual(hints.rows[0].measurements[1].level, 'danger')
})

test('a judgement with a missing measurement is warning', () => {
  const source = record()
  source.rows[0] = {
    ...source.rows[0],
    measurements: ['1.0', '', '', '', '', '', '', '', '', ''],
  }
  source.sampleJudgements = ['OK', 'OK', '', '', '', '', '', '', '', '']
  const hints = buildRecognitionReviewHints(source, allOneConfidence())
  assert.equal(hints.rows[0].measurements[1].level, 'warning')
  assert.match(hints.rows[0].measurements[1].reason, /判定存在但测量值为空/)
})

test('optional empty fields without scores do not create noisy warnings', () => {
  const source = record()
  source.trademark = ''
  source.notes = ''
  source.reviewer = ''
  const hints = buildRecognitionReviewHints(
    source,
    normalizeRecognitionConfidence(undefined, 1),
  )
  assert.equal(hints.fields.trademark.level, 'normal')
  assert.equal(hints.fields.notes.level, 'normal')
  assert.equal(hints.fields.reviewer.level, 'normal')
})
