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

test('recognition cards advance progress on a 300ms wall-clock timer while a request is active', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const skipQueueRecognition = page.match(
    /skipQueueRecognition\(event: WechatMiniprogram\.TouchEvent\) \{([\s\S]*?)\n    \},\n    removeQueueRecognition/,
  )?.[1] || ''

  assert.match(page, /RECOGNITION_PROGRESS_TICK_MS\s*=\s*300/)
  assert.match(page, /getTimedRecognitionProgress/)
  assert.match(page, /startRecognitionProgress\(id: string\)/)
  assert.match(
    page,
    /recognitionProgressTimer = setInterval\(tick, RECOGNITION_PROGRESS_TICK_MS\)[\s\S]*?tick\(\)/,
  )
  assert.match(page, /updateQueueItem\([\s\S]*?progress/)
  assert.match(page, /this\.startRecognitionProgress\(next\.id\)/)
  assert.match(page, /this\.stopRecognitionProgress\(\)/)
  assert.match(page, /detached\(\)\s*\{[\s\S]*?stopRecognitionProgress/)
  assert.match(
    skipQueueRecognition,
    /if \(id === this\.data\.activeRecognitionQueueId\) \{\s*this\.stopRecognitionProgress\(\)\s*\}/,
  )
})

test('history page throttles automatic refreshes without flashing cached records', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')
  const attached = page.match(/attached\(\)\s*\{([\s\S]*?)\n    \},/)?.[1] || ''

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

test('all top navigation bars use the shared glass material', () => {
  const navigationScss = source('miniprogram/components/navigation-bar/navigation-bar.scss')
  const loginJson = source('miniprogram/pages/login/login.json')
  const loginWxml = source('miniprogram/pages/login/login.wxml')
  const indexWxml = source('miniprogram/pages/index/index.wxml')
  const logsWxml = source('miniprogram/pages/logs/logs.wxml')
  const skeletonWxml = source('miniprogram/pages/index/index.skeleton.wxml')
  const skeletonWxss = source('miniprogram/pages/index/index.skeleton.wxss')

  assert.match(navigationScss, /background:\s*rgba\(246,\s*249,\s*252,\s*\.48\)/)
  const navigationBlur = navigationScss.match(/backdrop-filter:\s*blur\((\d+rpx)\)\s+saturate\(132%\)/)?.[1]
  assert.ok(navigationBlur)
  assert.match(navigationScss, new RegExp(`-webkit-backdrop-filter:\\s*blur\\(${navigationBlur}\\)\\s+saturate\\(132%\\)`))
  assert.match(navigationScss, /border-bottom:/)

  assert.match(loginJson, /"navigationStyle"\s*:\s*"custom"/)
  assert.match(loginJson, /"navigation-bar"\s*:\s*"\/components\/navigation-bar\/navigation-bar"/)
  assert.match(loginWxml, /<navigation-bar[^>]*title="账号登录"[^>]*back="\{\{false\}\}"/)

  for (const wxml of [loginWxml, indexWxml, logsWxml]) {
    assert.match(wxml, /background="rgba\(246, 249, 252, \.48\)"/)
  }

  assert.match(skeletonWxml, /background:\s*rgba\(246, 249, 252, \.48\)/)
  assert.match(skeletonWxss, new RegExp(`backdrop-filter:\\s*blur\\(${navigationBlur}\\)\\s+saturate\\(132%\\)`))
})

test('glass navigation remains fixed with spacing derived from the unified height', () => {
  const navigationScss = source('miniprogram/components/navigation-bar/navigation-bar.scss')
  const navigationTs = source('miniprogram/components/navigation-bar/navigation-bar.ts')
  const indexWxml = source('miniprogram/pages/index/index.wxml')
  const indexScss = source('miniprogram/pages/index/index.scss')
  const loginWxml = source('miniprogram/pages/login/login.wxml')
  const loginScss = source('miniprogram/pages/login/login.scss')
  const logsWxml = source('miniprogram/pages/logs/logs.wxml')
  const logsScss = source('miniprogram/pages/logs/logs.scss')
  const skeletonWxml = source('miniprogram/pages/index/index.skeleton.wxml')
  const skeletonWxss = source('miniprogram/pages/index/index.skeleton.wxss')

  assert.match(navigationScss, /\.weui-navigation-bar\s*\{\s*position:\s*fixed;/)
  assert.doesNotMatch(navigationScss, /position:\s*sticky/)
  assert.match(navigationScss, /top:\s*0;/)
  assert.match(navigationScss, /left:\s*0;/)
  assert.match(navigationScss, /right:\s*0;/)

  assert.match(indexWxml, /^<navigation-bar[^>]*>[^]*?<scroll-view[^>]*class="page-scroll"/)
  assert.match(logsWxml, /<navigation-bar[^>]*>[^]*?<scroll-view[^>]*class="scrollarea"/)
  assert.match(skeletonWxml, /<view is="components\/navigation-bar\/navigation-bar">[^]*?<scroll-view[^>]*class="page-scroll"/)

  const indexShell = indexScss.match(/\.page-shell\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(navigationScss, /height:\s*calc\(var\(--height\) \+ env\(safe-area-inset-top\) \+ 8px\)/)
  assert.match(navigationScss, /padding-top:\s*calc\(env\(safe-area-inset-top\) \+ 8px\)/)
  assert.match(navigationTs, /const SAFE_AREA_TOP_EXTRA = 8[^]*const adjustedSafeAreaTop = safeAreaTop \+ SAFE_AREA_TOP_EXTRA/)
  assert.doesNotMatch(navigationTs, /isDevtools \|\| isAndroid \?/)
  assert.match(indexShell, /padding:\s*calc\(36px \+ env\(safe-area-inset-top\) \+ 8px \+ 32rpx\)/)
  assert.match(loginScss, /padding:\s*calc\(36px \+ env\(safe-area-inset-top\) \+ 8px \+ 72rpx\)/)
  assert.match(logsScss, /padding-top:\s*calc\(36px \+ env\(safe-area-inset-top\) \+ 8px\)/)
  assert.match(skeletonWxml, /height: calc\(var\(--height\) \+ 55px\); padding-top: 55px;/)
  assert.match(skeletonWxss, /\.bar--weui-navigation-bar\s*\{\s*--height:\s*36px;[^}]*position:\s*fixed;/)

  assert.match(navigationTs, /triggerEvent\('heightchange', \{ height: navigationBarHeight \}\)/)
  assert.match(indexWxml, /<navigation-bar[^>]*bindheightchange="onNavigationHeightChange"/)
  assert.match(indexWxml, /class="page-shell"[^>]*padding-top: calc\(\{\{navigationBarHeight\}\}px \+ 32rpx\)/)
  assert.match(loginWxml, /<navigation-bar[^>]*bindheightchange="onNavigationHeightChange"/)
  assert.match(loginWxml, /class="login-page"[^>]*padding-top: calc\(\{\{navigationBarHeight\}\}px \+ 72rpx\)/)
  assert.match(logsWxml, /<navigation-bar[^>]*bindheightchange="onNavigationHeightChange"/)
  assert.match(logsWxml, /class="scrollarea"[^>]*padding-top: \{\{navigationBarHeight\}\}px/)
})

test('all glass navigation variants share one content height', () => {
  const navigationScss = source('miniprogram/components/navigation-bar/navigation-bar.scss')
  const skeletonWxss = source('miniprogram/pages/index/index.skeleton.wxss')
  const baseHeight = navigationScss.match(/\.weui-navigation-bar\s*\{[^}]*--height:\s*(\d+px)/)?.[1]
  const androidHeight = navigationScss.match(/\.weui-navigation-bar \.android\s*\{[^}]*--height:\s*(\d+px)/)?.[1]

  assert.equal(baseHeight, '36px')
  assert.equal(androidHeight, baseHeight)
  assert.match(skeletonWxss, new RegExp(`\\.bar--weui-navigation-bar\\s*\\{[^}]*--height:\\s*${baseHeight}`))
})
