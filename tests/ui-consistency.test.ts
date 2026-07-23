import test from 'node:test'
import strictAssert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const assert: typeof strictAssert = strictAssert
const root = resolve(__dirname, '..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('login and index pages share the inspection design tokens', () => {
  const loginScss = source('miniprogram/pages/login/login.scss')
  const indexScss = source('miniprogram/pages/index/index.scss')
  assert.match(loginScss, /@import ['"]\.\.\/\.\.\/styles\/design-tokens['"];/)
  assert.match(indexScss, /@import ['"]\.\.\/\.\.\/styles\/design-tokens['"];/)
})

test('login page uses the internal card and form hierarchy', () => {
  const wxml = source('miniprogram/pages/login/login.wxml')
  const scss = source('miniprogram/pages/login/login.scss')
  assert.match(wxml, /class="login-intro"/)
  assert.match(wxml, /class="login-form-heading"/)
  assert.match(wxml, /class="login-field"/)
  assert.match(wxml, /class="error-message"/)
  assert.doesNotMatch(scss, /linear-gradient/)
})

test('pending inspection page exposes unified toolbar, state and task metadata classes', () => {
  const wxml = source('miniprogram/pages/index/index.wxml')
  assert.match(wxml, /class="task-toolbar-heading"/)
  assert.match(wxml, /class="task-state-icon/)
  assert.match(wxml, /class="task-card-kicker"/)
  assert.match(wxml, /class="task-card-details"/)
})

test('scan workspace exposes recognition queue and confidence review states', () => {
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')
  assert.match(wxml, /class="[^"]*recognition-queue-summary/)
  assert.match(wxml, /class="recognition-queue-list"/)
  assert.match(wxml, /recognition-queue-item/)
  assert.match(wxml, /queue-add-camera/)
  assert.match(wxml, /queue-add-album/)
  assert.match(wxml, /review-risk-summary/)
  assert.match(scss, /\.is-confidence-danger/)
  assert.match(scss, /\.is-confidence-warning/)
  const summary = scss.match(/\.recognition-queue-summary\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(
    summary,
    /animation:\s*content-rise\s+\.38s\s+\.01s\s+ease-out\s+both;/,
  )
  const riskSummary = scss.match(/\.review-risk-summary\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(
    riskSummary,
    /animation:\s*content-rise\s+\.38s\s+\.04s\s+ease-out\s+both;/,
  )
  assert.match(scss, /\.api-card\s*\{\s*animation-delay:\s*\.08s;\s*\}/)
  assert.match(scss, /\.form-card\s*\{\s*animation-delay:\s*\.12s;\s*\}/)
  assert.match(scss, /\.table-card\s*\{\s*animation-delay:\s*\.16s;\s*\}/)
  assert.doesNotMatch(wxml, /screen === 'recognizing'/)
})

test('recognition queue add buttons remain full-width and single-line', () => {
  const scss = source('miniprogram/pages/index/index.scss')
  const layout = scss.match(/\.queue-add-actions\s*\{([^}]*)\}/)?.[1] || ''
  const buttons = scss.match(
    /\.queue-add-actions \.primary-button,\s*\n\.queue-add-actions \.secondary-button\s*\{([^}]*)\}/,
  )?.[1] || ''
  assert.match(layout, /grid-template-columns:\s*1fr;/)
  assert.doesNotMatch(layout, /1fr\s+1fr/)
  assert.match(buttons, /white-space:\s*nowrap;/)
})

test('record cards expose server-aware delete controls', () => {
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')
  const page = source('miniprogram/pages/index/index.ts')
  assert.match(wxml, /class="history-delete-button"/)
  assert.match(wxml, /loading="\{\{historyDeletingId === item\.id\}\}"/)
  assert.match(wxml, /catchtap="deleteHistory"/)
  assert.doesNotMatch(
    wxml,
    /wx:if="\{\{item\.origin === 'local'\}\}" class="history-delete-button"/,
  )
  assert.match(scss, /\.history-delete-button\s*\{/)
  const cardMain = scss.match(/\.history-main\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(cardMain, /padding-right:\s*64rpx;/)
  assert.match(page, /deleteRemoteInspectionRecord/)
  assert.match(page, /deleteInspectionHistoriesByServerRecord/)
})

test('task and history lists expose animated loading skeletons', () => {
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')
  const page = source('miniprogram/pages/index/index.ts')
  assert.match(
    wxml,
    /wx:if="\{\{taskLoading && taskItems\.length === 0\}\}" class="task-skeleton-list"/,
  )
  assert.match(
    wxml,
    /wx:if="\{\{historyLoading && historyRecords\.length === 0\}\}" class="history-skeleton-list"/,
  )
  assert.match(
    wxml,
    /wx:elif="\{\{!historyLoading && historyRecords\.length === 0\}\}" class="history-empty"/,
  )
  assert.match(wxml, /class="[^\"]*skeleton-card/)
  assert.match(page, /historyLoading:\s*false/)
  assert.match(scss, /@keyframes skeleton-card-in/)
  assert.match(scss, /@keyframes skeleton-shimmer/)
  assert.match(scss, /\.skeleton-card:nth-child\(2\)/)
  assert.match(scss, /\.skeleton-card:nth-child\(3\)/)
})


test('recognition cards expose status-aware progress bars', () => {
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')
  assert.match(wxml, /class="queue-progress"/)
  assert.match(wxml, /class="queue-progress-fill queue-progress-fill--\{\{queueItem\.status\}\}"/)
  assert.match(wxml, /width:\s*\{\{queueItem\.progress\}\}%/)
  assert.match(wxml, /\{\{queueItem\.progress\}\}%/)
  assert.match(scss, /\.queue-progress-fill--recognizing::after/)
  assert.match(scss, /@keyframes queue-progress-shimmer/)
  assert.match(scss, /\.queue-progress-fill--failed/)
  assert.match(scss, /\.queue-progress-fill--ready/)
})

test('history page throttles automatic refreshes without flashing cached records', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')
  const attached = page.match(/attached\(\)\s*\{([\s\S]*?)\n    \},\n  \},\n  methods:/)?.[1] || ''

  assert.doesNotMatch(attached, /refreshHistory\(/)
  assert.match(page, /historyLoadedAt:\s*0/)
  assert.match(page, /historyRefreshQueued:\s*false/)
  assert.match(page, /shouldRefreshInspectionHistory/)
  assert.match(page, /shouldQueueInspectionHistoryRefresh/)
  assert.match(page, /const previousTab = this\.data\.activeTab/)
  assert.match(page, /activeTab === 'history' && previousTab !== 'history'/)
  assert.match(
    page,
    /historyRecords:\s*this\.data\.historyRecords\.length > 0\s*\? this\.data\.historyRecords/,
  )
  assert.match(wxml, /bindtap="retryHistoryRefresh"/)
  assert.match(page, /shouldQueueInspectionHistoryRefresh\([\s\S]*?this\.data\.historyRefreshQueued/)
  assert.match(page, /const queuedRefresh = this\.data\.historyRefreshQueued/)
  assert.match(page, /historyRefreshQueued:\s*false/)
  assert.match(page, /if \(queuedRefresh\) this\.refreshHistory\(true\)/)
  assert.ok((page.match(/refreshHistory\(true\)/g) || []).length >= 4)
})
