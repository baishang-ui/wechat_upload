import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('pending product selection opens the record-style workbench modal while preserving the legacy page route', () => {
  const app = JSON.parse(source('miniprogram/app.json')) as { pages: string[] }
  const indexTs = source('miniprogram/pages/index/index.ts')
  const indexWxml = source('miniprogram/pages/index/index.wxml')
  const indexJson = source('miniprogram/pages/index/index.json')

  assert.ok(app.pages.includes('pages/inspection-workbench/inspection-workbench'))
  assert.match(indexTs, /openWorkbenchModal/)
  assert.match(indexTs, /workbenchModalVisible: true/)
  assert.doesNotMatch(indexTs, /wx\.navigateTo\(\{\s*url:\s*`\/pages\/inspection-workbench/)
  assert.match(indexWxml, /<inspection-workbench-modal/)
  assert.match(indexJson, /"inspection-workbench-modal"/)
  assert.match(indexWxml, />进入检验</)
})

test('inspection workbench exposes online table, unlimited photos, OCR review and draft save states', () => {
  const wxml = source('miniprogram/pages/inspection-workbench/inspection-workbench.wxml')
  const scss = source('miniprogram/pages/inspection-workbench/inspection-workbench.scss')
  const page = source('miniprogram/pages/inspection-workbench/inspection-workbench.ts')

  assert.match(wxml, /class="workbench-source"/)
  assert.match(wxml, /class="inspection-table-scroll"/)
  assert.match(wxml, /class="workbench-photo-grid"/)
  assert.match(wxml, /class="unmatched-review"/)
  assert.match(wxml, /拍摄质检单并识别/)
  assert.match(wxml, /保存草稿/)
  assert.doesNotMatch(wxml, /\.join\(/)
  assert.match(page, /count:\s*9/)
  assert.match(page, /addLocalPhotos/)
  assert.match(page, /uploadInspectionRowImage/)
  assert.match(page, /mergeRecognitionRecord/)
  assert.match(page, /workbenchToDraft/)
  assert.match(page, /buildRenderColumns\(workbench\.columns\)/)
  assert.match(page, /getInspectionItemDetail/)
  assert.match(page, /buildOnlineInspectionTemplate/)
  assert.match(wxml, /wx:for="{{renderColumns}}"/)
  assert.ok(scss.includes("@import '../../styles/design-tokens';"))
  assert.ok(scss.includes('.inspection-table-scroll'))
})
