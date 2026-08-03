import Taro from '@tarojs/taro'

import type { InspectionJsonExportAdapter } from '@legacy/services/export-service'

export const inspectionExportAdapter: InspectionJsonExportAdapter = {
  userDataPath: Taro.env.USER_DATA_PATH || '',
  writeFile: (filePath, data) => new Promise((resolve, reject) => {
    Taro.getFileSystemManager().writeFile({
      filePath,
      data,
      encoding: 'utf8',
      success: () => resolve(),
      fail: () => reject(new Error('无法生成 JSON 文件')),
    })
  }),
  shareFile: (filePath, fileName) => new Promise((resolve, reject) => {
    Taro.shareFileMessage({
      filePath,
      fileName,
      success: () => resolve(),
      fail: () => reject(new Error('无法分享 JSON 文件')),
    })
  }),
  wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
}
