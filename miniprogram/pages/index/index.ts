import { StoredInspectionRecord } from '../../domain/inspection-history'
import {
  appendRecognitionQueue,
  claimQueuedRecognitionItems,
  completeQueueItem,
  createRecognitionQueueItem,
  failQueueItem,
  getQueueStats,
  getTimedRecognitionProgress,
  markQueueItemRecognizing,
  MAX_CONCURRENT_RECOGNITIONS,
  MAX_RECOGNITION_QUEUE_SIZE,
  RecognitionQueueItem,
  removeQueueItem,
  requestQueueItemSkip,
  retryQueueItem,
  updateQueueItem,
} from '../../domain/recognition-queue'
import {
  buildRecognitionReviewHints,
  createEmptyReviewHints,
  hasUnreviewedDanger,
  markReviewHintReviewed,
  RecognitionReviewHints,
} from '../../domain/recognition-review'
import {
  createMockRecord,
  InspectionRecord,
  InspectionRowField,
  Judgement,
  MEASUREMENT_COUNT,
  PRODUCT_OPTIONS,
  updateMeasurement,
  updateRecordField,
  updateRowField,
  updateSampleJudgement,
  validateRecord,
} from '../../domain/inspection-record'
import {
  deleteInspectionHistoriesByServerRecord,
  deleteInspectionHistory,
  loadInspectionHistory,
  saveHistorySyncState,
  saveInspectionHistory,
} from '../../services/history-service'
import {
  recognizeInspection,
  submitInspection,
} from '../../services/inspection-service'
import { exportInspectionJson } from '../../services/export-service'
import { getCurrentUser } from '../../services/auth-service'
import { ServerClientError } from '../../services/server-client'
import {
  applyInspectionDateToTaskItems,
  createStandaloneInspection,
  deleteRemoteInspectionRecord,
  getInspectionTask,
  HistoryViewItem,
  inspectionImageToDataUrl,
  listInspectionHistory,
  listInspectionTasks,
  mergeInspectionHistory,
  QualityInspectionTaskDto,
  saveInspectionDraft,
  shouldQueueInspectionHistoryRefresh,
  shouldRefreshInspectionHistory,
  syncStoredInspection,
  taskItemToInspectionRecord,
} from '../../services/quality-inspection-service'

interface NavigationHeightChangeEvent {
  detail: { height: number }
}

interface HistoryEditorInput {
  localId: string
  displayId: string
  origin: 'local' | 'remote'
  sourceType: 'purchase_order' | 'standalone'
  taskId: number | null
  itemId: number | null
  imagePath: string
  rawContent: string
  record: InspectionRecord
}

type WorkspaceTab = 'scan' | 'tasks' | 'history'

const productLabels = PRODUCT_OPTIONS.map((option) => option.label)
const measurementHeaders = Array.from({ length: MEASUREMENT_COUNT }, (_, index) => index + 1)
const judgementOptions: Judgement[] = ['', 'OK', 'NG']
const RECOGNITION_PROGRESS_TICK_MS = 300
const recognitionProgressTimers = new Map<string, ReturnType<typeof setInterval>>()
const recognitionProgressStartedAt = new Map<string, number>()

