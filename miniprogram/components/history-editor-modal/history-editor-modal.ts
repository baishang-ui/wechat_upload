import {
  createMockRecord,
  InspectionRecord,
  InspectionRow,
  InspectionRowField,
  PRODUCT_OPTIONS,
  updateMeasurement,
  updateRecordField,
  updateRowField,
  updateSampleJudgement,
  validateRecord,
} from '../../domain/inspection-record'
import { InspectionSourceType, StoredInspectionRecord } from '../../domain/inspection-history'
import { exportInspectionJson } from '../../services/export-service'
import {
  loadInspectionHistory,
  saveInspectionHistory,
} from '../../services/history-service'
import { syncInspectionHistoryRecord } from '../../services/inspection-history-sync-service'
import {
  getInspectionTask,
  taskItemToInspectionRecord,
} from '../../services/quality-inspection-service'
import { showTopToast } from '../../services/top-toast-service'

interface InputValueEvent {
  detail: { value: string }
}

interface HistoryEditorCloseDetail {
  id: string
  taskId: number
  itemId: number
}

interface HistoryEditorRowItem {
  rowIndex: number
  row: InspectionRow
}

const EDITABLE_RECORD_FIELDS = [
  'customer',
  'supplier',
  'trademark',
  'orderNumber',
  'model',
  'arrivalQuantity',
  'inspectionDate',
  'notes',
  'reviewer',
  'inspector',
] as const

type EditableRecordField = typeof EDITABLE_RECORD_FIELDS[number]
type HistoryOrigin = 'local' | 'remote'
type HistoryEditKind = '' | 'record' | 'row' | 'measurement'

const productLabels = PRODUCT_OPTIONS.map((option) => option.label)
const HISTORY_EDITOR_CLOSE_DELAY_MS = 300
const attachedHistoryEditorModals = new WeakSet<object>()
const historyEditorCloseTimers = new WeakMap<object, ReturnType<typeof setTimeout>>()
const historyEditorDraftValues = new WeakMap<object, string>()
const historyEditorRawContents = new WeakMap<object, string>()
const historyEditorRows = new WeakMap<object, InspectionRow[]>()
const historyEditorLoadVersions = new WeakMap<object, number>()

function withoutInspectionRows(record: InspectionRecord): InspectionRecord {
  return { ...record, rows: [] }
}

function withInspectionRows(record: InspectionRecord, rows: InspectionRow[]): InspectionRecord {
  return { ...record, rows }
}

function buildHistoryEditorRowItems(rows: InspectionRow[]): HistoryEditorRowItem[] {
  return rows.map((row, rowIndex) => ({ rowIndex, row }))
}

function isEditableRecordField(value: string): value is EditableRecordField {
  return (EDITABLE_RECORD_FIELDS as readonly string[]).includes(value)
}

function isInspectionRowField(value: string): value is InspectionRowField {
  return value === 'item' || value === 'requirement' || value === 'specification'
}

function sourceTypeFrom(value: string): InspectionSourceType {
  return value === 'purchase_order' ? 'purchase_order' : 'standalone'
}

function normalizeSharedEditorValue(value: string, multiline: boolean): string {
  return multiline ? value : value.replace(/[\r\n]+/g, ' ')
}

function clearHistoryEditorCloseTimer(component: object): void {
  const timer = historyEditorCloseTimers.get(component)
  if (timer) clearTimeout(timer)
  historyEditorCloseTimers.delete(component)
}

function scheduleHistoryEditorClose(component: object, callback: () => void): void {
  clearHistoryEditorCloseTimer(component)
  const timer = setTimeout(() => {
    historyEditorCloseTimers.delete(component)
    callback()
  }, HISTORY_EDITOR_CLOSE_DELAY_MS)
  historyEditorCloseTimers.set(component, timer)
}

function nextHistoryEditorLoadVersion(component: object): number {
  const version = (historyEditorLoadVersions.get(component) || 0) + 1
  historyEditorLoadVersions.set(component, version)
  return version
}

