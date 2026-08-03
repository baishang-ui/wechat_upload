import Taro from '@tarojs/taro'

import type { ServerClientAdapter } from '@legacy/services/server-client'

function browserHeaders(source: Record<string, string>): Record<string, string> {
  const headers = { ...source }
  delete headers.Cookie
  return headers
}

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeout: number,
): Promise<Response> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeout)
  try {
    return await fetch(input, { ...init, signal: controller.signal })
  } finally {
    clearTimeout(timer)
  }
}

export const serverAdapter: ServerClientAdapter = {
  getStorage: (key) => Taro.getStorageSync(key),
  setStorage: (key, value) => Taro.setStorageSync(key, value),
  removeStorage: (key) => Taro.removeStorageSync(key),
  request: async (options) => {
    const method = options.method
    const response = await fetchWithTimeout(options.url, {
      method,
      headers: browserHeaders(options.header),
      credentials: 'include',
      body: method === 'GET' ? undefined : JSON.stringify(options.data),
    }, options.timeout)
    return {
      statusCode: response.status,
      data: await response.text(),
    }
  },
  uploadFile: async (options) => {
    const body = new FormData()
    Object.entries(options.formData || {}).forEach(([key, value]) => {
      body.append(key, value)
    })
    const fileResponse = await fetch(options.filePath)
    body.append(options.name, await fileResponse.blob(), 'upload.jpg')
    const response = await fetchWithTimeout(options.url, {
      method: 'POST',
      headers: browserHeaders(options.header),
      credentials: 'include',
      body,
    }, options.timeout)
    return {
      statusCode: response.status,
      data: await response.text(),
    }
  },
}
