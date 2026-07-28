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
  assert.match(wxml, /class="task-toolbar-title">质检订单<\/view>/)
  assert.match(wxml, /placeholder="搜索质检单号、采购合同、客户或供应商"/)
  assert.match(wxml, /class="task-card-kicker">质检订单<\/view>/)
  assert.match(wxml, /class="task-card-title">\{\{task\.task_no \|\| '未编号质检订单'\}\}<\/view>/)
  assert.match(wxml, /class="task-card-contract">采购合同：\{\{task\.contract_no \|\| '—'\}\}<\/view>/)
})

test('recognized report fields and matching messages identify the purchase contract explicitly', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')

  assert.match(wxml, /class="field-label">采购合同号<\/text><input value="\{\{record\.orderNumber\}\}"/)
  const historyEditor = source('miniprogram/components/history-editor-modal/history-editor-modal.wxml')
  assert.match(historyEditor, /class="field-label">采购合同号<\/text>/)
  assert.match(historyEditor, /data-field="orderNumber"/)
  assert.match(page, /missing_order_number': stage = '识别完成，未识别到合同号'/)
  assert.match(page, /order_ambiguous': stage = '识别完成，合同号对应多个质检订单，请手动选择'/)
  assert.match(page, /item_not_found': stage = '识别完成，质检订单中没有待检产品'/)
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

test('review inputs update only their bound leaf and preserve the native cursor viewport', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const onRecordInput = page.match(/onRecordInput\(event: WechatMiniprogram\.Input\) \{([\s\S]*?)\n    \},\n    onRowInput/)?.[1] || ''
  const onRowInput = page.match(/onRowInput\(event: WechatMiniprogram\.Input\) \{([\s\S]*?)\n    \},\n    onMeasurementInput/)?.[1] || ''
  const onMeasurementInput = page.match(/onMeasurementInput\(event: WechatMiniprogram\.Input\) \{([\s\S]*?)\n    \},\n    onJudgementChange/)?.[1] || ''

  assert.match(onRecordInput, /\[`record\.\$\{String\(field\)\}`\]: value/)
  assert.match(onRowInput, /\[`record\.rows\[\$\{rowIndex\}\]\.\$\{field\}`\]: value/)
  assert.match(onMeasurementInput, /\[`record\.rows\[\$\{rowIndex\}\]\.measurements\[\$\{measurementIndex\}\]`\]: value/)

  for (const handler of [onRecordInput, onRowInput, onMeasurementInput]) {
    assert.doesNotMatch(handler, /record:\s*update(?:RecordField|RowField|Measurement)\(/)
    assert.match(handler, /return value/)
  }
})

test('review text inputs keep identical text metrics before and after focus', () => {
  const scss = source('miniprogram/pages/index/index.scss')
  const wxml = source('miniprogram/pages/index/index.wxml')
  const pageConfig = source('miniprogram/pages/index/index.json')
  const reviewEditor = wxml.match(/<view wx:if="\{\{activeTab === 'scan' && screen === 'review'\}\}" class="review-native-page">([\s\S]*?)<scroll-view\s+wx:else/)?.[1] || ''
  const reviewInputs = reviewEditor.match(/<(?:input|textarea)\b[^>]*>/g) || []
  const reviewEditorCards = reviewEditor.match(/<view class="card [^"]*review-editor-card[^"]*">/g) || []
  const fieldInput = scss.match(/\.field input\s*\{([^}]*)\}/)?.[1] || ''
  const tableInput = scss.match(/\.table-cell input\s*\{([^}]*)\}/)?.[1] || ''
  const field = scss.match(/\.field\s*\{([^}]*)\}/)?.[1] || ''
  const tableCell = scss.match(/\.table-cell\s*\{([^}]*)\}/)?.[1] || ''
  const reviewEditorCard = scss.match(/\.review-editor-card\s*\{([^}]*)\}/)?.[1] || ''
  const reviewEditorFade = scss.match(/@keyframes review-editor-fade\s*\{([\s\S]*?)\n\}/)?.[1] || ''

  assert.ok(reviewInputs.length > 0)
  for (const input of reviewInputs) assert.match(input, /\sadjust-position="\{\{false\}\}"/)
  for (const input of reviewInputs) assert.doesNotMatch(input, /always-embed=/)
  assert.equal(reviewEditorCards.length, 3)
  assert.match(
    wxml,
    /<view wx:if="\{\{activeTab === 'scan' && screen === 'review'\}\}" class="review-native-page">/,
  )
  assert.match(wxml, /<scroll-view\s+wx:else\s+class="page-scroll"\s+scroll-y\s+enhanced/)
  assert.doesNotMatch(reviewEditor, /class="page-scroll"/)
  assert.doesNotMatch(pageConfig, /"disableScroll":\s*true/)
  assert.match(reviewEditor, /<scroll-view class="table-scroll" scroll-x show-scrollbar="\{\{false\}\}">/)
  assert.doesNotMatch(reviewEditor, /<scroll-view class="table-scroll"[^>]*\senhanced(?:=|\s|>)/)
  assert.match(reviewEditorCard, /animation-name:\s*review-editor-fade;/)
  assert.doesNotMatch(reviewEditorFade, /transform:/)

  assert.match(fieldInput, /height:\s*48rpx;/)
  assert.match(fieldInput, /line-height:\s*48rpx;/)
  assert.match(fieldInput, /padding:\s*0;/)
  assert.match(fieldInput, /box-sizing:\s*border-box;/)
  assert.match(tableInput, /height:\s*48rpx;/)
  assert.match(tableInput, /line-height:\s*48rpx;/)
  assert.match(tableInput, /padding:\s*0;/)
  assert.match(tableInput, /box-sizing:\s*border-box;/)
  assert.match(field, /overflow:\s*hidden;/)
  assert.match(tableCell, /overflow:\s*hidden;/)
})

