import test from 'node:test'
import strictAssert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const assert: typeof strictAssert = strictAssert
const root = resolve(__dirname, '..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('all project animation curves use explicit cubic bezier timing', () => {
  const animationSources = [
    'miniprogram/app.scss',
    'miniprogram/styles/_design-tokens.scss',
    'miniprogram/pages/login/login.scss',
    'miniprogram/pages/index/index.scss',
    'miniprogram/pages/inspection-workbench/inspection-workbench.scss',
    'miniprogram/pages/logs/logs.scss',
    'miniprogram/pages/document-camera/document-camera.scss',
    'miniprogram/components/navigation-bar/navigation-bar.scss',
    'miniprogram/components/navigation-bar/navigation-bar.ts',
    'miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss',
    'miniprogram/components/history-editor-modal/history-editor-modal.scss',
    'miniprogram/components/top-toast/top-toast.scss',
  ]

  animationSources.forEach((path) => {
    const declarations = source(path).matchAll(/\b(animation|transition)\s*:\s*([^;]+);/g)
    for (const [, property, value] of declarations) {
      if (property === 'animation' && value.trim() === 'none') continue
      assert.match(value, /cubic-bezier\(/, `${path} contains an implicit or keyword timing curve: ${value.trim()}`)
      assert.doesNotMatch(value, /\b(?:ease|ease-in|ease-out|ease-in-out|linear)\b/)
    }
  })
})

test('login and index pages share the inspection design tokens', () => {
  const loginScss = source('miniprogram/pages/login/login.scss')
  const indexScss = source('miniprogram/pages/index/index.scss')
  assert.match(loginScss, /@import ['"]\.\.\/\.\.\/styles\/design-tokens['"];/)
  assert.match(indexScss, /@import ['"]\.\.\/\.\.\/styles\/design-tokens['"];/)
})

test('global presentation styles share semantic surface and interaction tokens', () => {
  const tokens = source('miniprogram/styles/_design-tokens.scss')
  const presentationStyles = [
    'miniprogram/pages/document-camera/document-camera.scss',
    'miniprogram/pages/logs/logs.scss',
    'miniprogram/components/navigation-bar/navigation-bar.scss',
    'miniprogram/components/top-toast/top-toast.scss',
  ]

  ;[
    '$ui-surface-secondary',
    '$ui-surface-tertiary',
    '$ui-surface-hover',
    '$ui-primary-soft',
    '$ui-success-border',
    '$ui-warning',
    '$ui-warning-background',
    '$ui-warning-border',
    '$ui-danger-background-pressed',
    '$ui-danger-border',
    '$ui-overlay-background',
    '$ui-overlay-surface',
    '$ui-sheet-background',
    '$ui-overlay-shadow',
    '$ui-glass-background',
    '$ui-glass-border',
    '$ui-glass-highlight-strong',
    '$ui-glass-highlight-medium',
    '$ui-glass-highlight-soft',
    '$ui-bottom-glass-brightness',
    '$ui-diffuse-glow',
    '$ui-diffuse-glow-strong',
    '$ui-glass-shadow',
    '$ui-glass-blur',
    '$ui-glass-saturation',
    '$ui-button-radius',
    '$ui-field-radius',
    '$ui-disabled-opacity',
  ].forEach((token) => assert.match(tokens, new RegExp(`\\${token}:`)))
  assert.match(tokens, /\$ui-glass-blur:\s*18rpx;/)
  assert.match(tokens, /\$ui-glass-saturation:\s*132%;/)

  presentationStyles.forEach((path) => {
    assert.match(source(path), /@import ['"]\.\.\/\.\.\/styles\/design-tokens['"];/)
  })

  const indexScss = source('miniprogram/pages/index/index.scss')
  const primaryButton = indexScss.match(/\.primary-button\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(primaryButton, /background:\s*\$ui-primary;/)
  assert.doesNotMatch(primaryButton, /linear-gradient/)
  assert.match(indexScss, /\.primary-button:active\s*\{[^}]*transform:\s*scale\(\.97\);/s)
})

test('drawer components use HeroUI-style semantic surfaces and interaction states', () => {
  const historyScss = source('miniprogram/components/history-editor-modal/history-editor-modal.scss')
  const workbenchScss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')
  const toastScss = source('miniprogram/components/top-toast/top-toast.scss')
  const indexScss = source('miniprogram/pages/index/index.scss')

  for (const scss of [historyScss, workbenchScss]) {
    assert.match(scss, /-modal-panel\s*\{[^}]*background:\s*\$ui-sheet-background;/s)
    assert.match(scss, /\.modal-state-card--error\s*\{[^}]*border-color:\s*\$ui-danger-border;[^}]*background:\s*\$ui-danger-background;/s)
    assert.match(scss, /\.form-field:focus-within\s*\{[^}]*border-color:\s*\$ui-primary;[^}]*box-shadow:\s*\$ui-focus-ring;/s)
    assert.match(scss, /\.measurement-field:focus-within\s*\{[^}]*border-color:\s*\$ui-primary;[^}]*box-shadow:\s*\$ui-focus-ring;/s)
  }

  assert.match(historyScss, /\.inspection-item-card\.is-expanded\s*\{[^}]*border-color:\s*\$ui-primary;[^}]*box-shadow:\s*\$ui-focus-ring;/s)
  assert.match(historyScss, /\.judgement-toggle\s*\{[^}]*border:\s*1rpx solid \$ui-success-border;[^}]*background:\s*\$ui-success-background;/s)
  assert.match(historyScss, /\.judgement-toggle\.is-ng\s*\{[^}]*border-color:\s*\$ui-danger-border;[^}]*background:\s*\$ui-danger-background;/s)
  assert.match(workbenchScss, /\.unmatched-item\s*\{[^}]*border-color:\s*\$ui-warning-border;[^}]*background:\s*\$ui-warning-background;/s)
  assert.match(workbenchScss, /\.formal-final-option\.is-active\s*\{[^}]*border-color:\s*\$ui-success-border;[^}]*background:\s*\$ui-success-background;/s)
  assert.match(workbenchScss, /\.formal-final-option--ng\.is-active\s*\{[^}]*border-color:\s*\$ui-danger-border;[^}]*background:\s*\$ui-danger-background;/s)
  assert.match(toastScss, /\.top-toast--success \.top-toast__title\s*\{\s*color:\s*\$ui-success;\s*\}/)
  assert.match(toastScss, /\.top-toast--success \.top-toast__icon\s*\{\s*background:\s*\$ui-success;\s*\}/)
  assert.match(toastScss, /\.top-toast--error \.top-toast__title\s*\{\s*color:\s*\$ui-danger;\s*\}/)
  assert.match(toastScss, /\.top-toast--warning \.top-toast__title\s*\{\s*color:\s*\$ui-warning;\s*\}/)
  assert.doesNotMatch(
    toastScss,
    /\.top-toast--(?:success|error|warning) \.top-toast__surface\s*\{[^}]*background:/s,
  )
  assert.match(indexScss, /\.history-delete-visual\s*\{[^}]*border:\s*1rpx solid \$ui-danger-border;[^}]*background:\s*\$ui-danger-background;/s)
})

test('mobile controls share readable type and finger-friendly sizing tokens', () => {
  const tokens = source('miniprogram/styles/_design-tokens.scss')
  const appScss = source('miniprogram/app.scss')
  const navigationScss = source('miniprogram/components/navigation-bar/navigation-bar.scss')
  const loginScss = source('miniprogram/pages/login/login.scss')
  const indexScss = source('miniprogram/pages/index/index.scss')
  const historyScss = source('miniprogram/components/history-editor-modal/history-editor-modal.scss')
  const workbenchScss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')

  ;[
    '$ui-touch-target',
    '$ui-control-height',
    '$ui-control-height-large',
    '$ui-font-body',
    '$ui-font-control',
    '$ui-font-label',
    '$ui-font-caption',
  ].forEach((token) => assert.match(tokens, new RegExp(`\\${token}:`)))

  assert.match(appScss, /page\s*\{[^}]*font-size:\s*\$ui-font-body;/s)
  assert.match(navigationScss, /--height:\s*44px;/)
  assert.match(loginScss, /\.login-input\s*\{[^}]*height:\s*\$ui-control-height-large;/s)
  assert.match(loginScss, /\.login-button\s*\{[^}]*height:\s*\$ui-control-height-large;/s)
  assert.match(indexScss, /\.floating-tab\s*\{[^}]*height:\s*48px;/s)

  for (const scss of [historyScss, workbenchScss]) {
    assert.match(scss, /\.(?:history|workbench)-close\s*\{[^}]*width:\s*\$ui-touch-target;[^}]*height:\s*\$ui-touch-target;/s)
  }

  assert.match(historyScss, /\.export-button,\s*\n\.save-button\s*\{[^}]*height:\s*\$ui-control-height;/s)
  assert.match(workbenchScss, /\.recognition-button,\s*\n\.page-button,\s*\n\.save-button\s*\{[^}]*height:\s*\$ui-control-height;/s)
})

