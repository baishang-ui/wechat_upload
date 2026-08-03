export const UI_PREFERENCES_STORAGE_KEY = 'uiPreferences:v1'

export const UI_THEME_MODES = [
  { value: 'light', label: '亮色' },
  { value: 'dark', label: '暗色' },
] as const

export const UI_THEME_COLORS = [
  { value: 'blue', label: '雾蓝', preview: '#5695e0' },
  { value: 'violet', label: '柔紫', preview: '#9284d6' },
  { value: 'green', label: '灰绿', preview: '#55a674' },
  { value: 'orange', label: '陶橙', preview: '#c67f4d' },
] as const

export type UiThemeMode = typeof UI_THEME_MODES[number]['value']
export type UiThemeColor = typeof UI_THEME_COLORS[number]['value']

export interface UiPreferences {
  mode: UiThemeMode
  color: UiThemeColor
}

export interface UiThemePresentation {
  pageStyle: string
  navigationTextColor: string
  navigationBackground: string
  refresherBackground: string
}

export const DEFAULT_UI_PREFERENCES: UiPreferences = {
  mode: 'light',
  color: 'blue',
}

interface AccentPalette {
  primary: string
  pressed: string
  onPrimary: string
  soft: string
  softPressed: string
  darkSoft: string
  darkSoftPressed: string
  focusRing: string
  indicatorShadow: string
  diffuseGlow: string
  diffuseGlowStrong: string
}

const ACCENT_PALETTES: Record<UiThemeColor, AccentPalette> = {
  blue: {
    primary: '#5695e0',
    pressed: '#5087c9',
    onPrimary: '#18181b',
    soft: 'rgba(86, 149, 224, .15)',
    softPressed: 'rgba(86, 149, 224, .2)',
    darkSoft: 'rgba(86, 149, 224, .15)',
    darkSoftPressed: 'rgba(86, 149, 224, .2)',
    focusRing: 'rgba(86, 149, 224, .18)',
    indicatorShadow: 'rgba(86, 149, 224, .08)',
    diffuseGlow: 'rgba(86, 149, 224, .04)',
    diffuseGlowStrong: 'rgba(86, 149, 224, .065)',
  },
  violet: {
    primary: '#9284d6',
    pressed: '#8479c1',
    onPrimary: '#18181b',
    soft: 'rgba(146, 132, 214, .15)',
    softPressed: 'rgba(146, 132, 214, .2)',
    darkSoft: 'rgba(146, 132, 214, .15)',
    darkSoftPressed: 'rgba(146, 132, 214, .2)',
    focusRing: 'rgba(146, 132, 214, .18)',
    indicatorShadow: 'rgba(146, 132, 214, .08)',
    diffuseGlow: 'rgba(146, 132, 214, .04)',
    diffuseGlowStrong: 'rgba(146, 132, 214, .065)',
  },
  green: {
    primary: '#55a674',
    pressed: '#4f966a',
    onPrimary: '#18181b',
    soft: 'rgba(85, 166, 116, .15)',
    softPressed: 'rgba(85, 166, 116, .2)',
    darkSoft: 'rgba(85, 166, 116, .15)',
    darkSoftPressed: 'rgba(85, 166, 116, .2)',
    focusRing: 'rgba(85, 166, 116, .18)',
    indicatorShadow: 'rgba(85, 166, 116, .08)',
    diffuseGlow: 'rgba(85, 166, 116, .04)',
    diffuseGlowStrong: 'rgba(85, 166, 116, .065)',
  },
  orange: {
    primary: '#c67f4d',
    pressed: '#b27448',
    onPrimary: '#18181b',
    soft: 'rgba(198, 127, 77, .15)',
    softPressed: 'rgba(198, 127, 77, .2)',
    darkSoft: 'rgba(198, 127, 77, .15)',
    darkSoftPressed: 'rgba(198, 127, 77, .2)',
    focusRing: 'rgba(198, 127, 77, .18)',
    indicatorShadow: 'rgba(198, 127, 77, .08)',
    diffuseGlow: 'rgba(198, 127, 77, .04)',
    diffuseGlowStrong: 'rgba(198, 127, 77, .065)',
  },
}