test('review actions keep return, export, and save controls in one balanced row', () => {
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')
  const actions = wxml.match(/<view class="bottom-actions">([\s\S]*?)<\/view>/)?.[1] || ''
  const layout = scss.match(/\.bottom-actions\s*\{([^}]*)\}/)?.[1] || ''
  const buttons = scss.match(
    /\.bottom-actions \.primary-button,\s*\n\.bottom-actions \.secondary-button,\s*\n\.bottom-actions \.export-button\s*\{([^}]*)\}/,
  )?.[1] || ''

  assert.match(actions, /bindtap="backToRecognitionQueue"/)
  assert.match(actions, /bindtap="exportCurrentRecord"/)
  assert.match(actions, /bindtap="submitRecord"/)
  assert.match(layout, /grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/)
  assert.match(buttons, /height:\s*88rpx;/)
  assert.match(buttons, /margin-top:\s*0;/)
  assert.match(buttons, /font-size:\s*26rpx;/)
  assert.match(buttons, /white-space:\s*nowrap;/)
})

test('quality orders use the same all-source and all-status default scope as the web workbench', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const activateTab = page.match(/activateTab\(activeTab: WorkspaceTab\) \{([\s\S]*?)\n    \},\n    switchTab/)?.[1] || ''
  const loadTasks = page.match(/loadTasks\(reset = false, force = false\): Promise<void> \{([\s\S]*?)\n    \},\n    loadMoreTasks/)?.[1] || ''
  const openTask = page.match(/openTask\(event: WechatMiniprogram\.TouchEvent\) \{([\s\S]*?)\n    \},\n    selectTaskItem/)?.[1] || ''
  const pageShow = page.match(/pageLifetimes:\s*\{[\s\S]*?show\(\) \{([\s\S]*?)\n    \},?[\s\S]*?\n  \},\n  methods:/)?.[1] || ''

  assert.match(page, /taskAppliedSearch:\s*''/)
  assert.match(page, /taskStatus:\s*'all'/)
  assert.match(page, /taskLoadedAt:\s*0/)
  assert.match(page, /taskRefreshQueued:\s*false/)
  assert.match(page, /taskRequestId:\s*0/)
  assert.match(page, /taskOpeningId:\s*0/)
  assert.match(activateTab, /activeTab === 'tasks' && previousTab !== 'tasks'[\s\S]*?loadTasks\(true, true\)/)
  assert.match(pageShow, /activeTab === 'tasks'/)
  assert.match(pageShow, /loadTasks\(true, true\)/)
  assert.match(loadTasks, /const search = this\.data\.taskAppliedSearch\.trim\(\)/)
  assert.match(loadTasks, /status:\s*status === 'all' \? undefined : status/)
  assert.match(loadTasks, /sourceType:\s*'all'/)
  assert.doesNotMatch(loadTasks, /sourceType:\s*'purchase_order'/)
  assert.match(loadTasks, /shouldRefreshInspectionTasks/)
  assert.match(loadTasks, /shouldQueueInspectionTaskRefresh/)
  assert.match(loadTasks, /const preserveTaskItems = resetList && !queryChanged/)
  assert.match(loadTasks, /taskRefreshing:\s*preserveTaskItems/)
  assert.match(loadTasks, /resetList && queryChanged[\s\S]*?taskItems:\s*\[\]/)
  assert.match(loadTasks, /taskRequestId !== requestId/)
  assert.match(loadTasks, /taskRefreshQueued/)
  assert.match(page, /confirmTaskSearch\(\)[\s\S]*?taskAppliedSearch[\s\S]*?loadTasks\(true, true\)/)
  assert.match(page, /changeTaskStatus[\s\S]*?loadTasks\(true, true\)/)
  assert.match(openTask, /getInspectionTask\(taskId\)/)
  assert.doesNotMatch(openTask, /taskLoading:\s*true/)
  assert.match(openTask, /taskOpeningId/)
})