Component({
  data: {
    navigationBarHeight: 91,
    activeTab: 'scan' as WorkspaceTab,
    taskItems: [] as QualityInspectionTaskDto[],
    taskPage: 1,
    taskTotal: 0,
    taskSearch: '',
    taskStatus: 'pending',
    taskLoading: false,
    selectedTaskId: 0,
    selectedItemId: 0,
    screen: 'capture',
    imagePath: '',
    imageId: '',
    rawContent: '',
    recognitionQueue: [] as RecognitionQueueItem[],
    recognitionQueueStats: getQueueStats([]),
    reviewQueueItemId: '',
    reviewHints: createEmptyReviewHints() as RecognitionReviewHints,
    productLabels,
    productIndex: 0,
    measurementHeaders,
    judgementOptions,
    illustrationCells: Array.from({ length: 9 }, (_, index) => index + 1),
    record: createMockRecord(),
    submitting: false,
    exporting: false,
    recordId: '',
    editingRecordId: '',
    historyRecords: [] as HistoryViewItem[],
    historyLoading: false,
    historyLoadedAt: 0,
    historyRefreshQueued: false,
    historyError: '',
    historyRequestId: 0,
    historyOpeningId: '',
    historyDeletingId: '',
    historyModalVisible: false,
    historyModalClosing: false,
    historyEditId: '',
    historyEditDisplayId: '',
    historyEditOrigin: 'local' as 'local' | 'remote',
    historyEditSourceType: 'standalone' as 'purchase_order' | 'standalone',
    historyEditTaskId: 0,
    historyEditItemId: 0,
    historyEditImagePath: '',
    historyEditRawContent: '',
    historyEditProductIndex: 0,
    historyEditRecord: createMockRecord(),
    historySaving: false,
    historyExporting: false,
    pressedTab: '' as WorkspaceTab | '',
  },
  lifetimes: {
    attached() {
      getCurrentUser()
        .catch((error: Error) => {
          if (error instanceof ServerClientError && error.statusCode === 401) {
            wx.reLaunch({ url: '/pages/login/login' })
            return
          }
          wx.showToast({ title: error.message || '会话检查失败', icon: 'none' })
        })
    },
    detached() {
      this.stopAllRecognitionProgress()
    },
  },
  methods: {
    onNavigationHeightChange(event: NavigationHeightChangeEvent) {
      this.setData({ navigationBarHeight: event.detail.height })
    },
    refreshHistory(force = false): Promise<void> {
      const forceRefresh = force === true
      if (this.data.historyLoading) {
        if (shouldQueueInspectionHistoryRefresh(
          this.data.historyLoading,
          forceRefresh,
          this.data.historyRefreshQueued,
        )) {
          this.setData({ historyRefreshQueued: true })
        }
        return Promise.resolve()
      }
      if (!shouldRefreshInspectionHistory(
        this.data.historyLoadedAt,
        Date.now(),
        forceRefresh,
      )) return Promise.resolve()
      const requestId = this.data.historyRequestId + 1
      const local = loadInspectionHistory()
      this.setData({
        historyRecords: this.data.historyRecords.length > 0
          ? this.data.historyRecords
          : mergeInspectionHistory(local, []),
        historyLoading: true,
        historyError: '',
        historyRequestId: requestId,
      })
      return listInspectionHistory()
        .then((data) => {
          if (this.data.historyRequestId !== requestId) return
          this.setData({
            historyRecords: mergeInspectionHistory(loadInspectionHistory(), data.items),
            historyError: '',
            historyLoadedAt: Date.now(),
          })
        })
        .catch((error: Error) => {
          if (this.data.historyRequestId !== requestId) return
          this.setData({
            historyRecords: this.data.historyRecords.length > 0
              ? this.data.historyRecords
              : mergeInspectionHistory(loadInspectionHistory(), []),
            historyError: `服务器记录加载失败：${error.message || '请稍后重试'}`,
            historyLoadedAt: Date.now(),
          })
        })
        .finally(() => {
          if (this.data.historyRequestId === requestId) {
            const queuedRefresh = this.data.historyRefreshQueued
            this.setData({
              historyLoading: false,
              historyRefreshQueued: false,
            })
            if (queuedRefresh) this.refreshHistory(true)
          }
        })
    },
    retryHistoryRefresh() {
      this.refreshHistory(true)
    },
    activateTab(activeTab: WorkspaceTab) {
      const previousTab = this.data.activeTab
      this.setData({
        activeTab,
        ...(activeTab === 'scan'
          ? { selectedTaskId: 0, selectedItemId: 0 }
          : {}),
      })
      if (activeTab === 'history' && previousTab !== 'history') this.refreshHistory()
      if (activeTab === 'tasks') this.loadTasks(true)
    },
    switchTab(event: WechatMiniprogram.TouchEvent) {
      this.activateTab(event.currentTarget.dataset.tab as WorkspaceTab)
    },
    onTabPressStart(event: WechatMiniprogram.TouchEvent) {
      const touchedTab = event.currentTarget.dataset.tab as WorkspaceTab
      this.setData({ pressedTab: touchedTab === this.data.activeTab ? touchedTab : '' })
    },
    onTabPressEnd() {
      this.setData({ pressedTab: '' })
    },
    goToScan() {
      this.setData({ activeTab: 'scan' })
    },
    showHistory() {
      this.activateTab('history')
    },
    loadTasks(reset = false) {
      if (this.data.taskLoading) return
      const page = reset ? 1 : this.data.taskPage
      if (!reset && this.data.taskItems.length >= this.data.taskTotal) return
      this.setData({
        taskLoading: true,
        ...(reset ? { taskItems: [], taskPage: 1, taskTotal: 0 } : {}),
      })
      listInspectionTasks({
        page,
        pageSize: 20,
        search: this.data.taskSearch.trim() || undefined,
        status: this.data.taskStatus === 'all' ? undefined : this.data.taskStatus,
        sourceType: 'purchase_order',
      })
        .then((data) => {
          this.setData({
            taskItems: reset
              ? data.items
              : [...this.data.taskItems, ...data.items],
            taskTotal: data.total,
            taskPage: page + 1,
          })
        })
        .catch((error: Error) => {
          wx.showToast({ title: error.message || '待检任务加载失败', icon: 'none' })
        })
        .finally(() => this.setData({ taskLoading: false }))
    },
    loadMoreTasks() {
      if (this.data.activeTab === 'tasks') this.loadTasks(false)
    },
    onTaskSearchInput(event: WechatMiniprogram.Input) {
      this.setData({ taskSearch: event.detail.value })
    },
    confirmTaskSearch() {
      this.loadTasks(true)
    },
    changeTaskStatus(event: WechatMiniprogram.TouchEvent) {
      const taskStatus = String(event.currentTarget.dataset.status || 'pending')
      this.setData({ taskStatus }, () => this.loadTasks(true))
    },
    openTask(event: WechatMiniprogram.TouchEvent) {
      const taskId = Number(event.currentTarget.dataset.id)
      if (!taskId) return
      if (this.data.selectedTaskId === taskId) {
        this.setData({ selectedTaskId: 0, selectedItemId: 0 })
        return
      }
      this.setData({ taskLoading: true })
      getInspectionTask(taskId)
        .then((task) => {
          this.setData({
            selectedTaskId: task.id,
            selectedItemId: 0,
            taskItems: this.data.taskItems.map((item) => (
              item.id === task.id ? task : item
            )),
          })
        })
        .catch((error: Error) => {
          wx.showToast({ title: error.message || '任务详情加载失败', icon: 'none' })
        })
        .finally(() => this.setData({ taskLoading: false }))
    },
    selectTaskItem(event: WechatMiniprogram.TouchEvent) {
      const taskId = Number(event.currentTarget.dataset.taskId)
      const itemId = Number(event.currentTarget.dataset.itemId)
      const task = this.data.taskItems.find((candidate) => candidate.id === taskId)
      const item = task?.items?.find((candidate) => candidate.id === itemId)
      if (!task || !item) return
      const record = taskItemToInspectionRecord(task, item)
      const productIndex = PRODUCT_OPTIONS.findIndex(
        (option) => option.value === record.productType,
      )
      this.setData({
        activeTab: 'scan',
        screen: 'capture',
        selectedTaskId: taskId,
        selectedItemId: itemId,
        record,
        productIndex: Math.max(productIndex, 0),
      })
      wx.showToast({ title: '任务已选择，请拍摄报告', icon: 'none' })
    },
    syncHistoryRecord(record: StoredInspectionRecord): Promise<StoredInspectionRecord> {
      return syncStoredInspection(record, {
        createStandalone: createStandaloneInspection,
        saveDraft: saveInspectionDraft,
        imageToDataUrl: inspectionImageToDataUrl,
        loadExistingImages: async (taskId, itemId) => {
          const task = await getInspectionTask(taskId)
          const item = task.items?.find((candidate) => candidate.id === itemId)
          return (item?.inspection_draft?.ai_workbench_images || [])
            .filter((image) => image.startsWith('data:image/'))
            .slice(0, 1)
        },
        updateState: async (nextRecord) => (
          saveHistorySyncState(nextRecord) || nextRecord
        ),
        onUnauthorized: () => wx.reLaunch({ url: '/pages/login/login' }),
      }).then((synced) => {
        if (
          synced.syncStatus === 'synced'
          && synced.taskId
          && synced.itemId
        ) {
          this.setData({
            taskItems: applyInspectionDateToTaskItems(
              this.data.taskItems,
              synced.taskId,
              synced.itemId,
              synced.record.inspectionDate,
            ),
          })
        }
        return synced
      })
    },
    retryHistorySync(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const stored = loadInspectionHistory().find((item) => item.id === id)
      if (!stored || stored.syncStatus === 'syncing') return
      this.setData({
        historyRecords: this.data.historyRecords.map((item) => (
          item.id === id
            ? { ...item, syncStatus: 'syncing', syncError: '' }
            : item
        )),
      })
      this.syncHistoryRecord(stored)
        .then((result) => this.refreshHistory(true).then(() => result))
        .then((result) => {
          wx.showToast({
            title: result.syncStatus === 'synced' ? '同步成功' : '同步失败，请重试',
            icon: 'none',
          })
        })
    },
    exportCurrentRecord() {
      if (this.data.exporting) return
      this.setData({ exporting: true })
      exportInspectionJson({
        recordId: this.data.recordId || this.data.editingRecordId,
        record: this.data.record,
      })
        .then(() => {
          wx.showToast({ title: 'JSON已生成', icon: 'none' })
        })
        .catch((error: Error) => {
          wx.showModal({ title: '导出失败', content: error.message, showCancel: false })
        })
        .finally(() => this.setData({ exporting: false }))
    },
    takePhoto() {
      this.chooseImage(['camera'])
    },
    chooseFromAlbum() {
      this.chooseImage(['album'])
    },
    chooseImage(sourceType: Array<'album' | 'camera'>) {
      const remaining = MAX_RECOGNITION_QUEUE_SIZE - this.data.recognitionQueueStats.total
      if (remaining <= 0) {
        wx.showToast({ title: '识别队列最多保留 10 张图片', icon: 'none' })
        return
      }
      wx.chooseMedia({
        count: sourceType.includes('album') ? Math.min(9, remaining) : 1,
        mediaType: ['image'],
        sourceType,
        sizeType: ['compressed'],
        success: (result) => this.enqueueRecognitionFiles(
          result.tempFiles.map((file) => file.tempFilePath),
        ),
      })
    },
    applyRecognitionQueue(queue: RecognitionQueueItem[], callback?: () => void) {
      const visibleQueue = queue.filter((item) => item.status !== 'skipped')
      this.setData({
        recognitionQueue: visibleQueue,
        recognitionQueueStats: getQueueStats(visibleQueue),
      }, callback)
    },
    stopRecognitionProgress(id: string) {
      const timer = recognitionProgressTimers.get(id)
      if (timer !== undefined) clearInterval(timer)
      recognitionProgressTimers.delete(id)
      recognitionProgressStartedAt.delete(id)
    },
    stopAllRecognitionProgress() {
      recognitionProgressTimers.forEach((timer) => clearInterval(timer))
      recognitionProgressTimers.clear()
      recognitionProgressStartedAt.clear()
    },
    startRecognitionProgress(id: string) {
      this.stopRecognitionProgress(id)
      recognitionProgressStartedAt.set(id, Date.now())
      const tick = () => {
        const current = this.data.recognitionQueue.find((item) => item.id === id)
        const startedAt = recognitionProgressStartedAt.get(id)
        if (
          !current
          || startedAt === undefined
          || (current.status !== 'preparing' && current.status !== 'recognizing')
        ) {
          this.stopRecognitionProgress(id)
          return
        }
        const progress = Math.max(
          current.progress,
          getTimedRecognitionProgress(
            Date.now() - startedAt,
            undefined,
            current.progressProfile,
          ),
        )
        if (progress === current.progress) return
        this.applyRecognitionQueue(updateQueueItem(this.data.recognitionQueue, id, { progress }))
      }
      recognitionProgressTimers.set(id, setInterval(tick, RECOGNITION_PROGRESS_TICK_MS))
      tick()
    },
    enqueueRecognitionFiles(imagePaths: string[]) {
      if (imagePaths.length === 0) return
      const createdAt = Date.now()
      const sourceType = this.data.selectedTaskId && this.data.selectedItemId
        ? 'purchase_order' as const
        : 'standalone' as const
      const additions = imagePaths.map((imagePath, index) => createRecognitionQueueItem({
        id: `RQ-${createdAt}-${index}-${Math.random().toString(16).slice(2, 8)}`,
        imagePath,
        createdAt: createdAt + index,
        sourceType,
        taskId: sourceType === 'purchase_order' ? this.data.selectedTaskId : null,
        itemId: sourceType === 'purchase_order' ? this.data.selectedItemId : null,
        taskPrefill: sourceType === 'purchase_order' ? this.data.record : null,
      }))
      const queue = appendRecognitionQueue(this.data.recognitionQueue, additions)
      this.setData({
        screen: 'capture',
        recognitionQueue: queue,
        recognitionQueueStats: getQueueStats(queue),
      }, () => this.runRecognitionQueue())
    },
    runRecognitionQueue() {
      const claimed = claimQueuedRecognitionItems(
        this.data.recognitionQueue,
        MAX_CONCURRENT_RECOGNITIONS,
      )
      if (claimed.claimed.length === 0) return
      this.applyRecognitionQueue(claimed.queue, () => {
        claimed.claimed.forEach((item) => this.startQueueRecognition(item.id))
      })
    },
    startQueueRecognition(id: string) {
      const next = this.data.recognitionQueue.find((item) => item.id === id)
      if (!next || next.status !== 'preparing') return
      this.startRecognitionProgress(id)
      setTimeout(() => {
        const current = this.data.recognitionQueue.find((item) => item.id === id)
        if (!current || current.status !== 'preparing') return
        const recognizingQueue = markQueueItemRecognizing(this.data.recognitionQueue, id)
        this.applyRecognitionQueue(recognizingQueue)
      }, 350)
      recognizeInspection(next.imagePath)
        .then((result) => {
          const current = this.data.recognitionQueue.find((item) => item.id === id)
          const taskPrefill = current?.taskPrefill
          const recognizedRecord = taskPrefill
            ? {
              ...result.record,
              customer: result.record.customer || taskPrefill.customer,
              supplier: result.record.supplier || taskPrefill.supplier,
              orderNumber: result.record.orderNumber || taskPrefill.orderNumber,
              model: result.record.model || taskPrefill.model,
              arrivalQuantity: result.record.arrivalQuantity || taskPrefill.arrivalQuantity,
              inspectionDate: result.record.inspectionDate || taskPrefill.inspectionDate,
            }
            : result.record
          const normalizedResult = { ...result, record: recognizedRecord }
          const hints = buildRecognitionReviewHints(recognizedRecord, result.confidence, taskPrefill)
          const completed = completeQueueItem(
            this.data.recognitionQueue,
            id,
            normalizedResult,
            hints,
          )
          this.applyRecognitionQueue(completed)
        })
        .catch((error: Error) => {
          const failed = failQueueItem(
            this.data.recognitionQueue,
            id,
            error.message || '识别失败',
          )
          this.applyRecognitionQueue(failed)
        })
        .finally(() => {
          this.stopRecognitionProgress(id)
          this.runRecognitionQueue()
        })
    },
    openQueueReview(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const item = this.data.recognitionQueue.find((candidate) => candidate.id === id)
      if (!item || item.status !== 'ready' || !item.result || !item.reviewHints) return
      const productIndex = PRODUCT_OPTIONS.findIndex(
        (option) => option.value === item.result?.record.productType,
      )
      this.setData({
        screen: 'review',
        reviewQueueItemId: id,
        imagePath: item.imagePath,
        imageId: item.result.imageId,
        rawContent: item.result.rawContent,
        record: item.result.record,
        reviewHints: item.reviewHints,
        productIndex: Math.max(productIndex, 0),
        selectedTaskId: item.taskId || 0,
        selectedItemId: item.itemId || 0,
        recordId: '',
        editingRecordId: '',
      })
    },
    backToRecognitionQueue() {
      const id = this.data.reviewQueueItemId
      let queue = this.data.recognitionQueue
      const item = queue.find((candidate) => candidate.id === id)
      if (item?.result) {
        queue = updateQueueItem(queue, id, {
          result: { ...item.result, record: this.data.record },
          reviewHints: this.data.reviewHints,
        })
      }
      this.setData({
        screen: 'capture',
        reviewQueueItemId: '',
        recognitionQueue: queue,
        recognitionQueueStats: getQueueStats(queue),
      })
    },
    retryQueueRecognition(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const queue = retryQueueItem(this.data.recognitionQueue, id)
      this.setData({
        recognitionQueue: queue,
        recognitionQueueStats: getQueueStats(queue),
      }, () => this.runRecognitionQueue())
    },
    skipQueueRecognition(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const current = this.data.recognitionQueue.find((item) => item.id === id)
      if (current?.status === 'preparing' || current?.status === 'recognizing') {
        this.stopRecognitionProgress(id)
      }
      this.applyRecognitionQueue(requestQueueItemSkip(this.data.recognitionQueue, id))
    },
    removeQueueRecognition(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const item = this.data.recognitionQueue.find((candidate) => candidate.id === id)
      if (!item) return
      const remove = () => this.applyRecognitionQueue(removeQueueItem(this.data.recognitionQueue, id))
      if (item.status !== 'ready') {
        remove()
        return
      }
      wx.showModal({
        title: '删除待审核结果',
        content: '删除后需要重新添加图片识别，是否继续？',
        confirmText: '删除',
        confirmColor: '#c93f4a',
        success: (result) => {
          if (result.confirm) remove()
        },
      })
    },
    previewImage() {
      if (!this.data.imagePath) return
      wx.previewImage({
        current: this.data.imagePath,
        urls: [this.data.imagePath],
        fail: () => wx.showToast({ title: '本地图片已失效', icon: 'none' }),
      })
    },
    showHistoryEditor(input: HistoryEditorInput) {
      const productIndex = PRODUCT_OPTIONS.findIndex(
        (option) => option.value === input.record.productType,
      )
      this.setData({
        historyModalVisible: true,
        historyModalClosing: false,
        historyEditId: input.localId,
        historyEditDisplayId: input.displayId,
        historyEditOrigin: input.origin,
        historyEditSourceType: input.sourceType,
        historyEditTaskId: input.taskId || 0,
        historyEditItemId: input.itemId || 0,
        historyEditImagePath: input.imagePath,
        historyEditRawContent: input.rawContent,
        historyEditRecord: input.record,
        historyEditProductIndex: Math.max(productIndex, 0),
      })
    },
    openHistory(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const selected = this.data.historyRecords.find((item) => item.id === id)
      if (!selected || this.data.historyOpeningId) return
      if (selected.origin === 'local') {
        const stored = loadInspectionHistory().find((item) => item.id === id)
        if (!stored) {
          this.refreshHistory(true)
          return
        }
        this.showHistoryEditor({
          localId: stored.id,
          displayId: stored.id,
          origin: 'local',
          sourceType: stored.sourceType,
          taskId: stored.taskId,
          itemId: stored.itemId,
          imagePath: stored.imagePath,
          rawContent: stored.rawContent,
          record: stored.record,
        })
        return
      }
      if (!selected.taskId || !selected.itemId) return
      this.setData({ historyOpeningId: selected.id })
      getInspectionTask(selected.taskId)
        .then((task) => {
          const item = task.items?.find((candidate) => candidate.id === selected.itemId)
          if (!item) throw new Error('服务器记录明细不存在')
          const cached = loadInspectionHistory().find((record) => (
            record.taskId === selected.taskId && record.itemId === selected.itemId
          ))
          this.showHistoryEditor({
            localId: cached?.id || '',
            displayId: task.task_no || `云端记录 ${selected.taskId}/${selected.itemId}`,
            origin: 'remote',
            sourceType: task.source_type || selected.sourceType,
            taskId: selected.taskId,
            itemId: selected.itemId,
            imagePath: cached?.imagePath || '',
            rawContent: cached?.rawContent || '',
            record: taskItemToInspectionRecord(task, item),
          })
        })
        .catch((error: Error) => {
          wx.showToast({ title: error.message || '服务器记录加载失败', icon: 'none' })
        })
        .finally(() => this.setData({ historyOpeningId: '' }))
    },
    noop() {},
    closeHistoryModal() {
      if (this.data.historySaving) return
      this.hideHistoryModal()
    },
    hideHistoryModal() {
      if (!this.data.historyModalVisible || this.data.historyModalClosing) return
      this.setData({ historyModalClosing: true })
      setTimeout(() => {
        this.setData({
          historyModalVisible: false,
          historyModalClosing: false,
          historyEditId: '',
          historyEditDisplayId: '',
          historyEditOrigin: 'local',
          historyEditSourceType: 'standalone',
          historyEditTaskId: 0,
          historyEditItemId: 0,
          historyEditImagePath: '',
          historyEditRawContent: '',
          historyEditProductIndex: 0,
          historyEditRecord: createMockRecord(),
        })
      }, 300)
    },
    previewHistoryImage() {
      const imagePath = this.data.historyEditImagePath
      if (!imagePath) return
      wx.previewImage({
        current: imagePath,
        urls: [imagePath],
        fail: () => wx.showToast({ title: '本地图片已失效', icon: 'none' }),
      })
    },
    onHistoryProductChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const productIndex = Number(event.detail.value)
      const productType = PRODUCT_OPTIONS[productIndex].value
      this.setData({
        historyEditProductIndex: productIndex,
        historyEditRecord: updateRecordField(this.data.historyEditRecord, 'productType', productType),
      })
    },
    onHistoryRecordInput(event: WechatMiniprogram.Input) {
      const field = event.currentTarget.dataset.field as keyof InspectionRecord
      this.setData({
        historyEditRecord: updateRecordField(this.data.historyEditRecord, field, event.detail.value),
      })
    },
    onHistoryRowInput(event: WechatMiniprogram.Input) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const field = event.currentTarget.dataset.field as InspectionRowField
      this.setData({
        historyEditRecord: updateRowField(this.data.historyEditRecord, rowIndex, field, event.detail.value),
      })
    },
    onHistoryMeasurementInput(event: WechatMiniprogram.Input) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const measurementIndex = Number(event.currentTarget.dataset.measurementIndex)
      this.setData({
        historyEditRecord: updateMeasurement(
          this.data.historyEditRecord,
          rowIndex,
          measurementIndex,
          event.detail.value,
        ),
      })
    },
    onHistoryJudgementChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const sampleIndex = Number(event.currentTarget.dataset.sampleIndex)
      const judgement = judgementOptions[Number(event.detail.value)]
      this.setData({
        historyEditRecord: updateSampleJudgement(this.data.historyEditRecord, sampleIndex, judgement),
      })
    },
    exportHistoryRecord() {
      if (this.data.historyExporting) return
      this.setData({ historyExporting: true })
      exportInspectionJson({
        recordId: this.data.historyEditId || this.data.historyEditDisplayId,
        record: this.data.historyEditRecord,
      })
        .then(() => {
          wx.showToast({ title: 'JSON已生成', icon: 'none' })
        })
        .catch((error: Error) => {
          wx.showModal({ title: '导出失败', content: error.message, showCancel: false })
        })
        .finally(() => this.setData({ historyExporting: false }))
    },
    saveHistoryEdit() {
      if (this.data.historySaving) return
      const missing = validateRecord(this.data.historyEditRecord)
      if (missing.length > 0) {
        wx.showToast({ title: `请完善${missing[0]}`, icon: 'none' })
        return
      }
      this.setData({ historySaving: true })
      saveInspectionHistory({
        imagePath: this.data.historyEditImagePath,
        rawContent: this.data.historyEditRawContent,
        record: this.data.historyEditRecord,
        sourceType: this.data.historyEditSourceType,
        taskId: this.data.historyEditTaskId || null,
        itemId: this.data.historyEditItemId || null,
      }, this.data.historyEditId)
        .then((stored) => this.syncHistoryRecord(stored))
        .then((result) => this.refreshHistory(true).then(() => result))
        .then((result) => {
          this.hideHistoryModal()
          wx.showToast({
            title: result.syncStatus === 'synced'
              ? '记录已更新并同步'
              : '已本地保存，同步失败',
            icon: 'none',
          })
        })
        .catch((error: Error) => {
          wx.showModal({ title: '更新失败', content: error.message, showCancel: false })
        })
        .finally(() => this.setData({ historySaving: false }))
    },
    deleteHistory(event: WechatMiniprogram.TouchEvent) {
      if (this.data.historyDeletingId) return
      const id = String(event.currentTarget.dataset.id || '')
      const selected = this.data.historyRecords.find((item) => item.id === id)
      if (!selected) return
      const isRemote = selected.origin === 'remote'
      wx.showModal({
        title: '删除识别记录',
        content: isRemote
          ? '将删除服务器上的该条质检数据及关联的本地副本，删除后无法恢复。'
          : '将删除这条本地识别记录和本地图片，删除后无法恢复。',
        confirmText: '删除',
        confirmColor: '#c93f4a',
        success: (result) => {
          if (!result.confirm || this.data.historyDeletingId) return
          this.setData({ historyDeletingId: id })
          const deleting = isRemote
            ? (() => {
              const taskId = selected.taskId
              const itemId = selected.itemId
              if (taskId === null || itemId === null) {
                return Promise.reject(new Error('服务器记录缺少任务或物料编号'))
              }
              return deleteRemoteInspectionRecord(taskId, itemId)
                .then(() => deleteInspectionHistoriesByServerRecord(taskId, itemId))
            })()
            : deleteInspectionHistory(id)
          deleting
            .then(() => this.refreshHistory(true))
            .then(() => {
              const editingSameRecord = this.data.historyEditId === id || (
                isRemote
                && this.data.historyEditTaskId === selected.taskId
                && this.data.historyEditItemId === selected.itemId
              )
              if (editingSameRecord) this.hideHistoryModal()
              if (isRemote && selected.sourceType === 'purchase_order') this.loadTasks(true)
              wx.showToast({ title: '已删除', icon: 'success' })
            })
            .catch((error: Error) => {
              wx.showModal({
                title: '删除失败',
                content: error.message || '请稍后重试',
                showCancel: false,
              })
            })
            .finally(() => this.setData({ historyDeletingId: '' }))
        },
      })
    },
    onProductChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const productIndex = Number(event.detail.value)
      const productType = PRODUCT_OPTIONS[productIndex].value
      this.setData({
        productIndex,
        record: updateRecordField(this.data.record, 'productType', productType),
      })
    },
    onRecordInput(event: WechatMiniprogram.Input) {
      const field = event.currentTarget.dataset.field as keyof InspectionRecord
      this.setData({
        record: updateRecordField(this.data.record, field, event.detail.value),
        reviewHints: markReviewHintReviewed(this.data.reviewHints, `record.${String(field)}`),
      })
    },
    onRowInput(event: WechatMiniprogram.Input) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const field = event.currentTarget.dataset.field as InspectionRowField
      this.setData({
        record: updateRowField(this.data.record, rowIndex, field, event.detail.value),
        reviewHints: markReviewHintReviewed(
          this.data.reviewHints,
          `rows.${rowIndex}.${field}`,
        ),
      })
    },
    onMeasurementInput(event: WechatMiniprogram.Input) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const measurementIndex = Number(event.currentTarget.dataset.measurementIndex)
      this.setData({
        record: updateMeasurement(this.data.record, rowIndex, measurementIndex, event.detail.value),
        reviewHints: markReviewHintReviewed(
          this.data.reviewHints,
          `rows.${rowIndex}.measurements.${measurementIndex}`,
        ),
      })
    },
    onJudgementChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const sampleIndex = Number(event.currentTarget.dataset.sampleIndex)
      const judgement = judgementOptions[Number(event.detail.value)]
      this.setData({
        record: updateSampleJudgement(this.data.record, sampleIndex, judgement),
        reviewHints: markReviewHintReviewed(
          this.data.reviewHints,
          `sampleJudgements.${sampleIndex}`,
        ),
      })
    },
    submitRecord() {
      if (this.data.submitting) return
      const missing = validateRecord(this.data.record)
      if (missing.length > 0) {
        wx.showToast({ title: `请完善${missing[0]}`, icon: 'none' })
        return
      }
      if (hasUnreviewedDanger(this.data.reviewHints)) {
        wx.showModal({
          title: '仍有重点核对字段',
          content: `还有 ${this.data.reviewHints.dangerCount} 个红色字段未人工修改，确认数据无误后仍可保存。`,
          confirmText: '确认保存',
          success: (result) => {
            if (result.confirm) this.performSubmitRecord()
          },
        })
        return
      }
      this.performSubmitRecord()
    },
    performSubmitRecord() {
      if (this.data.submitting) return
      this.setData({ submitting: true })
      submitInspection(this.data.imageId, this.data.record)
        .then(() => saveInspectionHistory({
          imagePath: this.data.imagePath,
          rawContent: this.data.rawContent,
          record: this.data.record,
          sourceType: this.data.selectedTaskId ? 'purchase_order' : 'standalone',
          taskId: this.data.selectedTaskId || null,
          itemId: this.data.selectedItemId || null,
        }, this.data.editingRecordId))
        .then((stored) => this.syncHistoryRecord(stored))
        .then((stored) => {
          const queue = this.data.reviewQueueItemId
            ? removeQueueItem(this.data.recognitionQueue, this.data.reviewQueueItemId)
            : this.data.recognitionQueue
          this.setData({
            screen: 'success',
            recordId: stored.id,
            editingRecordId: stored.id,
            reviewQueueItemId: '',
            recognitionQueue: queue,
            recognitionQueueStats: getQueueStats(queue),
          })
          this.refreshHistory(true)
          if (stored.syncStatus === 'failed') {
            wx.showToast({
              title: '已本地保存，可在历史记录重试',
              icon: 'none',
              duration: 2800,
            })
          }
        })
        .catch((error: Error) => {
          wx.showModal({ title: '保存失败', content: error.message, showCancel: false })
        })
        .finally(() => this.setData({ submitting: false }))
    },
    resetFlow() {
      this.setData({
        screen: 'capture',
        imagePath: '',
        imageId: '',
        rawContent: '',
        recordId: '',
        editingRecordId: '',
        reviewQueueItemId: '',
        reviewHints: createEmptyReviewHints(),
        productIndex: 0,
        record: createMockRecord(),
      })
    },
  },
})
