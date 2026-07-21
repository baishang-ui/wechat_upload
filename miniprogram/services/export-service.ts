import {
  buildInspectionTableExport,
  serializeInspectionTableExport,
} from '../domain/inspection-export'
import { InspectionRecord } from '../domain/inspection-record'

export interface InspectionJsonExportAdapter {
  userDataPath: string
  writeFile(filePath: string, data: string): Promise<void>
  shareFile?(filePath: string, fileName: string): Promise<void>
  wait(milliseconds: number): Promise<void>
}

export interface InspectionJsonExportInput {
  recordId?: string
  record: InspectionRecord
}

export interface InspectionJsonExportResult {
  fileName: string
  filePath: string
  delivery: 'shared'
}

interface ShareFileMessageOptions {
  filePath: string
  fileName: string
  success: () => void
  fail: () => void
}

interface FileShareApi {
  shareFileMessage?: (options: ShareFileMessageOptions) => void
}

function createDefaultAdapter(): InspectionJsonExportAdapter {
  const fileSystem = wx.getFileSystemManager()
  const shareApi = wx as unknown as FileShareApi
  return {
    userDataPath: wx.env.USER_DATA_PATH,
    writeFile: (filePath, data) => new Promise((resolve, reject) => {
      fileSystem.writeFile({
        filePath,
        data,
        encoding: 'utf8',
        success: () => resolve(),
        fail: () => reject(new Error('无法生成 JSON 文件')),
      })
    }),
    shareFile: typeof shareApi.shareFileMessage === 'function'
      ? (filePath, fileName) => new Promise((resolve, reject) => {
        shareApi.shareFileMessage?.({
          filePath,
          fileName,
          success: () => resolve(),
          fail: () => reject(new Error('无法分享 JSON 文件')),
        })
      })
      : undefined,
    wait: (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)),
  }
}

function buildFileName(recordId: string | undefined, now: number): string {
  const identifier = recordId?.trim()
    ? recordId.trim().replace(/[^a-zA-Z0-9_-]/g, '-')
    : String(now)
  return `inspection-${identifier}.json`
}

export async function exportInspectionJson(
  input: InspectionJsonExportInput,
  adapter: InspectionJsonExportAdapter = createDefaultAdapter(),
  now = Date.now(),
): Promise<InspectionJsonExportResult> {
  const fileName = buildFileName(input.recordId, now)
  const basePath = adapter.userDataPath.replace(/\/$/, '')
  const filePath = `${basePath}/${fileName}`
  const exported = buildInspectionTableExport(input.record, {
    recordId: input.recordId,
    exportedAt: new Date(now).toISOString(),
  })
  const json = serializeInspectionTableExport(exported)

  await adapter.writeFile(filePath, json)
  if (!adapter.shareFile) {
    throw new Error('当前微信版本不支持文件分享，请升级后重试')
  }

  try {
    await adapter.shareFile(filePath, fileName)
  } catch {
    await adapter.wait(150)
    await adapter.shareFile(filePath, fileName)
  }
  return { fileName, filePath, delivery: 'shared' }
}
