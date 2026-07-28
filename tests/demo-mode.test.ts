import test from 'node:test'
import strictAssert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const assert: typeof strictAssert = strictAssert
const root = resolve(__dirname, '..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('server config separates data and recognition service addresses', () => {
  const serverConfig = source('miniprogram/config/server.ts')
  const indexPage = source('miniprogram/pages/index/index.ts')
  const indexWxml = source('miniprogram/pages/index/index.wxml')
  const historySyncService = source('miniprogram/services/inspection-history-sync-service.ts')

  assert.match(
    serverConfig,
    /export const DATA_SERVER_BASE_URL = 'https:\/\/www\.binictools\.cn:7876'/,
  )
  assert.match(
    serverConfig,
    /export const RECOGNITION_API_URL = 'https:\/\/www\.binictools\.cn:7876\/api\/miniprogram\/quality-inspections\/recognize'/,
  )
  assert.doesNotMatch(serverConfig, /MODEL_API_URL|MODEL_NAME|MODEL_TOKEN_STORAGE_KEY/)
  assert.match(serverConfig, /export const DEMO_MODE = (?:true|false)/)
  assert.match(
    indexPage,
    /if \(!DEMO_MODE\) \{\s*getCurrentUser\(\)/,
  )
  assert.match(
    historySyncService,
    /onUnauthorized:\s*\(\) => \{\s*if \(!DEMO_MODE\) wx\.reLaunch\(/,
  )
  assert.match(indexWxml, /class="floating-tab[^\n]*data-tab="tasks"/)
  assert.doesNotMatch(indexWxml, /wx:if="\{\{!demoMode\}\}"/)
  assert.doesNotMatch(
    indexPage,
    /syncHistoryRecord\(record: StoredInspectionRecord\): Promise<StoredInspectionRecord> \{\s*if \(DEMO_MODE\)/,
  )
})
