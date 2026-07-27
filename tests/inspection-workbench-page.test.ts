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
  const modal = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

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
  assert.doesNotMatch(page, /listProductQualityTemplates/)
  assert.match(page, /buildOnlineInspectionTemplate\(detail\)/)
  assert.doesNotMatch(modal, /listProductQualityTemplates/)
  assert.match(modal, /buildOnlineInspectionTemplate\(detail\)/)
  assert.match(wxml, /wx:for="{{renderColumns}}"/)
  assert.ok(scss.includes("@import '../../styles/design-tokens';"))
  assert.ok(scss.includes('.inspection-table-scroll'))
})


test('online report structure is rebuilt even when an older draft already contains rows', () => {
  const page = source('miniprogram/pages/inspection-workbench/inspection-workbench.ts')
  const modal = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  for (const implementation of [page, modal]) {
    assert.doesNotMatch(implementation, /draftRecords\.length === 0/)
    assert.match(implementation, /if \(!template\)/)
    assert.match(implementation, /buildOnlineInspectionTemplate\(detail\)/)
    assert.match(implementation, /draft: item\.inspection_draft/)
  }
})


test('recognized reports automatically attach to a pending order and expose a direct workbench jump', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')

  assert.match(page, /autoWriteRecognizedInspectionToPendingItem/)
  assert.match(page, /autoWriteQueueRecognition/)
  assert.match(page, /jumpToMatchedInspection/)
  assert.match(page, /sourceType:\s*'purchase_order'/)
  assert.match(wxml, /进入待检产品/)
  assert.match(wxml, /bindtap="jumpToMatchedInspection"/)
})

test('history records show the reason when an order cannot be found and syncing is skipped', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')

  assert.match(page, /listTasks:\s*listInspectionTasks/)
  assert.match(page, /result\.syncError\s*\|\|/)
  assert.match(wxml, /item\.syncError && \(item\.syncStatus === 'failed' \|\| item\.syncStatus === 'local'\)/)
})

test('legacy workbench page discards stale item detail responses', () => {
  const page = source('miniprogram/pages/inspection-workbench/inspection-workbench.ts')

  assert.match(page, /const requestedTaskId = this\.data\.taskId/)
  assert.match(page, /const requestedItemId = this\.data\.itemId/)
  assert.match(page, /requestedTaskId !== this\.data\.taskId/)
  assert.match(page, /requestedItemId !== this\.data\.itemId/)
})
