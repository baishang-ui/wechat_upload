import test from 'node:test'
import strictAssert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const assert: typeof strictAssert = strictAssert
const root = resolve(__dirname, '..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('temporary public demo targets the online service and bypasses login without changing the workspace content', () => {
  const serverConfig = source('miniprogram/config/server.ts')
  const indexPage = source('miniprogram/pages/index/index.ts')
  const indexWxml = source('miniprogram/pages/index/index.wxml')

  assert.match(
    serverConfig,
    /export const SERVER_BASE_URL = 'https:\/\/www\.binictools\.cn:7876'/,
  )
  assert.match(serverConfig, /export const DEMO_MODE = true/)
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