const LIGHT_THEME = {
  '--ui-page-background': '#f7f7f8',
  '--ui-text-primary': '#18181b',
  '--ui-text-secondary': '#71717a',
  '--ui-text-tertiary': '#a1a1aa',
  '--ui-card-background': '#fcfcfc',
  '--ui-surface-secondary': '#f4f4f5',
  '--ui-surface-tertiary': '#efeff0',
  '--ui-surface-hover': '#f1f1f2',
  '--ui-card-border': '#e7e7ea',
  '--ui-separator': '#ececee',
  '--ui-field-background': '#fcfcfc',
  '--ui-field-border': '#e4e4e7',
  '--ui-overlay-background': 'rgba(0, 0, 0, .5)',
  '--ui-overlay-surface': '#fcfcfc',
  '--ui-sheet-background': 'rgba(252, 252, 252, .96)',
  '--ui-glass-background': 'rgba(252, 252, 252, .58)',
  '--ui-glass-border': 'rgba(255, 255, 255, .7)',
  '--ui-glass-highlight-strong': 'rgba(255, 255, 255, .62)',
  '--ui-glass-highlight-medium': 'rgba(255, 255, 255, .22)',
  '--ui-glass-highlight-soft': 'rgba(255, 255, 255, .04)',
  '--ui-bottom-glass-brightness': '90%',
  '--ui-glass-shadow': '0 6rpx 24rpx rgba(24, 24, 27, .025), 0 24rpx 64rpx rgba(24, 24, 27, .045), inset 0 1rpx 0 rgba(255, 255, 255, .4)',
  '--ui-card-shadow': '0 6rpx 20rpx rgba(24, 24, 27, .025), 0 24rpx 64rpx rgba(24, 24, 27, .035)',
  '--ui-field-shadow': '0 4rpx 16rpx rgba(24, 24, 27, .018), 0 16rpx 44rpx rgba(24, 24, 27, .024)',
  '--ui-overlay-shadow': '0 10rpx 32rpx rgba(24, 24, 27, .035), 0 36rpx 96rpx rgba(24, 24, 27, .055)',
} as const

const DARK_THEME = {
  '--ui-page-background': '#111113',
  '--ui-text-primary': '#fcfcfc',
  '--ui-text-secondary': '#9f9fa9',
  '--ui-text-tertiary': '#71717a',
  '--ui-card-background': '#18181b',
  '--ui-surface-secondary': '#1f1f22',
  '--ui-surface-tertiary': '#242427',
  '--ui-surface-hover': '#28282b',
  '--ui-card-border': '#2c2c30',
  '--ui-separator': '#26262a',
  '--ui-field-background': '#1f1f22',
  '--ui-field-border': '#303035',
  '--ui-overlay-background': 'rgba(0, 0, 0, .6)',
  '--ui-overlay-surface': '#18181b',
  '--ui-sheet-background': 'rgba(24, 24, 27, .97)',
  '--ui-glass-background': 'rgba(24, 24, 27, .58)',
  '--ui-glass-border': 'rgba(255, 255, 255, .12)',
  '--ui-glass-highlight-strong': 'rgba(255, 255, 255, .24)',
  '--ui-glass-highlight-medium': 'rgba(255, 255, 255, .1)',
  '--ui-glass-highlight-soft': 'rgba(255, 255, 255, .03)',
  '--ui-bottom-glass-brightness': '100%',
  '--ui-glass-shadow': '0 0 0 1rpx rgba(255, 255, 255, .06) inset, 0 20rpx 68rpx rgba(0, 0, 0, .16), 0 0 72rpx var(--ui-diffuse-glow-strong)',
  '--ui-card-shadow': '0 0 0 1rpx rgba(255, 255, 255, .04), 0 20rpx 64rpx rgba(0, 0, 0, .14), 0 0 64rpx var(--ui-diffuse-glow)',
  '--ui-field-shadow': '0 0 0 1rpx rgba(255, 255, 255, .03), 0 16rpx 48rpx rgba(0, 0, 0, .1), 0 0 48rpx var(--ui-diffuse-glow)',
  '--ui-overlay-shadow': '0 0 0 1rpx rgba(255, 255, 255, .06), 0 36rpx 104rpx rgba(0, 0, 0, .22), 0 0 96rpx var(--ui-diffuse-glow-strong)',
} as const

