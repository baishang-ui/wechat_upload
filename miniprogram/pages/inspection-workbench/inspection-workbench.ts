import { showTopToast } from '../../services/top-toast-service'
import {
  addLocalPhotos,
  buildInspectionWorkbench,
  InspectionPhoto,
  InspectionTemplateColumnDto,
  InspectionWorkbench,
  InspectionWorkbenchRow,
  mergeRecognitionRecord,
  removeWorkbenchPhoto,
  UnmatchedRecognitionRow,
  updateWorkbenchMeasurement,
  updateWorkbenchPhoto,
  updateWorkbenchRowField,
  workbenchToDraft,
} from '../../domain/inspection-workbench'
import { buildOnlineInspectionTemplate } from '../../domain/online-inspection-template'
import { prepareImageForUpload, recognizeInspection } from '../../services/inspection-service'
import {
  getInspectionItemDetail,
  uploadInspectionDraftImage,
  QualityInspectionItemDto,
  QualityInspectionTaskDto,
  saveInspectionDraft,
  uploadInspectionRowImage,
} from '../../services/quality-inspection-service'

interface NavigationHeightChangeEvent {
  detail: { height: number }
}

interface InputEvent {
  detail: { value: string }
  currentTarget: {
    dataset: Record<string, string | number | undefined>
  }
}

interface SwitchEvent {
  detail: { value: boolean }
  currentTarget: {
    dataset: Record<string, string | number | undefined>
  }
}

interface RowActionEvent {
  currentTarget: {
    dataset: Record<string, string | number | undefined>
  }
}

type RenderColumnKind =
  | 'project'
  | 'method'
  | 'standard'
  | 'measurement'
  | 'decision'
  | 'note'
  | 'photos'
  | 'extra'

interface RenderColumn {
  key: string
  title: string
  kind: RenderColumnKind
  width: number
  measurementIndex: number
}

interface RenderCell extends RenderColumn {
  value: string
}

interface WorkbenchRenderRow extends InspectionWorkbenchRow {
  cells: RenderCell[]
}

interface WorkbenchGroup {
  title: string
  rows: WorkbenchRenderRow[]
}

interface RouteOptions {
  taskId?: string
  itemId?: string
}

const FALLBACK_COLUMNS: InspectionTemplateColumnDto[] = [
  { key: 'project', title: '检验项目', display_order: 0, visible: true },
  { key: 'method', title: '检验方法', display_order: 1, visible: true },
  { key: 'standard', title: '检验标准', display_order: 2, visible: true },
  ...Array.from({ length: 10 }, (_, index) => ({
    key: `sample_${index + 1}`,
    title: String(index + 1),
    display_order: index + 3,
    visible: true,
  })),
  { key: 'decision', title: '判定', display_order: 13, visible: true },
  { key: 'note', title: '备注', display_order: 14, visible: true },
  { key: 'images', title: '照片', display_order: 15, visible: true },
]

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function normalizedColumnKey(value: string): string {
  return value.trim().toLowerCase().replace(/[\s-]+/g, '_')
}

function renderColumnKind(column: InspectionTemplateColumnDto): {
  kind: RenderColumnKind
  measurementIndex: number
} {
  const key = normalizedColumnKey(column.key)
  const title = column.title.trim()
  if (['project', 'item', 'inspection_project'].includes(key)) {
    return { kind: 'project', measurementIndex: -1 }
  }
  if (['method', 'inspection_method'].includes(key)) {
    return { kind: 'method', measurementIndex: -1 }
  }
  if (['standard', 'requirement', 'inspection_standard'].includes(key)) {
    return { kind: 'standard', measurementIndex: -1 }
  }
  if (['decision', 'judgement', 'result'].includes(key)) {
    return { kind: 'decision', measurementIndex: -1 }
  }
  if (['note', 'notes', 'remark', 'remarks'].includes(key)) {
    return { kind: 'note', measurementIndex: -1 }
  }
  if (['image', 'images', 'photo', 'photos'].includes(key)) {
    return { kind: 'photos', measurementIndex: -1 }
  }
  const sampleMatch = key.match(/(?:sample|measurement|measure|data|value)_?(\d+)$/)
    || title.match(/^(?:样品|样本|实测值?|测量值?)?\s*(\d+)$/)
  if (sampleMatch) {
    const measurementIndex = Number(sampleMatch[1]) - 1
    if (measurementIndex >= 0 && measurementIndex < 10) {
      return { kind: 'measurement', measurementIndex }
    }
  }
  return { kind: 'extra', measurementIndex: -1 }
}

