import Taro from '@tarojs/taro'

import type { HistoryStorageAdapter } from '@legacy/services/history-service'

function uuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16)
    const value = token === 'x' ? random : (random & 0x3) | 0x8
    return value.toString(16)
  })
}

export const historyAdapter: HistoryStorageAdapter = {
  getStorage: (key) => Taro.getStorageSync(key),
  setStorage: (key, records) => Taro.setStorageSync(key, records),
  removeStorage: (key) => Taro.removeStorageSync(key),
  createUuid: uuid,
  saveFile: async (temporaryPath) => {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) return temporaryPath
    const fileSystem = Taro.getFileSystemManager()
    return new Promise((resolve, reject) => {
      fileSystem.saveFile({
        tempFilePath: temporaryPath,
        success: (result) => resolve(result.savedFilePath),
        fail: () => reject(new Error('无法保存报告图片')),
      })
    })
  },
  removeFile: async (filePath) => {
    if (Taro.getEnv() !== Taro.ENV_TYPE.WEAPP) return
    const fileSystem = Taro.getFileSystemManager()
    await new Promise<void>((resolve, reject) => {
      fileSystem.removeSavedFile({
        filePath,
        success: () => resolve(),
        fail: () => reject(new Error('无法删除本地报告图片')),
      })
    })
  },
}
