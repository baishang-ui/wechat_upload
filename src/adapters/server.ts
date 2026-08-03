import {
  serverRequest,
  serverUpload,
  type ServerRequestOptions,
  type ServerUploadOptions,
} from '@legacy/services/server-client'

import { serverAdapter } from './server-adapter'

export function request<T>(options: ServerRequestOptions): Promise<T> {
  return serverRequest<T>(options, serverAdapter)
}

export function upload<T>(options: ServerUploadOptions): Promise<T> {
  return serverUpload<T>(options, serverAdapter)
}

export { serverAdapter }