function defaultColumnWidth(kind: RenderColumnKind): number {
  if (kind === 'project') return 260
  if (kind === 'method') return 220
  if (kind === 'standard') return 300
  if (kind === 'measurement') return 116
  if (kind === 'decision') return 150
  if (kind === 'note') return 260
  if (kind === 'photos') return 360
  return 220
}

function buildRenderColumns(columns: InspectionTemplateColumnDto[]): RenderColumn[] {
  const source = columns.length > 0 ? columns : FALLBACK_COLUMNS
  return source.map((column) => {
    const resolved = renderColumnKind(column)
    const onlineWidth = Number(column.width)
    const width = Number.isFinite(onlineWidth) && onlineWidth > 0
      ? Math.min(640, Math.max(100, Math.round(onlineWidth * 2)))
      : defaultColumnWidth(resolved.kind)
    return {
      key: column.key,
      title: column.title,
      kind: resolved.kind,
      width,
      measurementIndex: resolved.measurementIndex,
    }
  })
}

function renderCellValue(row: InspectionWorkbenchRow, column: RenderColumn): string {
  if (column.kind === 'project') return row.project
  if (column.kind === 'method') return row.method
  if (column.kind === 'standard') return row.standard
  if (column.kind === 'measurement') return row.measurements[column.measurementIndex] || ''
  if (column.kind === 'decision') return row.decision
  if (column.kind === 'note') return row.note
  if (column.kind === 'extra') {
    return row.measurementStandards[column.key]
      || row.measurementStandards[column.title]
      || ''
  }
  return ''
}

function groupRows(
  rows: InspectionWorkbenchRow[],
  renderColumns: RenderColumn[],
): WorkbenchGroup[] {
  const groups: WorkbenchGroup[] = []
  rows.forEach((row) => {
    const title = row.groupTitle || '其他检验'
    const renderRow: WorkbenchRenderRow = {
      ...row,
      cells: renderColumns.map((column) => ({
        ...column,
        value: renderCellValue(row, column),
      })),
    }
    const current = groups[groups.length - 1]
    if (!current || current.title !== title) {
      groups.push({ title, rows: [renderRow] })
    } else {
      current.rows.push(renderRow)
    }
  })
  return groups
}

