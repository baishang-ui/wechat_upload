import {
  buildUiThemePresentation,
  normalizeUiPreferences,
  UiPreferences,
  UI_PREFERENCES_STORAGE_KEY,
} from '../domain/ui-preferences'

export interface UiThemePageData {
  uiThemePageStyle: string
  uiNavigationTextColor: string
  uiNavigationBackground: string
}

export interface UiPreferencesStorageAdapter {
  getStorage(key: string): unknown
  setStorage(key: string, value: UiPreferences): void
}

function createDefaultAdapter(): UiPreferencesStorageAdapter {
  return {
    getStorage: (key) => wx.getStorageSync(key),
    setStorage: (key, value) => wx.setStorageSync(key, value),
  }
}

export function loadUiPreferences(
  adapter: UiPreferencesStorageAdapter = createDefaultAdapter(),
): UiPreferences {
  try {
    return normalizeUiPreferences(adapter.getStorage(UI_PREFERENCES_STORAGE_KEY))
  } catch {
    return normalizeUiPreferences(null)
  }
}

export function saveUiPreferences(
  preferences: UiPreferences,
  adapter: UiPreferencesStorageAdapter = createDefaultAdapter(),
): UiPreferences {
  const normalized = normalizeUiPreferences(preferences)
  adapter.setStorage(UI_PREFERENCES_STORAGE_KEY, normalized)
  return normalized
}

export function loadUiThemePageData(
  adapter: UiPreferencesStorageAdapter = createDefaultAdapter(),
): UiThemePageData {
  const presentation = buildUiThemePresentation(loadUiPreferences(adapter))
  return {
    uiThemePageStyle: presentation.pageStyle,
    uiNavigationTextColor: presentation.navigationTextColor,
    uiNavigationBackground: presentation.navigationBackground,
  }
}