function isThemeMode(value: unknown): value is UiThemeMode {
  return UI_THEME_MODES.some((option) => option.value === value)
}

function isThemeColor(value: unknown): value is UiThemeColor {
  return UI_THEME_COLORS.some((option) => option.value === value)
}

export function normalizeUiPreferences(value: unknown): UiPreferences {
  if (typeof value !== 'object' || value === null) return { ...DEFAULT_UI_PREFERENCES }
  const candidate = value as { mode?: unknown; color?: unknown }
  if (!isThemeMode(candidate.mode) || !isThemeColor(candidate.color)) {
    return { ...DEFAULT_UI_PREFERENCES }
  }
  return {
    mode: candidate.mode,
    color: candidate.color,
  }
}

export function buildUiThemePresentation(
  preferences: UiPreferences,
): UiThemePresentation {
  const normalized = normalizeUiPreferences(preferences)
  const dark = normalized.mode === 'dark'
  const neutralTheme = dark ? DARK_THEME : LIGHT_THEME
  const accent = ACCENT_PALETTES[normalized.color]
  const variables: Record<string, string> = {
    ...neutralTheme,
    '--ui-primary': accent.primary,
    '--ui-primary-pressed': accent.pressed,
    '--ui-primary-soft': dark ? accent.darkSoft : accent.soft,
    '--ui-primary-soft-pressed': dark ? accent.darkSoftPressed : accent.softPressed,
    '--ui-on-primary': accent.onPrimary,
    '--ui-focus-ring': `0 0 0 4rpx ${accent.focusRing}`,
    '--ui-tab-indicator-shadow': `0 10rpx 32rpx ${accent.indicatorShadow}`,
    '--ui-diffuse-glow': accent.diffuseGlow,
    '--ui-diffuse-glow-strong': accent.diffuseGlowStrong,
    '--ui-success': '#17c964',
    '--ui-success-background': 'rgba(23, 201, 100, .15)',
    '--ui-success-border': 'rgba(23, 201, 100, .28)',
    '--ui-warning': dark ? '#f7b750' : '#f5a524',
    '--ui-warning-background': dark ? 'rgba(247, 183, 80, .15)' : 'rgba(245, 165, 36, .15)',
    '--ui-warning-border': dark ? 'rgba(247, 183, 80, .28)' : 'rgba(245, 165, 36, .28)',
    '--ui-danger': dark ? '#db3b3e' : '#ff383c',
    '--ui-danger-pressed': dark ? '#df4e51' : '#ff4c50',
    '--ui-danger-background': dark ? 'rgba(219, 59, 62, .15)' : 'rgba(255, 56, 60, .15)',
    '--ui-danger-background-pressed': dark ? 'rgba(219, 59, 62, .2)' : 'rgba(255, 56, 60, .2)',
    '--ui-danger-border': dark ? 'rgba(219, 59, 62, .28)' : 'rgba(255, 56, 60, .28)',
  }
  return {
    pageStyle: Object.entries(variables)
      .map(([name, value]) => `${name}: ${value};`)
      .join(' '),
    navigationTextColor: dark ? '#fcfcfc' : '#18181b',
    navigationBackground: neutralTheme['--ui-glass-background'],
    refresherBackground: neutralTheme['--ui-page-background'],
  }
}
