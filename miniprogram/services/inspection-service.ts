import {
  InspectionRecord,
  normalizeApiRecord,
  parseModelContent,
  RawApiRecord,
  validateRecord,
} from '../domain/inspection-record'
import {
  normalizeRecognitionConfidence,
  RecognitionConfidencePayload,
} from '../domain/recognition-review'
import {
  MODEL_API_URL,
  MODEL_NAME,
  MODEL_TOKEN_STORAGE_KEY,
  SERVER_UPLOAD_TIMEOUT_MS,
} from '../config/server'

export const MAX_IMAGE_BYTES = 600 * 1024
const COMPRESSION_QUALITIES = [70, 50, 35, 20]

export interface ImageCompressionApi {
  getFileInfo(options: {
    filePath: string
    success: (result: { size: number }) => void
    fail: () => void
  }): void
  compressImage(options: {
    src: string
    quality: number
    success: (result: { tempFilePath: string }) => void
    fail: () => void
  }): void
}

interface VisionTextContent {
  type: 'text'
  text: string
}

interface VisionImageContent {
  type: 'image_url'
  image_url: { url: string }
}

export interface VisionPayload {
  model: string
  messages: Array<{
    role: 'user'
    content: [VisionTextContent, VisionImageContent]
  }>
  max_tokens: number
  temperature: number
}

interface ChatCompletionResponse {
  choices?: Array<{
    message?: { content?: string }
  }>
  detail?: string
  error?: string
}

export interface ModelRequestOptions {
  url: string
  method: 'POST'
  header: Record<string, string>
  data: VisionPayload
  timeout: number
}

export interface ModelTransportResponse {
  statusCode: number
  data: ChatCompletionResponse | string
}

export interface ModelRecognitionAdapter {
  getStorage(key: string): unknown
  readFileAsBase64(filePath: string): Promise<string>
  request(options: ModelRequestOptions): Promise<ModelTransportResponse>
}

export interface RecognizeInspectionResult {
  imageId: string
  rawContent: string
  record: InspectionRecord
  confidence: RecognitionConfidencePayload
}

const RESPONSE_SCHEMA = {
  report_title: '',
  customer: '',
  supplier: '',
  trademark: '',
  order_number: '',
  model_spec: '',
  arrival_quantity: '',
  inspection_date: '',
  items: [{
    name: '',
    standard: '',
    specification: '',
    measurements: ['', '', '', '', '', '', '', '', '', ''],
  }],
  sample_judgements: ['', '', '', '', '', '', '', '', '', ''],
  notes: '',
  reviewer: '',
  inspector: '',
}

const OCR_PROMPT = [
  '你是工业检验报告OCR。自动判断图片方向并识别全部印刷体和手写内容。',
  '严格按照图片中表格的行顺序输出，不得合并、增加或改写检验项目。',
  '判定行不要放入items，必须写入sample_judgements。',
  '只返回严格JSON，不要Markdown或解释。无法确认的内容填写空字符串，不要编造。',
  '每个measurements数组和sample_judgements数组始终保留10项。',
  `字段结构必须完全遵循：${JSON.stringify(RESPONSE_SCHEMA)}`,
].join('')

function getDefaultImageApi(): ImageCompressionApi {
  return {
    getFileInfo: (options) => {
      wx.getFileSystemManager().getFileInfo({
        filePath: options.filePath,
        success: (result) => options.success({ size: result.size }),
        fail: () => options.fail(),
      })
    },
    compressImage: (options) => {
      wx.compressImage({
        src: options.src,
        quality: options.quality,
        success: (result) => options.success({ tempFilePath: result.tempFilePath }),
        fail: () => options.fail(),
      })
    },
  }
}

function getDefaultModelApi(): ModelRecognitionAdapter {
  return {
    getStorage: (key) => wx.getStorageSync(key),
    readFileAsBase64: (filePath) => new Promise((resolve, reject) => {
      wx.getFileSystemManager().readFile({
        filePath,
        encoding: 'base64',
        success: (result) => resolve(String(result.data)),
        fail: () => reject(new Error('无法读取所选图片，请重新拍摄')),
      })
    }),
    request: (options) => new Promise((resolve, reject) => {
      wx.request<ChatCompletionResponse>({
        url: options.url,
        method: options.method,
        header: options.header,
        data: options.data as unknown as WechatMiniprogram.IAnyObject,
        timeout: options.timeout,
        success: (response) => resolve({
          statusCode: response.statusCode,
          data: response.data,
        }),
        fail: reject,
      })
    }),
  }
}

