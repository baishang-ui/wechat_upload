import Taro from '@tarojs/taro'

import {
  prepareImageForUpload,
  type ImageCompressionApi,
} from '@legacy/services/image-upload-service'
import {
  uploadInspectionRowImage,
  uploadInspectionWorkbenchImage,
  type InspectionRowImageUploadResult,
} from '@legacy/services/quality-inspection-service'

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

function prepare(filePath: string): Promise<string> {
  return prepareImageForUpload(filePath, taroImageApi)
}

export function uploadInspectionRowPhoto(
  taskId: number,
  itemId: number,
  rowKey: string,
  filePath: string,
): Promise<InspectionRowImageUploadResult> {
  return uploadInspectionRowImage(taskId, itemId, rowKey, filePath, upload, prepare)
}

export async function uploadInspectionEvidence(
  taskId: number,
  itemId: number,
  filePath: string,
): Promise<InspectionRowImageUploadResult> {
  const preparedPath = await prepare(filePath)
  return uploadInspectionWorkbenchImage(taskId, itemId, preparedPath, upload)
}
