import {
  InspectionRecord,
  normalizeApiRecord,
  parseModelContent,
  RawApiRecord,
  validateRecord,
} from '../domain/inspection-record'

const API_URL = 'http://www.binictools.cn:8865/api/llm/v1/chat/completions'
const MODEL_NAME = 'qwen35'
const TOKEN_STORAGE_KEY = 'llmApiToken'
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
  model?: string
  choices?: Array<{
    message?: { content?: string }
    finish_reason?: string
  }>
  detail?: string
}

export interface RecognizeInspectionResult {
  imageId: string
  rawContent: string
  record: InspectionRecord
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

export function buildVisionPayload(base64Image: string, mimeType: string): VisionPayload {
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

function getMimeType(imagePath: string): string {
  const normalizedPath = imagePath.toLowerCase()
  if (normalizedPath.endsWith('.png')) return 'image/png'
  if (normalizedPath.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

function getDefaultImageApi(): ImageCompressionApi {
  return {
    getFileInfo: (options) => {
      wx.getFileInfo({
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

function getImageSize(imagePath: string, imageApi: ImageCompressionApi): Promise<number> {
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

function readImageAsBase64(imagePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.getFileSystemManager().readFile({
      filePath: imagePath,
      encoding: 'base64',
      success: (result) => resolve(String(result.data)),
      fail: () => reject(new Error('无法读取所选图片，请重新拍摄')),
    })
  })
}

function buildHeaders(): Record<string, string> {
  const token = String(wx.getStorageSync(TOKEN_STORAGE_KEY) || '').trim()
  return token
    ? { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
    : { 'Content-Type': 'application/json' }
}

function requestModel(payload: VisionPayload): Promise<string> {
  return new Promise((resolve, reject) => {
    wx.request<ChatCompletionResponse>({
      url: API_URL,
      method: 'POST',
      header: buildHeaders(),
      data: payload,
      timeout: 120000,
      success: (response) => {
        if (response.statusCode < 200 || response.statusCode >= 300) {
          if (response.statusCode === 413) {
            reject(new Error('图片请求仍然过大，请重新拍摄'))
            return
          }
          reject(new Error(response.data.detail || `模型服务返回 ${response.statusCode}`))
          return
        }
        const content = response.data.choices?.[0]?.message?.content
        if (!content) {
          reject(new Error('模型未返回识别内容'))
          return
        }
        resolve(content)
      },
      fail: (error) => reject(new Error(error.errMsg || '连接模型服务失败')),
    })
  })
}

export async function recognizeInspection(imagePath: string): Promise<RecognizeInspectionResult> {
  if (!imagePath) {
    throw new Error('请选择检验报告图片')
  }
  const preparedPath = await prepareImageForUpload(imagePath)
  const base64Image = await readImageAsBase64(preparedPath)
  const rawContent = await requestModel(buildVisionPayload(base64Image, getMimeType(preparedPath)))
  let rawRecord: RawApiRecord
  try {
    rawRecord = parseModelContent(rawContent)
  } catch {
    throw new Error('模型返回内容不是有效 JSON，请重新识别')
  }
  return {
    imageId: `api-image-${Date.now()}`,
    rawContent,
    record: normalizeApiRecord(rawRecord),
  }
}

export async function submitInspection(
  imageId: string,
  record: InspectionRecord,
): Promise<{ recordId: string }> {
  if (!imageId) {
    throw new Error('缺少图片记录')
  }
  const missing = validateRecord(record)
  if (missing.length > 0) {
    throw new Error(`请完善：${missing.join('、')}`)
  }
  return { recordId: `IR-${Date.now()}` }
}