test('sample judgements use binary switches with on as OK and off as NG', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')
  const historyEditor = source('miniprogram/components/history-editor-modal/history-editor-modal.ts')
  const historyEditorWxml = source('miniprogram/components/history-editor-modal/history-editor-modal.wxml')
  const scss = source('miniprogram/pages/index/index.scss')
  const onJudgementChange = page.match(/onJudgementChange\(event: WechatMiniprogram\.CustomEvent<\{ value: boolean \}>\) \{([\s\S]*?)\n    \},\n    submitRecord/)?.[1] || ''
  const toggleHistoryJudgement = historyEditor.match(/toggleJudgement\(event: WechatMiniprogram\.TouchEvent\) \{([\s\S]*?)\n    \},\n\n    exportRecord/)?.[1] || ''

  assert.equal((wxml.match(/<switch\b/g) || []).length, 1)
  assert.match(wxml, /<switch[^>]*checked="\{\{judgement === 'OK'\}\}"[^>]*bindchange="onJudgementChange"/)
  assert.match(historyEditorWxml, /class="judgement-toggle[\s\S]*bindtap="toggleJudgement"/)
  assert.doesNotMatch(historyEditorWxml, /<(?:picker|switch)\b/)
  assert.match(onJudgementChange, /event\.detail\.value \? 'OK' : 'NG'/)
  assert.match(toggleHistoryJudgement, /current === 'OK' \? 'NG' : 'OK'/)
  assert.match(scss, /\.judgement-switch-control/)
  assert.match(scss, /\.judgement-switch/)
})

test('history records mount the detail drawer from the workspace', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')
  const pageConfig = source('miniprogram/pages/index/index.json')
  const historyEditorTag = wxml.match(/<history-editor-modal[\s\S]*?\/>/)?.[0] || ''
  const openHistory = page.match(/openHistory\(event: WechatMiniprogram\.TouchEvent\) \{([\s\S]*?)\n    \},\n    closeHistoryEditorModal/)?.[1] || ''
  const closeHistory = page.match(/closeHistoryEditorModal\(\) \{([\s\S]*?)\n    \},\n    noop/)?.[1] || ''

  assert.match(pageConfig, /"history-editor-modal":\s*"\/components\/history-editor-modal\/history-editor-modal"/)
  assert.match(historyEditorTag, /visible="\{\{historyEditorVisible\}\}"/)
  assert.match(historyEditorTag, /bindclose="closeHistoryEditorModal"/)
  assert.match(historyEditorTag, /bindsaved="onHistoryEditorModalSaved"/)
  assert.match(historyEditorTag, /wx:if="\{\{historyEditorVisible\}\}"/)
  assert.match(page, /historyEditorVisible:\s*false/)
  assert.match(openHistory, /historyEditorVisible:\s*true/)
  assert.match(openHistory, /historyEditorOrigin:\s*selected\.origin/)
  assert.match(openHistory, /historyEditorId:\s*selected\.id/)
  assert.doesNotMatch(openHistory, /wx\.navigateTo|wx\.showModal/)
  assert.match(closeHistory, /historyEditorVisible:\s*false/)
  assert.match(closeHistory, /historyEditorId:\s*''/)
  assert.match(closeHistory, /historyEditorTaskId:\s*0/)
  assert.match(page, /onHistoryEditorModalSaved\([\s\S]*?this\.onHistoryEditorSaved\(event\.detail\.record\)/)
})

