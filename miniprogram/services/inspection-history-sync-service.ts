import { DEMO_MODE } from '../config/server'
import { StoredInspectionRecord } from '../domain/inspection-history'
import { saveHistorySyncState } from './history-service'
import {
  createStandaloneInspection,
  getInspectionTask,
  inspectionImageToDataUrl,
  listInspectionTasks,
  saveInspectionDraft,
  syncStoredInspection,
} from './quality-inspection-service'

export function syncInspectionHistoryRecord(
  record: StoredInspectionRecord,
): Promise<StoredInspectionRecord> {
  return syncStoredInspection(record, {
    listTasks: listInspectionTasks,
    createStandalone: createStandaloneInspection,
    saveDraft: saveInspectionDraft,
    imageToDataUrl: inspectionImageToDataUrl,
    loadExistingImages: async (taskId, itemId) => {
      const task = await getInspectionTask(taskId)
      const item = task.items?.find((candidate) => candidate.id === itemId)
      return (item?.inspection_draft?.ai_workbench_images || [])
        .filter((image) => typeof image === 'string')
        .slice(0, 1)
    },
    updateState: async (nextRecord) => (
      saveHistorySyncState(nextRecord) || nextRecord
    ),
    onUnauthorized: () => {
      if (!DEMO_MODE) wx.reLaunch({ url: '/pages/login/login' })
    },
  })
}
