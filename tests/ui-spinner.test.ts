import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

function source(path: string): string {
  return readFileSync(new URL(`../${path}`, import.meta.url), 'utf8')
}

test('shared spinner follows the HeroUI loading indicator anatomy', () => {
  const app = source('miniprogram/app.json')
  const wxml = source('miniprogram/components/ui-spinner/ui-spinner.wxml')
  const scss = source('miniprogram/components/ui-spinner/ui-spinner.scss')

  assert.match(app, /"ui-spinner"\s*:\s*"\/components\/ui-spinner\/ui-spinner"/)
  assert.match(wxml, /role="status"/)
  assert.match(wxml, /aria-label="\{\{label \|\| '加载中'\}\}"/)
  assert.match(wxml, /class="ui-spinner__track"/)
  assert.match(wxml, /class="ui-spinner__rotor"/)
  assert.match(wxml, /class="ui-spinner__arc ui-spinner__arc--soft"/)
  assert.match(wxml, /class="ui-spinner__arc ui-spinner__arc--strong"/)
  assert.match(wxml, /spinning \? 'is-spinning' : 'is-controlled'/)
  assert.match(wxml, /--ui-spinner-start-rotation: \{\{rotation\}\}deg/)
  assert.match(scss, /\.ui-spinner--sm[\s\S]*?32rpx/)
  assert.match(scss, /\.ui-spinner--md[\s\S]*?48rpx/)
  assert.match(scss, /\.ui-spinner--lg[\s\S]*?64rpx/)
  assert.match(scss, /\.ui-spinner--xl[\s\S]*?80rpx/)
  assert.match(scss, /\.ui-spinner\.is-spinning \.ui-spinner__rotor[\s\S]*?animation:\s*ui-spinner-rotate \.72s linear infinite;/)
  assert.match(scss, /from \{ transform: rotate\(var\(--ui-spinner-start-rotation\)\); \}/)
  assert.match(scss, /to \{ transform: rotate\(calc\(var\(--ui-spinner-start-rotation\) \+ 360deg\)\); \}/)
  assert.match(scss, /@media \(prefers-reduced-motion: reduce\)[\s\S]*animation:\s*none;/)
})

test('every visible loading region uses the shared HeroUI-style spinner', () => {
  const loadingSurfaces = [
    'miniprogram/components/navigation-bar/navigation-bar.wxml',
    'miniprogram/components/history-editor-modal/history-editor-modal.wxml',
    'miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml',
    'miniprogram/pages/document-camera/document-camera.wxml',
    'miniprogram/pages/index/index.wxml',
    'miniprogram/pages/inspection-workbench/inspection-workbench.wxml',
    'miniprogram/pages/login/login.wxml',
  ]

  loadingSurfaces.forEach((path) => {
    assert.match(source(path), /<ui-spinner\b/, `${path} should render ui-spinner`)
  })

  const index = source('miniprogram/pages/index/index.wxml')
  assert.match(index, /taskLoading && taskItems\.length === 0[\s\S]*?<ui-spinner[^>]*label="正在加载任务"/)
  assert.match(index, /historyLoading && historyRecords\.length === 0[\s\S]*?<ui-spinner[^>]*label="正在加载记录"/)
  assert.match(index, /accountLoading[\s\S]*?<ui-spinner[^>]*label="正在加载账户信息"/)
  assert.match(index, /item\.syncStatus === 'syncing'[\s\S]*?<ui-spinner/)

  const workbench = source('miniprogram/pages/inspection-workbench/inspection-workbench.wxml')
  assert.match(workbench, /wx:if="\{\{loading\}\}" class="state-card"[\s\S]*?<ui-spinner[^>]*size="lg"/)
  assert.match(workbench, /photo\.status === 'uploading'[\s\S]*?<ui-spinner/)

  const modal = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')
  assert.match(modal, /inspectionClassificationPending[\s\S]*?<ui-spinner/)
  assert.match(modal, /photo\.status === 'uploading'[\s\S]*?<ui-spinner/)
})
