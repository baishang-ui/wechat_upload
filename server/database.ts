import { createPool, type RowDataPacket } from 'mysql2/promise'

import type { MysqlConfig } from './config'

export const MYSQL_HEALTH_QUERY =
  'SELECT 1 AS ok, DATABASE() AS database_name, NOW() AS server_time'

export interface DatabaseHealth {
  database: string
  serverTime: string
}

export interface QueryExecutor {
  query(sql: string): Promise<[unknown, unknown]>
}

export interface DatabaseService {
  checkHealth(): Promise<DatabaseHealth>
  close(): Promise<void>
}

interface HealthRow {
  ok?: unknown
  database_name?: unknown
  server_time?: unknown
}

function healthCheckError(): Error {
  return new Error('Database health check failed')
}

function normalizeServerTime(value: unknown): string {
  const date = value instanceof Date ? value : typeof value === 'string' ? new Date(value) : null
  if (!date || Number.isNaN(date.getTime())) {
    throw healthCheckError()
  }
  return date.toISOString()
}

export async function checkDatabaseHealth(
  executor: QueryExecutor,
  expectedDatabase: string,
): Promise<DatabaseHealth> {
  const [result] = await executor.query(MYSQL_HEALTH_QUERY)
  if (!Array.isArray(result) || result.length === 0) {
    throw healthCheckError()
  }

  const row = result[0] as HealthRow
  if (row.ok !== 1 || row.database_name !== expectedDatabase) {
    throw healthCheckError()
  }

  return {
    database: expectedDatabase,
    serverTime: normalizeServerTime(row.server_time),
  }
}

export function createDatabase(config: MysqlConfig): DatabaseService {
  const pool = createPool({
    host: config.host,
    port: config.port,
    user: config.user,
    password: config.password,
    database: config.database,
    waitForConnections: true,
    connectionLimit: 5,
    connectTimeout: 5000,
  })

  const executor: QueryExecutor = {
    async query(sql: string): Promise<[unknown, unknown]> {
      const [rows, fields] = await pool.query<RowDataPacket[]>({ sql, timeout: 5000 })
      return [rows, fields]
    },
  }

  return {
    checkHealth: () => checkDatabaseHealth(executor, config.database),
    close: () => pool.end(),
  }
}