test('global motion uses shared pacing and supports reduced motion', () => {
  const tokens = source('miniprogram/styles/_design-tokens.scss')
  const motionStyles = [
    'miniprogram/pages/login/login.scss',
    'miniprogram/pages/index/index.scss',
    'miniprogram/pages/logs/logs.scss',
    'miniprogram/pages/document-camera/document-camera.scss',
    'miniprogram/pages/inspection-workbench/inspection-workbench.scss',
    'miniprogram/components/navigation-bar/navigation-bar.scss',
    'miniprogram/components/top-toast/top-toast.scss',
    'miniprogram/components/history-editor-modal/history-editor-modal.scss',
    'miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss',
  ]

  ;[
    '$ui-motion-duration-fast',
    '$ui-motion-duration-medium',
    '$ui-motion-duration-enter',
    '$ui-motion-stagger',
  ].forEach((token) => assert.match(tokens, new RegExp(`\\${token}:`)))

  motionStyles.forEach((path) => {
    assert.match(source(path), /@media \(prefers-reduced-motion:\s*reduce\)/, path)
  })

  assert.match(source('miniprogram/components/navigation-bar/navigation-bar.scss'), /navigation-material-in/)
  assert.match(source('miniprogram/pages/document-camera/document-camera.scss'), /camera-control-in/)
  assert.match(source('miniprogram/pages/inspection-workbench/inspection-workbench.scss'), /workbench-surface-in/)
  assert.match(source('miniprogram/pages/logs/logs.scss'), /log-item-in/)
  assert.match(source('miniprogram/components/history-editor-modal/history-editor-modal.scss'), /history-content-in/)
  assert.match(source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss'), /modal-content-in/)
})

test('project presentation icons use the shared Heroicons solid component', () => {
  const app = source('miniprogram/app.json')
  const iconWxml = source('miniprogram/components/hero-icon/hero-icon.wxml')
  const iconScss = source('miniprogram/components/hero-icon/hero-icon.scss')
  const index = source('miniprogram/pages/index/index.wxml')
  const navigation = source('miniprogram/components/navigation-bar/navigation-bar.wxml')
  const presentationSources = [
    index,
    navigation,
    source('miniprogram/pages/document-camera/document-camera.wxml'),
    source('miniprogram/pages/inspection-workbench/inspection-workbench.wxml'),
    source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml'),
    source('miniprogram/components/history-editor-modal/history-editor-modal.wxml'),
    source('miniprogram/components/top-toast/top-toast.wxml'),
  ].join('\n')

  assert.match(app, /"hero-icon": "\/components\/hero-icon\/hero-icon"/)
  assert.match(iconWxml, /class="hero-icon hero-icon--\{\{name\}\}"/)
  assert.match(iconScss, /Heroicons 24\/solid, https:\/\/heroicons\.com\//)
  const solidIconNames = [
    'viewfinder-circle',
    'clipboard-document-list',
    'clock',
    'user-circle',
    'chevron-left',
    'home',
    'trash',
    'x-mark',
    'plus',
    'check',
    'exclamation-circle',
  ]
  solidIconNames.forEach((name) => {
    assert.match(iconScss, new RegExp(`\\.hero-icon--${name}`))
  })
  assert.match(index, /<hero-icon name="viewfinder-circle"/)
  assert.match(index, /<hero-icon name="clipboard-document-list"/)
  assert.match(index, /<hero-icon name="clock"/)
  assert.match(index, /<hero-icon name="user-circle"/)
  assert.match(navigation, /<hero-icon name="chevron-left"/)
  assert.doesNotMatch(presentationSources, /[×＋⌄↶↷]/)
  assert.doesNotMatch(index, /scan-tab-icon|tasks-tab-icon|history-tab-icon|account-tab-icon/)
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

test('workspace cards use HeroUI-style Card, Chip, Tabs and Avatar patterns', () => {
  const scss = source('miniprogram/pages/index/index.scss')

  assert.match(scss, /\.task-status-row\s*\{[^}]*padding:\s*6rpx;[^}]*border-radius:\s*\$ui-field-radius;[^}]*background:\s*\$ui-surface-secondary;/s)
  assert.match(scss, /\.task-status-chip\s*\{[^}]*flex:\s*1;[^}]*background:\s*transparent;/s)
  assert.match(scss, /\.task-status-chip\.is-active\s*\{[^}]*color:\s*\$ui-text-primary;[^}]*background:\s*\$ui-card-background;[^}]*box-shadow:\s*\$ui-card-shadow;/s)
  assert.match(scss, /\.history-item\s*\{[^}]*border:\s*1rpx solid \$ui-card-border;[^}]*border-radius:\s*\$ui-card-radius;[^}]*background:\s*\$ui-card-background;[^}]*box-shadow:\s*\$ui-card-shadow;/s)
  assert.match(scss, /\.local-pill\s*\{[^}]*border:\s*1rpx solid \$ui-success-border;[^}]*background:\s*\$ui-success-background;/s)
  assert.match(scss, /\.account-avatar\s*\{[^}]*border-radius:\s*\$ui-card-radius;[^}]*box-shadow:\s*\$ui-card-shadow;/s)
  assert.match(scss, /\.account-avatar--fallback\s*\{[^}]*color:\s*\$ui-primary;[^}]*background:\s*\$ui-primary-soft;/s)
  assert.match(scss, /\.history-source--purchase_order\s*\{[^}]*color:\s*\$ui-primary;[^}]*background:\s*\$ui-primary-soft;/s)
  assert.match(scss, /\.history-source--standalone\s*\{[^}]*color:\s*\$ui-text-primary;[^}]*background:\s*\$ui-surface-tertiary;/s)
  assert.match(scss, /\.task-item-photo-count\s*\{[^}]*color:\s*\$ui-text-tertiary;/s)
  assert.match(scss, /\.history-error-bar\s*\{[^}]*border:\s*1rpx solid \$ui-warning-border;/s)
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
    /animation:\s*content-rise\s+\.38s\s+\.01s\s+cubic-bezier\(0, 0, \.58, 1\)\s+both;/,
  )
  const riskSummary = scss.match(/\.review-risk-summary\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(
    riskSummary,
    /animation:\s*content-rise\s+\.38s\s+\.04s\s+cubic-bezier\(0, 0, \.58, 1\)\s+both;/,
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

test('record cards keep names clear of server-aware delete controls', () => {
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')
  const page = source('miniprogram/pages/index/index.ts')
  assert.match(wxml, /class="history-delete-button"/)
  assert.match(wxml, /<hero-icon[^>]*name="trash"[^>]*\/>/)
  assert.doesNotMatch(wxml, />删<\/text>/)
  assert.match(wxml, /historyDeletingId !== item\.id[\s\S]*?<ui-spinner wx:else[^>]*color="danger"[^>]*label="正在删除记录"/)
  assert.doesNotMatch(wxml, /loading="\{\{historyDeletingId === item\.id\}\}"/)
  assert.match(wxml, /catchtap="deleteHistory"/)
  assert.doesNotMatch(
    wxml,
    /wx:if="\{\{item\.origin === 'local'\}\}" class="history-delete-button"/,
  )
  assert.match(scss, /\.history-delete-button\s*\{/)
  const cardMain = scss.match(/\.history-main\s*\{([^}]*)\}/)?.[1] || ''
  const cardHeader = scss.match(/\.history-card-header\s*\{([^}]*)\}/)?.[1] || ''
  const cardContent = scss.match(/\.history-card-content\s*\{([^}]*)\}/)?.[1] || ''
  const customer = scss.match(/\.history-customer\s*\{([^}]*)\}/)?.[1] || ''
  const deleteButton = scss.match(/\.history-delete-button\s*\{([^}]*)\}/)?.[1] || ''
  const deleteVisual = scss.match(/\.history-delete-visual\s*\{([^}]*)\}/)?.[1] || ''
  const syncRow = scss.match(/\.history-sync-row\s*\{([^}]*)\}/)?.[1] || ''
  const syncStatus = scss.match(/\.history-sync-status\s*\{([^}]*)\}/)?.[1] || ''
  const syncError = scss.match(/\.history-sync-error\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(cardMain, /padding-right:\s*0;/)
  assert.match(cardHeader, /display:\s*flex;/)
  assert.match(cardHeader, /align-items:\s*center;/)
  assert.match(cardHeader, /gap:\s*12rpx;/)
  assert.match(cardContent, /min-width:\s*0;/)
  assert.doesNotMatch(customer, /padding-right:/)
  assert.match(customer, /-webkit-line-clamp:\s*2;/)
  assert.doesNotMatch(deleteButton, /position:\s*absolute;/)
  assert.match(wxml, /class="history-card-header">[\s\S]*?class="history-heading-tags"[\s\S]*?class="history-delete-button"[\s\S]*?class="history-card-content">/)
  const historyHeader = wxml.match(/<view class="history-card-header">([\s\S]*?)<view class="history-card-content">/)?.[1] || ''
  assert.doesNotMatch(historyHeader, /history-date/)
  assert.match(deleteButton, /width:\s*\$ui-touch-target;/)
  assert.match(deleteButton, /height:\s*\$ui-touch-target;/)
  assert.match(deleteButton, /min-width:\s*\$ui-touch-target;/)
  assert.match(deleteButton, /max-width:\s*\$ui-touch-target;/)
  assert.match(deleteButton, /box-sizing:\s*border-box;/)
  assert.match(deleteButton, /border-radius:\s*50%;/)
  assert.match(deleteButton, /background:\s*transparent;/)
  assert.match(deleteVisual, /width:\s*64rpx;/)
  assert.match(deleteVisual, /height:\s*64rpx;/)
  assert.match(deleteVisual, /border-radius:\s*50%;/)
  assert.match(wxml, /<hero-icon[^>]*name="trash"[^>]*size="30rpx"[^>]*\/>/)
  assert.doesNotMatch(scss, /\.history-delete-icon\s*\{/)
  assert.match(syncRow, /flex-wrap:\s*nowrap;/)
  assert.match(syncStatus, /white-space:\s*nowrap;/)
  assert.match(syncError, /white-space:\s*normal;/)
  assert.match(syncError, /-webkit-line-clamp:\s*2;/)
  assert.match(page, /deleteRemoteInspectionRecord/)
  assert.match(page, /deleteInspectionHistoriesByServerRecord/)
})

