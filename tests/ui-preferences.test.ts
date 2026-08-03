import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import {
  buildUiThemePresentation,
  DEFAULT_UI_PREFERENCES,
  normalizeUiPreferences,
  UI_THEME_COLORS,
  UI_THEME_MODES,
} from '../miniprogram/domain/ui-preferences'
import {
  loadUiPreferences,
  saveUiPreferences,
  UiPreferencesStorageAdapter,
} from '../miniprogram/services/ui-preferences-service'

function createAdapter(initial?: unknown): UiPreferencesStorageAdapter & {
  stored: unknown
} {
  return {
    stored: initial,
    getStorage() {
      return this.stored
    },
    setStorage(_key, value) {
      this.stored = value
    },
  }
}

test('UI preferences expose light and dark modes with four semantic accent choices', () => {
  assert.deepEqual(UI_THEME_MODES.map((item) => item.value), ['light', 'dark'])
  assert.deepEqual(UI_THEME_COLORS.map((item) => item.value), ['blue', 'violet', 'green', 'orange'])
  assert.deepEqual(UI_THEME_COLORS.map((item) => item.preview), [
    '#5695e0',
    '#9284d6',
    '#55a674',
    '#c67f4d',
  ])
})

test('invalid UI preferences fall back to the light blue defaults', () => {
  assert.deepEqual(normalizeUiPreferences(null), DEFAULT_UI_PREFERENCES)
  assert.deepEqual(normalizeUiPreferences({ mode: 'system', color: 'pink' }), DEFAULT_UI_PREFERENCES)
})

test('theme presentation emits page-level semantic variables for light and dark modes', () => {
  const light = buildUiThemePresentation({ mode: 'light', color: 'blue' })
  const dark = buildUiThemePresentation({ mode: 'dark', color: 'orange' })

  assert.match(light.pageStyle, /--ui-primary: #5695e0;/)
  assert.match(light.pageStyle, /--ui-primary-pressed: #5087c9;/)
  assert.match(light.pageStyle, /--ui-primary-soft: rgba\(86, 149, 224, \.15\);/)
  assert.match(light.pageStyle, /--ui-on-primary: #18181b;/)
  assert.match(light.pageStyle, /--ui-page-background: #f7f7f8;/)
  assert.match(light.pageStyle, /--ui-text-primary: #18181b;/)
  assert.match(light.pageStyle, /--ui-card-background: #fcfcfc;/)
  assert.match(light.pageStyle, /--ui-surface-secondary: #f4f4f5;/)
  assert.match(light.pageStyle, /--ui-field-background: #fcfcfc;/)
  assert.match(light.pageStyle, /--ui-glass-background: rgba\(252, 252, 252, \.58\);/)
  assert.match(light.pageStyle, /--ui-bottom-glass-brightness: 90%;/)
  assert.match(light.pageStyle, /--ui-card-shadow: 0 6rpx 20rpx rgba\(24, 24, 27, \.025\), 0 24rpx 64rpx rgba\(24, 24, 27, \.035\);/)
  assert.match(light.pageStyle, /--ui-glass-shadow: 0 6rpx 24rpx rgba\(24, 24, 27, \.025\), 0 24rpx 64rpx rgba\(24, 24, 27, \.045\), inset 0 1rpx 0 rgba\(255, 255, 255, \.4\);/)
  assert.match(light.pageStyle, /--ui-glass-highlight-strong: rgba\(255, 255, 255, \.62\);/)
  assert.match(light.pageStyle, /--ui-glass-highlight-medium: rgba\(255, 255, 255, \.22\);/)
  assert.match(light.pageStyle, /--ui-glass-highlight-soft: rgba\(255, 255, 255, \.04\);/)
  assert.match(light.pageStyle, /--ui-success: #17c964;/)
  assert.match(light.pageStyle, /--ui-warning: #f5a524;/)
  assert.match(light.pageStyle, /--ui-danger: #ff383c;/)
  assert.equal(light.navigationTextColor, '#18181b')
  assert.match(dark.pageStyle, /--ui-primary: #c67f4d;/)
  assert.match(dark.pageStyle, /--ui-primary-pressed: #b27448;/)
  assert.match(dark.pageStyle, /--ui-page-background: #111113;/)
  assert.match(dark.pageStyle, /--ui-text-primary: #fcfcfc;/)
  assert.match(dark.pageStyle, /--ui-card-background: #18181b;/)
  assert.match(dark.pageStyle, /--ui-surface-secondary: #1f1f22;/)
  assert.match(dark.pageStyle, /--ui-field-background: #1f1f22;/)
  assert.match(dark.pageStyle, /--ui-glass-highlight-strong: rgba\(255, 255, 255, \.24\);/)
  assert.match(dark.pageStyle, /--ui-glass-highlight-medium: rgba\(255, 255, 255, \.1\);/)
  assert.match(dark.pageStyle, /--ui-glass-highlight-soft: rgba\(255, 255, 255, \.03\);/)
  assert.match(dark.pageStyle, /--ui-bottom-glass-brightness: 100%;/)
  assert.match(dark.pageStyle, /--ui-diffuse-glow: rgba\(198, 127, 77, \.04\);/)
  assert.match(dark.pageStyle, /--ui-diffuse-glow-strong: rgba\(198, 127, 77, \.065\);/)
  assert.match(dark.pageStyle, /--ui-card-shadow:[^;]*0 0 64rpx var\(--ui-diffuse-glow\);/)
  assert.match(dark.pageStyle, /--ui-glass-shadow:[^;]*0 0 72rpx var\(--ui-diffuse-glow-strong\);/)
  assert.match(dark.pageStyle, /--ui-overlay-shadow:[^;]*0 0 96rpx var\(--ui-diffuse-glow-strong\);/)
  assert.match(dark.pageStyle, /--ui-overlay-background: rgba\(0, 0, 0, \.6\);/)
  assert.equal(dark.navigationTextColor, '#fcfcfc')
  assert.equal(light.navigationBackground, 'rgba(252, 252, 252, .58)')
  assert.equal(dark.navigationBackground, 'rgba(24, 24, 27, .58)')
})

test('UI preference storage normalizes reads and persists validated values', () => {
  const adapter = createAdapter({ mode: 'dark', color: 'green' })
  assert.deepEqual(loadUiPreferences(adapter), { mode: 'dark', color: 'green' })

  const saved = saveUiPreferences({ mode: 'light', color: 'violet' }, adapter)
  assert.deepEqual(saved, { mode: 'light', color: 'violet' })
  assert.deepEqual(adapter.stored, saved)
})
