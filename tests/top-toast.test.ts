import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  showTopToast,
  partitionTopToastStack,
  subscribeTopToast,
  TopToastEvent,
} from '../miniprogram/services/top-toast-service'

const root = path.resolve(import.meta.dirname, '..')
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('top toast service delivers each notification only to the active page host', () => {
  const backgroundEvents: TopToastEvent[] = []
  const activeEvents: TopToastEvent[] = []
  const unsubscribeBackground = subscribeTopToast((event) => backgroundEvents.push(event))
  const unsubscribeActive = subscribeTopToast((event) => activeEvents.push(event))

  const success = showTopToast({ message: '草稿已保存', type: 'success', duration: 500 })

  assert.equal(backgroundEvents.length, 0)
  assert.deepEqual(activeEvents, [success])
  assert.equal(success.message, '草稿已保存')
  assert.equal(success.type, 'success')
  assert.equal(success.duration, 1200)

  unsubscribeActive()
  const warning = showTopToast({ message: ' 请核对未匹配条目 ', type: 'warning', duration: 9000 })
  assert.deepEqual(backgroundEvents, [warning])
  assert.equal(warning.message, '请核对未匹配条目')
  assert.equal(warning.duration, 6000)

  unsubscribeBackground()
})


test('top toast stack keeps two full notifications and stacks the third and older cards', () => {
  const events = [
    showTopToast({ message: '第一条', type: 'info' }),
    showTopToast({ message: '第二条', type: 'warning' }),
    showTopToast({ message: '第三条', type: 'error' }),
    showTopToast({ message: '第四条', type: 'success' }),
  ]

  const stack = partitionTopToastStack(events)

  assert.deepEqual(stack.expanded.map((event) => event.message), ['第四条', '第三条'])
  assert.deepEqual(stack.stacked.map((event) => event.message), ['第二条', '第一条'])
})

