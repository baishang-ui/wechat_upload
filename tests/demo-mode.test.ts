import test from 'node:test'
import strictAssert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const assert: typeof strictAssert = strictAssert
const root = resolve(__dirname, '..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('server config separates business and direct model endpoints', () => {
  const serverConfig = source('miniprogram/config/server.ts')
  const indexPage = source('miniprogram/pages/index/index.ts')
  const indexWxml = source('miniprogram/pages/index/index.wxml')

  assert.match(
    serverConfig,
    /export const BUSINESS_SERVER_BASE_URL = 'http:\/\/localhost:7875'/,
  )
  assert.match(
    serverConfig,
    /export const MODEL_API_URL = 'http:\/\/www\.binictools\.cn:8865\/api\/llm\/v1\/chat\/completions'/,
  )
  assert.match(serverConfig, /export const MODEL_NAME = 'qwen35'/)
  assert.match(serverConfig, /export const MODEL_TOKEN_STORAGE_KEY = 'llmApiToken'/)
  assert.match(serverConfig, /export const DEMO_MODE = (?:true|false)/)
  assert.match(
    indexPage,
    /if \(!DEMO_MODE\) \{\s*getCurrentUser\(\)/,
  )
  assert.match(
    indexPage,
    /onUnauthorized:\s*\(\) => \{\s*if \(!DEMO_MODE\) wx\.reLaunch\(/,
  )
  assert.match(indexWxml, /class="floating-tab[^\n]*data-tab="tasks"/)
  assert.doesNotMatch(indexWxml, /wx:if="\{\{!demoMode\}\}"/)
  assert.doesNotMatch(
    indexPage,
    /syncHistoryRecord\(record: StoredInspectionRecord\): Promise<StoredInspectionRecord> \{\s*if \(DEMO_MODE\)/,
  )
})