test('record cards display one image or a tilted stack of up to three thumbnails', () => {
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')
  const page = source('miniprogram/pages/index/index.ts')
  const loadHistory = page.match(/loadHistory\(\): Promise<void> \{([\s\S]*?)\n    \},\n    async loadHistoryImagesInBackground/)?.[1] || ''
  const loadHistoryImages = page.match(/async loadHistoryImagesInBackground\([\s\S]*?\): Promise<void> \{([\s\S]*?)\n    \},\n    loadActiveListOnce/)?.[1] || ''

  assert.match(wxml, /wx:if="\{\{item\.imagePaths\.length\}\}" class="history-thumb-stack/)
  assert.match(wxml, /wx:for="\{\{item\.imagePaths\}\}"/)
  assert.match(wxml, /class="history-thumb history-thumb--layer history-thumb--layer-\{\{historyImageIndex\}\}"/)
  assert.match(wxml, /src="\{\{historyImage\}\}"/)
  assert.match(wxml, /wx:if="\{\{item\.imageCount > 1\}\}" class="history-thumb-count"/)
  assert.match(wxml, /wx:elif="\{\{item\.imageCount > 0\}\}" class="history-thumb history-thumb--placeholder skeleton-block"/)
  assert.match(scss, /\.history-thumb--placeholder\s*\{[^}]*overflow:\s*hidden;/s)
  assert.match(scss, /\.history-thumb-stack--multiple/)
  assert.match(scss, /\.history-thumb--layer-0\s*\{[^}]*rotate\(/s)
  assert.match(scss, /\.history-thumb--layer-1\s*\{[^}]*rotate\(/s)
  assert.match(scss, /\.history-thumb--layer-2\s*\{[^}]*rotate\(/s)
  assert.match(scss, /\.history-thumb--layer-2\s*\{[^}]*translate\(34rpx,/s)
  assert.match(page, /const HISTORY_IMAGE_BATCH_SIZE = 4/)
  assert.match(page, /const HISTORY_IMAGE_BATCH_DELAY_MS = 24/)
  assert.match(loadHistory, /deferHistoryCardImages\(/)
  assert.match(loadHistory, /void this\.loadHistoryImagesInBackground\(historyRecords, requestId\)/)
  assert.doesNotMatch(loadHistory, /await materializeHistoryCardImages|hydrateMissingHistoryImages/)
  assert.match(loadHistoryImages, /await waitForHistoryImageTurn\(\)[\s\S]*?await materializeHistoryCardImages\(batch\)/)
  assert.match(loadHistoryImages, /await hydrateMissingHistoryImages\(this\.data\.historyRecords\)/)
  assert.match(page, /this\.data\.historyRequestId !== requestId/)
  assert.match(page, /item\.imageSummaryComplete[\s\S]*?hasSameListData\(item\.imagePaths, hydrated\.imagePaths\)/)
  assert.doesNotMatch(page, /if \(item\.imagePaths\.length > 0\) return item/)
  assert.doesNotMatch(page, /if \(!historyChanged && !this\.data\.historyError\) return/)
})

test('workspace exposes an account tab with current-user details and logout', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')
  const tabSwipe = source('miniprogram/domain/tab-swipe.ts')

  assert.match(tabSwipe, /WORKSPACE_TABS = \['scan', 'tasks', 'history', 'account'\] as const/)
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
  const tabBar = scss.match(/\.floating-tabs\s*\{([^}]*)\}/)?.[1] || ''
  const tabButton = scss.match(/\.floating-tab\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(tabBar, /bottom:\s*calc\(28rpx \+ env\(safe-area-inset-bottom\)\);/)
  assert.match(tabBar, /height:\s*56px;/)
  assert.match(tabBar, /width:\s*316px;/)
  assert.match(tabBar, /grid-template-columns:\s*repeat\(4, 74px\);/)
  assert.match(tabButton, /width:\s*74px;/)
  assert.match(tabButton, /height:\s*48px;/)
  assert.match(scss, /\.tab-indicator\s*\{[^}]*height:\s*48px;/s)
  assert.match(wxml, /data-tab="scan"[^>]*bindtouchstart="onTabSwipeStart"/)
  assert.match(wxml, /data-tab="tasks"[^>]*bindtouchstart="onTabSwipeStart"/)
  assert.match(wxml, /class="floating-tabs[^"]*"[^>]*catchtouchmove="onTabSwipeMove"/)
  assert.match(wxml, /class="floating-tabs[^"]*"[^>]*bindtouchend="onTabSwipeEnd"/)
  assert.match(wxml, /class="floating-tabs[^"]*"[^>]*bindtouchcancel="onTabSwipeCancel"/)
  assert.match(wxml, /tabDragging \? 'is-dragging is-dragging-' \+ tabDragDirection/)
  assert.match(wxml, /tabSettling \? 'is-settling is-settling-' \+ tabSettlingDirection/)
  assert.match(wxml, /class="tab-indicator"[^>]*translate3d\(\{\{tabIndicatorOffset\}\}px/)
  assert.match(wxml, /class="tab-indicator-fill[^>]*width:\s*calc\(100% \+ \{\{tabDragStretch\}\}px\)/)
  assert.match(wxml, /class="tab-indicator-fill[^>]*margin-left:\s*\{\{tabDragStretchOffset\}\}px/)
  assert.match(wxml, /class="tab-indicator-fill[^>]*scaleY\(\{\{tabDragScaleY\}\}\)/)
  assert.doesNotMatch(wxml, /tab-settle-shape/)
  assert.match(wxml, /style="color: \{\{tabVisualColors\.scan\}\};"/)
  assert.match(wxml, /style="color: \{\{tabVisualColors\.tasks\}\};"/)
  assert.match(wxml, /style="color: \{\{tabVisualColors\.history\}\};"/)
  assert.match(wxml, /style="color: \{\{tabVisualColors\.account\}\};"/)
  assert.match(page, /getTabDragStretch\(deltaX\)/)
  assert.match(page, /getTabSwitchStretch\(deltaX\)/)
  assert.match(page, /getTabDragScaleY\(tabDragStretch\)/)
  assert.match(page, /getTabVisualColors/)
  assert.match(page, /resolveContinuousTabDrag/)
  assert.match(page, /resolveTabDragDirection\(movementX \|\| deltaX, gesture\.direction\)/)
  assert.match(page, /suppressNextTap/)
  assert.doesNotMatch(scss, /\.floating-tabs\.is-dragging \.tab-indicator\s*\{[^}]*transition:\s*none;/s)
  const indicatorFillRules = scss.match(/\.tab-indicator-fill\s*\{[\s\S]*?\n\}\n\n@keyframes glass-bar-in/)?.[0] || ''
  assert.match(indicatorFillRules, /height:\s*100%;/)
  assert.match(indicatorFillRules, /transition:[^;]*width[^;]*margin-left/s)
  assert.match(indicatorFillRules, /transition:[^;]*transform/s)
  assert.match(scss, /@keyframes tab-leading-settle-right\s*\{[\s\S]*?0%\s*\{[\s\S]*?var\(--tab-settle-initial-stretch\)[\s\S]*?24%\s*\{[\s\S]*?var\(--tab-settle-pre-stretch\)[\s\S]*?46%\s*\{[\s\S]*?var\(--tab-settle-peak-stretch\)[\s\S]*?width:\s*100%;[\s\S]*?scaleY\(1\)/)
  assert.match(scss, /@keyframes tab-leading-settle-left\s*\{[\s\S]*?var\(--tab-settle-initial-stretch\)[\s\S]*?var\(--tab-settle-pre-stretch\)[\s\S]*?var\(--tab-settle-peak-stretch\)[\s\S]*?margin-left:\s*0;/)
  assert.doesNotMatch(scss, /@keyframes tab-indicator-settle|--tab-settle-start-offset/)
  assert.doesNotMatch(scss, /tab-settle-shape|tab-trailing-settle/)
  assert.match(page, /tabDragStretchOffset:\s*gesture\.direction === 'left' \? -tabDragStretch : 0/)
  assert.match(page, /if \(touchedTab !== this\.data\.activeTab\)/)
  assert.match(page, /gesture\.startX \+= dragResult\.consumedX/)
  assert.match(page, /const settleMetrics = getTabSettleMetrics\(deltaX\)/)
  assert.match(page, /this\.activateTab\(\s*dragResult\.targetTab,\s*gesture\.direction,\s*settleMetrics,\s*settleMetrics\.preStretch,\s*settleMetrics\.preScaleY/)
  assert.match(page, /const targetTab = event\.currentTarget\.dataset\.tab as WorkspaceTab/)
  assert.match(page, /const direction: TabDragDirection = getTabIndicatorOffset\(targetTab\)[\s\S]*?\? 'left'[\s\S]*?: 'right'/)
  assert.match(page, /const settleMetrics = getTabSettleMetrics\(deltaX\)\s*this\.activateTab\(targetTab, direction, settleMetrics\)/)
  assert.doesNotMatch(page, /TAB_CLICK_DEFORMATION_MS|tabClickSwitchTimers/)
  assert.match(page, /const continuesCurrentRoute = shouldSettle[\s\S]*?shouldContinueTabSettleRoute\([\s\S]*?this\.data\.tabSettlingDirection,[\s\S]*?settlingDirection,[\s\S]*?this\.data\.tabSettling/)
  assert.match(page, /if \(continuesCurrentRoute\) \{[\s\S]*?tabIndicatorOffset,[\s\S]*?finishActivation[\s\S]*?return/)
  assert.match(page, /const TAB_SETTLE_DURATION_MS = 400/)
  assert.match(scss, /\.floating-tabs\s*\{[^}]*animation:\s*glass-bar-in \.32s cubic-bezier\(\.2, \.8, \.2, 1\) both;/s)
  assert.match(scss, /\.tab-indicator\s*\{[^}]*transition:\s*transform \.4s cubic-bezier\(\.38, \.56, \.46, 1\)/s)
  assert.equal((scss.match(/animation: tab-leading-settle-(?:left|right) \.4s/g) || []).length, 2)
  assert.match(scss, /\.floating-tabs\.is-dragging \.tab-indicator-fill\s*\{[^}]*transition-duration:\s*\.1s;[^}]*cubic-bezier\(\.35, \.2, \.45, 1\)/s)
  assert.equal((scss.match(/animation: tab-leading-settle-(?:left|right) \.4s cubic-bezier\(\.48, \.08, \.52, 1\)/g) || []).length, 2)
  assert.match(scss, /\.account-logout-button\s*\{/)
})

test('bottom navigation uses a theme-aware diagonal gradient outline', () => {
  const scss = source('miniprogram/pages/index/index.scss')
  const tabBar = scss.match(/\.floating-tabs\s*\{([^}]*)\}/)?.[1] || ''
  const outline = scss.match(/\.floating-tabs::before\s*\{([\s\S]*?)\n\}/)?.[1] || ''

  assert.match(tabBar, /border:\s*0;/)
  assert.match(tabBar, /border-radius:\s*999rpx;/)
  assert.doesNotMatch(tabBar, /border:\s*1rpx solid \$ui-glass-border;/)
  assert.match(outline, /background:\s*conic-gradient\(\s*from 0deg at 50% 50%,/s)
  assert.match(outline, /\$ui-glass-highlight-soft 80deg,[\s\S]*\$ui-glass-highlight-strong 100deg,/)
  assert.match(outline, /\$ui-glass-highlight-soft 260deg,[\s\S]*\$ui-glass-highlight-strong 280deg,/)
  assert.doesNotMatch(outline, /radial-gradient\(/)
  assert.doesNotMatch(outline, /linear-gradient\(\s*135deg,/)
  assert.match(outline, /\$ui-glass-highlight-strong/)
  assert.match(outline, /\$ui-glass-highlight-medium/)
  assert.match(outline, /\$ui-glass-highlight-soft/)
  assert.doesNotMatch(outline, /\$ui-primary/)
  assert.match(outline, /mask-composite:\s*exclude;/)
  assert.match(tabBar, /-webkit-backdrop-filter:\s*blur\(\$ui-glass-blur\) saturate\(\$ui-glass-saturation\) brightness\(\$ui-bottom-glass-brightness\);/)
  assert.match(tabBar, /backdrop-filter:\s*blur\(\$ui-glass-blur\) saturate\(\$ui-glass-saturation\) brightness\(\$ui-bottom-glass-brightness\);/)
  assert.match(scss, /\.tab-indicator-fill\s*\{[^}]*border-radius:\s*999rpx;/s)
})

test('account settings persist an accessible accent and light or dark appearance', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')
  const tokens = source('miniprogram/styles/_design-tokens.scss')

  assert.match(page, /loadUiPreferences\(\)/)
  assert.match(page, /saveUiPreferences\(nextPreferences\)/)
  assert.match(page, /selectUiThemeMode/)
  assert.match(page, /selectUiThemeColor/)
  assert.match(wxml, /<page-meta page-style="\{\{uiThemePageStyle\}\}"/)
  assert.match(wxml, /class="account-settings-card card"/)
  assert.match(wxml, /role="radiogroup"[^>]*aria-label="显示模式"/)
  assert.match(wxml, /data-mode="\{\{themeModeOption\.value\}\}"[^>]*bindtap="selectUiThemeMode"/)
  assert.match(wxml, /role="radiogroup"[^>]*aria-label="主题色"/)
  assert.match(wxml, /data-color="\{\{themeColorOption\.value\}\}"[^>]*bindtap="selectUiThemeColor"/)
  assert.match(wxml, /aria-checked="\{\{uiPreferences\.mode === themeModeOption\.value\}\}"/)
  assert.match(wxml, /aria-checked="\{\{uiPreferences\.color === themeColorOption\.value\}\}"/)
  assert.match(scss, /\.account-theme-mode-option\s*\{[^}]*min-height:\s*\$ui-touch-target;/s)
  assert.match(scss, /\.account-theme-color-option\s*\{[^}]*min-height:\s*\$ui-touch-target;/s)
  assert.match(scss, /\.account-theme-mode-option\.is-active\s*\{[^}]*box-shadow:\s*\$ui-card-shadow;/s)
  assert.match(tokens, /\$ui-primary:\s*var\(--ui-primary, #5695e0\);/)
  assert.match(tokens, /\$ui-page-background:\s*var\(--ui-page-background, #f7f7f8\);/)
  assert.match(tokens, /\$ui-field-background:\s*var\(--ui-field-background, #fcfcfc\);/)

  for (const route of ['login', 'logs', 'document-camera', 'inspection-workbench']) {
    const routeWxml = source(`miniprogram/pages/${route}/${route}.wxml`)
    const routePage = source(`miniprogram/pages/${route}/${route}.ts`)
    assert.match(routeWxml, /<page-meta page-style="\{\{uiThemePageStyle\}\}"/)
    assert.match(routePage, /loadUiThemePageData\(\)/)
  }
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

test('task and history lists initialize once and use only pull-down refresh afterwards', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')

  assert.match(page, /taskInitialized:\s*false/)
  assert.match(page, /historyInitialized:\s*false/)
  assert.match(page, /taskPullRefreshing:\s*false/)
  assert.match(page, /taskPulling:\s*false/)
  assert.match(page, /historyPullRefreshing:\s*false/)
  assert.match(page, /historyPulling:\s*false/)
  assert.match(page, /taskLoadingQueryKey:\s*''/)
  assert.match(page, /loadActiveListOnce\(\)/)
  assert.match(page, /activeTab === 'tasks' && !this\.data\.taskInitialized[\s\S]*?loadTasks\(true\)/)
  assert.match(page, /activeTab === 'history' && !this\.data\.historyInitialized[\s\S]*?loadHistory\(\)/)
  assert.match(page, /onListPullDownRefresh\(\)[\s\S]*?taskPullRefreshing:\s*true[\s\S]*?loadTasks\(true, true\)/)
  assert.match(page, /const PULL_REFRESH_MINIMUM_DURATION_MS = 1000/)
  assert.match(page, /function keepPullRefreshVisible\(operation: Promise<void>\)[\s\S]*?PULL_REFRESH_MINIMUM_DURATION_MS[\s\S]*?setTimeout\(resolve, Math\.max\(0, remaining\)\)/)
  assert.match(page, /keepPullRefreshVisible\(this\.loadTasks\(true, true\)\)/)
  assert.match(page, /onListPullDownRefresh\(\)[\s\S]*?historyPullRefreshing:\s*true[\s\S]*?loadHistory\(\)/)
  assert.match(page, /keepPullRefreshVisible\(this\.loadHistory\(\)\)/)
  assert.match(page, /const taskListRequests = new WeakMap<object, Promise<void>>\(\)/)
  assert.match(page, /const historyListRequests = new WeakMap<object, Promise<void>>\(\)/)
  assert.match(page, /this\.data\.taskLoading[\s\S]*?queryKey === this\.data\.taskLoadingQueryKey[\s\S]*?return taskListRequests\.get\(this\) \?\? Promise\.resolve\(\)/)
  assert.match(page, /this\.data\.historyLoading[\s\S]*?return historyListRequests\.get\(this\) \?\? Promise\.resolve\(\)/)
  assert.doesNotMatch(page, /pageLifetimes:/)
  assert.doesNotMatch(page, /refreshHistory/)
  assert.doesNotMatch(page, /shouldRefreshInspectionHistory/)
  assert.doesNotMatch(page, /shouldQueueInspectionHistoryRefresh/)
  assert.match(wxml, /refresher-enabled="\{\{activeTab === 'tasks' \|\| activeTab === 'history'\}\}"/)
  assert.match(wxml, /refresher-default-style="none"/)
  assert.match(wxml, /refresher-threshold="72"/)
  assert.match(wxml, /refresher-triggered="\{\{\(activeTab === 'tasks' && taskPullRefreshing\) \|\| \(activeTab === 'history' && historyPullRefreshing\)\}\}"/)
  assert.match(wxml, /bindrefresherrefresh="onListPullDownRefresh"/)
  assert.match(wxml, /bindrefresherpulling="onListPulling"/)
  assert.match(wxml, /bindrefresherrestore="onListPullRefreshRestore"/)
  assert.match(wxml, /bindrefresherabort="onListPullRefreshRestore"/)
  assert.match(page, /onListPulling\(event:[\s\S]*?taskPulling:\s*true[\s\S]*?historyPulling:\s*true/)
  assert.match(page, /onListPullRefreshRestore\(\)[\s\S]*?taskPulling\s*=\s*false[\s\S]*?historyPulling\s*=\s*false/)
  assert.match(wxml, /slot="refresher"[\s\S]*?class="pull-refresh-indicator \{\{[\s\S]*?taskPulling[\s\S]*?historyPulling[\s\S]*?is-pulling[\s\S]*?taskPullRefreshing[\s\S]*?historyPullRefreshing[\s\S]*?is-refreshing[\s\S]*?pull-refresh-visual[\s\S]*?<ui-spinner[^>]*label="\{\{[\s\S]*?正在刷新列表[\s\S]*?下拉刷新列表/)
  assert.doesNotMatch(wxml, /pull-refresh-loading-indicator/)
  assert.doesNotMatch(wxml, /pull-refresh-icon|pull-refresh-core|pull-refresh-halo/)
  assert.match(wxml, /slot="refresher"[\s\S]*?style="transform: translate3d\(0, \{\{navigationBarHeight\}\}px, 0\);"/)
  assert.match(wxml, /class="page-scroll"[\s\S]*?scroll-top="\{\{workspaceScrollTop\}\}"/)
  assert.match(scss, /\.page-scroll\s*\{[\s\S]*?height:\s*100vh;/)
  assert.match(wxml, /activeTab === 'tasks'[\s\S]*?taskPullRefreshing[\s\S]*?activeTab === 'history'[\s\S]*?historyPullRefreshing/)
  assert.doesNotMatch(wxml, /pull-refresh-motion\.wxs|pullMotion\./)
  assert.doesNotMatch(page, /pullRefreshOpacity|pullRefreshOffset|pullRefreshProgress/)
  assert.match(page, /pullRefreshRotationForDistance\(event\.detail\.dy \|\| 0\)/)
  assert.match(page, /pullRefreshRotation:\s*rotation/)
  assert.match(page, /onListPullRefreshRestore\(\)[\s\S]*?pullRefreshRotation\s*=\s*0/)
  assert.match(wxml, /<ui-spinner[^>]*spinning="\{\{[\s\S]*?taskPullRefreshing[\s\S]*?historyPullRefreshing[\s\S]*?rotation="\{\{pullRefreshRotation\}\}"/)
  assert.match(page, /workspaceScrollTop:\s*1[\s\S]*?workspaceScrollTop:\s*0/)
  assert.match(scss, /\.pull-refresh-indicator\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*112rpx;[\s\S]*?pointer-events:\s*none;/)
  assert.doesNotMatch(scss.match(/\.pull-refresh-indicator\s*\{[^}]*\}/)?.[0] || '', /position:\s*fixed/)
  assert.match(scss, /\.pull-refresh-indicator\.is-pulling\s*\{[\s\S]*?pull-refresh-fade-in 160ms cubic-bezier\(0, 0, \.58, 1\) both;[\s\S]*?animation-delay:\s*140ms;/)
  assert.match(scss, /\.pull-refresh-visual\s*\{[\s\S]*?border:\s*1rpx solid \$ui-glass-border;[\s\S]*?background:\s*\$ui-glass-background;[\s\S]*?backdrop-filter:\s*blur\(12rpx\) saturate\(\$ui-glass-saturation\);/)
  assert.doesNotMatch(scss, /\.pull-refresh-icon|\.pull-refresh-core|\.pull-refresh-halo|pull-refresh-glow/)
  assert.doesNotMatch(wxml, /pull-refresh-ring/)
  assert.doesNotMatch(scss, /pull-refresh-ring|pull-refresh-spin/)
  assert.match(scss, /\.pull-refresh-indicator\.is-refreshing \.pull-refresh-visual\s*\{[\s\S]*?transform:\s*scale\(1\);/)
  assert.match(scss, /@keyframes pull-refresh-fade-in/)
  assert.doesNotMatch(scss, /pull-refresh-visual-in/)
  assert.doesNotMatch(scss, /pull-refresh-float/)
  assert.match(page, /function hasSameListData\([\s\S]*?JSON\.stringify\(left\) === JSON\.stringify\(right\)/)
  assert.match(page, /const historyChanged = !hasSameListData\(this\.data\.historyRecords, deferredRecords\)/)
  assert.match(page, /if \(historyChanged \|\| this\.data\.historyError\) \{[\s\S]*?this\.setData/)
  assert.match(page, /const keepCurrentPages = resetList && preserveLoadedPages && !queryChanged/)
  assert.match(page, /const itemsChanged = !hasSameListData\(this\.data\.taskItems, taskItems\)/)
  assert.match(page, /if \(Object\.keys\(updates\)\.length > 0\) this\.setData\(updates\)/)
  assert.doesNotMatch(wxml, /bindtap="retryHistoryRefresh"/)
  assert.match(wxml, /请下拉刷新重试/)
})

test('all top navigation bars use the shared glass material', () => {
  const navigationScss = source('miniprogram/components/navigation-bar/navigation-bar.scss')
  const loginJson = source('miniprogram/pages/login/login.json')
  const loginWxml = source('miniprogram/pages/login/login.wxml')
  const indexWxml = source('miniprogram/pages/index/index.wxml')
  const logsWxml = source('miniprogram/pages/logs/logs.wxml')

  assert.match(navigationScss, /background:\s*\$ui-glass-background/)
  assert.match(navigationScss, /-webkit-backdrop-filter:\s*blur\(\$ui-glass-blur\)\s+saturate\(\$ui-glass-saturation\)/)
  assert.match(navigationScss, /backdrop-filter:\s*blur\(\$ui-glass-blur\)\s+saturate\(\$ui-glass-saturation\)/)
  assert.match(navigationScss, /border-bottom:/)

  assert.match(loginJson, /"navigationStyle"\s*:\s*"custom"/)
  assert.match(loginJson, /"navigation-bar"\s*:\s*"\/components\/navigation-bar\/navigation-bar"/)
  assert.match(loginWxml, /<navigation-bar[^>]*title="账号登录"[^>]*back="\{\{false\}\}"/)

  for (const wxml of [loginWxml, indexWxml, logsWxml]) {
    assert.match(wxml, /<page-meta page-style="\{\{uiThemePageStyle\}\}"/)
    assert.match(wxml, /color="\{\{uiNavigationTextColor\}\}"/)
    assert.match(wxml, /background="\{\{uiNavigationBackground\}\}"/)
  }
})

test('top and bottom bars share one glass surface recipe', () => {
  const navigation = source('miniprogram/components/navigation-bar/navigation-bar.scss')
  const index = source('miniprogram/pages/index/index.scss')
  const workbench = source('miniprogram/pages/inspection-workbench/inspection-workbench.scss')
  const historyModal = source('miniprogram/components/history-editor-modal/history-editor-modal.scss')
  const workbenchModal = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')
  const optionalBrightness = '(?:\\s+brightness\\(\\$ui-bottom-glass-brightness\\))?'
  const glassRecipe = new RegExp(`background:\\s*\\$ui-glass-background;[^}]*-webkit-backdrop-filter:\\s*blur\\(\\$ui-glass-blur\\)\\s+saturate\\(\\$ui-glass-saturation\\)${optionalBrightness};[^}]*backdrop-filter:\\s*blur\\(\\$ui-glass-blur\\)\\s+saturate\\(\\$ui-glass-saturation\\)${optionalBrightness};`, 's')
  const glassRule = (selector: string) => new RegExp(`${selector}\\s*\\{[^}]*${glassRecipe.source}`, 's')

  assert.match(navigation, glassRule('\\.weui-navigation-bar__inner'))
  assert.match(index, glassRule('\\.floating-tabs'))
  assert.match(workbench, glassRule('\\.workbench-bottom-bar'))
  assert.match(historyModal, glassRule('\\.history-modal-actions'))
  assert.match(workbenchModal, glassRule('\\.workbench-modal-actions'))
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

  assert.match(navigationScss, /\.weui-navigation-bar\s*\{\s*position:\s*fixed;/)
  assert.doesNotMatch(navigationScss, /position:\s*sticky/)
  assert.match(navigationScss, /top:\s*0;/)
  assert.match(navigationScss, /left:\s*0;/)
  assert.match(navigationScss, /right:\s*0;/)

  assert.match(indexWxml, /^<page-meta[^>]*\/>\s*<navigation-bar[^>]*><\/navigation-bar>\s*<view class="workspace-window[^>]*>[^]*?<scroll-view[^>]*class="page-scroll"/)
  assert.match(logsWxml, /<navigation-bar[^>]*>[^]*?<scroll-view[^>]*class="scrollarea"/)

  const indexShell = indexScss.match(/\.page-shell\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(navigationScss, /height:\s*calc\(var\(--height\) \+ env\(safe-area-inset-top\) \+ 8px\)/)
  assert.match(navigationScss, /padding-top:\s*calc\(env\(safe-area-inset-top\) \+ 8px\)/)
  assert.match(navigationTs, /const SAFE_AREA_TOP_EXTRA = 8[^]*const adjustedSafeAreaTop = safeAreaTop \+ SAFE_AREA_TOP_EXTRA/)
  assert.match(navigationTs, /const NAVIGATION_CONTENT_HEIGHT = 44/)
  assert.doesNotMatch(navigationTs, /isDevtools \|\| isAndroid \?/)
  assert.match(indexShell, /padding:\s*calc\(44px \+ env\(safe-area-inset-top\) \+ 8px \+ 32rpx\)/)
  assert.match(loginScss, /padding:\s*calc\(44px \+ env\(safe-area-inset-top\) \+ 8px \+ 72rpx\)/)
  assert.match(logsScss, /padding-top:\s*calc\(44px \+ env\(safe-area-inset-top\) \+ 8px\)/)

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
  const navigationTs = source('miniprogram/components/navigation-bar/navigation-bar.ts')
  const baseHeight = navigationScss.match(/\.weui-navigation-bar\s*\{[^}]*--height:\s*(\d+px)/)?.[1]
  const androidHeight = navigationScss.match(/\.weui-navigation-bar \.android\s*\{[^}]*--height:\s*(\d+px)/)?.[1]

  assert.equal(baseHeight, '44px')
  assert.equal(androidHeight, baseHeight)
  assert.match(navigationTs, /const NAVIGATION_CONTENT_HEIGHT = 44/)
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
  assert.match(wxml, /<scroll-view\s+wx:else\s+class="page-scroll"[^>]*\s+scroll-y[^>]*\s+enhanced/)
  assert.doesNotMatch(reviewEditor, /class="page-scroll"/)
  assert.doesNotMatch(pageConfig, /"disableScroll":\s*true/)
  assert.match(reviewEditor, /<scroll-view class="table-scroll" scroll-x show-scrollbar="\{\{false\}\}">/)
  assert.doesNotMatch(reviewEditor, /<scroll-view class="table-scroll"[^>]*\senhanced(?:=|\s|>)/)
  assert.match(reviewEditorCard, /animation-name:\s*review-editor-fade;/)
  assert.doesNotMatch(reviewEditorFade, /transform:/)

  assert.match(fieldInput, /height:\s*64rpx;/)
  assert.match(fieldInput, /line-height:\s*64rpx;/)
  assert.match(fieldInput, /padding:\s*0;/)
  assert.match(fieldInput, /box-sizing:\s*border-box;/)
  assert.match(tableInput, /height:\s*64rpx;/)
  assert.match(tableInput, /line-height:\s*64rpx;/)
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
  assert.match(buttons, /height:\s*\$ui-control-height-large;/)
  assert.match(buttons, /margin-top:\s*0;/)
  assert.match(buttons, /font-size:\s*\$ui-font-control;/)
  assert.match(buttons, /white-space:\s*nowrap;/)
})

test('quality orders use the same all-source and all-status default scope as the web workbench', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const activateTab = page.match(/activateTab\(\s*activeTab: WorkspaceTab,[\s\S]*?\n    \) \{([\s\S]*?)\n    \},\n    switchTab/)?.[1] || ''
  const loadTasks = page.match(/loadTasks\(reset = false, preserveLoadedPages = false\): Promise<void> \{([\s\S]*?)\n    \},\n    loadMoreTasks/)?.[1] || ''
  const openTask = page.match(/openTask\(event: WechatMiniprogram\.TouchEvent\) \{([\s\S]*?)\n    \},\n    measureTaskCardOverlay/)?.[1] || ''
  const measureTaskCardOverlay = page.match(/measureTaskCardOverlay\(taskId: number, requestId: number\) \{([\s\S]*?)\n    \},\n    closeTaskCardOverlay/)?.[1] || ''

  assert.match(page, /taskAppliedSearch:\s*''/)
  assert.match(page, /taskStatus:\s*'all'/)
  assert.match(page, /taskInitialized:\s*false/)
  assert.match(page, /taskPullRefreshing:\s*false/)
  assert.match(page, /taskRequestId:\s*0/)
  assert.match(page, /taskOpeningId:\s*0/)
  assert.match(activateTab, /this\.loadActiveListOnce\(\)/)
  assert.match(activateTab, /activeTab !== 'tasks'[\s\S]*?taskCardOverlayVisible:\s*false/)
  assert.doesNotMatch(page, /pageLifetimes:/)
  assert.match(page, /getCurrentUser\(\)[\s\S]*?this\.loadActiveListOnce\(\)/)
  assert.match(loadTasks, /pageSize:\s*TASK_PAGE_SIZE/)
  assert.match(loadTasks, /const search = this\.data\.taskAppliedSearch\.trim\(\)/)
  assert.match(loadTasks, /status:\s*status === 'all' \? undefined : status/)
  assert.match(loadTasks, /sourceType:\s*'all'/)
  assert.match(loadTasks, /compact:\s*true/)
  assert.doesNotMatch(loadTasks, /sourceType:\s*'purchase_order'/)
  assert.doesNotMatch(loadTasks, /shouldRefreshInspectionTasks/)
  assert.doesNotMatch(loadTasks, /shouldQueueInspectionTaskRefresh/)
  assert.match(loadTasks, /taskInitialized:\s*true/)
  assert.match(loadTasks, /resetList && queryChanged[\s\S]*?taskItems:\s*\[\]/)
  assert.match(loadTasks, /taskRequestId !== requestId/)
  assert.doesNotMatch(loadTasks, /taskRefreshQueued/)
  assert.match(page, /confirmTaskSearch\(\)[\s\S]*?taskAppliedSearch[\s\S]*?loadTasks\(true\)/)
  assert.match(page, /changeTaskStatus[\s\S]*?loadTasks\(true\)/)
  assert.match(openTask, /getInspectionTask\(taskId, true\)/)
  assert.doesNotMatch(openTask, /taskLoading:\s*true/)
  assert.match(openTask, /const requestId = this\.data\.taskOpenRequestId \+ 1/)
  assert.match(openTask, /taskOpenRequestId:\s*requestId[\s\S]*?taskOpeningId:\s*taskId[\s\S]*?this\.measureTaskCardOverlay\(taskId, requestId\)[\s\S]*?getInspectionTask\(taskId, true\)/)
  assert.match(openTask, /taskOpenRequestId !== requestId/)
  assert.match(openTask, /this\.closeTaskCardOverlay\(\)/)
  assert.doesNotMatch(openTask, /workspaceScrollTop|scrollTaskCardIntoView|scheduleTaskCardIntoView|restoreTaskCardScroll/)
  assert.doesNotMatch(openTask, /if \(this\.data\.taskOpeningId\) return/)
  assert.match(page, /taskCardOverlayVisible:\s*false/)
  assert.match(page, /taskCardOverlayOpen:\s*false/)
  assert.doesNotMatch(page, /workspaceScrollPositions|taskCardRestorePositions|TASK_CARD_(?:EXPAND|SCROLL)_DURATION_MS|scheduleTaskCardIntoView|startTaskCardMotion|wx\.nextTick/)
  assert.doesNotMatch(openTask, /setTimeout/)
  assert.match(measureTaskCardOverlay, /taskCardOverlayVisible:\s*true[\s\S]*?taskCardOverlayOriginLeft:\s*rect\.left[\s\S]*?taskCardOverlayOriginTop:\s*rect\.top[\s\S]*?taskCardOverlayOriginWidth:\s*rect\.width[\s\S]*?taskCardOverlayOriginHeight:\s*rect\.height[\s\S]*?selectedTaskId:\s*taskId/)
  assert.doesNotMatch(measureTaskCardOverlay, /scrollTop|setTimeout/)
  assert.doesNotMatch(page, /workspaceScrollWithAnimation:\s*true/)
})

test('pending task items show shared backend inspection data and photos', () => {
  const page = source('miniprogram/pages/index/index.ts')
  const wxml = source('miniprogram/pages/index/index.wxml')
  const scss = source('miniprogram/pages/index/index.scss')

  assert.match(wxml, /taskItem\.inspection_summary\.filled/)
  assert.match(wxml, /taskItem\.inspection_summary\.ng/)
  assert.match(wxml, /'已填 ' \+ taskItem\.inspection_summary\.filled/)
  assert.match(wxml, /'未录入'/)
  assert.doesNotMatch(wxml, /线上检测：|暂无检测数据/)
  assert.match(wxml, /wx:for="\{\{taskItem\.preview_thumbnails\}\}"/)
  assert.match(wxml, /src="\{\{taskPhoto\}\}"/)
  assert.match(wxml, /data-url="\{\{taskItem\.preview_images\[taskPhotoIndex\]\}\}"/)
  assert.match(wxml, /catchtap="previewTaskItemPhoto"/)
  assert.match(wxml, /lazy-load="\{\{true\}\}"/)
  assert.match(wxml, /taskItem\.preview_image_count/)
  assert.match(wxml, /还有 \{\{taskItem\.preview_image_count - taskItem\.preview_images\.length\}\} 张/)
  assert.doesNotMatch(wxml, /完整图片进入检验后加载/)
  assert.match(wxml, /class="task-item-action">[\s\S]*?<text>检验<\/text>[\s\S]*?name="chevron-left"/)
  assert.match(wxml, /taskOpeningId === activeTask\.id/)
  assert.match(page, /previewTaskItemPhoto/)
  assert.match(page, /wx\.previewImage\(\{ current, urls \}\)/)
  assert.match(scss, /\.task-item-inspection-summary/)
  assert.match(scss, /\.task-item-inspection-progress/)
  assert.match(scss, /\.task-item-name\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s)
  assert.match(wxml, /class="task-item-name"[^]*?<view class="task-item-tags">[^]*?taskItem\.material_code[^]*?wx:for="\{\{taskItem\.spec_tags\}\}"[^]*?wx:key="key"[^]*?specTag\.label[^]*?specTag\.value[^]*?class="task-item-tag is-quantity"[^]*?taskItem\.quantity/)
  assert.doesNotMatch(wxml, /class="task-item-meta"/)
  assert.match(scss, /\.task-item-tags\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*wrap;[^}]*gap:\s*8rpx;/s)
  assert.match(scss, /\.task-item-tag\s*\{[^}]*max-width:\s*100%;[^}]*border-radius:\s*999rpx;/s)
  assert.match(scss, /\.task-item-tag\.is-spec/)
  assert.match(scss, /\.task-item-tag\.is-quantity/)
  assert.match(wxml, /class="task-item \{\{[\s\S]*?class="task-item-header"[\s\S]*?class="task-item-content"/)
  assert.match(wxml, /class="task-item \{\{[\s\S]*?role="button"[\s\S]*?aria-label="检验 \{\{taskItem\.material_name/)
  assert.match(scss, /\.task-item-list\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;[^}]*display:\s*flex;[^}]*background:\s*\$ui-sheet-background;/s)
  assert.match(scss, /\.task-item\s*\{[^}]*border:\s*1rpx solid \$ui-card-border;[^}]*border-radius:\s*\$ui-card-radius;[^}]*background:\s*\$ui-card-background;[^}]*box-shadow:\s*\$ui-field-shadow;/s)
  assert.doesNotMatch(scss.match(/\.task-item-action\s*\{[^}]*\}/)?.[0] || '', /position:/)
  assert.match(scss, /\.task-item-inspection-result\.is-ng/)
  assert.match(scss, /\.task-item-photo-scroll/)
  assert.match(scss, /\.task-item-photo/)
  assert.match(scss, /\.task-item-photo-count/)
})

test('online workbenches render server thumbnails and preview original images', () => {
  const page = source('miniprogram/pages/inspection-workbench/inspection-workbench.ts')
  const pageWxml = source('miniprogram/pages/inspection-workbench/inspection-workbench.wxml')
  const modal = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')
  const modalWxml = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')

  assert.match(pageWxml, /reportPreviewPaths/)
  assert.match(pageWxml, /photo\.thumbnailUrl/)
  assert.match(modalWxml, /reportPreviewPaths/)
  assert.match(modalWxml, /photo\.thumbnailUrl/)
  assert.match(page, /reportPreviewOriginalPaths/)
  assert.match(modal, /reportPreviewOriginalPaths/)
  assert.match(page, /inspectionImageThumbnailUrl/)
  assert.match(modal, /inspectionImageThumbnailUrl/)
  assert.match(page, /function photoOriginalSource[\s\S]*?return photo\.remoteUrl \|\| photo\.localPath/)
  assert.match(modal, /function photoOriginalSource[\s\S]*?return photo\.remoteUrl \|\| photo\.localPath/)
  assert.match(page, /wx\.previewImage\(\{ current, urls: this\.data\.reportPreviewOriginalPaths \}\)/)
  assert.match(modal, /wx\.previewImage\(\{ current, urls: this\.data\.reportPreviewOriginalPaths \}\)/)
})

test('opening an order uses a fixed expansion layer so list layout never animates', () => {
  const wxml = source('miniprogram/pages/index/index.wxml')
  const page = source('miniprogram/pages/index/index.ts')
  const scss = source('miniprogram/pages/index/index.scss')
  const openTask = page.match(/openTask\(event: WechatMiniprogram\.TouchEvent\) \{([\s\S]*?)\n    \},\n    measureTaskCardOverlay/)?.[1] || ''
  const measureTaskCardOverlay = page.match(/measureTaskCardOverlay\(taskId: number, requestId: number\) \{([\s\S]*?)\n    \},\n    closeTaskCardOverlay/)?.[1] || ''

  assert.match(wxml, /id="task-card-\{\{task\.id\}\}"[\s\S]*?class="task-card card \{\{taskCardOverlayVisible && taskCardOverlayId === task\.id \? 'is-source-hidden' : ''\}\}"/)
  assert.match(wxml, /scroll-with-animation="\{\{workspaceScrollWithAnimation\}\}"/)
  assert.doesNotMatch(wxml, /bindscroll="onWorkspaceScroll"/)
  assert.match(wxml, /wx:if="\{\{taskCardOverlayVisible && activeTask\}\}"\s+class="task-card-overlay \{\{taskCardOverlayOpen \? 'is-open' : ''\}\} \{\{taskCardOverlayClosing \? 'is-closing' : ''\}\}"/)
  assert.match(wxml, /style="left: \{\{taskCardOverlayOpen \? taskCardOverlayTargetLeft : taskCardOverlayOriginLeft\}\}px; top: \{\{taskCardOverlayOpen \? taskCardOverlayTargetTop : taskCardOverlayOriginTop\}\}px; width: \{\{taskCardOverlayOpen \? taskCardOverlayTargetWidth : taskCardOverlayOriginWidth\}\}px; height: \{\{taskCardOverlayOpen \? taskCardOverlayTargetHeight : taskCardOverlayOriginHeight\}\}px;"/)
  assert.match(wxml, /class="task-product-count">共 \{\{task\.items\.length \|\| 0\}\} 条产品<\/view>/)
  assert.doesNotMatch(wxml, /class="task-status-badge"|class="task-item-list-header"|class="task-item-list-count"/)
  assert.match(wxml, /<view[\s\S]*?class="task-card-overlay[\s\S]*?<view class="task-item-list">[\s\S]*?<scroll-view class="task-item-scroll" scroll-y enhanced show-scrollbar="\{\{false\}\}">/)
  assert.match(wxml, /wx:for-index="taskItemIndex"[\s\S]*?style="animation-delay: \{\{500 \+ taskItemIndex \* 60\}\}ms;"/)
  assert.match(scss, /\.task-card\s*\{[^}]*height:\s*302rpx;[^}]*transition:\s*box-shadow/s)
  assert.match(scss, /\.task-card\.is-source-hidden\s*\{[^}]*visibility:\s*hidden;/s)
  assert.match(scss, /\.task-card-overlay\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*30;[^}]*will-change:\s*left, top, width, height;[^}]*transition:\s*left \.46s cubic-bezier\(\.16, 1, \.3, 1\), top \.46s cubic-bezier\(\.16, 1, \.3, 1\), width \.46s cubic-bezier\(\.16, 1, \.3, 1\), height \.46s cubic-bezier\(\.16, 1, \.3, 1\)/s)
  assert.match(scss, /\.task-card-overlay\s*\{[^}]*box-sizing:\s*border-box;[^}]*border:\s*1rpx solid \$ui-card-border;[^}]*border-radius:\s*\$ui-card-radius;[^}]*box-shadow:\s*\$ui-card-shadow;/s)
  assert.doesNotMatch(scss.match(/\.task-card-overlay\s*\{[^}]*\}/)?.[0] || '', /transform:/)
  assert.match(scss, /\.task-card-overlay \.task-card-head\s*\{[^}]*flex:\s*none;[^}]*flex-shrink:\s*0;[^}]*box-sizing:\s*border-box;[^}]*border-bottom:\s*1rpx solid transparent;[^}]*transition:\s*background \.15s cubic-bezier\(0, 0, \.58, 1\), border-color \.46s cubic-bezier\(\.16, 1, \.3, 1\);/s)
  assert.match(scss, /\.task-card-overlay\.is-open \.task-card-head\s*\{[^}]*border-bottom-color:\s*\$ui-separator;/s)
  assert.match(scss, /\.task-card-overlay\.is-closing\s*\{[^}]*pointer-events:\s*none;/s)
  assert.match(scss, /\.task-card-overlay \.task-item-list\s*\{[^}]*opacity:\s*0;[^}]*filter:\s*blur\(0\);[^}]*transform:\s*translate3d\(0, 20rpx, 0\);[^}]*will-change:\s*opacity, filter, transform;/s)
  assert.match(scss, /\.task-card-overlay\.is-open \.task-item-list\s*\{[^}]*animation:\s*task-item-list-focus-in \.46s cubic-bezier\(\.16, 1, \.3, 1\) both;/s)
  assert.match(scss, /\.task-card-overlay\.is-closing \.task-item-list\s*\{[^}]*animation:\s*task-item-list-focus-out \.46s cubic-bezier\(\.16, 1, \.3, 1\) both;/s)
  assert.match(scss, /\.task-card-overlay\.is-open \.task-item\s*\{[^}]*animation:\s*task-product-enter \.3s cubic-bezier\(\.16, 1, \.3, 1\) both;/s)
  assert.doesNotMatch(scss.match(/\.task-item\s*\{[^}]*\}/)?.[0] || '', /animation:/)
  assert.match(scss, /@keyframes task-item-list-focus-in\s*\{[\s\S]*?from\s*\{[\s\S]*?filter:\s*blur\(0\)[\s\S]*?45%\s*\{[\s\S]*?filter:\s*blur\(10rpx\)[\s\S]*?to\s*\{[\s\S]*?filter:\s*blur\(0\)/)
  assert.match(scss, /@keyframes task-item-list-focus-out\s*\{[\s\S]*?from\s*\{[\s\S]*?filter:\s*blur\(0\)[\s\S]*?45%\s*\{[\s\S]*?filter:\s*blur\(10rpx\)[\s\S]*?to\s*\{[\s\S]*?filter:\s*blur\(0\)/)
  assert.match(scss, /\.task-item-scroll\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1;/s)
  assert.match(scss, /@keyframes task-product-enter\s*\{[\s\S]*?transform:\s*translateY\(12rpx\)[\s\S]*?transform:\s*translateY\(0\)/)
  assert.match(openTask, /this\.measureTaskCardOverlay\(taskId, requestId\)/)
  assert.match(measureTaskCardOverlay, /taskCardOverlayVisible:\s*true[\s\S]*?taskCardOverlayOriginLeft:\s*rect\.left[\s\S]*?taskCardOverlayOriginHeight:\s*rect\.height[\s\S]*?this\.setData\(\{ taskCardOverlayOpen:\s*true \}\)/)
  assert.doesNotMatch(page, /taskCardMotionId|taskCardMotionOffset|taskCardOverlayOriginScale/)
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

test('history detail preserves the pending workbench drawer structure and field materials', () => {
  const historyWxml = source('miniprogram/components/history-editor-modal/history-editor-modal.wxml')
  const historyScss = source('miniprogram/components/history-editor-modal/history-editor-modal.scss')
  const workbenchWxml = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')
  const workbenchScss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')
  const drawers = [
    {
      prefix: 'history',
      wxml: historyWxml,
      scss: historyScss,
    },
    {
      prefix: 'workbench',
      wxml: workbenchWxml,
      scss: workbenchScss,
    },
  ]

  for (const drawer of drawers) {
    assert.match(drawer.scss, /@import ['"]\.\.\/\.\.\/styles\/design-tokens['"];/)
    assert.match(drawer.scss, /height:\s*88vh;/)
    assert.match(drawer.wxml, /class="modal-grabber"/)
    assert.match(drawer.wxml, new RegExp(`class="${drawer.prefix}-modal-header"`))
    assert.match(drawer.wxml, new RegExp(`class="${drawer.prefix}-close"`))
    assert.match(
      drawer.wxml,
      new RegExp(`<scroll-view[^>]*class="${drawer.prefix}-modal-body"`),
    )
    assert.match(drawer.wxml, new RegExp(`class="${drawer.prefix}-modal-actions"`))
    assert.match(drawer.wxml, /class="inspection-item-card /)
    assert.match(drawer.wxml, /class="inspection-item-summary"/)
    assert.match(drawer.wxml, /class="inspection-item-details"/)

    const closeButton = drawer.scss.match(
      new RegExp(`\\.${drawer.prefix}-close\\s*\\{([^}]*)\\}`),
    )?.[1] || ''
    assert.match(closeButton, /width:\s*\$ui-touch-target;/)
    assert.match(closeButton, /height:\s*\$ui-touch-target;/)
    assert.match(closeButton, /border-radius:\s*50%;/)
  }

  const historyFieldContainers = historyScss.match(
    /\.form-field\s*\{([^}]*)\}/,
  )?.[1] || ''
  assert.match(historyFieldContainers, /padding:\s*17rpx 18rpx;/)
  assert.match(historyFieldContainers, /border:\s*1rpx solid \$ui-field-border;/)
  assert.match(historyFieldContainers, /border-radius:\s*\$ui-field-radius;/)
  assert.match(historyFieldContainers, /background:\s*\$ui-field-background;/)

  const historySummary = historyScss.match(/\.inspection-item-summary\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(historySummary, /min-height:\s*136rpx;/)
  assert.match(historySummary, /padding:\s*27rpx 28rpx;/)

  const historyTitleWrap = historyScss.match(/\.inspection-item-title-wrap\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(historyTitleWrap, /padding-right:\s*18rpx;/)

  const historyDetails = historyScss.match(/\.inspection-item-details\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(historyDetails, /padding:\s*4rpx 24rpx 26rpx;/)

  const historyMeasurements = historyScss.match(/\.measurement-grid\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(historyMeasurements, /margin-top:\s*10rpx;/)
  assert.match(historyMeasurements, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);/)
  assert.match(historyMeasurements, /gap:\s*12rpx;/)

  const historyMeasurementField = historyScss.match(/\.measurement-field\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(historyMeasurementField, /padding:\s*11rpx 14rpx;/)
  assert.match(historyMeasurementField, /border-radius:\s*\$ui-field-radius;/)
  assert.match(historyMeasurementField, /background:\s*\$ui-field-background;/)

  assert.match(historyWxml, /class="form-field detail-field/)
  assert.match(historyWxml, /class="form-field row-field/)
  assert.match(historyWxml, /class="measurement-field"/)
  assert.doesNotMatch(historyScss, /border-bottom:\s*1rpx dashed/)
  const historyMask = historyScss.match(/\.history-modal-mask\s*\{([^}]*)\}/)?.[1] || ''
  assert.match(historyMask, /-webkit-backdrop-filter:\s*blur\(12rpx\);/)
  assert.match(historyMask, /backdrop-filter:\s*blur\(12rpx\);/)
  assert.match(
    historyWxml,
    /<view wx:if="\{\{drawerMounted\}\}" class="history-modal-mask"/,
  )
})

test('history editor edits values in place while unloading drawer content after animation', () => {
  const app = source('miniprogram/app.json')
  const page = source('miniprogram/components/history-editor-modal/history-editor-modal.ts')
  const wxml = source('miniprogram/components/history-editor-modal/history-editor-modal.wxml')
  const scss = source('miniprogram/components/history-editor-modal/history-editor-modal.scss')
  const finishClose = page.match(/finishClose\(\) \{([\s\S]*?)\n    \},\n\n    previewImage/)?.[1] || ''
  const releaseDrawerContent = page.match(/releaseDrawerContent\((?:[\s\S]*?)\) \{([\s\S]*?)\n    \},\n\n    previewImage/)?.[1] || ''
  const activateInlineEditor = page.match(/activateInlineEditor\((?:[\s\S]*?)\n    \) \{([\s\S]*?)\n    \},\n\n    onInlineEditorInput/)?.[1] || ''
  const nativeEditors = wxml.match(/<(?:input|textarea)\b[^>]*>/g) || []

  assert.doesNotMatch(app, /"pages\/history-editor\/history-editor"/)
  assert.doesNotMatch(app, /"pages\/history-field-editor\/history-field-editor"/)
  assert.doesNotMatch(wxml, /scroll-x|inspection-table|always-embed/)
  assert.match(wxml, /wx:for="\{\{rowItems\}\}"/)
  assert.doesNotMatch(wxml, /wx:for="\{\{record\.rows\}\}"/)
  assert.doesNotMatch(wxml, /row-pagination|goPreviousRowPage|goNextRowPage/)
  assert.doesNotMatch(page, /buildHistoryEditorRowPage|pageRows|pageTotal/)
  assert.ok(nativeEditors.length > 1)
  for (const editor of nativeEditors) {
    assert.match(editor, /wx:if=/)
    assert.match(editor, /value="\{\{activeEditValue\}\}"/)
    assert.match(editor, /focus="\{\{activeEditorFocused\}\}"/)
    assert.match(editor, /bindinput="onInlineEditorInput"/)
    assert.match(editor, /bindblur="onInlineEditorBlur"/)
    assert.doesNotMatch(editor, /always-embed=/)
  }
  assert.doesNotMatch(wxml, /shared-inline-editor/)
  assert.doesNotMatch(page, /activeEditorVisible|activateSharedEditor|onSharedEditor/)
  assert.match(
    wxml,
    /<textarea wx:if="\{\{activeEditKind === 'record' && activeEditField === 'customer'\}\}" class="inline-edit-input"[\s\S]*?<\/textarea>[\s\S]*?<view wx:else[^>]*class="inline-edit-value"[^>]*data-field="customer"[^>]*bindtap="beginRecordEdit"/,
  )
  assert.match(
    wxml,
    /<textarea wx:if="\{\{activeEditKind === 'row' && activeEditRowIndex === rowItem\.rowIndex && activeEditField === 'item'\}\}" class="inline-edit-input"[\s\S]*?<\/textarea>[\s\S]*?<view wx:else[^>]*class="inline-edit-value"[^>]*data-row-index="\{\{rowItem\.rowIndex\}\}"[^>]*data-field="item"[^>]*bindtap="beginRowFieldEdit"/,
  )
  assert.match(
    wxml,
    /<input wx:if="\{\{activeEditKind === 'measurement' && activeEditRowIndex === rowItem\.rowIndex && activeEditMeasurementIndex === measurementIndex\}\}" class="measurement-input"[\s\S]*?<view wx:else class="measurement-display" data-row-index="\{\{rowItem\.rowIndex\}\}" data-measurement-index="\{\{measurementIndex\}\}" bindtap="beginMeasurementEdit"/,
  )
  assert.match(
    wxml,
    /<textarea wx:if="\{\{activeEditKind === 'record' && activeEditField === 'notes'\}\}" class="inline-edit-input"/,
  )
  const inlineEditValue = scss.match(/\.inline-edit-value\s*\{([^}]*)\}/)?.[1] || ''
  const inlineEditInput = scss.match(/\.inline-edit-input\s*\{([^}]*)\}/)?.[1] || ''
  assert.doesNotMatch(inlineEditValue, /(?:^|\n)\s*height:\s*48rpx;/)
  assert.match(scss, /\.inline-edit-value\s*\{[^}]*white-space:\s*pre-wrap;/)
  assert.doesNotMatch(wxml, /\sauto-height(?:\s|>|\/)/)
  assert.match(wxml, /class="inline-edit-input" style="height: \{\{activeEditorHeight\}\}rpx;"/)
  assert.match(page, /calculateInlineEditorHeight/)
  assert.match(page, /INLINE_EDITOR_MAX_HEIGHT_RPX = 192/)
  assert.match(page, /createSelectorQuery\(\)[\s\S]*boundingClientRect/)
  assert.match(page, /pixelsToRpx/)
  assert.match(page, /activeEditorBaseHeight/)
  assert.doesNotMatch(inlineEditInput, /min-height:/)
  assert.doesNotMatch(inlineEditInput, /max-height:/)
  assert.match(inlineEditInput, /overflow-y:\s*auto;/)
  assert.match(wxml, /id="history-editor-record-model" class="inline-edit-value"/)
  assert.match(wxml, /id="history-editor-row-\{\{rowItem\.rowIndex\}\}-specification" class="inline-edit-value"/)
  assert.doesNotMatch(scss, /\.notes-field \.inline-edit-input/)
  assert.match(page, /onInlineEditorInput[\s\S]*Math\.max\(this\.data\.activeEditorBaseHeight, height\)/)
  assert.doesNotMatch(wxml, /\sdisabled="\{\{!drawerMounted/)
  assert.doesNotMatch(wxml, /fixed=/)
  assert.match(wxml, /^<view class="history-modal-layer \{\{drawerMounted \? 'is-mounted' : ''\}\}/)
  assert.match(wxml, /<scroll-view wx:if="\{\{drawerMounted\}\}" class="history-modal-body"/)
  assert.doesNotMatch(wxml, /bindinput="(?:onRecordInput|onRowFieldInput|onMeasurementInput)"/)
  assert.match(wxml, /expandedRowIndex === rowItem\.rowIndex/)
  assert.doesNotMatch(wxml, /startEditing|编辑记录|wx:if="\{\{editing\}\}"/)
  assert.doesNotMatch(page, /editable:\s*true|wx\.showModal|wx\.showActionSheet|wx\.navigateTo/)
  assert.match(page, /onInlineEditorInput[\s\S]*historyEditorDraftValues\.set/)
  assert.match(page, /commitActiveEditor[\s\S]*updateRowField/)
  assert.match(page, /commitActiveEditor[\s\S]*updateMeasurement/)
  assert.match(page, /detached\(\) \{[\s\S]*clearHistoryEditorCloseTimer\(this\)/)
  assert.match(page, /detached\(\) \{[\s\S]*historyEditorDraftValues\.delete\(this\)/)
  assert.match(page, /detached\(\) \{[\s\S]*historyEditorRawContents\.delete\(this\)/)
  assert.match(page, /detached\(\) \{[\s\S]*historyEditorRows\.delete\(this\)/)
  assert.match(page, /drawerMounted:\s*false/)
  assert.match(page, /observers:\s*\{[\s\S]*'visible, origin, recordId, sourceType, taskId, itemId'/)
  assert.match(page, /openDrawer\(\)[\s\S]*drawerMounted:\s*true/)
  assert.match(activateInlineEditor, /commitActiveEditor\(activateWithDisplayedHeight\)/)
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
  assert.match(scss, /\.inline-edit-input/)
  assert.match(scss, /\.measurement-input/)
  assert.doesNotMatch(scss, /\.shared-inline-editor/)
  assert.match(scss, /height:\s*88vh;/)
  assert.match(scss, /\.history-modal-mask\s*\{[^}]*backdrop-filter:\s*blur\(12rpx\);/)
  assert.match(scss, /\.history-modal-panel\s*\{[^}]*will-change:\s*transform;[^}]*transform:\s*translate3d\(0, 100%, 0\);/s)
  assert.doesNotMatch(scss.match(/\.history-modal-panel\s*\{[^}]*\}/)?.[0] || '', /backdrop-filter:/)
  assert.match(scss, /@keyframes history-modal-sheet-up/)
  assert.match(scss, /@keyframes history-modal-sheet-down/)
  assert.match(scss, /@keyframes history-modal-sheet-up\s*\{[\s\S]*?translate3d\(0, 100%, 0\)[\s\S]*?translate3d\(0, 0, 0\)/)
  assert.match(scss, /@keyframes history-modal-sheet-down\s*\{[\s\S]*?translate3d\(0, 0, 0\)[\s\S]*?translate3d\(0, 100%, 0\)/)
})
