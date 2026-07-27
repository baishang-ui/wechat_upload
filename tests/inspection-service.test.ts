import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { normalizeApiRecord } from '../miniprogram/domain/inspection-record'
import {
  ImageCompressionApi,
  MAX_ONLINE_IMAGE_BYTES,
  prepareImageForUpload,
  RecognitionProxyUpload,
  recognizeInspection,
  submitInspection,
} from '../miniprogram/services/inspection-service'

function createCompleteRecord() {
  return normalizeApiRecord({
    report_title: '钢丝刷检验记录单',
    customer: '客户A',
    supplier: '供应商A',
    model_spec: '100x20',
    inspection_date: '2026-07-21',
    items: [{ name: '材质', measurements: ['OK'] }],
    sample_judgements: ['OK'],
  })
}

function createImageApi(sizes: Record<string, number>) {
  const qualities: number[] = []
  const api: ImageCompressionApi = {
    getFileInfo: ({ filePath, success, fail }) => {
      const size = sizes[filePath]
      if (size === undefined) {
        fail()
        return
      }
      success({ size })
    },
    compressImage: ({ quality, success }) => {
      qualities.push(quality)
      success({ tempFilePath: `/tmp/compressed-${quality}.jpg` })
    },
  }
  return { ...api, qualities }
}

test('recognizeInspection requires an image path before accessing WeChat APIs', async () => {
  await assert.rejects(() => recognizeInspection(''), /请选择检验报告图片/)
})

test('recognizeInspection uploads the path prepared for the 5 MB online limit', async () => {
  const uploadedPaths: string[] = []
  const upload: RecognitionProxyUpload = async (filePath) => {
    uploadedPaths.push(filePath)
    return {
      record: {
        report_title: '钢丝刷检验记录单',
        customer: '客户A',
        supplier: '供应商A',
        model_spec: '100x20',
        inspection_date: '2026-07-22',
        items: [{ name: '材质', measurements: ['OK', 'OK', 'NG'] }],
        sample_judgements: ['OK', 'OK', 'NG'],
      },
      raw_content: '{"report_title":"钢丝刷检验记录单"}',
      confidence: {
        fields: { customer: 0.92, supplier: 0.72, model_spec: 0.2 },
        items: [{ name: 0.95, measurements: [0.95, 0.7, 0.2] }],
        sample_judgements: [0.9, 0.65, 0.1],
      },
    }
  }

  const result = await recognizeInspection(
    '/tmp/report.jpg',
    upload,
    async () => '/tmp/compressed-report.jpg',
  )

  assert.deepEqual(uploadedPaths, ['/tmp/compressed-report.jpg'])
  assert.equal(result.rawContent, '{"report_title":"钢丝刷检验记录单"}')
  assert.equal(result.record.customer, '客户A')
  assert.equal(result.confidence.fields.customer, 0.92)
  assert.equal(result.confidence.fields.supplier, 0.72)
  assert.equal(result.confidence.fields.model_spec, 0.2)
  assert.equal(result.confidence.items[0].name, 0.95)
  assert.deepEqual(result.confidence.items[0].measurements.slice(0, 3), [0.95, 0.7, 0.2])
  assert.deepEqual(result.confidence.sample_judgements.slice(0, 3), [0.9, 0.65, 0.1])
  assert.equal(result.confidence.items[0].measurements.length, 10)
})

test('recognizeInspection accepts confidence embedded in the backend record', async () => {
  const upload: RecognitionProxyUpload = async () => ({
    record: {
      report_title: '钢丝刷检验记录单',
      confidence: { fields: { report_title: 0.86 } },
    },
    raw_content: '',
  })

  const result = await recognizeInspection('/tmp/report.png', upload, async (path) => path)

  assert.equal(result.record.productType, 'steel_brush')
  assert.equal(result.confidence.fields.report_title, 0.86)
  assert.match(result.rawContent, /钢丝刷检验记录单/)
})

test('recognizeInspection propagates backend proxy errors and rejects invalid proxy data', async () => {
  const failingUpload: RecognitionProxyUpload = async () => {
    throw new Error('模型维护中')
  }
  await assert.rejects(
    () => recognizeInspection('/tmp/report.jpg', failingUpload, async (path) => path),
    /模型维护中/,
  )

  const invalidUpload: RecognitionProxyUpload = async () => ({
    record: null as never,
    raw_content: 'not-json',
  })
  await assert.rejects(
    () => recognizeInspection('/tmp/report.jpg', invalidUpload, async (path) => path),
    /识别服务返回内容不是有效 JSON/,
  )
})

test('prepareImageForUpload keeps images at or below 5 MB unchanged', async () => {
  const imageApi = createImageApi({
    '/tmp/report.jpg': MAX_ONLINE_IMAGE_BYTES,
  })

  assert.equal(
    await prepareImageForUpload('/tmp/report.jpg', imageApi),
    '/tmp/report.jpg',
  )
  assert.deepEqual(imageApi.qualities, [])
})

test('prepareImageForUpload compresses images larger than 5 MB until they are below the limit', async () => {
  const imageApi = createImageApi({
    '/tmp/report.jpg': MAX_ONLINE_IMAGE_BYTES + 1,
    '/tmp/compressed-80.jpg': MAX_ONLINE_IMAGE_BYTES + 20_000,
    '/tmp/compressed-65.jpg': MAX_ONLINE_IMAGE_BYTES - 1,
  })

  assert.equal(
    await prepareImageForUpload('/tmp/report.jpg', imageApi),
    '/tmp/compressed-65.jpg',
  )
  assert.deepEqual(imageApi.qualities, [80, 65])
})

test('prepareImageForUpload rejects an image that cannot be compressed below 5 MB', async () => {
  const sizes: Record<string, number> = {
    '/tmp/report.jpg': MAX_ONLINE_IMAGE_BYTES + 1,
  }
  for (const quality of [80, 65, 50, 35, 20, 10]) {
    sizes[`/tmp/compressed-${quality}.jpg`] = MAX_ONLINE_IMAGE_BYTES + 1
  }
  const imageApi = createImageApi(sizes)

  await assert.rejects(
    () => prepareImageForUpload('/tmp/report.jpg', imageApi),
    /压缩后仍超过 5 MB/,
  )
})

test('submitInspection rejects incomplete records', async () => {
  await assert.rejects(
    () => submitInspection('api-image-1', { ...createCompleteRecord(), customer: '' }),
    /请完善：客户/,
  )
})

test('submitInspection confirms a complete editable record', async () => {
  const result = await submitInspection('api-image-1', createCompleteRecord())
  assert.match(result.recordId, /^IR-/)
})
