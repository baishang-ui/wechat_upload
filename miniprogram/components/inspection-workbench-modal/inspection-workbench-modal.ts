import { showTopToast } from '../../services/top-toast-service'
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
  buildInspectionWorkbenchFinalState,
  findInspectionWorkbenchPageForRow,
  InspectionWorkbenchFinalState,
  InspectionWorkbenchPage,
} from '../../domain/inspection-workbench-pagination'
import { buildOnlineInspectionTemplate } from '../../domain/online-inspection-template'
import { normalizeInspectionDate } from '../../domain/inspection-record'
import {
  buildInspectionImageClassificationState,
  mergeInspectionImageAssignmentsIntoRows,
  removeInspectionImageReferences,
} from '../../domain/inspection-image-classification'
import { prepareImageForUpload, recognizeInspection } from '../../services/inspection-service'
import {
  getInspectionItemDetail,
  inspectionImageThumbnailUrl,
  QualityInspectionCustomerProductDto,
  uploadInspectionDraftImage,
  QualityInspectionItemDto,
  QualityInspectionMasterProductDto,
  QualityInspectionTaskDto,
  saveInspectionDraft,
  uploadInspectionWorkbenchImage,
  uploadInspectionRowImage,
} from '../../services/quality-inspection-service'

interface InputEvent {
  detail: { value: string }
  currentTarget: { dataset: Record<string, string | number | undefined> }
}

interface SwitchEvent {
  detail: { value: boolean }
  currentTarget: { dataset: Record<string, string | number | undefined> }
}

interface RowActionEvent {
  currentTarget: { dataset: Record<string, string | number | undefined> }
}

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value)
}

function photoOriginalSource(photo: InspectionPhoto): string {
  return photo.remoteUrl || photo.localPath
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback
}

