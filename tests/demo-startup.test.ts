import test from 'node:test'
import strictAssert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const assert: typeof strictAssert = strictAssert
const root = resolve(__dirname, '..')

test('production mode validates the session from the workspace entry page', () => {
  const config = readFileSync(resolve(root, 'miniprogram/config/server.ts'), 'utf8')
  const appConfig = JSON.parse(readFileSync(resolve(root, 'miniprogram/app.json'), 'utf8')) as {
    pages: string[]
  }

  assert.match(config, /export const DEMO_MODE = false/)
  assert.equal(appConfig.pages[0], 'pages/index/index')
})
