import test from 'node:test'
import assert from 'node:assert/strict'

import { closeResources } from '../server/lifecycle.ts'

test('closeResources closes the database even when HTTP shutdown fails', async () => {
  const calls: string[] = []

  await assert.rejects(
    closeResources(
      async () => {
        calls.push('http')
        throw new Error('HTTP close failed')
      },
      async () => {
        calls.push('database')
      },
    ),
    /Resource shutdown failed/,
  )

  assert.deepEqual(calls, ['http', 'database'])
})

test('closeResources reports failure after attempting both resources', async () => {
  const calls: string[] = []

  await assert.rejects(
    closeResources(
      async () => {
        calls.push('http')
      },
      async () => {
        calls.push('database')
        throw new Error('Database close failed')
      },
    ),
    /Resource shutdown failed/,
  )

  assert.deepEqual(calls, ['http', 'database'])
})

test('closeResources resolves when both resources close', async () => {
  const calls: string[] = []

  await closeResources(
    async () => {
      calls.push('http')
    },
    async () => {
      calls.push('database')
    },
  )

  assert.deepEqual(calls, ['http', 'database'])
})
