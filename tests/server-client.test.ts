import test from 'node:test'
import assert from 'node:assert/strict'

import {
  SERVER_BASE_URL,
  SESSION_COOKIE_STORAGE_KEY,
} from '../miniprogram/config/server'
import {
  clearSessionCookie,
  serverRequest,
  serverUpload,
  ServerClientAdapter,
} from '../miniprogram/services/server-client'

function harness() {
  const storage = new Map<string, unknown>()
  const requests: Array<Record<string, unknown>> = []
  const adapter: ServerClientAdapter = {
    getStorage: (key) => storage.get(key),
    setStorage: (key, value) => storage.set(key, value),
    removeStorage: (key) => storage.delete(key),
    request: async (options) => {
      requests.push(options as unknown as Record<string, unknown>)
      return {
        statusCode: 200,
        data: { success: true, data: { ok: true } },
        cookies: ['session=signed-cookie; Path=/; HttpOnly'],
      }
    },
    uploadFile: async () => ({
      statusCode: 200,
      data: JSON.stringify({ success: true, data: { uploaded: true } }),
      cookies: [],
    }),
  }
  return { adapter, storage, requests }
}

test('serverRequest saves response cookie and carries it on the next request', async () => {
  const state = harness()
  await serverRequest<{ ok: boolean }>(
    { method: 'POST', path: '/api/miniprogram/auth/login', data: {} },
    state.adapter,
  )
  await serverRequest<{ ok: boolean }>(
    { method: 'GET', path: '/api/miniprogram/auth/me' },
    state.adapter,
  )
  assert.equal(
    state.storage.get(SESSION_COOKIE_STORAGE_KEY),
    'session=signed-cookie',
  )
  assert.equal(
    (state.requests[1].header as Record<string, string>).Cookie,
    'session=signed-cookie',
  )
  assert.equal(SERVER_BASE_URL, 'https://www.binictools.cn:7876')
})

test('401 clears cookie and throws a user-readable error', async () => {
  const state = harness()
  state.storage.set(SESSION_COOKIE_STORAGE_KEY, 'session=expired')
  state.adapter.request = async () => ({
    statusCode: 401,
    data: { success: false, error: '未登录' },
    cookies: [],
  })
  await assert.rejects(
    () => serverRequest({ method: 'GET', path: '/api/miniprogram/auth/me' }, state.adapter),
    /未登录/,
  )
  assert.equal(state.storage.has(SESSION_COOKIE_STORAGE_KEY), false)
  clearSessionCookie(state.adapter)
})

test('serverUpload parses JSON and maps backend errors', async () => {
  const state = harness()
  const uploaded = await serverUpload<{ uploaded: boolean }>(
    { path: '/api/miniprogram/upload', filePath: '/tmp/a.jpg', name: 'file' },
    state.adapter,
  )
  assert.deepEqual(uploaded, { uploaded: true })
  state.adapter.uploadFile = async () => ({
    statusCode: 413,
    data: JSON.stringify({ success: false, error: '图片过大' }),
    cookies: [],
  })
  await assert.rejects(
    () => serverUpload(
      { path: '/api/miniprogram/upload', filePath: '/tmp/a.jpg', name: 'file' },
      state.adapter,
    ),
    /图片过大/,
  )
})
