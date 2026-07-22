export interface MysqlConfig {
  host: string
  port: number
  user: string
  password: string
  database: string
}

export interface HttpServerConfig {
  host: string
  port: number
}

export interface ServerConfig {
  mysql: MysqlConfig
  server: HttpServerConfig
}

type Environment = Readonly<Record<string, string | undefined>>

function readRequiredTrimmed(environment: Environment, key: string): string {
  const value = environment[key]?.trim()
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`)
  }
  return value
}

function readPassword(environment: Environment): string {
  const value = environment.MYSQL_PASSWORD
  if (value === undefined || value.length === 0) {
    throw new Error('Missing required environment variable: MYSQL_PASSWORD')
  }
  return value
}

function parsePort(value: string, key: string): number {
  const normalized = value.trim()
  if (!/^\d+$/.test(normalized)) {
    throw new Error(`Invalid TCP port in environment variable: ${key}`)
  }

  const port = Number(normalized)
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid TCP port in environment variable: ${key}`)
  }

  return port
}

export function loadServerConfig(environment: Environment = process.env): ServerConfig {
  return {
    mysql: {
      host: readRequiredTrimmed(environment, 'MYSQL_HOST'),
      port: parsePort(readRequiredTrimmed(environment, 'MYSQL_PORT'), 'MYSQL_PORT'),
      user: readRequiredTrimmed(environment, 'MYSQL_USER'),
      password: readPassword(environment),
      database: readRequiredTrimmed(environment, 'MYSQL_DATABASE'),
    },
    server: {
      host: environment.SERVER_HOST?.trim() || '0.0.0.0',
      port: parsePort(environment.SERVER_PORT ?? '3000', 'SERVER_PORT'),
    },
  }
}
