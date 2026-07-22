import 'dotenv/config'

import { createServer, type Server } from 'node:http'

import { createRequestHandler, type ErrorMetadata } from './app'
import { loadServerConfig } from './config'
import { createDatabase } from './database'

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close(error => {
      if (error) {
        reject(error)
        return
      }
      resolve()
    })
  })
}

function safeErrorMetadata(error: unknown): ErrorMetadata {
  const name = error instanceof Error ? error.name : 'UnknownError'
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined
  return code ? { name, code } : { name }
}

async function main(): Promise<void> {
  const config = loadServerConfig()
  const database = createDatabase(config.mysql)
  const server = createServer(createRequestHandler({ database }))
  let shuttingDown = false

  const shutdown = async (signal: NodeJS.Signals): Promise<void> => {
    if (shuttingDown) {
      return
    }
    shuttingDown = true
    console.log(`Received ${signal}; shutting down`)

    try {
      await closeServer(server)
      await database.close()
    } catch (error) {
      console.error('Server shutdown failed', safeErrorMetadata(error))
      process.exitCode = 1
    }
  }

  process.once('SIGINT', () => {
    void shutdown('SIGINT')
  })
  process.once('SIGTERM', () => {
    void shutdown('SIGTERM')
  })

  server.on('error', error => {
    console.error('HTTP server failed', safeErrorMetadata(error))
    process.exitCode = 1
    void database.close()
  })

  server.listen(config.server.port, config.server.host, () => {
    console.log(`Backend listening on http://${config.server.host}:${config.server.port}`)
  })
}

void main().catch(error => {
  console.error('Backend startup failed', safeErrorMetadata(error))
  process.exitCode = 1
})
