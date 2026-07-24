import test from 'node:test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { normalizeApiRecord } from '../miniprogram/domain/inspection-record'
import {
  MAX_IMAGE_BYTES,
  prepareImageForUpload,
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

test('recognizeInspection requires an image path before accessing WeChat APIs', async () => {
  await assert.rejects(() => recognizeInspection(''), /请选择检验报告图片/)
})


test('recognizeInspection uploads to the shared backend without direct model credentials', async () => {
  const imageApi = createImageApi({ '/tmp/report.jpg': 100 })
  const calls: Array<Record<string, unknown>> = []
  const upload = async <T>(options: Record<string, unknown>): Promise<T> => {
    calls.push(options)
    return {
      record: {
        report_title: '钢丝刷检验记录单',
        customer: '客户A',
        supplier: '供应商A',
        model_spec: '100x20',
        inspection_date: '2026-07-22',
        items: [{ name: '材质', measurements: ['OK'] }],
        sample_judgements: ['OK'],
      },
      raw_content: '{"report_title":"钢丝刷检验记录单"}',
      confidence: {
        fields: { customer: 0.95 },
        items: [{ measurements: [0.55] }],
        sample_judgements: [0.81],
      },
    } as T
  }
  const result = await recognizeInspection('/tmp/report.jpg', imageApi, upload)
  assert.equal(calls[0].path, '/api/miniprogram/quality-inspections/recognize')
  assert.equal(result.record.customer, '客户A')
  assert.equal(result.confidence.fields.customer, 0.95)
  assert.equal(result.confidence.items[0].measurements[0], 0.55)

  const source = readFileSync(
    resolve('miniprogram/services/inspection-service.ts'),
    'utf8',
  )
  assert.equal(source.includes('8865'), false)
  assert.equal(source.includes('TOKEN_STORAGE_KEY'), false)
  assert.equal(source.includes('Authorization'), false)
  assert.equal(source.includes('wx.getFileInfo('), false)
  assert.equal(source.includes('wx.getFileSystemManager().getFileInfo('), true)
})


test('recognizeInspection accepts a legacy response without confidence', async () => {
  const imageApi = createImageApi({ '/tmp/legacy.jpg': 100 })
  const upload = async <T>(): Promise<T> => ({
    record: {
      report_title: '钢丝刷检验记录单',
      customer: '客户A',
      supplier: '供应商A',
      model_spec: '100x20',
      inspection_date: '2026-07-22',
      items: [{ name: '材质', measurements: ['1.0'] }],
      sample_judgements: ['OK'],
    },
    raw_content: '{}',
  } as T)
  const result = await recognizeInspection('/tmp/legacy.jpg', imageApi, upload)
  assert.equal(result.confidence.fields.customer, null)
  assert.equal(result.confidence.items.length, 1)
  assert.equal(result.confidence.items[0].measurements.length, 10)
})

test('prepareImageForUpload keeps an image already below the request limit', async () => {
  const imageApi = createImageApi({ '/tmp/report.jpg': MAX_IMAGE_BYTES - 1 })

  assert.equal(await prepareImageForUpload('/tmp/report.jpg', imageApi), '/tmp/report.jpg')
  assert.deepEqual(imageApi.qualities, [])
})

test('prepareImageForUpload compresses repeatedly until the image is below 600 KB', async () => {
  const imageApi = createImageApi({
    '/tmp/report.jpg': 1200 * 1024,
    '/tmp/compressed-70.jpg': 780 * 1024,
    '/tmp/compressed-50.jpg': 520 * 1024,
  })

  assert.equal(await prepareImageForUpload('/tmp/report.jpg', imageApi), '/tmp/compressed-50.jpg')
  assert.deepEqual(imageApi.qualities, [70, 50])
})

test('prepareImageForUpload rejects an image that remains too large', async () => {
  const imageApi = createImageApi({
    '/tmp/report.jpg': 1600 * 1024,
    '/tmp/compressed-70.jpg': 1400 * 1024,
    '/tmp/compressed-50.jpg': 1200 * 1024,
    '/tmp/compressed-35.jpg': 1000 * 1024,
    '/tmp/compressed-20.jpg': 800 * 1024,
  })

  await assert.rejects(
    () => prepareImageForUpload('/tmp/report.jpg', imageApi),
    /压缩后仍超过 600 KB/,
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

function createImageApi(sizes: Record<string, number>) {
  const qualities: number[] = []
  return {
    qualities,
    getFileInfo(options: { filePath: string, success: (result: { size: number }) => void }) {
      options.success({ size: sizes[options.filePath] })
    },
    compressImage(options: {
      quality: number
      success: (result: { tempFilePath: string }) => void
    }) {
      qualities.push(options.quality)
      options.success({ tempFilePath: `/tmp/compressed-${options.quality}.jpg` })
    },
  }
}
