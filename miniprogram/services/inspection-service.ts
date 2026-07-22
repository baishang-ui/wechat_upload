import {
  InspectionRecord,
  normalizeApiRecord,
  validateRecord,
} from '../domain/inspection-record'
import {
  QualityUpload,
  recognizeInspectionFile,
} from './quality-inspection-service'
import { serverUpload } from './server-client'

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

export interface RecognizeInspectionResult {
  imageId: string
  rawContent: string
  record: InspectionRecord
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

export async function recognizeInspection(
  imagePath: string,
  imageApi: ImageCompressionApi = getDefaultImageApi(),
  upload: QualityUpload = serverUpload,
): Promise<RecognizeInspectionResult> {
  if (!imagePath) throw new Error('请选择检验报告图片')
  const preparedPath = await prepareImageForUpload(imagePath, imageApi)
  const result = await recognizeInspectionFile(preparedPath, upload)
  return {
    imageId: `api-image-${Date.now()}`,
    rawContent: result.raw_content,
    record: normalizeApiRecord(result.record),
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
