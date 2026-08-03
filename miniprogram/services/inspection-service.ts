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
  RecognitionProxyResult,
  recognizeInspectionFile,
} from './quality-inspection-service'
import {
  ImageUploadPreparer,
  prepareImageForUpload,
} from './image-upload-service'

export type { ImageCompressionApi } from './image-upload-service'
export {
  MAX_ONLINE_IMAGE_BYTES,
  prepareImageForUpload,
} from './image-upload-service'

export type RecognitionProxyUpload = (filePath: string) => Promise<RecognitionProxyResult>

export interface RecognizeInspectionResult {
  imageId: string
  rawContent: string
  record: InspectionRecord
  confidence: RecognitionConfidencePayload
}

function getProxyRecord(result: RecognitionProxyResult): RawApiRecord {
  const record = result?.record
  if (record && typeof record === 'object' && !Array.isArray(record)) return record
  try {
    return parseModelContent(String(result?.raw_content || ''))
  } catch {
    throw new Error('识别服务返回内容不是有效 JSON，请重新识别')
  }
}

export async function recognizeInspection(
  imagePath: string,
  upload: RecognitionProxyUpload = recognizeInspectionFile,
  prepare: ImageUploadPreparer = prepareImageForUpload,
): Promise<RecognizeInspectionResult> {
  if (!imagePath) throw new Error('请选择检验报告图片')
  const preparedPath = await prepare(imagePath)
  const result = await upload(preparedPath)
  const rawRecord = getProxyRecord(result)
  const record = normalizeApiRecord(rawRecord)
  const rawContent = String(result.raw_content || '').trim() || JSON.stringify(rawRecord)
  return {
    imageId: `api-image-${Date.now()}`,
    rawContent,
    record,
    confidence: normalizeRecognitionConfidence(
      result.confidence || rawRecord.confidence,
      record.rows.length,
    ),
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