function getImageSize(
  imagePath: string,
  imageApi: ImageCompressionApi,
): Promise<number> {
  return new Promise((resolve, reject) => {
    imageApi.getFileInfo({
      filePath: imagePath,
      success: (result) => resolve(result.size),
      fail: () => reject(new Error('无法获取图片大小，请重新选择')),
    })
  })
}

function compressImage(
  imagePath: string,
  quality: number,
  imageApi: ImageCompressionApi,
): Promise<string> {
  return new Promise((resolve, reject) => {
    imageApi.compressImage({
      src: imagePath,
      quality,
      success: (result) => resolve(result.tempFilePath),
      fail: () => reject(new Error('图片压缩失败，请重新拍摄')),
    })
  })
}

export async function prepareImageForUpload(
  imagePath: string,
  imageApi: ImageCompressionApi = getDefaultImageApi(),
): Promise<string> {
  let preparedPath = imagePath
  let imageSize = await getImageSize(preparedPath, imageApi)
  if (imageSize <= MAX_IMAGE_BYTES) return preparedPath
  for (const quality of COMPRESSION_QUALITIES) {
    preparedPath = await compressImage(preparedPath, quality, imageApi)
    imageSize = await getImageSize(preparedPath, imageApi)
    if (imageSize <= MAX_IMAGE_BYTES) return preparedPath
  }
  throw new Error('图片压缩后仍超过 600 KB，请靠近报告重新拍摄')
}

function getMimeType(imagePath: string): string {
  const normalizedPath = imagePath.toLowerCase()
  if (normalizedPath.endsWith('.png')) return 'image/png'
  if (normalizedPath.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

export function buildVisionPayload(
  base64Image: string,
  mimeType: string,
): VisionPayload {
  return {
    model: MODEL_NAME,
    messages: [{
      role: 'user',
      content: [
        { type: 'text', text: OCR_PROMPT },
        {
          type: 'image_url',
          image_url: { url: `data:${mimeType};base64,${base64Image}` },
        },
      ],
    }],
    max_tokens: 3000,
    temperature: 0,
  }
}

function modelHeaders(modelApi: ModelRecognitionAdapter): Record<string, string> {
  const token = String(modelApi.getStorage(MODEL_TOKEN_STORAGE_KEY) || '').trim()
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

function parseModelResponse(data: ChatCompletionResponse | string): ChatCompletionResponse {
  if (typeof data !== 'string') return data
  try {
    return JSON.parse(data) as ChatCompletionResponse
  } catch {
    return {}
  }
}

async function requestModel(
  payload: VisionPayload,
  modelApi: ModelRecognitionAdapter,
): Promise<string> {
  let response: ModelTransportResponse
  try {
    response = await modelApi.request({
      url: MODEL_API_URL,
      method: 'POST',
      header: modelHeaders(modelApi),
      data: payload,
      timeout: SERVER_UPLOAD_TIMEOUT_MS,
    })
  } catch (error) {
    const message = error instanceof Error
      ? error.message
      : String((error as { errMsg?: unknown } | null)?.errMsg || '')
    throw new Error(message || '连接模型服务失败')
  }
  const data = parseModelResponse(response.data)
  if (response.statusCode < 200 || response.statusCode >= 300) {
    if (response.statusCode === 413) {
      throw new Error('图片请求仍然过大，请重新拍摄')
    }
    throw new Error(data.detail || data.error || `模型服务返回 ${response.statusCode}`)
  }
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('模型未返回识别内容')
  return content
}

export async function recognizeInspection(
  imagePath: string,
  imageApi: ImageCompressionApi = getDefaultImageApi(),
  modelApi: ModelRecognitionAdapter = getDefaultModelApi(),
): Promise<RecognizeInspectionResult> {
  if (!imagePath) throw new Error('请选择检验报告图片')
  const preparedPath = await prepareImageForUpload(imagePath, imageApi)
  const base64Image = await modelApi.readFileAsBase64(preparedPath)
  const rawContent = await requestModel(
    buildVisionPayload(base64Image, getMimeType(preparedPath)),
    modelApi,
  )
  let rawRecord: RawApiRecord
  try {
    rawRecord = parseModelContent(rawContent)
  } catch {
    throw new Error('模型返回内容不是有效 JSON，请重新识别')
  }
  const record = normalizeApiRecord(rawRecord)
  return {
    imageId: `api-image-${Date.now()}`,
    rawContent,
    record,
    confidence: normalizeRecognitionConfidence(undefined, record.rows.length),
  }
}

export async function submitInspection(
  imageId: string,
  record: InspectionRecord,
): Promise<{ recordId: string }> {
  if (!imageId) throw new Error('缺少图片记录')
  const missing = validateRecord(record)
  if (missing.length > 0) throw new Error(`请完善：${missing.join('、')}`)
  return { recordId: `IR-${Date.now()}` }
}