function currentLocalDate(): string {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function resolvedInspectionDate(...values: unknown[]): string {
  for (const value of values) {
    const candidate = text(value)
    const normalized = normalizeInspectionDate(candidate.slice(0, 10))
    if (normalized) return normalized
  }
  return ''
}

function quantityDisplay(item: QualityInspectionItemDto): string {
  const quantity = item.quantity === null || item.quantity === undefined
    ? '0'
    : String(item.quantity)
  return `${quantity} ${text(item.unit)}`.trim()
}

function inspectionRecognitionRequest(imageCount: number): Record<string, unknown> {
  const changedAt = new Date().toISOString()
  return {
    visual_recognition_request: imageCount > 0
      ? {
          status: 'pending',
          source: 'miniprogram',
          requested_at: changedAt,
          image_count: imageCount,
        }
      : {
          status: 'cleared',
          source: 'miniprogram',
          cleared_at: changedAt,
          image_count: 0,
        },
  }
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
    masterProduct: null as QualityInspectionMasterProductDto | null,
    customerProduct: null as QualityInspectionCustomerProductDto | null,
    workbench: null as InspectionWorkbench | null,
    aiWorkbenchResult: {} as Record<string, unknown>,
    finalState: buildInspectionWorkbenchFinalState([], {}) as InspectionWorkbenchFinalState,
    inspectionDate: '',
    quantityDisplay: '',
    templateDisplayName: '',
    loading: false,
    loadError: '',
    recognizing: false,
    recognitionError: '',
    photoUploading: false,
    photoDeletingIndex: -1,
    photoUploadError: '',
    rawContent: '',
    reportImages: [] as string[],
    reportPreviewPaths: [] as string[],
    reportPreviewOriginalPaths: [] as string[],
    inspectionImages: [] as string[],
    inspectionClassifiedCount: 0,
    inspectionClassificationPending: false,
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
        masterProduct: null,
        customerProduct: null,
        workbench: null,
        aiWorkbenchResult: {},
        finalState: buildInspectionWorkbenchFinalState([], {}),
        inspectionDate: '',
        quantityDisplay: '',
        templateDisplayName: '',
        loading: false,
        loadError: '',
        recognizing: false,
        recognitionError: '',
        photoUploading: false,
        photoDeletingIndex: -1,
        photoUploadError: '',
        rawContent: '',
        reportImages: [],
        reportPreviewPaths: [],
        reportPreviewOriginalPaths: [],
        inspectionImages: [],
        inspectionClassifiedCount: 0,
        inspectionClassificationPending: false,
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
      if (
        !this.data.taskId
        || !this.data.itemId
        || this.data.loading
        || !this.isActiveWorkbenchRequest(this.data.taskId, this.data.itemId)
      ) return
      const requestedTaskId = this.data.taskId
      const requestedItemId = this.data.itemId
      this.setData({ loading: true, loadError: '', savedMessage: '', recognitionError: '' })
      try {
        const detail = await getInspectionItemDetail(requestedTaskId, requestedItemId)
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) {
          if (this.data.visible && !this.data.closing && this.data.taskId && this.data.itemId) {
            this.setData({ loading: false })
            void this.loadWorkbench()
          }
          return
        }
        const task = detail.task
        const item = detail.item
        if (!task || !item) throw new Error('线上任务中未找到该产品')
        const template = buildOnlineInspectionTemplate(detail)
        const baseWorkbench = buildInspectionWorkbench({
          template,
          draft: item.inspection_draft,
          thumbnailUrl: inspectionImageThumbnailUrl,
        })
        const aiWorkbenchResult = item.inspection_draft?.ai_workbench_result || {}
        const unmatched = Array.isArray(aiWorkbenchResult.unmatched_recognition_rows)
          ? aiWorkbenchResult.unmatched_recognition_rows as UnmatchedRecognitionRow[]
          : []
        const inspectionDate = resolvedInspectionDate(
          aiWorkbenchResult.inspection_date,
          task.signed_date,
        ) || currentLocalDate()
        const reportImages = (item.inspection_draft?.record_source_images || [])
          .filter((image) => typeof image === 'string')
        const inspectionImages = (item.inspection_draft?.ai_workbench_images || [])
          .filter((image) => typeof image === 'string')
        const workbench = {
          ...baseWorkbench,
          rows: mergeInspectionImageAssignmentsIntoRows(
            baseWorkbench.rows,
            aiWorkbenchResult,
            inspectionImages,
            inspectionImageThumbnailUrl,
          ),
        }
        const pages = buildInspectionWorkbenchPages(workbench.rows, unmatched)
        const imageClassification = buildInspectionImageClassificationState(
          aiWorkbenchResult,
          inspectionImages,
        )
        this.setData({
          task,
          item,
          masterProduct: detail.master_product || null,
          customerProduct: detail.customer_product || null,
          workbench,
          aiWorkbenchResult,
          finalState: buildInspectionWorkbenchFinalState(workbench.rows, aiWorkbenchResult),
          inspectionDate,
          quantityDisplay: quantityDisplay(item),
          templateDisplayName: text(template.title || template.template_name || template.template_id) || '未配置',
          unmatched,
          pages,
          currentPage: pages[0] || null,
          activePage: 0,
          pageNumber: pages.length ? 1 : 0,
          pageTotal: pages.length,
          expandedRowKey: '',
          reportImages,
          reportPreviewPaths: reportImages.map(inspectionImageThumbnailUrl),
          reportPreviewOriginalPaths: reportImages,
          inspectionImages,
          inspectionClassifiedCount: imageClassification.assignedCount,
          inspectionClassificationPending: imageClassification.pending,
          rawContent: text(aiWorkbenchResult.recognition_raw_content),
          dirty: false,
          loading: false,
        })
      } catch (error) {
        if (this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) {
          this.setData({ loading: false, loadError: errorMessage(error, '产品检验表加载失败') })
        }
      }
    },

    setRows(rows: InspectionWorkbenchRow[]) {
      const workbench = this.data.workbench
      if (!workbench || !this.data.visible || this.data.closing) return
      const next = { ...workbench, rows }
      const pages = buildInspectionWorkbenchPages(rows, this.data.unmatched)
      const activePage = Math.min(this.data.activePage, Math.max(0, pages.length - 1))
      this.setData({
        workbench: next,
        finalState: buildInspectionWorkbenchFinalState(rows, this.data.aiWorkbenchResult),
        pages,
        currentPage: pages[activePage] || null,
        activePage,
        pageNumber: pages.length ? activePage + 1 : 0,
        pageTotal: pages.length,
        savedMessage: '',
        dirty: true,
      })
    },

    isActiveWorkbenchRequest(taskId: number, itemId: number): boolean {
      return this.data.visible
        && !this.data.closing
        && taskId === this.data.taskId
        && itemId === this.data.itemId
    },

    onMeasurementInput(event: InputEvent) {
      const rowKey = text(event.currentTarget.dataset.rowKey)
      const measurementIndex = Number(event.currentTarget.dataset.measurementIndex)
      if (!this.data.workbench || !rowKey || !Number.isInteger(measurementIndex)) return
      this.setRows(updateWorkbenchMeasurement(this.data.workbench.rows, rowKey, measurementIndex, event.detail.value))
    },

    onDecisionChange(event: SwitchEvent) {
      const rowKey = text(event.currentTarget.dataset.rowKey)
      if (!this.data.workbench || !rowKey) return
      const decision = event.detail.value ? 'OK' : 'NG'
      this.setRows(updateWorkbenchRowField(this.data.workbench.rows, rowKey, 'decision', decision))
    },

    onRowFieldInput(event: InputEvent) {
      const rowKey = text(event.currentTarget.dataset.rowKey)
      const field = text(event.currentTarget.dataset.field)
      if (!this.data.workbench || !rowKey || field !== 'note') return
      this.setRows(updateWorkbenchRowField(this.data.workbench.rows, rowKey, field, event.detail.value))
    },

    addRowPhotos(event: RowActionEvent) {
      const rowKey = text(event.currentTarget.dataset.rowKey)
      if (
        !rowKey
        || this.data.photoUploading
        || !this.isActiveWorkbenchRequest(this.data.taskId, this.data.itemId)
      ) return
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
          if (!error.errMsg?.includes('cancel')) showTopToast({ title: '选择照片失败，请重试', icon: 'none' })
        },
      })
    },

    async syncUploadedRowPhotos(
      requestedTaskId: number,
      requestedItemId: number,
      rows: InspectionWorkbenchRow[],
    ): Promise<boolean> {
      const { workbench, task, item } = this.data
      if (
        !workbench
        || !task
        || !item
        || !this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)
      ) return false
      const nextWorkbench = { ...workbench, rows }
      try {
        await saveInspectionDraft(requestedTaskId, requestedItemId, workbenchToDraft(nextWorkbench, {
          metadata: {
            customer: text(task.customer_name),
            supplier: text(task.supplier_name),
            orderNumber: text(task.contract_no),
            model: text(item.spec_desc || item.material_name),
            arrivalQuantity: item.quantity === null || item.quantity === undefined ? '' : String(item.quantity),
            inspectionDate: this.data.inspectionDate,
          },
          rawContent: this.data.rawContent,
          unmatched: this.data.unmatched,
          qualitySheetImages: this.data.reportImages,
          inspectionImages: this.data.inspectionImages,
          aiResult: this.data.aiWorkbenchResult,
        }))
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return false
        const hasPendingPhotos = rows.some((row) => (
          row.images.some((photo) => photo.status !== 'uploaded')
        ))
        this.setData({
          savedMessage: '照片已上传并同步',
          dirty: hasPendingPhotos,
        })
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return false
        this.triggerEvent('saved', { taskId: requestedTaskId, itemId: requestedItemId })
        return true
      } catch (error) {
        if (this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) {
          this.setData({
            photoUploadError: errorMessage(error, '照片已上传，但同步后端失败，请重试'),
            dirty: true,
          })
        }
        return false
      }
    },

    async appendAndUploadPhotos(rowKey: string, localPaths: string[]) {
      const requestedTaskId = this.data.taskId
      const requestedItemId = this.data.itemId
      if (
        this.data.photoUploading
        || !this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)
      ) return
      const workbench = this.data.workbench
      if (!workbench || localPaths.length === 0) return
      this.setData({ photoUploading: true, photoUploadError: '', savedMessage: '' })
      const previousCount = workbench.rows.find((row) => row.rowKey === rowKey)?.images.length || 0
      let rows = addLocalPhotos(workbench.rows, rowKey, localPaths)
      const additions = rows.find((row) => row.rowKey === rowKey)?.images.slice(previousCount) || []
      let uploadedCount = 0
      let failedCount = 0
      this.setRows(rows)
      try {
        for (const photo of additions) {
          if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
          rows = updateWorkbenchPhoto(rows, rowKey, photo.id, { status: 'uploading', error: '' })
          this.setRows(rows)
          try {
            const preparedPath = await prepareImageForUpload(photo.localPath)
            if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
            const uploaded = await uploadInspectionRowImage(
              requestedTaskId,
              requestedItemId,
              rowKey,
              preparedPath,
              undefined,
              async (path) => path,
            )
            if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
            rows = updateWorkbenchPhoto(rows, rowKey, photo.id, {
              status: 'uploaded',
              remoteUrl: uploaded.url,
              thumbnailUrl: inspectionImageThumbnailUrl(uploaded.url),
              error: '',
            })
            uploadedCount += 1
          } catch (error) {
            if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
            rows = updateWorkbenchPhoto(rows, rowKey, photo.id, { status: 'failed', error: errorMessage(error, '上传失败') })
            failedCount += 1
          }
          this.setRows(rows)
        }
        if (uploadedCount) {
          const synced = await this.syncUploadedRowPhotos(requestedTaskId, requestedItemId, rows)
          if (synced) showTopToast({ title: '照片已同步到线上', icon: 'success' })
        }
        if (failedCount && this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) {
          this.setData({ photoUploadError: `${failedCount}张照片上传失败，请重试` })
        }
      } finally {
        if (this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) {
          this.setData({ photoUploading: false })
        }
      }
    },

    previewPhoto(event: RowActionEvent) {
      const rowKey = text(event.currentTarget.dataset.rowKey)
      const photoId = text(event.currentTarget.dataset.photoId)
      const row = this.data.workbench?.rows.find((candidate) => candidate.rowKey === rowKey)
      const current = row?.images.find((photo) => photo.id === photoId)
      if (!row || !current) return
      wx.previewImage({
        current: photoOriginalSource(current),
        urls: row.images.map(photoOriginalSource).filter(Boolean),
      })
    },

    removePhoto(event: RowActionEvent) {
      const rowKey = text(event.currentTarget.dataset.rowKey)
      const photoId = text(event.currentTarget.dataset.photoId)
      if (!this.data.workbench || !rowKey || !photoId) return
      const photo = this.data.workbench.rows
        .find((row) => row.rowKey === rowKey)?.images
        .find((candidate) => candidate.id === photoId)
      const sourceImageIndex = photo?.sourceImageIndex
      if (
        photo?.origin === 'ai_assignment'
        && typeof sourceImageIndex === 'number'
        && Number.isInteger(sourceImageIndex)
      ) {
        void this.deleteInspectionImageAt(sourceImageIndex)
        return
      }
      this.setRows(removeWorkbenchPhoto(this.data.workbench.rows, rowKey, photoId))
      if (photo?.remoteUrl) void this.saveDraft(false, [photo.remoteUrl])
    },

    retryPhoto(event: RowActionEvent) {
      const rowKey = text(event.currentTarget.dataset.rowKey)
      const photoId = text(event.currentTarget.dataset.photoId)
      const photo = this.data.workbench?.rows.find((row) => row.rowKey === rowKey)?.images
        .find((candidate) => candidate.id === photoId)
      if (photo?.localPath) void this.retryPhotoUpload(rowKey, photo)
    },

    async retryPhotoUpload(rowKey: string, photo: InspectionPhoto) {
      const requestedTaskId = this.data.taskId
      const requestedItemId = this.data.itemId
      if (
        this.data.photoUploading
        || !this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)
      ) return
      const workbench = this.data.workbench
      if (!workbench) return
      this.setData({ photoUploading: true, photoUploadError: '', savedMessage: '' })
      let rows = updateWorkbenchPhoto(workbench.rows, rowKey, photo.id, { status: 'uploading', error: '' })
      this.setRows(rows)
      try {
        const preparedPath = await prepareImageForUpload(photo.localPath)
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
        const uploaded = await uploadInspectionRowImage(
          requestedTaskId,
          requestedItemId,
          rowKey,
          preparedPath,
          undefined,
          async (path) => path,
        )
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
        rows = updateWorkbenchPhoto(rows, rowKey, photo.id, {
          status: 'uploaded',
          remoteUrl: uploaded.url,
          thumbnailUrl: inspectionImageThumbnailUrl(uploaded.url),
          error: '',
        })
        this.setRows(rows)
        const synced = await this.syncUploadedRowPhotos(requestedTaskId, requestedItemId, rows)
        if (synced) showTopToast({ title: '照片已同步到线上', icon: 'success' })
      } catch (error) {
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
        rows = updateWorkbenchPhoto(rows, rowKey, photo.id, { status: 'failed', error: errorMessage(error, '上传失败') })
        this.setRows(rows)
        this.setData({ photoUploadError: errorMessage(error, '照片上传失败，请重试') })
      } finally {
        if (this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) {
          this.setData({ photoUploading: false })
        }
      }
    },

    chooseInspectionPhotos() {
      if (
        this.data.photoUploading
        || this.data.photoDeletingIndex >= 0
        || this.data.recognizing
        || !this.isActiveWorkbenchRequest(this.data.taskId, this.data.itemId)
      ) return
      wx.chooseMedia({
        count: 6,
        mediaType: ['image'],
        sourceType: ['camera', 'album'],
        sizeType: ['original'],
        success: ({ tempFiles }) => {
          const localPaths = tempFiles.map((file) => file.tempFilePath).filter(Boolean)
          if (localPaths.length) void this.uploadInspectionPhotos(localPaths)
        },
        fail: (error) => {
          if (!error.errMsg?.includes('cancel')) showTopToast({ title: '选择现场图片失败，请重试', icon: 'none' })
        },
      })
    },

    async uploadInspectionPhotos(localPaths: string[]) {
      const requestedTaskId = this.data.taskId
      const requestedItemId = this.data.itemId
      const workbench = this.data.workbench
      if (
        !workbench
        || this.data.photoUploading
        || this.data.photoDeletingIndex >= 0
        || !this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)
      ) return
      this.setData({ photoUploading: true, photoUploadError: '', savedMessage: '' })
      let inspectionImages = [...this.data.inspectionImages]
      let uploadedCount = 0
      let failedCount = 0
      try {
        for (const localPath of localPaths) {
          try {
            const preparedPath = await prepareImageForUpload(localPath)
            if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
            const uploaded = await uploadInspectionWorkbenchImage(
              requestedTaskId,
              requestedItemId,
              preparedPath,
            )
            if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
            inspectionImages = [...inspectionImages, uploaded.url]
            uploadedCount += 1
            this.setData({ inspectionImages })
          } catch {
            if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
            failedCount += 1
          }
        }
        if (!uploadedCount) throw new Error('验货图片上传失败，请重试')

        const aiWorkbenchResult = inspectionRecognitionRequest(inspectionImages.length)
        const imageClassification = buildInspectionImageClassificationState(
          aiWorkbenchResult,
          inspectionImages,
        )
        const rows = mergeInspectionImageAssignmentsIntoRows(
          this.data.workbench?.rows || workbench.rows,
          aiWorkbenchResult,
          inspectionImages,
          inspectionImageThumbnailUrl,
        )
        this.setRows(rows)
        this.setData({
          inspectionImages,
          aiWorkbenchResult,
          inspectionClassifiedCount: imageClassification.assignedCount,
          inspectionClassificationPending: imageClassification.pending,
          finalState: buildInspectionWorkbenchFinalState(rows, aiWorkbenchResult),
          dirty: true,
        })

        await saveInspectionDraft(requestedTaskId, requestedItemId, workbenchToDraft(
          this.data.workbench || workbench,
          {
            metadata: {
              customer: text(this.data.task?.customer_name),
              supplier: text(this.data.task?.supplier_name),
              orderNumber: text(this.data.task?.contract_no),
              model: text(this.data.item?.spec_desc || this.data.item?.material_name),
              arrivalQuantity: this.data.item?.quantity === null || this.data.item?.quantity === undefined
                ? ''
                : String(this.data.item.quantity),
              inspectionDate: this.data.inspectionDate,
            },
            rawContent: this.data.rawContent,
            unmatched: this.data.unmatched,
            qualitySheetImages: this.data.reportImages,
            inspectionImages,
            aiResult: aiWorkbenchResult,
          },
        ))
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
        const savedMessage = failedCount
          ? `已同步${uploadedCount}张，${failedCount}张上传失败`
          : '已同步至线上验货图片区'
        this.setData({
          savedMessage,
          photoUploadError: failedCount ? `${failedCount}张图片上传失败，请重新选择` : '',
          dirty: false,
        })
        this.triggerEvent('saved', { taskId: requestedTaskId, itemId: requestedItemId })
        showTopToast({
          title: failedCount ? savedMessage : '图片已同步，线上工作台将自动识别',
          icon: 'none',
        })
      } catch (error) {
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
        this.setData({
          photoUploadError: errorMessage(error, '验货图片同步失败'),
          dirty: uploadedCount > 0,
        })
      } finally {
        if (this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) {
          this.setData({ photoUploading: false })
        }
      }
    },

    async deleteInspectionImageAt(index: number) {
      const requestedTaskId = this.data.taskId
      const requestedItemId = this.data.itemId
      const { workbench, task, item } = this.data
      if (
        !workbench
        || !task
        || !item
        || !Number.isInteger(index)
        || index < 0
        || index >= this.data.inspectionImages.length
        || this.data.photoUploading
        || this.data.photoDeletingIndex >= 0
        || this.data.saving
        || this.data.recognizing
        || !this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)
      ) return

      const inspectionImages = this.data.inspectionImages.filter((_, imageIndex) => imageIndex !== index)
      const aiWorkbenchResult = {
        ...removeInspectionImageReferences(this.data.aiWorkbenchResult, index),
        ...inspectionRecognitionRequest(inspectionImages.length),
      }
      const imageClassification = buildInspectionImageClassificationState(
        aiWorkbenchResult,
        inspectionImages,
      )
      const rows = mergeInspectionImageAssignmentsIntoRows(
        workbench.rows,
        aiWorkbenchResult,
        inspectionImages,
        inspectionImageThumbnailUrl,
      )
      const nextWorkbench = { ...workbench, rows }
      this.setRows(rows)
      this.setData({
        inspectionImages,
        aiWorkbenchResult,
        inspectionClassifiedCount: imageClassification.assignedCount,
        inspectionClassificationPending: imageClassification.pending,
        finalState: buildInspectionWorkbenchFinalState(rows, aiWorkbenchResult),
        photoDeletingIndex: index,
        photoUploadError: '',
        savedMessage: '',
        dirty: true,
      })
      try {
        await saveInspectionDraft(requestedTaskId, requestedItemId, workbenchToDraft(nextWorkbench, {
          metadata: {
            customer: text(task.customer_name),
            supplier: text(task.supplier_name),
            orderNumber: text(task.contract_no),
            model: text(item.spec_desc || item.material_name),
            arrivalQuantity: item.quantity === null || item.quantity === undefined ? '' : String(item.quantity),
            inspectionDate: this.data.inspectionDate,
          },
          rawContent: this.data.rawContent,
          unmatched: this.data.unmatched,
          qualitySheetImages: this.data.reportImages,
          inspectionImages,
          aiResult: aiWorkbenchResult,
        }))
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
        this.setData({
          savedMessage: inspectionImages.length ? '验货图片已更新' : '验货图片已清空',
          dirty: false,
        })
        this.triggerEvent('saved', { taskId: requestedTaskId, itemId: requestedItemId })
        showTopToast({
          title: inspectionImages.length ? '图片已删除，线上将重新识别' : '验货图片已清空',
          icon: 'none',
        })
      } catch (error) {
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
        this.setData({
          photoUploadError: errorMessage(error, '图片删除同步失败，请点击保存草稿重试'),
          dirty: true,
        })
      } finally {
        if (this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) {
          this.setData({ photoDeletingIndex: -1 })
        }
      }
    },

    takeQualitySheetPhoto() {
      if (this.data.recognizing || !this.isActiveWorkbenchRequest(this.data.taskId, this.data.itemId)) return
      wx.navigateTo({
        url: '/pages/document-camera/document-camera',
        events: { documentPhotoConfirmed: ({ tempFilePath }: { tempFilePath?: string }) => {
          if (tempFilePath) void this.recognizeQualitySheet(tempFilePath)
        } },
        fail: () => showTopToast({ title: '无法打开相机，请稍后重试', icon: 'none' }),
      })
    },

    chooseQualitySheetPhoto() {
      if (this.data.recognizing || !this.isActiveWorkbenchRequest(this.data.taskId, this.data.itemId)) return
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
          if (!error.errMsg?.includes('cancel')) showTopToast({ title: '选择质检单失败，请重试', icon: 'none' })
        },
      })
    },

    async recognizeQualitySheet(imagePath: string) {
      const requestedTaskId = this.data.taskId
      const requestedItemId = this.data.itemId
      const workbench = this.data.workbench
      if (
        !workbench
        || this.data.recognizing
        || !this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)
      ) return
      this.setData({ recognizing: true, recognitionError: '', savedMessage: '' })
      try {
        const preparedPath = await prepareImageForUpload(imagePath)
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
        const result = await recognizeInspection(preparedPath)
        if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
        const merged = mergeRecognitionRecord(this.data.workbench?.rows || workbench.rows, result.record)
        let reportImages = this.data.reportImages
        let reportPreviewPath = preparedPath
        let reportPreviewOriginalPath = preparedPath
        try {
          const uploadedReport = await uploadInspectionDraftImage(
            requestedTaskId,
            requestedItemId,
            preparedPath,
          )
          if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
          reportImages = [...reportImages, uploadedReport.url]
          reportPreviewPath = inspectionImageThumbnailUrl(uploadedReport.url)
          reportPreviewOriginalPath = uploadedReport.url
        } catch {
          if (!this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) return
          showTopToast({ title: '识别完成，质检单图片未写入草稿', icon: 'none' })
        }
        const unmatched = [...this.data.unmatched, ...merged.unmatched]
        const next = { ...workbench, rows: merged.rows }
        const recognizedInspectionDate = resolvedInspectionDate(result.record.inspectionDate)
        const inspectionDate = recognizedInspectionDate || this.data.inspectionDate
        const aiWorkbenchResult = {
          ...this.data.aiWorkbenchResult,
          ...(recognizedInspectionDate ? { inspection_date: recognizedInspectionDate } : {}),
        }
        this.setData({
          workbench: next,
          aiWorkbenchResult,
          finalState: buildInspectionWorkbenchFinalState(merged.rows, aiWorkbenchResult),
          inspectionDate,
          unmatched,
          rawContent: [this.data.rawContent, result.rawContent].filter(Boolean).join('\n\n---\n\n'),
          reportImages,
          reportPreviewPaths: [...this.data.reportPreviewPaths, reportPreviewPath],
          reportPreviewOriginalPaths: [
            ...this.data.reportPreviewOriginalPaths,
            reportPreviewOriginalPath,
          ],
          dirty: true,
        })
        this.syncCurrentPageAfterRecognition(next.rows, unmatched)
        showTopToast({ title: merged.unmatched.length ? '识别完成，请核对未匹配条目' : '识别结果已回填', icon: 'none' })
      } catch (error) {
        if (this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) {
          this.setData({ recognitionError: errorMessage(error, '质检单识别失败') })
        }
      } finally {
        if (this.isActiveWorkbenchRequest(requestedTaskId, requestedItemId)) {
          this.setData({ recognizing: false })
        }
      }
    },

    previewReportImage(event: RowActionEvent) {
      const index = Number(event.currentTarget.dataset.index)
      const current = this.data.reportPreviewOriginalPaths[index]
      if (current) wx.previewImage({ current, urls: this.data.reportPreviewOriginalPaths })
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
      if (!this.isActiveWorkbenchRequest(this.data.taskId, this.data.itemId)) return
      const pages = buildInspectionWorkbenchPages(rows, unmatched)
      const matchedRow = rows.find((row) => row.measurements.some((value) => value.trim()))
      const matchedIndex = matchedRow ? findInspectionWorkbenchPageForRow(pages, matchedRow.rowKey) : -1
      const activePage = matchedIndex >= 0 ? matchedIndex : Math.min(this.data.activePage, Math.max(0, pages.length - 1))
      this.setData({
        pages,
        finalState: buildInspectionWorkbenchFinalState(rows, this.data.aiWorkbenchResult),
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
      this.triggerEvent('closing')
      this.setData({ closing: true })
      setTimeout(() => {
        this.triggerEvent('close', { taskId: this.data.taskId, itemId: this.data.itemId, saved: !this.data.dirty })
      }, 300)
    },

    async saveDraft(closeAfterSave = false, deletedRecordImages: string[] = []) {
      const shouldClose = closeAfterSave === true
      const { workbench, task, item } = this.data
      if (
        !workbench
        || !task
        || !item
        || this.data.saving
        || this.data.loading
        || this.data.recognizing
        || this.data.photoUploading
        || this.data.photoDeletingIndex >= 0
        || !this.isActiveWorkbenchRequest(this.data.taskId, this.data.itemId)
      ) return
      const pendingPhotos = workbench.rows.flatMap((row) => row.images).filter((photo) => photo.status !== 'uploaded')
      if (pendingPhotos.length) {
        showTopToast({ title: '请先重试或删除未完成上传的照片', icon: 'none' })
        return
      }
      this.setData({ saving: true, savedMessage: '' })
      try {
        await saveInspectionDraft(this.data.taskId, this.data.itemId, workbenchToDraft(workbench, {
          metadata: {
            customer: text(task.customer_name),
            supplier: text(task.supplier_name),
            orderNumber: text(task.contract_no),
            model: text(item.spec_desc || item.material_name),
            arrivalQuantity: item.quantity === null || item.quantity === undefined ? '' : String(item.quantity),
            inspectionDate: this.data.inspectionDate,
          },
          rawContent: this.data.rawContent,
          unmatched: this.data.unmatched,
          qualitySheetImages: this.data.reportImages,
          inspectionImages: this.data.inspectionImages,
          deletedRecordImages,
          aiResult: this.data.aiWorkbenchResult,
        }))
        if (!this.isActiveWorkbenchRequest(this.data.taskId, this.data.itemId)) return
        const savedMessage = deletedRecordImages.length ? '图片已删除并同步' : '草稿已保存'
        this.setData({ savedMessage, dirty: false })
        showTopToast({ title: savedMessage, icon: 'success' })
        this.triggerEvent('saved', { taskId: this.data.taskId, itemId: this.data.itemId, closing: shouldClose })
        if (shouldClose) this.finishClose()
      } catch (error) {
        if (this.isActiveWorkbenchRequest(this.data.taskId, this.data.itemId)) {
          showTopToast({
            message: errorMessage(error, '草稿保存失败，请重试'),
            type: 'error',
            duration: 3600,
          })
        }
      } finally {
        if (this.isActiveWorkbenchRequest(this.data.taskId, this.data.itemId)) {
          this.setData({ saving: false })
        }
      }
    },
  },
})
