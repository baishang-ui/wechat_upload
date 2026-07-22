import test from 'node:test'
import assert from 'node:assert/strict'

import {
  MYSQL_HEALTH_QUERY,
  checkDatabaseHealth,
  type QueryExecutor,
} from '../server/database.ts'

function createExecutor(rows: unknown[]): { executor: QueryExecutor; queries: string[] } {
  const queries: string[] = []
  return {
    queries,
    executor: {
      async query(sql: string) {
        queries.push(sql)
        return [rows, []]
      },
    },
  }
}

test('checkDatabaseHealth executes the fixed read-only query and normalizes its result', async () => {
  const { executor, queries } = createExecutor([
    {
      ok: 1,
      database_name: 'smart_sales_system',
      server_time: new Date('2026-07-22T08:30:00.000Z'),
    },
  ])

  const result = await checkDatabaseHealth(executor, 'smart_sales_system')

  assert.deepEqual(queries, [MYSQL_HEALTH_QUERY])
  assert.deepEqual(result, {
    database: 'smart_sales_system',
    serverTime: '2026-07-22T08:30:00.000Z',
  })
})

test('checkDatabaseHealth accepts an ISO server time string', async () => {
  const { executor } = createExecutor([
    {
      ok: 1,
      database_name: 'smart_sales_system',
      server_time: '2026-07-22T08:30:00.000Z',
    },
  ])

  const result = await checkDatabaseHealth(executor, 'smart_sales_system')

  assert.equal(result.serverTime, '2026-07-22T08:30:00.000Z')
})

for (const [name, rows] of [
  ['empty rows', []],
  ['wrong ok value', [{ ok: 0, database_name: 'smart_sales_system', server_time: new Date() }]],
  ['wrong database', [{ ok: 1, database_name: 'other_database', server_time: new Date() }]],
  ['invalid time', [{ ok: 1, database_name: 'smart_sales_system', server_time: 'not-a-date' }]],
] as const) {
  test(`checkDatabaseHealth rejects ${name}`, async () => {
    const { executor } = createExecutor([...rows])

    await assert.rejects(
      checkDatabaseHealth(executor, 'smart_sales_system'),
      /Database health check failed/,
    )
  })
}
