import {
  addLocalPhotos,
  buildInspectionWorkbench,
  InspectionPhoto,
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
import {
  buildInspectionWorkbenchPages,
  findInspectionWorkbenchPageForRow,
  InspectionWorkbenchPage,
} from '../../domain/inspection-workbench-pagination'
import { buildOnlineInspectionTemplate } from '../../domain/online-inspection-template'
import { prepareImageForUpload, recognizeInspection } from '../../services/inspection-service'
import {
  getInspectionItemDetail,
  inspectionImageToDataUrl,
  QualityInspectionItemDto,
  QualityInspectionTaskDto,
  saveInspectionDraft,
  uploadInspectionRowImage,
} from '../../services/quality-inspection-service'

interface InputEvent {
  detail: { value: string }
  currentTarget: { dataset: Record<string, string | number | undefined> }
}

interface RowActionEvent {
  currentTarget: { dataset: Record<string, string | number | undefined> }
}

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function photoSource(photo: InspectionPhoto): string {
  return photo.localPath || photo.remoteUrl
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

Component({
  properties: {
    visible: { type: Boolean, value: false },
    taskId: { type: Number, value: 0 },
    itemId: { type: Number, value: 0 },
  },

  data: {
    task: null as QualityInspectionTaskDto | null,
    item: null as QualityInspectionItemDto | null,
    workbench: null as InspectionWorkbench | null,
    loading: false,
    loadError: '',
    recognizing: false,
    recognitionError: '',
    rawContent: '',
    reportImages: [] as string[],
    reportPreviewPaths: [] as string[],
    unmatched: [] as UnmatchedRecognitionRow[],
    pages: [] as InspectionWorkbenchPage[],
    currentPage: null as InspectionWorkbenchPage | null,
    activePage: 0,
    pageNumber: 1,
    pageTotal: 0,
    expandedRowKey: '',
    dirty: false,
    saving: false,
    savedMessage: '',
    closing: false,
  },

  lifetimes: {
    attached() {
      // `wx:if` mounts this drawer only after the parent has supplied its IDs.
      // Rechecking here makes the opening path resilient to a component hot reload.
      if (this.data.visible && this.data.taskId && this.data.itemId) {
        void this.loadWorkbench()
      }
    },
  },

  observers: {
    'visible, taskId, itemId'(visible: boolean, taskId: number, itemId: number) {
      if (!visible) {
        this.resetWorkbench()
        return
      }
      if (!taskId || !itemId) {
        this.setData({ loading: false, loadError: '缺少待检任务或产品信息' })
        return
      }
      void this.loadWorkbench()
    },
  },

  methods: {
    noop() {},

    resetWorkbench() {
      this.setData({
        task: null,
        item: null,
        workbench: null,
        loading: false,
        loadError: '',
        recognizing: false,
        recognitionError: '',
        rawContent: '',
        reportImages: [],
        reportPreviewPaths: [],
        unmatched: [],
        pages: [],
        currentPage: null,
        activePage: 0,
        pageNumber: 1,
        pageTotal: 0,
        expandedRowKey: '',
        dirty: false,
        saving: false,
        savedMessage: '',
      })
    },

    async loadWorkbench() {
      if (!this.data.visible || !this.data.taskId || !this.data.itemId || this.data.loading) return
      this.setData({ loading: true, loadError: '', savedMessage: '', recognitionError: '' })
      try {
        const detail = await getInspectionItemDetail(this.data.taskId, this.data.itemId)
        const task = detail.task
        const item = detail.item
        if (!task || !item) throw new Error('线上任务中未找到该产品')
        const workbench = buildInspectionWorkbench({
          template: item.inspection_template || buildOnlineInspectionTemplate(detail),
          draft: item.inspection_draft,
        })
        const result = item.inspection_draft?.ai_workbench_result || {}
        const unmatched = Array.isArray(result.unmatched_recognition_rows)
          ? result.unmatched_recognition_rows as UnmatchedRecognitionRow[]
          : []
        const pages = buildInspectionWorkbenchPages(workbench.rows, unmatched)
        this.setData({
          task,
          item,
          workbench,
          unmatched,
          pages,
          currentPage: pages[0] || null,
          activePage: 0,
          pageNumber: pages.length ? 1 : 0,
          pageTotal: pages.length,
          expandedRowKey: '',
          reportImages: (item.inspection_draft?.ai_workbench_images || []).filter((image) => typeof image === 'string'),
          rawContent: text(result.recognition_raw_content),
          dirty: false,
          loading: false,
        })
      } catch (error) {
        this.setData({ loading: false, loadError: errorMessage(error, '产品检验表加载失败') })
      }
    },

    setRows(rows: InspectionWorkbenchRow[]) {
      const workbench = this.data.workbench
      if (!workbench) return
      const next = { ...workbench, rows }
      const pages = buildInspectionWorkbenchPages(rows, this.data.unmatched)
      const activePage = Math.min(this.data.activePage, Math.max(0, pages.length - 1))
      this.setData({
        workbench: next,
        pages,
        currentPage: pages[activePage] || null,
        activePage,
        pageNumber: pages.length ? activePage + 1 : 0,
        pageTotal: pages.length,
        savedMessage: '',
        dirty: true,
      })
    },

    onMeasurementInput(event: InputEvent) {
      const rowKey = text(event.currentTarget.dataset.rowKey)
      const measurementIndex = Number(event.currentTarget.dataset.measurementIndex)
      if (!this.data.workbench || !rowKey || !Number.isInteger(measurementIndex)) return
      this.setRows(updateWorkbenchMeasurement(this.data.workbench.rows, rowKey, measurementIndex, event.detail.value))
    },

    onRowFieldInput(event: InputEvent) {
      const rowKey = text(event.currentTarget.dataset.rowKey)
      const field = text(event.currentTarget.dataset.field)
      if (!this.data.workbench || !rowKey || (field !== 'decision' && field !== 'note')) return
      this.setRows(updateWorkbenchRowField(this.data.workbench.rows, rowKey, field, event.detail.value))
    },

    addRowPhotos(event: RowActionEvent) {
      const rowKey = text(event.currentTarget.dataset.rowKey)
      if (!rowKey) return
      wx.chooseMedia({
        count: 9,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        sizeType: ['compressed'],
        success: ({ tempFiles }) => {
          const localPaths = tempFiles.map((file) => file.tempFilePath).filter(Boolean)
          void this.appendAndUploadPhotos(rowKey, localPaths)
        },
        fail: (error) => {
          if (!error.errMsg?.includes('cancel')) wx.showToast({ title: '选择照片失败，请重试', icon: 'none' })
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
        rows = updateWorkbenchPhoto(rows, rowKey, photo.id, { status: 'uploading', error: '' })
        this.setRows(rows)
        try {
          const uploaded = await uploadInspectionRowImage(this.data.taskId, this.data.itemId, rowKey, photo.localPath)
          rows = updateWorkbenchPhoto(rows, rowKey, photo.id, { status: 'uploaded', remoteUrl: uploaded.url, error: '' })
        } catch (error) {
          rows = updateWorkbenchPhoto(rows, rowKey, photo.id, { status: 'failed', error: errorMessage(error, '上传失败') })
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
      wx.previewImage({ current: photoSource(current), urls: row.images.map(photoSource).filter(Boolean) })
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
      const photo = this.data.workbench?.rows.find((row) => row.rowKey === rowKey)?.images
        .find((candidate) => candidate.id === photoId)
      if (photo?.localPath) void this.retryPhotoUpload(rowKey, photo)
    },

    async retryPhotoUpload(rowKey: string, photo: InspectionPhoto) {
      const workbench = this.data.workbench
      if (!workbench) return
      let rows = updateWorkbenchPhoto(workbench.rows, rowKey, photo.id, { status: 'uploading', error: '' })
      this.setRows(rows)
      try {
        const uploaded = await uploadInspectionRowImage(this.data.taskId, this.data.itemId, rowKey, photo.localPath)
        rows = updateWorkbenchPhoto(rows, rowKey, photo.id, { status: 'uploaded', remoteUrl: uploaded.url, error: '' })
      } catch (error) {
        rows = updateWorkbenchPhoto(rows, rowKey, photo.id, { status: 'failed', error: errorMessage(error, '上传失败') })
      }
      this.setRows(rows)
    },

    takeQualitySheetPhoto() {
      if (this.data.recognizing) return
      wx.navigateTo({
        url: '/pages/document-camera/document-camera',
        events: { documentPhotoConfirmed: ({ tempFilePath }: { tempFilePath?: string }) => {
          if (tempFilePath) void this.recognizeQualitySheet(tempFilePath)
        } },
        fail: () => wx.showToast({ title: '无法打开相机，请稍后重试', icon: 'none' }),
      })
    },

    chooseQualitySheetPhoto() {
      if (this.data.recognizing) return
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType: ['album'],
        sizeType: ['compressed'],
        success: ({ tempFiles }) => {
          const imagePath = tempFiles[0]?.tempFilePath
          if (imagePath) void this.recognizeQualitySheet(imagePath)
        },
        fail: (error) => {
          if (!error.errMsg?.includes('cancel')) wx.showToast({ title: '选择质检单失败，请重试', icon: 'none' })
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
          reportImages = [...reportImages, await inspectionImageToDataUrl(preparedPath)]
        } catch {
          wx.showToast({ title: '识别完成，质检单图片未写入草稿', icon: 'none' })
        }
        const unmatched = [...this.data.unmatched, ...merged.unmatched]
        const next = { ...workbench, rows: merged.rows }
        this.setData({
          workbench: next,
          unmatched,
          rawContent: [this.data.rawContent, result.rawContent].filter(Boolean).join('\n\n---\n\n'),
          reportImages,
          reportPreviewPaths: [...this.data.reportPreviewPaths, preparedPath],
          dirty: true,
        })
        this.syncCurrentPageAfterRecognition(next.rows, unmatched)
        wx.showToast({ title: merged.unmatched.length ? '识别完成，请核对未匹配条目' : '识别结果已回填', icon: 'none' })
      } catch (error) {
        this.setData({ recognitionError: errorMessage(error, '质检单识别失败') })
      } finally {
        this.setData({ recognizing: false })
      }
    },

    previewReportImage(event: RowActionEvent) {
      const index = Number(event.currentTarget.dataset.index)
      const current = this.data.reportPreviewPaths[index]
      if (current) wx.previewImage({ current, urls: this.data.reportPreviewPaths })
    },

    clearUnmatched() {
      const pages = buildInspectionWorkbenchPages(this.data.workbench?.rows || [], [])
      const activePage = Math.min(this.data.activePage, Math.max(0, pages.length - 1))
      this.setData({
        unmatched: [],
        pages,
        activePage,
        currentPage: pages[activePage] || null,
        pageNumber: pages.length ? activePage + 1 : 0,
        pageTotal: pages.length,
        savedMessage: '',
        dirty: true,
      })
    },

    toggleRowExpanded(event: RowActionEvent) {
      const rowKey = text(event.currentTarget.dataset.rowKey)
      if (rowKey) this.setData({ expandedRowKey: this.data.expandedRowKey === rowKey ? '' : rowKey })
    },

    goPreviousPage() {
      if (this.data.loading || this.data.activePage <= 0) return
      this.goToPage(this.data.activePage - 1)
    },

    goNextPage() {
      if (this.data.loading || this.data.activePage >= this.data.pageTotal - 1) return
      this.goToPage(this.data.activePage + 1)
    },

    goToPage(index: number) {
      const pages = this.data.pages
      const activePage = Math.max(0, Math.min(index, pages.length - 1))
      const currentPage = pages[activePage]
      if (!currentPage) return
      this.setData({ activePage, currentPage, pageNumber: activePage + 1, pageTotal: pages.length, expandedRowKey: '' })
    },

    syncCurrentPageAfterRecognition(rows: InspectionWorkbenchRow[], unmatched: UnmatchedRecognitionRow[]) {
      const pages = buildInspectionWorkbenchPages(rows, unmatched)
      const matchedRow = rows.find((row) => row.measurements.some((value) => value.trim()))
      const matchedIndex = matchedRow ? findInspectionWorkbenchPageForRow(pages, matchedRow.rowKey) : -1
      const activePage = matchedIndex >= 0 ? matchedIndex : Math.min(this.data.activePage, Math.max(0, pages.length - 1))
      this.setData({
        pages,
        activePage,
        currentPage: pages[activePage] || null,
        pageNumber: pages.length ? activePage + 1 : 0,
        pageTotal: pages.length,
        expandedRowKey: matchedRow?.rowKey || '',
      })
    },

    requestClose() {
      if (this.data.saving || this.data.closing) return
      if (!this.data.dirty) {
        this.finishClose()
        return
      }
      this.showUnsavedCloseDialog()
    },

    showUnsavedCloseDialog() {
      wx.showActionSheet({
        itemList: ['继续编辑', '保存草稿', '暂不保存'],
        success: ({ tapIndex }) => {
          if (tapIndex === 1) { void this.saveDraft(true); return }
          if (tapIndex === 2) this.finishClose()
        },
      })
    },

    finishClose() {
      if (this.data.closing) return
      // Keep the drawer mounted until its record-style slide-down animation finishes.
      this.setData({ closing: true })
      setTimeout(() => {
        this.triggerEvent('close', { taskId: this.data.taskId, itemId: this.data.itemId, saved: !this.data.dirty })
      }, 300)
    },

    async saveDraft(closeAfterSave = false) {
      const shouldClose = closeAfterSave === true
      const { workbench, task, item } = this.data
      if (!workbench || !task || !item || this.data.saving || this.data.loading || this.data.recognizing) return
      const pendingPhotos = workbench.rows.flatMap((row) => row.images).filter((photo) => photo.status !== 'uploaded')
      if (pendingPhotos.length) {
        wx.showToast({ title: '请先重试或删除未完成上传的照片', icon: 'none' })
        return
      }
      this.setData({ saving: true, savedMessage: '' })
      try {
        await saveInspectionDraft(this.data.taskId, this.data.itemId, workbenchToDraft(workbench, {
          metadata: {
            customer: text(task.customer_name),
            supplier: text(task.supplier_name),
            orderNumber: text(task.contract_no || task.task_no),
            model: text(item.spec_desc || item.material_name),
            arrivalQuantity: item.quantity === null || item.quantity === undefined ? '' : String(item.quantity),
            inspectionDate: text(task.signed_date),
          },
          rawContent: this.data.rawContent,
          unmatched: this.data.unmatched,
          reportImages: this.data.reportImages,
        }))
        this.setData({ savedMessage: '草稿已保存', dirty: false })
        wx.showToast({ title: '草稿已保存', icon: 'success' })
        this.triggerEvent('saved', { taskId: this.data.taskId, itemId: this.data.itemId })
        if (shouldClose) this.finishClose()
      } catch (error) {
        wx.showModal({ title: '保存失败', content: errorMessage(error, '草稿保存失败，请重试'), showCancel: false })
      } finally {
        this.setData({ saving: false })
      }
    },
  },
})
