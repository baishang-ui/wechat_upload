import {
  HISTORY_STORAGE_KEY,
  HistoryRecordInput,
  parseHistory,
  removeHistoryRecord,
  StoredInspectionRecord,
  upsertHistory,
} from '../domain/inspection-history'

export interface HistoryStorageAdapter {
  getStorage(): unknown
  setStorage(records: StoredInspectionRecord[]): void
  saveFile(temporaryPath: string): Promise<string>
  removeFile(filePath: string): Promise<void>
}

function createDefaultAdapter(): HistoryStorageAdapter {
  const fileSystem = wx.getFileSystemManager()
  return {
    getStorage: () => wx.getStorageSync(HISTORY_STORAGE_KEY),
    setStorage: (records) => wx.setStorageSync(HISTORY_STORAGE_KEY, records),
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
    return parseHistory(adapter.getStorage())
  } catch {
    return []
  }
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

  if (!existing) {
    savedImagePath = await adapter.saveFile(input.imagePath)
    newlySavedImagePath = savedImagePath
  }

  const mutation = upsertHistory(records, {
    ...input,
    imagePath: savedImagePath,
  }, now, existing?.id)

  try {
    adapter.setStorage(mutation.records)
  } catch {
    if (newlySavedImagePath) {
      await removeFilesBestEffort([newlySavedImagePath], adapter)
    }
    throw new Error('无法保存识别记录，请重试')
  }

  await removeFilesBestEffort(mutation.removedImagePaths, adapter)
  const savedRecord = mutation.records.find((item) => item.id === (existing?.id ?? `IR-${now}`))
  if (!savedRecord) {
    throw new Error('无法读取已保存的识别记录')
  }
  return savedRecord
}

export async function deleteInspectionHistory(
  id: string,
  adapter: HistoryStorageAdapter = createDefaultAdapter(),
): Promise<StoredInspectionRecord[]> {
  const mutation = removeHistoryRecord(loadInspectionHistory(adapter), id)
  try {
    adapter.setStorage(mutation.records)
  } catch {
    throw new Error('无法删除识别记录，请重试')
  }
  await removeFilesBestEffort(mutation.removedImagePaths, adapter)
  return mutation.records
}
