import type { RequestListener, ServerResponse } from 'node:http'

import type { DatabaseHealth, DatabaseService } from './database'

export interface ErrorMetadata {
  name: string
  code?: string
}

export interface AppDependencies {
  database: Pick<DatabaseService, 'checkHealth'>
  logError?: (message: string, metadata: ErrorMetadata) => void
}

function sendJson(response: ServerResponse, statusCode: number, body: unknown): void {
  response.statusCode = statusCode
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(body))
}

function sanitizeError(error: unknown): ErrorMetadata {
  const name = error instanceof Error ? error.name : 'UnknownError'
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined

  return code ? { name, code } : { name }
}

function mysqlHealthBody(health: DatabaseHealth): Record<string, unknown> {
  return {
    ok: true,
    database: health.database,
    serverTime: health.serverTime,
  }
}

export function createRequestHandler(dependencies: AppDependencies): RequestListener {
  const logError =
    dependencies.logError ??
    ((message: string, metadata: ErrorMetadata) => {
      console.error(message, metadata)
    })

  return async (request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://localhost').pathname

    if (request.method === 'GET' && pathname === '/api/health') {
      sendJson(response, 200, { ok: true })
      return
    }

    if (request.method === 'GET' && pathname === '/api/health/mysql') {
      try {
        const health = await dependencies.database.checkHealth()
        sendJson(response, 200, mysqlHealthBody(health))
      } catch (error) {
        logError('MySQL health check failed', sanitizeError(error))
        sendJson(response, 503, { ok: false, error: 'MYSQL_UNAVAILABLE' })
      }
      return
    }

    sendJson(response, 404, { ok: false, error: 'NOT_FOUND' })
  }
}
