import Taro from '@tarojs/taro'

import type { StoredInspectionRecord } from '@legacy/domain/inspection-history'
import type { InspectionRecord } from '@legacy/domain/inspection-record'
import { exportInspectionJson } from '@legacy/services/export-service'
import {
  saveHistorySyncState,
  saveInspectionHistory,
} from '@legacy/services/history-service'
import {
  createStandaloneInspection,
  getInspectionTask,
  listInspectionTasks,
  saveInspectionDraft,
  syncStoredInspection,
} from '@legacy/services/quality-inspection-service'
import { ServerClientError } from '@legacy/services/server-client'

import { inspectionExportAdapter } from '@/adapters/export'
import { historyAdapter } from '@/adapters/history'
import { request } from '@/adapters/server'

export interface SaveRecognizedInspectionInput {
  imagePath: string
  rawContent: string
  record: InspectionRecord
  sourceType: 'standalone' | 'purchase_order'
  taskId: number | null
  itemId: number | null
}

async function unusedImageToDataUrl(): Promise<string> {
  return ''
}

export async function saveRecognizedInspection(
  input: SaveRecognizedInspectionInput,
  existingId = '',
): Promise<StoredInspectionRecord> {
  const stored = await saveInspectionHistory({
    imagePath: input.imagePath,
    rawContent: input.rawContent,
    record: input.record,
    sourceType: input.sourceType,
    taskId: input.taskId,
    itemId: input.itemId,
  }, existingId, historyAdapter)

  return syncStoredInspection(stored, {
    listTasks: (query) => listInspectionTasks(query, request),
    createStandalone: (clientRecordId, record) => (
      createStandaloneInspection(clientRecordId, record, request)
    ),
    saveDraft: (taskId, itemId, payload) => (
      saveInspectionDraft(taskId, itemId, payload, request)
    ),
    loadExistingImages: async (taskId, itemId) => {
      const task = await getInspectionTask(taskId, false, request)
      const item = task.items?.find((candidate) => candidate.id === itemId)
      return (item?.inspection_draft?.ai_workbench_images || [])
        .filter((image): image is string => typeof image === 'string')
        .slice(0, 1)
    },
    imageToDataUrl: unusedImageToDataUrl,
    updateState: (record) => saveHistorySyncState(record, historyAdapter) || record,
    onUnauthorized: (error) => {
      if (!(error instanceof ServerClientError) || error.statusCode !== 401) return
      void Taro.reLaunch({ url: '/pages/login/index' })
    },
  })
}

export async function exportRecognizedInspection(
  record: InspectionRecord,
  recordId?: string,
): Promise<void> {
  await exportInspectionJson({ record, recordId }, inspectionExportAdapter)
}
