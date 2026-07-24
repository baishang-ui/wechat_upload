import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('pending product selection opens a paged inspection workbench modal instead of navigating away', () => {
  const indexTs = source('miniprogram/pages/index/index.ts')
  const indexWxml = source('miniprogram/pages/index/index.wxml')
  const indexJson = source('miniprogram/pages/index/index.json')

  assert.match(indexTs, /workbenchModalVisible/)
  assert.match(indexTs, /openWorkbenchModal/)
  assert.doesNotMatch(indexTs, /wx\.navigateTo\(\{\s*url:\s*`\/pages\/inspection-workbench/)
  assert.match(indexWxml, /<inspection-workbench-modal/)
  assert.match(indexWxml, /visible="\{\{workbenchModalVisible\}\}"/)
  assert.match(indexJson, /"inspection-workbench-modal"/)
})

test('inspection workbench modal uses a record-style drawer, page controls, and focused expandable cards', () => {
  const wxml = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')
  const scss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(wxml, /class="workbench-modal-layer/)
  assert.match(wxml, /class="workbench-modal-mask/)
  assert.match(wxml, /class="workbench-modal-panel/)
  assert.match(wxml, /class="modal-grabber/)
  assert.match(wxml, /class="workbench-modal-body/)
  assert.match(wxml, /class="workbench-modal-actions/)
  assert.match(wxml, /上一页/)
  assert.match(wxml, /下一页/)
  assert.match(wxml, /保存草稿/)
  assert.match(wxml, /class="inspection-item-card/)
  assert.match(wxml, /bindtap="toggleRowExpanded"/)
  assert.doesNotMatch(wxml, /inspection-table-scroll/)
  assert.match(ts, /buildInspectionWorkbenchPages/)
  assert.match(ts, /requestClose/)
  assert.match(ts, /showUnsavedCloseDialog/)
  assert.match(scss, /@keyframes modal-sheet-up/)
})

test('inspection workbench drawer keeps record-style fixed height, scrollable content, and exit animation', () => {
  const wxml = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')
  const scss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(wxml, /class="workbench-modal-layer \{\{closing \? 'is-closing' : ''\}\}"/)
  assert.match(scss, /\.workbench-modal-panel\s*\{[\s\S]*?height:\s*88vh/)
  assert.doesNotMatch(scss, /\.workbench-modal-panel\s*\{[\s\S]*?max-height:\s*91vh/)
  assert.match(scss, /\.workbench-modal-body\s*\{[\s\S]*?min-height:\s*0[\s\S]*?flex:\s*1/)
  assert.match(scss, /\.workbench-modal-actions\s*\{[\s\S]*?flex:\s*none/)
  assert.match(scss, /\.workbench-modal-layer\.is-closing \.workbench-modal-mask\s*\{[\s\S]*?modal-mask-out/)
  assert.match(scss, /\.workbench-modal-layer\.is-closing \.workbench-modal-panel\s*\{[\s\S]*?modal-sheet-down/)
  assert.match(ts, /closing:\s*false/)
  assert.match(ts, /this\.setData\(\{ closing: true \}\)/)
  assert.match(ts, /setTimeout\([\s\S]*?this\.triggerEvent\('close'/)
})

test('inspection workbench keeps actions readable and content orderly on narrow screens', () => {
  const wxml = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')
  const scss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')

  assert.match(wxml, /class="workbench-modal-heading"/)
  assert.match(wxml, /class="workbench-pagination-actions"[\s\S]*?上一页[\s\S]*?page-status[\s\S]*?下一页/)
  assert.match(wxml, /<view class="workbench-modal-actions">[\s\S]*?<view class="workbench-pagination-actions">[\s\S]*?<view class="save-button/)
  assert.match(scss, /\.workbench-modal-heading\s*\{[\s\S]*?min-width:\s*0[\s\S]*?flex:\s*1/)
  assert.match(scss, /\.workbench-modal-title\s*\{[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/)
  assert.match(scss, /\.workbench-modal-actions\s*\{[\s\S]*?flex-direction:\s*column/)
  assert.match(scss, /\.workbench-pagination-actions\s*\{[\s\S]*?display:\s*flex/)
  assert.match(wxml, /<view class="workbench-close"[\s\S]*?hover-class="workbench-close--pressed"/)
  assert.doesNotMatch(wxml, /<button class="workbench-close"/)
  assert.doesNotMatch(wxml, /<button class="page-button/)
  assert.doesNotMatch(wxml, /<button class="save-button/)
  assert.match(scss, /\.workbench-close\s*\{[\s\S]*?display:\s*flex[\s\S]*?border-radius:\s*50%/)
  assert.match(scss, /\.page-button\s*\{[\s\S]*?flex:\s*1/)
  assert.match(scss, /\.save-button\s*\{[\s\S]*?width:\s*100%/)
  assert.match(scss, /@media \(max-width:\s*360px\)[\s\S]*?\.recognition-actions[\s\S]*?grid-template-columns:\s*1fr/)
  assert.match(scss, /@media \(max-width:\s*360px\)[\s\S]*?\.measurement-grid[\s\S]*?grid-template-columns:\s*1fr/)
  assert.match(scss, /@media \(max-width:\s*360px\)[\s\S]*?\.workbench-photo-grid[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
})

test('closing the workbench does not refresh pending tasks unless a draft was saved', () => {
  const indexTs = source('miniprogram/pages/index/index.ts')
  const closeMethod = indexTs.match(/closeWorkbenchModal\(\)\s*\{([\s\S]*?)\n    \},\n    onWorkbenchSaved/)?.[1] || ''
  const savedMethod = indexTs.match(/onWorkbenchSaved\(\)\s*\{([\s\S]*?)\n    \},/)?.[1] || ''

  assert.ok(closeMethod)
  assert.doesNotMatch(closeMethod, /loadTasks/)
  assert.match(savedMethod, /loadTasks\(true\)/)
})

test('manual save from the drawer does not treat the tap event as a close-after-save request', () => {
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(ts, /const shouldClose = closeAfterSave === true/)
  assert.match(ts, /if \(shouldClose\) this\.finishClose\(\)/)
})

test('workbench drawer is mounted only when opened and initializes on attachment', () => {
  const indexWxml = source('miniprogram/pages/index/index.wxml')
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(indexWxml, /<inspection-workbench-modal[\s\S]*wx:if="\{\{workbenchModalVisible\}\}"/)
  assert.match(ts, /lifetimes:\s*\{[\s\S]*attached\(\)/)
  assert.match(ts, /void this\.loadWorkbench\(\)/)
})
