import Taro from '@tarojs/taro'

import {
  recognizeInspection,
  type RecognizeInspectionResult,
} from '@legacy/services/inspection-service'
import {
  prepareImageForUpload,
  type ImageCompressionApi,
} from '@legacy/services/image-upload-service'
import { recognizeInspectionFile } from '@legacy/services/quality-inspection-service'

import { upload } from '@/adapters/server'

const taroImageApi: ImageCompressionApi = {
  getFileInfo: (options) => {
    Taro.getFileInfo({
      filePath: options.filePath,
      success: (result) => options.success({ size: result.size }),
      fail: options.fail,
    })
  },
  compressImage: (options) => {
    Taro.compressImage({
      src: options.src,
      quality: options.quality,
      success: (result) => options.success({ tempFilePath: result.tempFilePath }),
      fail: options.fail,
    })
  },
}

export function recognizeReport(imagePath: string): Promise<RecognizeInspectionResult> {
  return recognizeInspection(
    imagePath,
    (filePath) => recognizeInspectionFile(filePath, upload),
    (filePath) => prepareImageForUpload(filePath, taroImageApi),
  )
}
