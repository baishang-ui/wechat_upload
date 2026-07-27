import {
  DATA_SERVER_BASE_URL,
  SERVER_REQUEST_TIMEOUT_MS,
  SERVER_UPLOAD_TIMEOUT_MS,
  SESSION_COOKIE_STORAGE_KEY,
} from '../config/server'

export interface ServerRequestOptions {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
  data?: unknown
  timeoutMs?: number
}

export type ServerSessionMode = 'managed' | 'read-only' | 'none'

export interface ServerUploadOptions {
  url?: string
  path: string
  filePath: string
  name: string
  formData?: Record<string, string>
  timeoutMs?: number
  sessionMode?: ServerSessionMode
}

export interface ApiEnvelope<T> {
  success: boolean
  data?: T
  error?: string
  detail?: string
}

interface TransportResponse {
  statusCode: number
  data: unknown
  cookies?: string[]
}

interface RequestTransportOptions {
  url: string
  method: ServerRequestOptions['method']
  data?: unknown
  header: Record<string, string>
  timeout: number
}

interface UploadTransportOptions {
  url: string
  filePath: string
  name: string
  formData?: Record<string, string>
  header: Record<string, string>
  timeout: number
}

export interface ServerClientAdapter {
  getStorage(key: string): unknown
  setStorage(key: string, value: string): void
  removeStorage(key: string): void
  request(options: RequestTransportOptions): Promise<TransportResponse>
  uploadFile(options: UploadTransportOptions): Promise<TransportResponse>
}

export class ServerClientError extends Error {
  constructor(message: string, readonly statusCode = 0) {
    super(message)
    this.name = 'ServerClientError'
  }
}

function defaultAdapter(): ServerClientAdapter {
  return {
    getStorage: (key) => wx.getStorageSync(key),
    setStorage: (key, value) => wx.setStorageSync(key, value),
    removeStorage: (key) => wx.removeStorageSync(key),
    request: (options) => new Promise((resolve, reject) => {
      wx.request({
        ...options,
        method: options.method as WechatMiniprogram.RequestOption['method'],
        data: options.data as
          | string
          | WechatMiniprogram.IAnyObject
          | ArrayBuffer
          | undefined,
        success: (response) => resolve({
          statusCode: response.statusCode,
          data: response.data,
          cookies: response.cookies,
        }),
        fail: reject,
      })
    }),
    uploadFile: (options) => new Promise((resolve, reject) => {
      wx.uploadFile({
        ...options,
        success: (response) => {
          const responseWithCookies = response as typeof response & {
            cookies?: string[]
          }
          resolve({
            statusCode: response.statusCode,
            data: response.data,
            cookies: responseWithCookies.cookies,
          })
        },
        fail: reject,
      })
    }),
  }
}

function getAdapter(adapter?: ServerClientAdapter): ServerClientAdapter {
  return adapter || defaultAdapter()
}

function sessionCookie(adapter: ServerClientAdapter): string {
  return String(adapter.getStorage(SESSION_COOKIE_STORAGE_KEY) || '').trim()
}

function saveSessionCookie(
  cookies: string[] | undefined,
  adapter: ServerClientAdapter,
): void {
  const cookie = (cookies || [])
    .map((value) => String(value).split(';', 1)[0].trim())
    .find((value) => value.startsWith('session='))
  if (cookie) adapter.setStorage(SESSION_COOKIE_STORAGE_KEY, cookie)
}

export function clearSessionCookie(adapter?: ServerClientAdapter): void {
  getAdapter(adapter).removeStorage(SESSION_COOKIE_STORAGE_KEY)
}

function parseEnvelope<T>(data: unknown): ApiEnvelope<T> {
  let parsed = data
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed) as unknown
    } catch {
      throw new ServerClientError('服务器返回了无效数据')
    }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ServerClientError('服务器返回了无效数据')
  }
  return parsed as ApiEnvelope<T>
}

const READABLE_ERROR_STATUSES = new Set([
  400, 401, 403, 404, 409, 413, 422, 429, 502,
])

function unwrapResponse<T>(
  response: TransportResponse,
  adapter: ServerClientAdapter,
  manageSession = true,
): T {
  if (manageSession) saveSessionCookie(response.cookies, adapter)
  const envelope = parseEnvelope<T>(response.data)
  if (response.statusCode >= 200 && response.statusCode < 300 && envelope.success) {
    if (Object.prototype.hasOwnProperty.call(envelope, 'data')) {
      return envelope.data as T
    }
    const { success: _success, ...legacyPayload } = envelope as ApiEnvelope<T>
      & Record<string, unknown>
    return legacyPayload as T
  }
  if (manageSession && response.statusCode === 401) clearSessionCookie(adapter)
  const backendReason = envelope.error || envelope.detail
  if (backendReason || READABLE_ERROR_STATUSES.has(response.statusCode)) {
    throw new ServerClientError(
      backendReason || '请求失败，请重试',
      response.statusCode,
    )
  }
  throw new ServerClientError('服务器暂时不可用', response.statusCode)
}

function mapTransportError(error: unknown): never {
  if (error instanceof ServerClientError) throw error
  const message = error instanceof Error
    ? error.message
    : String((error as { errMsg?: unknown } | null)?.errMsg || error || '')
  if (message.toLowerCase().includes('timeout')) {
    throw new ServerClientError('请求超时，请重试')
  }
  throw new ServerClientError('网络连接失败，请稍后重试')
}

export async function serverRequest<T>(
  options: ServerRequestOptions,
  adapter?: ServerClientAdapter,
): Promise<T> {
  const client = getAdapter(adapter)
  const cookie = sessionCookie(client)
  const header: Record<string, string> = {
    'Content-Type': 'application/json',
  }
  if (cookie) header.Cookie = cookie
  try {
    const response = await client.request({
      url: `${DATA_SERVER_BASE_URL}${options.path}`,
      method: options.method,
      data: options.data,
      header,
      timeout: options.timeoutMs || SERVER_REQUEST_TIMEOUT_MS,
    })
    return unwrapResponse<T>(response, client)
  } catch (error) {
    return mapTransportError(error)
  }
}

export async function serverUpload<T>(
  options: ServerUploadOptions,
  adapter?: ServerClientAdapter,
): Promise<T> {
  const client = getAdapter(adapter)
  const sessionMode = options.sessionMode || 'managed'
  const cookie = sessionMode === 'none' ? '' : sessionCookie(client)
  const header: Record<string, string> = {}
  if (cookie) header.Cookie = cookie
  try {
    const response = await client.uploadFile({
      url: options.url || `${DATA_SERVER_BASE_URL}${options.path}`,
      filePath: options.filePath,
      name: options.name,
      formData: options.formData,
      header,
      timeout: options.timeoutMs || SERVER_UPLOAD_TIMEOUT_MS,
    })
    return unwrapResponse<T>(response, client, sessionMode === 'managed')
  } catch (error) {
    return mapTransportError(error)
  }
}