test('history editor keeps one native input bridge while unloading drawer content after animation', () => {
  const app = source('miniprogram/app.json')
  const page = source('miniprogram/components/history-editor-modal/history-editor-modal.ts')
  const wxml = source('miniprogram/components/history-editor-modal/history-editor-modal.wxml')
  const scss = source('miniprogram/components/history-editor-modal/history-editor-modal.scss')
  const finishClose = page.match(/finishClose\(\) \{([\s\S]*?)\n    \},\n\n    previewImage/)?.[1] || ''
  const releaseDrawerContent = page.match(/releaseDrawerContent\((?:[\s\S]*?)\) \{([\s\S]*?)\n    \},\n\n    previewImage/)?.[1] || ''
  const activateSharedEditor = page.match(/activateSharedEditor\((?:[\s\S]*?)\n    \) \{([\s\S]*?)\n    \},\n\n    onSharedEditorInput/)?.[1] || ''
  const nativeEditors = wxml.match(/<(?:input|textarea)\b/g) || []
  const textareaOffset = wxml.indexOf('<textarea')
  const drawerBodyOffset = wxml.indexOf('<scroll-view wx:if="{{drawerMounted}}"')

  assert.doesNotMatch(app, /"pages\/history-editor\/history-editor"/)
  assert.doesNotMatch(app, /"pages\/history-field-editor\/history-field-editor"/)
  assert.doesNotMatch(wxml, /scroll-x|inspection-table|always-embed/)
  assert.match(wxml, /wx:for="\{\{rowItems\}\}"/)
  assert.doesNotMatch(wxml, /wx:for="\{\{record\.rows\}\}"/)
  assert.doesNotMatch(wxml, /row-pagination|goPreviousRowPage|goNextRowPage/)
  assert.doesNotMatch(page, /buildHistoryEditorRowPage|pageRows|pageTotal/)
  assert.equal(nativeEditors.length, 1)
  assert.match(
    wxml,
    /<textarea\s+wx:if="\{\{drawerMounted && activeEditorVisible\}\}"\s+class="shared-inline-editor-input"/,
  )
  assert.match(wxml, /bindinput="onSharedEditorInput"/)
  assert.match(wxml, /hold-keyboard="\{\{true\}\}"/)
  assert.doesNotMatch(wxml, /\sdisabled="\{\{!drawerMounted/)
  assert.doesNotMatch(wxml, /fixed=/)
  assert.match(wxml, /^<view class="history-modal-layer \{\{drawerMounted \? 'is-mounted' : ''\}\}/)
  assert.match(wxml, /<view class="history-modal-panel"[\s\S]*class="shared-inline-editor/)
  assert.ok(textareaOffset > 0 && drawerBodyOffset > textareaOffset)
  assert.match(wxml, /<scroll-view wx:if="\{\{drawerMounted\}\}" class="history-modal-body"/)
  assert.match(wxml, /data-field="customer" data-label="客户" bindtap="beginRecordEdit"/)
  assert.match(wxml, /data-field="item" data-label="检验项目" bindtap="beginRowFieldEdit"/)
  assert.match(wxml, /data-measurement-index="\{\{measurementIndex\}\}" bindtap="beginMeasurementEdit"/)
  assert.doesNotMatch(wxml, /bindinput="(?:onRecordInput|onRowFieldInput|onMeasurementInput)"/)
  assert.match(wxml, /expandedRowIndex === rowItem\.rowIndex/)
  assert.doesNotMatch(wxml, /startEditing|编辑记录|wx:if="\{\{editing\}\}"/)
  assert.doesNotMatch(page, /editable:\s*true|wx\.showModal|wx\.showActionSheet|wx\.navigateTo/)
  assert.match(page, /onSharedEditorInput[\s\S]*historyEditorDraftValues\.set/)
  assert.match(page, /commitActiveEditor[\s\S]*updateRowField/)
  assert.match(page, /commitActiveEditor[\s\S]*updateMeasurement/)
  assert.match(page, /detached\(\) \{[\s\S]*clearHistoryEditorCloseTimer\(this\)/)
  assert.match(page, /detached\(\) \{[\s\S]*historyEditorDraftValues\.delete\(this\)/)
  assert.match(page, /detached\(\) \{[\s\S]*historyEditorRawContents\.delete\(this\)/)
  assert.match(page, /detached\(\) \{[\s\S]*historyEditorRows\.delete\(this\)/)
  assert.match(page, /drawerMounted:\s*false/)
  assert.match(page, /observers:\s*\{[\s\S]*'visible, origin, recordId, sourceType, taskId, itemId'/)
  assert.match(page, /openDrawer\(\)[\s\S]*drawerMounted:\s*true/)
  assert.match(activateSharedEditor, /commitActiveEditor\(activate,\s*true\)/)
  assert.match(finishClose, /closing:\s*true/)
  assert.match(finishClose, /expandedRowIndex:\s*-1/)
  assert.match(finishClose, /activeEditorFocused:\s*false/)
  assert.match(finishClose, /wx\.hideKeyboard\(\)/)
  assert.match(finishClose, /scheduleHistoryEditorClose\(this/)
  assert.match(finishClose, /releaseDrawerContent/)
  assert.match(releaseDrawerContent, /drawerMounted:\s*false/)
  assert.match(releaseDrawerContent, /rowItems:\s*\[\]/)
  assert.match(releaseDrawerContent, /record:\s*withoutInspectionRows\(createMockRecord\(\)\)/)
  assert.match(releaseDrawerContent, /historyEditorRawContents\.delete\(this\)/)
  assert.match(releaseDrawerContent, /historyEditorRows\.delete\(this\)/)
  assert.match(releaseDrawerContent, /triggerEvent\('close'/)
  assert.match(scss, /height:\s*88vh;/)
  assert.doesNotMatch(scss, /backdrop-filter/)
  assert.match(scss, /@keyframes history-modal-sheet-up/)
  assert.match(scss, /@keyframes history-modal-sheet-down/)
})
