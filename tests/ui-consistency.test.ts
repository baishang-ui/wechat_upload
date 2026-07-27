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
  assert.match(wxml, /class="history-delete-icon"[^>]*>×<\/text>/)
  assert.doesNotMatch(wxml, />删<\/text>/)
  assert.match(wxml, /loading="\{\{historyDeletingId === item\.id\}\}"/)
  assert.match(wxml, /catchtap="deleteHistory"/)
  assert.doesNotMatch(
    wxml,
    /wx:if="\{\{item\.origin === 'local'\}\}" class="history-delete-button"/,
  )
  assert.match(scss, /\.history-delete-button\s*\{/)
  const cardMain = scss.match(/\.history-main\s*\{([^}]*)\}/)?.[1] || ''
  const cardRow = scss.match(/\.history-row\s*\{([^}]*)\}/)?.[1] || ''
  const deleteButton = scss.match(/\.history-delete-button\s*\{([^}]*)\}/)?.[1] || ''
  const syncRow = scss.match(/\.history-sync-row\s*\{([^}]*)\}/)?.[1] || ''
  const syncStatus = scss.match(/\.history-sync-status\s*\{([^}]*)\}/)?.[1] || ''
  const syncError = scss.match(/\.history-sync-error\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(cardMain, /padding-right:\s*0;/)
  assert.match(cardRow, /padding-right:\s*72rpx;/)
  assert.match(deleteButton, /top:\s*18rpx;/)
  assert.doesNotMatch(deleteButton, /bottom:/)
  assert.match(deleteButton, /width:\s*56rpx;/)
  assert.match(deleteButton, /height:\s*56rpx;/)
  assert.match(deleteButton, /min-width:\s*56rpx;/)
  assert.match(deleteButton, /max-width:\s*56rpx;/)
  assert.match(deleteButton, /box-sizing:\s*border-box;/)
  assert.match(deleteButton, /border-radius:\s*50%;/)
  assert.match(scss, /\.history-delete-icon\s*\{/)
  assert.match(syncRow, /flex-wrap:\s*nowrap;/)
  assert.match(syncStatus, /white-space:\s*nowrap;/)
  assert.match(syncError, /white-space:\s*normal;/)
  assert.match(syncError, /-webkit-line-clamp:\s*2;/)
  assert.match(page, /deleteRemoteInspectionRecord/)
  assert.match(page, /deleteInspectionHistoriesByServerRecord/)
})

test('workspace exposes an account tab with current-user details and logout', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')

  assert.match(page, /type WorkspaceTab = 'scan' \| 'tasks' \| 'history' \| 'account'/)
  const authImport = page.match(/import \{([^}]*)\} from '\.\.\/\.\.\/services\/auth-service'/s)?.[1] || ''
  assert.match(authImport, /AuthUser/)
  assert.match(authImport, /getCurrentUser/)
  assert.match(authImport, /logout/)
  assert.match(page, /currentUser:\s*null as AuthUser \| null/)
  assert.match(page, /confirmLogout\(\)/)
  assert.match(page, /logout\(\)/)
  assert.match(page, /wx\.reLaunch\(\{ url: '\/pages\/login\/login' \}\)/)
  assert.match(wxml, /activeTab === 'account'/)
  assert.match(wxml, /class="account-profile-card card"/)
  assert.match(wxml, /bindtap="confirmLogout"/)
  assert.match(wxml, /data-tab="account"/)
  assert.match(wxml, />账户<\/text>/)
  assert.match(scss, /grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/)
  assert.match(scss, /\.tab-indicator\.is-account\s*\{/)
  assert.match(scss, /\.account-logout-button\s*\{/)
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
  assert.match(page, /const recognitionProgressTimers = new Map<string, ReturnType<typeof setInterval>>\(\)/)
  assert.match(page, /const recognitionProgressStartedAt = new Map<string, number>\(\)/)
  assert.match(page, /stopRecognitionProgress\(id: string\)/)
  assert.match(page, /stopAllRecognitionProgress\(\)/)
  assert.match(page, /this\.stopAllRecognitionProgress\(\)/)
  assert.match(page, /MAX_CONCURRENT_RECOGNITIONS/)
  assert.match(page, /claimQueuedRecognitionItems\(\s*this\.data\.recognitionQueue\s*,\s*MAX_CONCURRENT_RECOGNITIONS\s*,?\s*\)/)
  assert.match(page, /claimed\.claimed\.forEach\(\(item\) => this\.startQueueRecognition\(item\.id\)\)/)
  assert.match(page, /this\.stopRecognitionProgress\(id\)/)
  assert.match(page, /const queueIndex = this\.data\.recognitionQueue\.findIndex/)
  assert.match(page, /`recognitionQueue\[\$\{queueIndex\}\]\.progress`/)
  assert.match(page, /this\.setData\(\{ \[progressPath\]: progress \}\)/)
  assert.doesNotMatch(page, /applyRecognitionQueue\(updateQueueItem\(this\.data\.recognitionQueue, id, \{ progress \}\)\)/)
  assert.match(page, /if \(progress >= current\.progressProfile\.tailCeiling\) this\.stopRecognitionProgress\(id\)/)
  assert.doesNotMatch(page, /activeRecognitionQueueId/)
  assert.match(
    skipQueueRecognition,
    /this\.stopRecognitionProgress\(id\)/,
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

  assert.match(navigationTs, /const windowInfo = wx\.getWindowInfo\(\)/)
  assert.match(navigationTs, /const deviceInfo = wx\.getDeviceInfo\(\)/)
  assert.doesNotMatch(navigationTs, /wx\.getSystemInfo(?:Sync)?\(/)
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

test('all image pickers request original files without client-side compression', () => {
  const pickerFiles = [
    'miniprogram/pages/index/index.ts',
    'miniprogram/pages/inspection-workbench/inspection-workbench.ts',
    'miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts',
  ]

  pickerFiles.forEach((file) => {
    const fileSource = source(file)
    assert.doesNotMatch(fileSource, /sizeType:\s*\['compressed'\]/)
    assert.match(fileSource, /sizeType:\s*\['original'\]/)
  })
})

test('recognition work stops scheduling UI work after the workspace is detached', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const detached = page.match(/detached\(\) \{([\s\S]*?)\n    \},/)?.[1] || ''
  const startQueueRecognition = page.match(
    /startQueueRecognition\(id: string\) \{([\s\S]*?)\n    \},\n    async autoWriteQueueRecognition/,
  )?.[1] || ''

  assert.match(page, /const attachedWorkspaceComponents = new WeakSet<object>\(\)/)
  assert.match(page, /const recognitionStageTimers = new WeakMap<object, Set<ReturnType<typeof setTimeout>>>\(\)/)
  assert.match(page, /attachedWorkspaceComponents\.add\(this\)/)
  assert.match(detached, /attachedWorkspaceComponents\.delete\(this\)/)
  assert.match(detached, /clearRecognitionStageTimers\(this\)/)
  assert.match(startQueueRecognition, /scheduleRecognitionStage\(this, \(\) => \{/)
  assert.match(startQueueRecognition, /if \(!attachedWorkspaceComponents\.has\(this\)\) return/)
  assert.match(startQueueRecognition, /\.finally\(\(\) => \{[\s\S]*if \(attachedWorkspaceComponents\.has\(this\)\) this\.runRecognitionQueue\(\)/)
})
