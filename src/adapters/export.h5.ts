import type { InspectionJsonExportAdapter } from '@legacy/services/export-service'

const pendingFiles = new Map<string, string>()

export const inspectionExportAdapter: InspectionJsonExportAdapter = {
  userDataPath: 'h5-downloads',
  writeFile: async (filePath, data) => {
    pendingFiles.set(filePath, data)
  },
  shareFile: async (filePath, fileName) => {
    const data = pendingFiles.get(filePath)
    if (data === undefined) throw new Error('无法读取待下载的 JSON 文件')
    const url = URL.createObjectURL(new Blob([data], { type: 'application/json;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = fileName
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000)
    pendingFiles.delete(filePath)
  },
  wait: (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
}
