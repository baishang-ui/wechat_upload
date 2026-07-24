import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { normalizeApiRecord } from '../miniprogram/domain/inspection-record'
import {
  MODEL_API_URL,
  MODEL_NAME,
  MODEL_TOKEN_STORAGE_KEY,
  SERVER_UPLOAD_TIMEOUT_MS,
} from '../miniprogram/config/server'
import {
  MAX_IMAGE_BYTES,
  ModelRecognitionAdapter,
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


test('recognizeInspection calls the configured model endpoint directly', async () => {
  const imageApi = createImageApi({ '/tmp/report.jpg': 100 })
  const calls: Array<Record<string, unknown>> = []
  const storageKeys: string[] = []
  const modelApi: ModelRecognitionAdapter = {
    getStorage(key) {
      storageKeys.push(key)
      return 'model-secret'
    },
    readFileAsBase64: async (filePath) => {
      assert.equal(filePath, '/tmp/report.jpg')
      return 'encoded-image'
    },
    request: async (options) => {
      calls.push(options as unknown as Record<string, unknown>)
      return {
        statusCode: 200,
        data: {
          choices: [{
            message: {
              content: JSON.stringify({
                report_title: '钢丝刷检验记录单',
                customer: '客户A',
                supplier: '供应商A',
                model_spec: '100x20',
                inspection_date: '2026-07-22',
                items: [{ name: '材质', measurements: ['OK'] }],
                sample_judgements: ['OK'],
              }),
            },
          }],
        },
      }
    },
  }

  const result = await recognizeInspection('/tmp/report.jpg', imageApi, modelApi)
  const call = calls[0]
  const payload = call.data as {
    model: string
    messages: Array<{ content: Array<{ type: string; image_url?: { url: string } }> }>
  }
  assert.deepEqual(storageKeys, [MODEL_TOKEN_STORAGE_KEY])
  assert.equal(call.url, MODEL_API_URL)
  assert.equal(call.method, 'POST')
  assert.equal(call.timeout, SERVER_UPLOAD_TIMEOUT_MS)
  assert.deepEqual(call.header, {
    'Content-Type': 'application/json',
    Authorization: 'Bearer model-secret',
  })
  assert.equal(payload.model, MODEL_NAME)
  assert.equal(
    payload.messages[0].content[1].image_url?.url,
    'data:image/jpeg;base64,encoded-image',
  )
  assert.equal(result.record.customer, '客户A')
  assert.equal(result.confidence.fields.customer, null)
  assert.equal(result.confidence.items[0].measurements.length, 10)
})

test('recognizeInspection omits authorization when no model token is configured', async () => {
  const imageApi = createImageApi({ '/tmp/report.png': 100 })
  let capturedHeader: Record<string, string> = {}
  const modelApi: ModelRecognitionAdapter = {
    getStorage: () => '',
    readFileAsBase64: async () => 'png-image',
    request: async (options) => {
      capturedHeader = options.header
      return {
        statusCode: 200,
        data: {
          choices: [{ message: { content: '{"report_title":"钢丝刷检验记录单"}' } }],
        },
      }
    },
  }

  await recognizeInspection('/tmp/report.png', imageApi, modelApi)
  assert.deepEqual(capturedHeader, { 'Content-Type': 'application/json' })
})

test('recognizeInspection maps model HTTP and invalid JSON errors', async () => {
  const imageApi = createImageApi({ '/tmp/report.jpg': 100 })
  const failingApi: ModelRecognitionAdapter = {
    getStorage: () => '',
    readFileAsBase64: async () => 'image',
    request: async () => ({ statusCode: 503, data: { detail: '模型维护中' } }),
  }
  await assert.rejects(
    () => recognizeInspection('/tmp/report.jpg', imageApi, failingApi),
    /模型维护中/,
  )

  const invalidApi: ModelRecognitionAdapter = {
    ...failingApi,
    request: async () => ({
      statusCode: 200,
      data: { choices: [{ message: { content: 'not-json' } }] },
    }),
  }
  await assert.rejects(
    () => recognizeInspection('/tmp/report.jpg', imageApi, invalidApi),
    /模型返回内容不是有效 JSON/,
  )
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