function photoSource(photo: InspectionPhoto): string {
  return photo.localPath || photo.remoteUrl
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

Page({
  data: {
    navigationBarHeight: 91,
    taskId: 0,
    itemId: 0,
    task: null as QualityInspectionTaskDto | null,
    item: null as QualityInspectionItemDto | null,
    workbench: null as InspectionWorkbench | null,
    groups: [] as WorkbenchGroup[],
    renderColumns: [] as RenderColumn[],
    renderTableWidth: 0,
    loading: true,
    loadError: '',
    recognizing: false,
    recognitionError: '',
    rawContent: '',
    reportImages: [] as string[],
    reportPreviewPaths: [] as string[],
    inspectionImages: [] as string[],
    unmatched: [] as UnmatchedRecognitionRow[],
    saving: false,
    savedMessage: '',
  },

  onLoad(options: RouteOptions) {
    const taskId = Number(options.taskId)
    const itemId = Number(options.itemId)
    this.setData({ taskId, itemId })
    if (!taskId || !itemId) {
      this.setData({ loading: false, loadError: '缺少待检任务或产品信息' })
      return
    }
    void this.loadWorkbench()
  },

  onNavigationHeightChange(event: NavigationHeightChangeEvent) {
    this.setData({ navigationBarHeight: event.detail.height })
  },

  async loadWorkbench() {
    if (!this.data.taskId || !this.data.itemId) return
    const requestedTaskId = this.data.taskId
    const requestedItemId = this.data.itemId
    this.setData({ loading: true, loadError: '', savedMessage: '' })
    try {
      const detail = await getInspectionItemDetail(requestedTaskId, requestedItemId)
      if (
        requestedTaskId !== this.data.taskId
        || requestedItemId !== this.data.itemId
      ) return
      const task = detail.task
      const item = detail.item
      if (!task || !item) throw new Error('线上任务中未找到该产品')
      const template = buildOnlineInspectionTemplate(detail)
      const workbench = buildInspectionWorkbench({
        template,
        draft: item.inspection_draft,
      })
      const renderColumns = buildRenderColumns(workbench.columns)
      const result = item.inspection_draft?.ai_workbench_result || {}
      const unmatched = Array.isArray(result.unmatched_recognition_rows)
        ? result.unmatched_recognition_rows as UnmatchedRecognitionRow[]
        : []
      const reportImages = (item.inspection_draft?.record_source_images || [])
        .filter((image) => typeof image === 'string')
      const inspectionImages = (item.inspection_draft?.ai_workbench_images || [])
        .filter((image) => typeof image === 'string')
      this.setData({
        task,
        item,
        workbench,
        renderColumns,
        renderTableWidth: renderColumns.reduce((total, column) => total + column.width, 0),
        groups: groupRows(workbench.rows, renderColumns),
        unmatched,
        reportImages,
        reportPreviewPaths: reportImages,
        inspectionImages,
        rawContent: text(result.recognition_raw_content),
        loading: false,
      })
    } catch (error) {
      if (
        requestedTaskId === this.data.taskId
        && requestedItemId === this.data.itemId
      ) {
        this.setData({
          loading: false,
          loadError: errorMessage(error, '产品检验表加载失败'),
        })
      }
    }
  },

  setRows(rows: InspectionWorkbenchRow[]) {
    const workbench = this.data.workbench
    if (!workbench) return
    const next = { ...workbench, rows }
    this.setData({
      workbench: next,
      groups: groupRows(next.rows, this.data.renderColumns),
      savedMessage: '',
    })
  },

  onMeasurementInput(event: InputEvent) {
    const rowKey = text(event.currentTarget.dataset.rowKey)
    const measurementIndex = Number(event.currentTarget.dataset.measurementIndex)
    if (!this.data.workbench || !rowKey) return
    this.setRows(updateWorkbenchMeasurement(
      this.data.workbench.rows,
      rowKey,
      measurementIndex,
      event.detail.value,
    ))
  },

  onDecisionChange(event: SwitchEvent) {
    const rowKey = text(event.currentTarget.dataset.rowKey)
    if (!this.data.workbench || !rowKey) return
    const decision = event.detail.value ? 'OK' : 'NG'
    this.setRows(updateWorkbenchRowField(
      this.data.workbench.rows,
      rowKey,
      'decision',
      decision,
    ))
  },

  onRowFieldInput(event: InputEvent) {
    const rowKey = text(event.currentTarget.dataset.rowKey)
    const field = text(event.currentTarget.dataset.field)
    if (!this.data.workbench || !rowKey || field !== 'note') return
    this.setRows(updateWorkbenchRowField(
      this.data.workbench.rows,
      rowKey,
      field,
      event.detail.value,
    ))
  },

  addRowPhotos(event: RowActionEvent) {
    const rowKey = text(event.currentTarget.dataset.rowKey)
    if (!rowKey) return
    wx.chooseMedia({
      count: 9,
      mediaType: ['image'],
      sourceType: ['camera', 'album'],
      sizeType: ['original'],
      success: ({ tempFiles }) => {
        const localPaths = tempFiles.map((file) => file.tempFilePath).filter(Boolean)
        void this.appendAndUploadPhotos(rowKey, localPaths)
      },
      fail: (error) => {
        if (!error.errMsg?.includes('cancel')) {
          showTopToast({ title: '选择照片失败，请重试', icon: 'none' })
        }
      },
    })
  },

  async appendAndUploadPhotos(rowKey: string, localPaths: string[]) {
    const workbench = this.data.workbench
    if (!workbench || localPaths.length === 0) return
    const previousCount = workbench.rows.find((row) => row.rowKey === rowKey)?.images.length || 0
    let rows = addLocalPhotos(workbench.rows, rowKey, localPaths)
    const additions = rows.find((row) => row.rowKey === rowKey)?.images.slice(previousCount) || []
    this.setRows(rows)

    for (const photo of additions) {
      rows = updateWorkbenchPhoto(rows, rowKey, photo.id, {
        status: 'uploading',
        error: '',
      })
      this.setRows(rows)
      try {
        const uploaded = await uploadInspectionRowImage(
          this.data.taskId,
          this.data.itemId,
          rowKey,
          photo.localPath,
        )
        rows = updateWorkbenchPhoto(rows, rowKey, photo.id, {
          status: 'uploaded',
          remoteUrl: uploaded.url,
          error: '',
        })
      } catch (error) {
        rows = updateWorkbenchPhoto(rows, rowKey, photo.id, {
          status: 'failed',
          error: errorMessage(error, '上传失败'),
        })
      }
      this.setRows(rows)
    }
  },

  previewPhoto(event: RowActionEvent) {
    const rowKey = text(event.currentTarget.dataset.rowKey)
    const photoId = text(event.currentTarget.dataset.photoId)
    const row = this.data.workbench?.rows.find((candidate) => candidate.rowKey === rowKey)
    const current = row?.images.find((photo) => photo.id === photoId)
    if (!row || !current) return
    const urls = row.images.map(photoSource).filter(Boolean)
    wx.previewImage({ current: photoSource(current), urls })
  },

  removePhoto(event: RowActionEvent) {
    const rowKey = text(event.currentTarget.dataset.rowKey)
    const photoId = text(event.currentTarget.dataset.photoId)
    if (!this.data.workbench || !rowKey || !photoId) return
    this.setRows(removeWorkbenchPhoto(this.data.workbench.rows, rowKey, photoId))
  },

  retryPhoto(event: RowActionEvent) {
    const rowKey = text(event.currentTarget.dataset.rowKey)
    const photoId = text(event.currentTarget.dataset.photoId)
    const photo = this.data.workbench?.rows
      .find((row) => row.rowKey === rowKey)?.images
      .find((candidate) => candidate.id === photoId)
    if (!photo?.localPath) return
    void this.retryPhotoUpload(rowKey, photo)
  },

  async retryPhotoUpload(rowKey: string, photo: InspectionPhoto) {
    const workbench = this.data.workbench
    if (!workbench) return
    let rows = updateWorkbenchPhoto(workbench.rows, rowKey, photo.id, {
      status: 'uploading',
      error: '',
    })
    this.setRows(rows)
    try {
      const uploaded = await uploadInspectionRowImage(
        this.data.taskId,
        this.data.itemId,
        rowKey,
        photo.localPath,
      )
      rows = updateWorkbenchPhoto(rows, rowKey, photo.id, {
        status: 'uploaded',
        remoteUrl: uploaded.url,
        error: '',
      })
    } catch (error) {
      rows = updateWorkbenchPhoto(rows, rowKey, photo.id, {
        status: 'failed',
        error: errorMessage(error, '上传失败'),
      })
    }
    this.setRows(rows)
  },

  takeQualitySheetPhoto() {
    if (this.data.recognizing) return
    wx.navigateTo({
      url: '/pages/document-camera/document-camera',
      events: {
        documentPhotoConfirmed: ({ tempFilePath }: { tempFilePath?: string }) => {
          if (tempFilePath) void this.recognizeQualitySheet(tempFilePath)
        },
      },
      fail: () => {
        showTopToast({ title: '无法打开相机，请稍后重试', icon: 'none' })
      },
    })
  },

  chooseQualitySheetPhoto() {
    if (this.data.recognizing) return
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album'],
      sizeType: ['original'],
      success: ({ tempFiles }) => {
        const imagePath = tempFiles[0]?.tempFilePath
        if (imagePath) void this.recognizeQualitySheet(imagePath)
      },
      fail: (error) => {
        if (!error.errMsg?.includes('cancel')) {
          showTopToast({ title: '选择质检单失败，请重试', icon: 'none' })
        }
      },
    })
  },

  async recognizeQualitySheet(imagePath: string) {
    const workbench = this.data.workbench
    if (!workbench || this.data.recognizing) return
    this.setData({ recognizing: true, recognitionError: '', savedMessage: '' })
    try {
      const preparedPath = await prepareImageForUpload(imagePath)
      const result = await recognizeInspection(preparedPath)
      const merged = mergeRecognitionRecord(this.data.workbench?.rows || workbench.rows, result.record)
      let reportImages = this.data.reportImages
      try {
        const uploadedReport = await uploadInspectionDraftImage(
          this.data.taskId,
          this.data.itemId,
          preparedPath,
        )
        reportImages = [...reportImages, uploadedReport.url]
      } catch {
        showTopToast({ title: '识别完成，质检单图片未写入草稿', icon: 'none' })
      }
      const rawContent = [this.data.rawContent, result.rawContent]
        .filter(Boolean)
        .join('\n\n---\n\n')
      const unmatched = [...this.data.unmatched, ...merged.unmatched]
      const next = { ...workbench, rows: merged.rows }
      this.setData({
        workbench: next,
        groups: groupRows(next.rows, this.data.renderColumns),
        unmatched,
        rawContent,
        reportImages,
        reportPreviewPaths: [...this.data.reportPreviewPaths, preparedPath],
      })
      showTopToast({
        title: merged.unmatched.length > 0 ? '识别完成，请核对未匹配条目' : '识别结果已回填',
        icon: 'none',
      })
    } catch (error) {
      this.setData({ recognitionError: errorMessage(error, '质检单识别失败') })
    } finally {
      this.setData({ recognizing: false })
    }
  },

  previewReportImage(event: RowActionEvent) {
    const index = Number(event.currentTarget.dataset.index)
    const current = this.data.reportPreviewPaths[index]
    if (!current) return
    wx.previewImage({ current, urls: this.data.reportPreviewPaths })
  },

  clearUnmatched() {
    this.setData({ unmatched: [], savedMessage: '' })
  },

  async saveDraft() {
    const { workbench, task, item } = this.data
    if (!workbench || !task || !item || this.data.saving) return
    const pendingPhotos = workbench.rows.flatMap((row) => row.images)
      .filter((photo) => photo.status !== 'uploaded')
    if (pendingPhotos.length > 0) {
      showTopToast({ title: '请先重试或删除未完成上传的照片', icon: 'none' })
      return
    }
    this.setData({ saving: true, savedMessage: '' })
    try {
      const payload = workbenchToDraft(workbench, {
        metadata: {
          customer: text(task.customer_name),
          supplier: text(task.supplier_name),
          orderNumber: text(task.contract_no),
          model: text(item.spec_desc || item.material_name),
          arrivalQuantity: item.quantity === null || item.quantity === undefined
            ? ''
            : String(item.quantity),
          inspectionDate: text(task.signed_date),
        },
        rawContent: this.data.rawContent,
        unmatched: this.data.unmatched,
        qualitySheetImages: this.data.reportImages,
        inspectionImages: this.data.inspectionImages,
      })
      await saveInspectionDraft(this.data.taskId, this.data.itemId, payload)
      this.setData({ savedMessage: '草稿已保存' })
      showTopToast({ title: '草稿已保存', icon: 'success' })
    } catch (error) {
      showTopToast({
        message: errorMessage(error, '草稿保存失败，请重试'),
        type: 'error',
        duration: 3600,
      })
    } finally {
      this.setData({ saving: false })
    }
  },
})
