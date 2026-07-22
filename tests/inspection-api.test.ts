import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { normalizeApiRecord, parseModelContent } from '../miniprogram/domain/inspection-record.ts'
import { buildVisionPayload } from '../miniprogram/services/inspection-service.ts'

test('parseModelContent accepts JSON inside a markdown fence', () => {
  assert.deepEqual(parseModelContent('```json\n{"report_title":"钢丝刷检验记录单"}\n```'), {
    report_title: '钢丝刷检验记录单',
  })
})

test('normalizeApiRecord maps the model response to the editable ten-sample table', () => {
  const record = normalizeApiRecord({
    report_title: '钢丝刷检验记录单',
    customer: 'SUNDE',
    supplier: '李海玲',
    order_number: '522604017-3',
    model_spec: '100x100x23',
    arrival_quantity: '700',
    inspection_date: '2020.7.7',
    items: [
      { name: '材质', standard: '图纸要求', specification: '高碳钢', measurements: ['OK'] },
      { name: '判定', standard: '', specification: 'OK', measurements: ['OK', 'NG'] },
    ],
    sample_judgements: ['', '', '', '', '', '', '', '', '', ''],
  })

  assert.equal(record.productType, 'steel_brush')
  assert.equal(record.orderNumber, '522604017-3')
  assert.equal(record.rows.length, 1)
  assert.equal(record.rows[0].measurements.length, 10)
  assert.deepEqual(record.sampleJudgements.slice(0, 3), ['OK', 'NG', ''])
})

test('buildVisionPayload sends the report as an OpenAI-compatible image message', () => {
  const payload = buildVisionPayload('abc123', 'image/jpeg')
  const content = payload.messages[0].content

  assert.equal(payload.model, 'qwen35')
  assert.equal(content[1].type, 'image_url')
  assert.equal(content[1].image_url.url, 'data:image/jpeg;base64,abc123')
})
