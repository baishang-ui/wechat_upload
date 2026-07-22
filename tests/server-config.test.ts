import test from 'node:test'
import assert from 'node:assert/strict'

import { loadServerConfig } from '../server/config.ts'

const completeEnvironment = {
  MYSQL_HOST: ' 192.168.1.37 ',
  MYSQL_PORT: '3306',
  MYSQL_USER: ' root ',
  MYSQL_PASSWORD: ' secret with spaces ',
  MYSQL_DATABASE: ' smart_sales_system ',
  SERVER_HOST: '127.0.0.1',
  SERVER_PORT: '3100',
}

test('loadServerConfig returns typed and normalized values', () => {
  const config = loadServerConfig(completeEnvironment)

  assert.deepEqual(config, {
    mysql: {
      host: '192.168.1.37',
      port: 3306,
      user: 'root',
      password: ' secret with spaces ',
      database: 'smart_sales_system',
    },
    server: {
      host: '127.0.0.1',
      port: 3100,
    },
  })
})

test('loadServerConfig applies safe server defaults', () => {
  const { SERVER_HOST: _host, SERVER_PORT: _port, ...environment } = completeEnvironment
  const config = loadServerConfig(environment)

  assert.equal(config.server.host, '0.0.0.0')
  assert.equal(config.server.port, 3000)
})

for (const key of [
  'MYSQL_HOST',
  'MYSQL_PORT',
  'MYSQL_USER',
  'MYSQL_PASSWORD',
  'MYSQL_DATABASE',
] as const) {
  test(`loadServerConfig rejects missing ${key} without exposing secrets`, () => {
    const environment = { ...completeEnvironment }
    delete environment[key]

    assert.throws(
      () => loadServerConfig(environment),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, new RegExp(key))
        assert.doesNotMatch(error.message, /secret with spaces/)
        return true
      },
    )
  })
}

for (const [key, value] of [
  ['MYSQL_PORT', ''],
  ['MYSQL_PORT', 'abc'],
  ['MYSQL_PORT', '0'],
  ['MYSQL_PORT', '65536'],
  ['SERVER_PORT', '1.5'],
] as const) {
  test(`loadServerConfig rejects invalid ${key} value ${JSON.stringify(value)}`, () => {
    assert.throws(
      () => loadServerConfig({ ...completeEnvironment, [key]: value }),
      (error: unknown) => {
        assert.ok(error instanceof Error)
        assert.match(error.message, new RegExp(key))
        assert.doesNotMatch(error.message, /secret with spaces/)
        return true
      },
    )
  })
}
