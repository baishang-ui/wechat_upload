import 'dotenv/config'

import { loadServerConfig } from './config'
import { createDatabase, type DatabaseService } from './database'

interface SafeErrorDetails {
  name: string
  code?: string
}

function safeErrorDetails(error: unknown): SafeErrorDetails {
  const name = error instanceof Error ? error.name : 'UnknownError'
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : undefined
  return code ? { name, code } : { name }
}

async function main(): Promise<void> {
  let database: DatabaseService | undefined

  try {
    const config = loadServerConfig()
    database = createDatabase(config.mysql)
    const health = await database.checkHealth()
    console.log(`MySQL connection successful: database=${health.database}, serverTime=${health.serverTime}`)
  } catch (error) {
    console.error('MySQL connection test failed', safeErrorDetails(error))
    process.exitCode = 1
  } finally {
    await database?.close()
  }
}

void main()
