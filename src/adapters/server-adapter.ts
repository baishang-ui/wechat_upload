import Taro from '@tarojs/taro'

import type { ServerClientAdapter } from '@legacy/services/server-client'

export const serverAdapter: ServerClientAdapter = {
  getStorage: (key) => Taro.getStorageSync(key),
  setStorage: (key, value) => Taro.setStorageSync(key, value),
  removeStorage: (key) => Taro.removeStorageSync(key),
  request: async (options) => {
    const response = await Taro.request({
      url: options.url,
      method: options.method,
      data: options.data,
      header: options.header,
      timeout: options.timeout,
    })
    const responseWithCookies = response as typeof response & {
      cookies?: string[]
    }
    return {
      statusCode: response.statusCode,
      data: response.data,
      cookies: responseWithCookies.cookies,
    }
  },
  uploadFile: async (options) => {
    const response = await Taro.uploadFile({
      url: options.url,
      filePath: options.filePath,
      name: options.name,
      formData: options.formData,
      header: options.header,
      timeout: options.timeout,
    })
    const responseWithCookies = response as typeof response & {
      cookies?: string[]
    }
    return {
      statusCode: response.statusCode,
      data: response.data,
      cookies: responseWithCookies.cookies,
    }
  },
}