test('every page mounts the unified animated top toast and native notification popups are removed', () => {
  const app = JSON.parse(source('miniprogram/app.json')) as {
    usingComponents?: Record<string, string>
    pages: string[]
  }
  const toastWxml = source('miniprogram/components/top-toast/top-toast.wxml')
  const toastScss = source('miniprogram/components/top-toast/top-toast.scss')
  const toastTs = source('miniprogram/components/top-toast/top-toast.ts')
  const toastJson = source('miniprogram/components/top-toast/top-toast.json')
  const indexScss = source('miniprogram/pages/index/index.scss')
  const toastVisualLayers = toastScss.match(
    /\.top-toast__shadow,\s*\n\.top-toast__surface\s*\{([^}]*)\}/,
  )?.[1] || ''
  const toastContent = toastScss.match(/\.top-toast__content\s*\{([^}]*)\}/)?.[1] || ''
  const toastCard = toastScss.match(/^\.top-toast\s*\{([^}]*)\}/m)?.[1] || ''
  const visibleToastCard = toastScss.match(/\.top-toast--visible\s*\{([^}]*)\}/)?.[1] || ''
  const leavingToastCard = toastScss.match(/\.top-toast--leaving\s*\{([^}]*)\}/)?.[1] || ''

  assert.equal(app.usingComponents?.['top-toast'], '/components/top-toast/top-toast')
  for (const page of app.pages) {
    assert.match(source(`miniprogram/${page}.wxml`), /<top-toast\s*\/>/)
  }

  assert.match(toastWxml, /class="top-toast-stack"/)
  assert.match(toastWxml, /^<view\b/)
  assert.doesNotMatch(toastWxml, /<cover-view\b/)
  assert.match(toastWxml, /wx:for="\{\{items\}\}"/)
  assert.match(toastWxml, /top-toast-slot--\{\{item\.mode\}\}/)
  assert.doesNotMatch(toastWxml, /另有|foldCount/)
  assert.match(toastWxml, /(?:bind|catch)tap="dismissToast"/)
  assert.match(toastWxml, /class="top-toast__shadow"/)
  assert.match(toastWxml, /class="top-toast__surface"/)
  assert.match(toastTs, /virtualHost:\s*true/)
  assert.match(toastJson, /"styleIsolation"\s*:\s*"apply-shared"/)
  assert.match(toastTs, /subscribeTopToast/)
  assert.match(toastTs, /partitionTopToastStack/)
  assert.match(toastTs, /mode:\s*isStacked\s*\?\s*'stacked'/)
  assert.match(toastTs, /STACKED_TOAST_OFFSET_RPX/)
  assert.match(toastTs, /TOAST_SHADOW_VERTICAL_GUTTER_RPX/)
  assert.match(toastTs, /phase:\s*'entering'/)
  assert.match(toastTs, /phase\s*=\s*'visible'/)
  assert.match(toastTs, /phase\s*=\s*'leaving'/)
  assert.match(toastScss, /position:\s*fixed/)
  assert.match(toastScss, /\.top-toast-stack\s*\{[^}]*overflow:\s*visible;/s)
  assert.match(toastScss, /\.top-toast-stack\s*\{[^}]*width:\s*648rpx;[^}]*margin-top:\s*-48rpx;/s)
  assert.match(toastScss, /\.top-toast-slot\s*\{[^}]*top:\s*0;[^}]*right:\s*0;[^}]*left:\s*0;/s)
  assert.match(toastScss, /\.top-toast-slot\s*\{[^}]*overflow:\s*visible;/s)
  assert.match(toastScss, /\.top-toast\s*\{[^}]*overflow:\s*visible;/s)
  assert.match(toastVisualLayers, /top:\s*48rpx;/)
  assert.match(toastVisualLayers, /right:\s*48rpx;/)
  assert.match(toastVisualLayers, /bottom:\s*48rpx;/)
  assert.match(toastVisualLayers, /left:\s*48rpx;/)
  assert.match(toastScss, /\.top-toast__shadow\s*\{[^}]*box-shadow:/s)
  assert.match(toastScss, /\.top-toast__surface\s*\{[^}]*overflow:\s*hidden;/s)
  assert.match(toastScss, /\.top-toast__shadow\s*\{[^}]*box-shadow:\s*\$ui-overlay-shadow;/s)
  assert.match(toastScss, /\.top-toast__surface\s*\{[^}]*border:\s*1rpx solid \$ui-card-border;[^}]*background:\s*\$ui-overlay-surface;/s)
  assert.doesNotMatch(toastScss, /backdrop-filter:/)
  assert.doesNotMatch(toastScss, /\.top-toast--(?:success|error|warning) \.top-toast__surface\s*\{[^}]*background:/s)
  assert.match(toastScss, /\.top-toast--success \.top-toast__title\s*\{\s*color:\s*\$ui-success;\s*\}/)
  assert.match(toastScss, /\.top-toast--error \.top-toast__title\s*\{\s*color:\s*\$ui-danger;\s*\}/)
  assert.match(toastScss, /\.top-toast--warning \.top-toast__title\s*\{\s*color:\s*\$ui-warning;\s*\}/)
  assert.match(toastVisualLayers, /border-radius:\s*999rpx;/)
  assert.match(toastScss, /\.top-toast\s*\{[^}]*width:\s*648rpx;[^}]*height:\s*216rpx;/s)
  assert.doesNotMatch(toastCard, /\bwidth\s+\.\d+s/)
  assert.doesNotMatch(toastCard, /\bheight\s+\.\d+s/)
  assert.match(toastScss, /max-width:\s*calc\(100vw - 32rpx\)/)
  const toastRadius = toastVisualLayers.match(/border-radius:\s*(\d+rpx)/)?.[1]
  assert.equal(toastRadius, '999rpx')
  assert.match(indexScss, /\.floating-tabs\s*\{[^}]*border-radius:\s*999rpx;/s)
  assert.match(toastScss, /transition:[^;]*cubic-bezier\(\.22,\s*1,\s*\.36,\s*1\)/s)
  assert.match(toastScss, /\.top-toast--leaving/)
  assert.match(toastCard, /filter:\s*blur\(10rpx\);/)
  assert.match(visibleToastCard, /filter:\s*blur\(0\);/)
  assert.match(leavingToastCard, /filter:\s*blur\(10rpx\);/)
  assert.doesNotMatch(toastContent, /\bfilter:/)
  assert.match(toastTs, /this\.syncToastStack\(\(\) => \{[\s\S]*timers\.revealTimer = setTimeout/)

  const productionTs = [
    'miniprogram/pages/index/index.ts',
    'miniprogram/pages/document-camera/document-camera.ts',
    'miniprogram/pages/inspection-workbench/inspection-workbench.ts',
    'miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts',
  ].map(source).join('\n')

  assert.doesNotMatch(productionTs, /wx\.showToast/)
  assert.doesNotMatch(productionTs, /wx\.showModal\(\{[\s\S]{0,300}?showCancel:\s*false/)
  assert.match(productionTs, /showTopToast\(/)
})