Component({
  properties: {
    visible: { type: Boolean, value: false },
    origin: { type: String, value: 'local' },
    recordId: { type: String, value: '' },
    sourceType: { type: String, value: 'standalone' },
    taskId: { type: Number, value: 0 },
    itemId: { type: Number, value: 0 },
  },

  data: {
    drawerMounted: false,
    loading: true,
    loadError: '',
    closing: false,
    saving: false,
    exporting: false,
    localId: '',
    displayId: '',
    resolvedSourceType: 'standalone' as InspectionSourceType,
    imagePath: '',
    productLabels,
    productIndex: 0,
    record: withoutInspectionRows(createMockRecord()),
    rowItems: [] as HistoryEditorRowItem[],
    expandedRowIndex: -1,
    activeEditKind: '' as HistoryEditKind,
    activeEditField: '',
    activeEditLabel: '',
    activeEditValue: '',
    activeEditRowIndex: -1,
    activeEditMeasurementIndex: -1,
    activeEditMultiline: false,
    activeEditorVisible: false,
    activeEditorFocused: false,
  },

  lifetimes: {
    attached() {
      attachedHistoryEditorModals.add(this)
      if (this.data.visible) this.openDrawer()
    },
    detached() {
      attachedHistoryEditorModals.delete(this)
      clearHistoryEditorCloseTimer(this)
      nextHistoryEditorLoadVersion(this)
      historyEditorDraftValues.delete(this)
      historyEditorRawContents.delete(this)
      historyEditorRows.delete(this)
      historyEditorLoadVersions.delete(this)
      if (this.data.activeEditorFocused) wx.hideKeyboard()
    },
  },

  observers: {
    'visible, origin, recordId, sourceType, taskId, itemId'(visible: boolean) {
      if (!attachedHistoryEditorModals.has(this)) return
      if (visible) {
        this.openDrawer()
        return
      }
      if (this.data.drawerMounted && !this.data.closing) {
        this.releaseDrawerContent(false)
      }
    },
  },

  methods: {
    noop() {},

    openDrawer() {
      if (
        !attachedHistoryEditorModals.has(this)
        || !this.data.visible
        || this.data.drawerMounted
        || this.data.closing
      ) return
      clearHistoryEditorCloseTimer(this)
      historyEditorDraftValues.delete(this)
      historyEditorRawContents.delete(this)
      historyEditorRows.delete(this)
      this.setData({
        drawerMounted: true,
        loading: true,
        loadError: '',
        closing: false,
        saving: false,
        exporting: false,
        localId: '',
        displayId: '',
        resolvedSourceType: 'standalone',
        imagePath: '',
        productIndex: 0,
        record: withoutInspectionRows(createMockRecord()),
        rowItems: [],
        expandedRowIndex: -1,
        activeEditKind: '',
        activeEditField: '',
        activeEditLabel: '',
        activeEditValue: '',
        activeEditRowIndex: -1,
        activeEditMeasurementIndex: -1,
        activeEditMultiline: false,
        activeEditorVisible: false,
        activeEditorFocused: false,
      }, () => void this.loadRecord())
    },

    async loadRecord() {
      if (
        !attachedHistoryEditorModals.has(this)
        || !this.data.visible
        || !this.data.drawerMounted
        || this.data.closing
      ) return
      const loadVersion = nextHistoryEditorLoadVersion(this)
      const requestedOrigin: HistoryOrigin = this.data.origin === 'remote' ? 'remote' : 'local'
      const requestedId = this.data.recordId
      const requestedTaskId = this.data.taskId
      const requestedItemId = this.data.itemId
      this.setData({ loading: true, loadError: '' })
      try {
        if (requestedOrigin === 'local') {
          const stored = loadInspectionHistory().find((item) => item.id === requestedId)
          if (!stored) throw new Error('本地质检记录不存在或已被删除')
          if (historyEditorLoadVersions.get(this) !== loadVersion) return
          this.applyLoadedRecord(
            stored.record,
            stored.rawContent,
            stored.imagePath,
            stored.id,
            stored.id,
            stored.sourceType,
            loadVersion,
          )
          return
        }

        if (!requestedTaskId || !requestedItemId) throw new Error('服务器记录缺少任务或物料编号')
        const task = await getInspectionTask(requestedTaskId)
        if (
          !attachedHistoryEditorModals.has(this)
          || !this.data.visible
          || !this.data.drawerMounted
          || this.data.closing
          || historyEditorLoadVersions.get(this) !== loadVersion
          || requestedOrigin !== (this.data.origin === 'remote' ? 'remote' : 'local')
          || requestedId !== this.data.recordId
          || requestedTaskId !== this.data.taskId
          || requestedItemId !== this.data.itemId
        ) return
        const item = task.items?.find((candidate) => candidate.id === requestedItemId)
        if (!item) throw new Error('服务器记录明细不存在')
        const cached = loadInspectionHistory().find((stored) => (
          stored.taskId === requestedTaskId && stored.itemId === requestedItemId
        ))
        this.applyLoadedRecord(
          taskItemToInspectionRecord(task, item),
          cached?.rawContent || '',
          cached?.imagePath || '',
          cached?.id || '',
          task.task_no || `云端记录 ${requestedTaskId}/${requestedItemId}`,
          task.source_type === 'purchase_order'
            ? 'purchase_order'
            : sourceTypeFrom(this.data.sourceType),
          loadVersion,
        )
      } catch (error) {
        if (
          !attachedHistoryEditorModals.has(this)
          || !this.data.drawerMounted
          || this.data.closing
          || historyEditorLoadVersions.get(this) !== loadVersion
        ) return
        this.setData({
          loading: false,
          loadError: error instanceof Error && error.message
            ? error.message
            : '质检记录加载失败',
        })
      }
    },

    applyLoadedRecord(
      record: InspectionRecord,
      rawContent: string,
      imagePath: string,
      localId: string,
      displayId: string,
      sourceType: InspectionSourceType,
      loadVersion: number,
    ) {
      if (
        !attachedHistoryEditorModals.has(this)
        || !this.data.drawerMounted
        || this.data.closing
        || historyEditorLoadVersions.get(this) !== loadVersion
      ) return
      const productIndex = PRODUCT_OPTIONS.findIndex(
        (option) => option.value === record.productType,
      )
      historyEditorRawContents.set(this, rawContent)
      historyEditorRows.set(this, record.rows)
      this.setData({
        loading: false,
        loadError: '',
        localId,
        displayId,
        resolvedSourceType: sourceType,
        imagePath,
        productIndex: Math.max(productIndex, 0),
        record: withoutInspectionRows(record),
        rowItems: buildHistoryEditorRowItems(record.rows),
        expandedRowIndex: -1,
        activeEditKind: '',
        activeEditField: '',
        activeEditLabel: '',
        activeEditValue: '',
        activeEditRowIndex: -1,
        activeEditMeasurementIndex: -1,
        activeEditMultiline: false,
        activeEditorVisible: false,
        activeEditorFocused: false,
      })
    },

    retryLoad() {
      if (this.data.loading || this.data.closing) return
      void this.loadRecord()
    },

    requestClose() {
      if (this.data.saving || this.data.closing) return
      this.finishClose()
    },

    finishClose() {
      if (this.data.closing) return
      historyEditorDraftValues.delete(this)
      this.setData({
        closing: true,
        expandedRowIndex: -1,
        activeEditKind: '',
        activeEditField: '',
        activeEditLabel: '',
        activeEditValue: '',
        activeEditRowIndex: -1,
        activeEditMeasurementIndex: -1,
        activeEditMultiline: false,
        activeEditorVisible: false,
        activeEditorFocused: false,
      }, () => wx.hideKeyboard())
      scheduleHistoryEditorClose(this, () => {
        if (!attachedHistoryEditorModals.has(this)) return
        const detail: HistoryEditorCloseDetail = {
          id: this.data.recordId,
          taskId: this.data.taskId,
          itemId: this.data.itemId,
        }
        this.releaseDrawerContent(true, detail)
      })
    },

    releaseDrawerContent(
      notifyParent: boolean,
      closeDetail?: HistoryEditorCloseDetail,
    ) {
      nextHistoryEditorLoadVersion(this)
      historyEditorDraftValues.delete(this)
      historyEditorRawContents.delete(this)
      historyEditorRows.delete(this)
      const detail = closeDetail || {
        id: this.data.recordId,
        taskId: this.data.taskId,
        itemId: this.data.itemId,
      }
      this.setData({
        drawerMounted: false,
        loading: false,
        loadError: '',
        closing: false,
        saving: false,
        exporting: false,
        localId: '',
        displayId: '',
        resolvedSourceType: 'standalone',
        imagePath: '',
        productIndex: 0,
        record: withoutInspectionRows(createMockRecord()),
        rowItems: [],
        expandedRowIndex: -1,
        activeEditKind: '',
        activeEditField: '',
        activeEditLabel: '',
        activeEditValue: '',
        activeEditRowIndex: -1,
        activeEditMeasurementIndex: -1,
        activeEditMultiline: false,
        activeEditorVisible: false,
        activeEditorFocused: false,
      }, () => {
        if (notifyParent && attachedHistoryEditorModals.has(this)) {
          this.triggerEvent('close', detail)
        }
      })
    },

    previewImage() {
      if (!this.data.imagePath) return
      wx.previewImage({
        current: this.data.imagePath,
        urls: [this.data.imagePath],
        fail: () => showTopToast({ title: '本地图片已失效', icon: 'none' }),
      })
    },

    selectProductType(event: WechatMiniprogram.TouchEvent) {
      if (this.data.closing) return
      const productIndex = Number(event.currentTarget.dataset.productIndex)
      const selected = PRODUCT_OPTIONS[productIndex]
      if (!selected) return
      this.runAfterEditorCommit(() => {
        this.setData({
          productIndex,
          record: updateRecordField(this.data.record, 'productType', selected.value),
        })
      })
    },

    beginRecordEdit(event: WechatMiniprogram.TouchEvent) {
      if (this.data.closing || this.data.loading) return
      const field = String(event.currentTarget.dataset.field || '')
      if (!isEditableRecordField(field)) return
      this.activateSharedEditor(
        'record',
        field,
        -1,
        -1,
        String(event.currentTarget.dataset.label || ''),
        this.data.record[field],
        field === 'notes',
      )
    },

    beginRowFieldEdit(event: WechatMiniprogram.TouchEvent) {
      if (this.data.closing || this.data.loading) return
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const field = String(event.currentTarget.dataset.field || '')
      if (!Number.isInteger(rowIndex) || !isInspectionRowField(field)) return
      const row = (historyEditorRows.get(this) || [])[rowIndex]
      if (!row) return
      this.activateSharedEditor(
        'row',
        field,
        rowIndex,
        -1,
        String(event.currentTarget.dataset.label || ''),
        row[field],
        false,
      )
    },

    beginMeasurementEdit(event: WechatMiniprogram.TouchEvent) {
      if (this.data.closing || this.data.loading) return
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const measurementIndex = Number(event.currentTarget.dataset.measurementIndex)
      if (!Number.isInteger(rowIndex) || !Number.isInteger(measurementIndex)) return
      const measurement = (historyEditorRows.get(this) || [])[rowIndex]
        ?.measurements[measurementIndex]
      if (measurement === undefined) return
      this.activateSharedEditor(
        'measurement',
        '',
        rowIndex,
        measurementIndex,
        `样本 ${measurementIndex + 1}`,
        measurement,
        false,
      )
    },

    activateSharedEditor(
      kind: Exclude<HistoryEditKind, ''>,
      field: string,
      rowIndex: number,
      measurementIndex: number,
      label: string,
      value: string,
      multiline: boolean,
    ) {
      const activate = () => {
        if (!attachedHistoryEditorModals.has(this) || this.data.closing) return
        historyEditorDraftValues.set(this, value)
        this.setData({
          activeEditKind: kind,
          activeEditField: field,
          activeEditLabel: label,
          activeEditValue: value,
          activeEditRowIndex: rowIndex,
          activeEditMeasurementIndex: measurementIndex,
          activeEditMultiline: multiline,
          activeEditorVisible: true,
          activeEditorFocused: true,
        })
      }
      if (this.data.activeEditKind) {
        this.commitActiveEditor(activate, true)
        return
      }
      activate()
    },

    onSharedEditorInput(event: InputValueEvent) {
      if (this.data.closing || !this.data.activeEditKind) return
      historyEditorDraftValues.set(this, event.detail.value)
    },

    onSharedEditorBlur() {
      if (this.data.closing || !this.data.activeEditKind) return
      this.commitActiveEditor()
    },

    confirmSharedEditor() {
      if (this.data.closing || !this.data.activeEditKind) return
      this.commitActiveEditor(() => wx.hideKeyboard())
    },

    commitActiveEditor(callback?: () => void, preserveEditor = false) {
      const kind = this.data.activeEditKind
      if (!kind) {
        if (callback) callback()
        return
      }

      const value = normalizeSharedEditorValue(
        historyEditorDraftValues.get(this) ?? this.data.activeEditValue,
        this.data.activeEditMultiline,
      )
      const patch: Record<string, unknown> = preserveEditor
        ? {}
        : {
            activeEditKind: '',
            activeEditField: '',
            activeEditLabel: '',
            activeEditValue: '',
            activeEditRowIndex: -1,
            activeEditMeasurementIndex: -1,
            activeEditMultiline: false,
            activeEditorVisible: false,
            activeEditorFocused: false,
          }

      if (kind === 'record' && isEditableRecordField(this.data.activeEditField)) {
        patch[`record.${this.data.activeEditField}`] = value
      } else if (kind === 'row' && isInspectionRowField(this.data.activeEditField)) {
        const rowIndex = this.data.activeEditRowIndex
        const rows = historyEditorRows.get(this) || []
        if (rows[rowIndex]) {
          const updatedRows = updateRowField(
            withInspectionRows(this.data.record, rows),
            rowIndex,
            this.data.activeEditField,
            value,
          ).rows
          const rowItemIndex = this.data.rowItems.findIndex(
            (item) => item.rowIndex === rowIndex,
          )
          historyEditorRows.set(this, updatedRows)
          if (rowItemIndex >= 0) {
            patch[`rowItems[${rowItemIndex}].row.${this.data.activeEditField}`] = value
          }
        }
      } else if (kind === 'measurement') {
        const rowIndex = this.data.activeEditRowIndex
        const measurementIndex = this.data.activeEditMeasurementIndex
        const rows = historyEditorRows.get(this) || []
        if (rows[rowIndex]?.measurements[measurementIndex] !== undefined) {
          const updatedRows = updateMeasurement(
            withInspectionRows(this.data.record, rows),
            rowIndex,
            measurementIndex,
            value,
          ).rows
          const rowItemIndex = this.data.rowItems.findIndex(
            (item) => item.rowIndex === rowIndex,
          )
          historyEditorRows.set(this, updatedRows)
          if (rowItemIndex >= 0) {
            patch[
              `rowItems[${rowItemIndex}].row.measurements[${measurementIndex}]`
            ] = value
          }
        }
      }

      historyEditorDraftValues.delete(this)
      this.setData(patch, callback)
    },

    runAfterEditorCommit(callback: () => void) {
      if (this.data.activeEditKind) {
        this.commitActiveEditor(callback)
        return
      }
      callback()
    },

    toggleRowExpanded(event: WechatMiniprogram.TouchEvent) {
      if (this.data.closing) return
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      if (!Number.isInteger(rowIndex) || !(historyEditorRows.get(this) || [])[rowIndex]) return
      this.runAfterEditorCommit(() => {
        this.setData({
          expandedRowIndex: this.data.expandedRowIndex === rowIndex ? -1 : rowIndex,
        })
      })
    },

    toggleJudgement(event: WechatMiniprogram.TouchEvent) {
      if (this.data.closing) return
      const sampleIndex = Number(event.currentTarget.dataset.sampleIndex)
      const current = this.data.record.sampleJudgements[sampleIndex]
      if (current === undefined) return
      this.runAfterEditorCommit(() => {
        this.setData({
          record: updateSampleJudgement(
            this.data.record,
            sampleIndex,
            current === 'OK' ? 'NG' : 'OK',
          ),
        })
      })
    },

    exportRecord() {
      if (this.data.exporting || this.data.saving || this.data.closing) return
      this.runAfterEditorCommit(() => this.performExportRecord())
    },

    performExportRecord() {
      if (this.data.exporting || this.data.saving || this.data.closing) return
      const record = withInspectionRows(
        this.data.record,
        historyEditorRows.get(this) || [],
      )
      this.setData({ exporting: true })
      exportInspectionJson({
        recordId: this.data.localId || this.data.displayId,
        record,
      })
        .then(() => {
          if (
            attachedHistoryEditorModals.has(this)
            && this.data.drawerMounted
            && !this.data.closing
          ) {
            showTopToast({ title: 'JSON已生成', icon: 'none' })
          }
        })
        .catch((error: Error) => {
          if (
            !attachedHistoryEditorModals.has(this)
            || !this.data.drawerMounted
            || this.data.closing
          ) return
          showTopToast({
            message: error.message || '导出失败，请重试',
            type: 'error',
            duration: 3600,
          })
        })
        .finally(() => {
          if (attachedHistoryEditorModals.has(this)) this.setData({ exporting: false })
        })
    },

    saveRecord() {
      if (this.data.saving || this.data.closing) return
      this.runAfterEditorCommit(() => this.performSaveRecord())
    },

    performSaveRecord() {
      if (this.data.saving || this.data.closing) return
      const record = withInspectionRows(
        this.data.record,
        historyEditorRows.get(this) || [],
      )
      const missing = validateRecord(record)
      if (missing.length > 0) {
        showTopToast({ title: `请完善${missing[0]}`, icon: 'none' })
        return
      }
      this.setData({ saving: true })
      saveInspectionHistory({
        imagePath: this.data.imagePath,
        rawContent: historyEditorRawContents.get(this) || '',
        record,
        sourceType: this.data.resolvedSourceType,
        taskId: this.data.taskId || null,
        itemId: this.data.itemId || null,
      }, this.data.localId)
        .then((stored) => syncInspectionHistoryRecord(stored))
        .then((result: StoredInspectionRecord) => {
          if (!attachedHistoryEditorModals.has(this) || this.data.closing) return
          this.setData({ saving: false })
          this.triggerEvent('saved', { record: result })
          this.finishClose()
        })
        .catch((error: Error) => {
          if (!attachedHistoryEditorModals.has(this) || this.data.closing) return
          this.setData({ saving: false })
          showTopToast({
            message: error.message || '更新失败，请重试',
            type: 'error',
            duration: 3600,
          })
        })
    },
  },
})
