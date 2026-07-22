import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer, type RequestListener } from 'node:http'
import { once } from 'node:events'

import { createRequestHandler, type ErrorMetadata } from '../server/app.ts'

async function request(
  listener: RequestListener,
  path: string,
  init?: RequestInit,
): Promise<{ status: number; body: unknown; contentType: string | null }> {
  const server = createServer(listener)
  server.listen(0, '127.0.0.1')
  await once(server, 'listening')

  try {
    const address = server.address()
    assert.ok(address && typeof address === 'object')
    const response = await fetch(`http://127.0.0.1:${address.port}${path}`, init)
    return {
      status: response.status,
      body: await response.json(),
      contentType: response.headers.get('content-type'),
    }
  } finally {
    server.close()
    await once(server, 'close')
  }
}

test('GET /api/health reports process health without calling MySQL', async () => {
  let databaseCalls = 0
  const listener = createRequestHandler({
    database: {
      async checkHealth() {
        databaseCalls += 1
        throw new Error('should not run')
      },
    },
  })

  const response = await request(listener, '/api/health')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, { ok: true })
  assert.equal(response.contentType, 'application/json; charset=utf-8')
  assert.equal(databaseCalls, 0)
})

test('GET /api/health/mysql returns normalized database health', async () => {
  const listener = createRequestHandler({
    database: {
      async checkHealth() {
        return {
          database: 'smart_sales_system',
          serverTime: '2026-07-22T08:30:00.000Z',
        }
      },
    },
  })

  const response = await request(listener, '/api/health/mysql')

  assert.equal(response.status, 200)
  assert.deepEqual(response.body, {
    ok: true,
    database: 'smart_sales_system',
    serverTime: '2026-07-22T08:30:00.000Z',
  })
})

test('GET /api/health/mysql returns a safe 503 and sanitized log metadata', async () => {
  const secret = 'database-password'
  const logs: Array<{ message: string; metadata: ErrorMetadata }> = []
  const error = Object.assign(
    new Error(`authentication failed for root with ${secret} at 192.168.1.37`),
    { code: 'ER_ACCESS_DENIED_ERROR' },
  )
  const listener = createRequestHandler({
    database: {
      async checkHealth() {
        throw error
      },
    },
    logError(message, metadata) {
      logs.push({ message, metadata })
    },
  })

  const response = await request(listener, '/api/health/mysql')
  const serializedResponse = JSON.stringify(response.body)
  const serializedLogs = JSON.stringify(logs)

  assert.equal(response.status, 503)
  assert.deepEqual(response.body, { ok: false, error: 'MYSQL_UNAVAILABLE' })
  assert.doesNotMatch(serializedResponse, /authentication failed|root|192\.168\.1\.37|database-password/)
  assert.deepEqual(logs, [
    {
      message: 'MySQL health check failed',
      metadata: { name: 'Error', code: 'ER_ACCESS_DENIED_ERROR' },
    },
  ])
  assert.doesNotMatch(serializedLogs, /authentication failed|root|192\.168\.1\.37|database-password/)
})

test('unsupported methods and paths return JSON 404 responses', async () => {
  const listener = createRequestHandler({
    database: {
      async checkHealth() {
        return { database: 'unused', serverTime: new Date(0).toISOString() }
      },
    },
  })

  const missing = await request(listener, '/missing')
  const wrongMethod = await request(listener, '/api/health', { method: 'POST' })

  assert.equal(missing.status, 404)
  assert.deepEqual(missing.body, { ok: false, error: 'NOT_FOUND' })
  assert.equal(wrongMethod.status, 404)
  assert.deepEqual(wrongMethod.body, { ok: false, error: 'NOT_FOUND' })
})
