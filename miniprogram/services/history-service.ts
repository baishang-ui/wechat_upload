import {
  HISTORY_STORAGE_KEY,
  HistoryRecordInput,
  LEGACY_HISTORY_STORAGE_KEY,
  parseHistory,
  removeHistoryRecord,
  StoredInspectionRecord,
  updateSyncState,
  upsertHistory,
} from '../domain/inspection-history'

export interface HistoryStorageAdapter {
  getStorage(key: string): unknown
  setStorage(key: string, records: StoredInspectionRecord[]): void
  removeStorage(key: string): void
  createUuid(): string
  saveFile(temporaryPath: string): Promise<string>
  removeFile(filePath: string): Promise<void>
}

function createUuidV4(): string {
  const bytes = new Uint8Array(16)
  let populated = false
  wx.getRandomValues({
    length: bytes.length,
    success: (result) => {
      bytes.set(new Uint8Array(result.randomValues))
      populated = true
    },
  })
  if (!populated) {
    for (let index = 0; index < bytes.length; index += 1) {
      bytes[index] = Math.floor(Math.random() * 256)
    }
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0'))
  return `${hex.slice(0, 4).join('')}-${hex.slice(4, 6).join('')}-${hex.slice(6, 8).join('')}-${hex.slice(8, 10).join('')}-${hex.slice(10).join('')}`
}

function createDefaultAdapter(): HistoryStorageAdapter {
  const fileSystem = wx.getFileSystemManager()
  return {
    getStorage: (key) => wx.getStorageSync(key),
    setStorage: (key, records) => wx.setStorageSync(key, records),
    removeStorage: (key) => wx.removeStorageSync(key),
    createUuid: createUuidV4,
    saveFile: (temporaryPath) => new Promise((resolve, reject) => {
      fileSystem.saveFile({
        tempFilePath: temporaryPath,
        success: (result) => resolve(result.savedFilePath),
        fail: () => reject(new Error('无法保存报告图片')),
      })
    }),
    removeFile: (filePath) => new Promise((resolve, reject) => {
      fileSystem.removeSavedFile({
        filePath,
        success: () => resolve(),
        fail: () => reject(new Error('无法删除本地报告图片')),
      })
    }),
  }
}

async function removeFilesBestEffort(
  filePaths: string[],
  adapter: HistoryStorageAdapter,
): Promise<void> {
  await Promise.all(filePaths.map((filePath) => adapter.removeFile(filePath).catch(() => undefined)))
}

export function loadInspectionHistory(
  adapter: HistoryStorageAdapter = createDefaultAdapter(),
): StoredInspectionRecord[] {
  try {
    const currentRaw = adapter.getStorage(HISTORY_STORAGE_KEY)
    if (Array.isArray(currentRaw)) {
      const records = parseHistory(currentRaw, adapter.createUuid)
      const interrupted = currentRaw.some((item) => (
        typeof item === 'object' && item !== null
        && (item as { syncStatus?: unknown }).syncStatus === 'syncing'
      ))
      if (interrupted) adapter.setStorage(HISTORY_STORAGE_KEY, records)
      return records
    }
    const legacyRaw = adapter.getStorage(LEGACY_HISTORY_STORAGE_KEY)
    if (!Array.isArray(legacyRaw)) return []
    const migrated = parseHistory(legacyRaw, adapter.createUuid)
    adapter.setStorage(HISTORY_STORAGE_KEY, migrated)
    return migrated
  } catch {
    return []
  }
}

function persistState(
  id: string,
  patch: Parameters<typeof updateSyncState>[1],
  adapter: HistoryStorageAdapter,
  now: number,
): StoredInspectionRecord | null {
  const records = loadInspectionHistory(adapter)
  let updated: StoredInspectionRecord | null = null
  const next = records.map((record) => {
    if (record.id !== id) return record
    updated = updateSyncState(record, patch, now)
    return updated
  })
  if (updated) adapter.setStorage(HISTORY_STORAGE_KEY, next)
  return updated
}

export function saveHistorySyncState(
  record: StoredInspectionRecord,
  adapter: HistoryStorageAdapter = createDefaultAdapter(),
): StoredInspectionRecord | null {
  const records = loadInspectionHistory(adapter)
  let updated: StoredInspectionRecord | null = null
  const next = records.map((stored) => {
    if (stored.id !== record.id) return stored
    updated = {
      ...stored,
      sourceType: record.sourceType,
      taskId: record.taskId,
      itemId: record.itemId,
      syncStatus: record.syncStatus,
      syncError: record.syncError,
      updatedAt: record.updatedAt,
    }
    return updated
  })
  if (updated) adapter.setStorage(HISTORY_STORAGE_KEY, next)
  return updated
}


export function markHistorySyncing(
  id: string,
  adapter: HistoryStorageAdapter = createDefaultAdapter(),
  now = Date.now(),
): StoredInspectionRecord | null {
  return persistState(id, { syncStatus: 'syncing', syncError: '' }, adapter, now)
}

export function markHistorySynced(
  id: string,
  taskId: number,
  itemId: number,
  adapter: HistoryStorageAdapter = createDefaultAdapter(),
  now = Date.now(),
): StoredInspectionRecord | null {
  return persistState(id, {
    syncStatus: 'synced',
    syncError: '',
    taskId,
    itemId,
  }, adapter, now)
}

export function markHistoryFailed(
  id: string,
  syncError: string,
  adapter: HistoryStorageAdapter = createDefaultAdapter(),
  now = Date.now(),
): StoredInspectionRecord | null {
  return persistState(id, { syncStatus: 'failed', syncError }, adapter, now)
}

export async function saveInspectionHistory(
  input: HistoryRecordInput,
  existingId = '',
  adapter: HistoryStorageAdapter = createDefaultAdapter(),
  now = Date.now(),
): Promise<StoredInspectionRecord> {
  const records = loadInspectionHistory(adapter)
  const existing = existingId ? records.find((item) => item.id === existingId) : undefined
  let savedImagePath = existing?.imagePath ?? ''
  let newlySavedImagePath = ''
  if (!existing && input.imagePath) {
    savedImagePath = await adapter.saveFile(input.imagePath)
    newlySavedImagePath = savedImagePath
  }
  const mutation = upsertHistory(records, {
    ...input,
    imagePath: savedImagePath,
  }, now, existing?.id, adapter.createUuid)
  try {
    adapter.setStorage(HISTORY_STORAGE_KEY, mutation.records)
  } catch {
    if (newlySavedImagePath) await removeFilesBestEffort([newlySavedImagePath], adapter)
    throw new Error('无法保存识别记录，请重试')
  }
  await removeFilesBestEffort(mutation.removedImagePaths, adapter)
  const savedRecord = mutation.records.find((item) => item.id === (existing?.id ?? `IR-${now}`))
  if (!savedRecord) throw new Error('无法读取已保存的识别记录')
  return savedRecord
}

export async function deleteInspectionHistory(
  id: string,
  adapter: HistoryStorageAdapter = createDefaultAdapter(),
): Promise<StoredInspectionRecord[]> {
  const mutation = removeHistoryRecord(loadInspectionHistory(adapter), id)
  try {
    adapter.setStorage(HISTORY_STORAGE_KEY, mutation.records)
  } catch {
    throw new Error('无法删除识别记录，请重试')
  }
  await removeFilesBestEffort(mutation.removedImagePaths, adapter)
  return mutation.records
}
