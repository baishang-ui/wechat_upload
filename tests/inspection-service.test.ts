import test from 'node:test'
import assert from 'node:assert/strict'

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
