import { showTopToast } from '../../services/top-toast-service'
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
  MEASUREMENT_COUNT,
  PRODUCT_OPTIONS,
  updateRecordField,
  updateSampleJudgement,
  validateRecord,
} from '../../domain/inspection-record'
import {
  deleteInspectionHistoriesByServerRecord,
  deleteInspectionHistory,
  loadInspectionHistory,
  saveInspectionHistory,
} from '../../services/history-service'
import {
  recognizeInspection,
  submitInspection,
} from '../../services/inspection-service'
import { exportInspectionJson } from '../../services/export-service'
import { syncInspectionHistoryRecord } from '../../services/inspection-history-sync-service'
import {
  AuthUser,
  getCurrentUser,
  logout,
} from '../../services/auth-service'
import { DEMO_MODE } from '../../config/server'
import { ServerClientError } from '../../services/server-client'
import {
  applyInspectionDateToTaskItems,
  autoWriteRecognizedInspectionToPendingItem,
  deleteRemoteInspectionRecord,
  getInspectionTask,
  HistoryViewItem,
  listInspectionHistory,
  listInspectionTasks,
  mergeInspectionHistory,
  QualityInspectionTaskDto,
  TASK_PAGE_SIZE,
  taskItemToInspectionRecord,
} from '../../services/quality-inspection-service'

interface NavigationHeightChangeEvent {
  detail: { height: number }
}

interface HistoryEditorSavedPayload {
  record: StoredInspectionRecord
}

type WorkspaceTab = 'scan' | 'tasks' | 'history' | 'account'

const productLabels = PRODUCT_OPTIONS.map((option) => option.label)
const measurementHeaders = Array.from({ length: MEASUREMENT_COUNT }, (_, index) => index + 1)
const RECOGNITION_PROGRESS_TICK_MS = 300
const PULL_REFRESH_MINIMUM_DURATION_MS = 1000
const recognitionProgressTimers = new Map<string, ReturnType<typeof setInterval>>()
const recognitionProgressStartedAt = new Map<string, number>()
const attachedWorkspaceComponents = new WeakSet<object>()
const recognitionStageTimers = new WeakMap<object, Set<ReturnType<typeof setTimeout>>>()
const taskListRequests = new WeakMap<object, Promise<void>>()
const historyListRequests = new WeakMap<object, Promise<void>>()

function scheduleRecognitionStage(component: object, callback: () => void): void {
  if (!attachedWorkspaceComponents.has(component)) return
  let timers = recognitionStageTimers.get(component)
  if (!timers) {
    timers = new Set()
    recognitionStageTimers.set(component, timers)
  }
  const timer = setTimeout(() => {
    timers?.delete(timer)
    if (attachedWorkspaceComponents.has(component)) callback()
  }, 350)
  timers.add(timer)
}

function clearRecognitionStageTimers(component: object): void {
  recognitionStageTimers.get(component)?.forEach((timer) => clearTimeout(timer))
  recognitionStageTimers.delete(component)
}

function getAccountInitial(user: AuthUser): string {
  return String(user.real_name || user.username || '账').trim().slice(0, 1) || '账'
}

function keepPullRefreshVisible(operation: Promise<void>): Promise<void> {
  const startedAt = Date.now()
  return operation.finally(() => new Promise<void>((resolve) => {
    const remaining = PULL_REFRESH_MINIMUM_DURATION_MS - (Date.now() - startedAt)
    setTimeout(resolve, Math.max(0, remaining))
  }))
}

function upsertHistoryRecord(
  items: HistoryViewItem[],
  record: StoredInspectionRecord,
): HistoryViewItem[] {
  const recordView = mergeInspectionHistory([record], [])[0]
  if (!recordView) return items
  const index = items.findIndex((item) => (
    item.id === record.id
    || (
      record.taskId !== null
      && record.itemId !== null
      && item.taskId === record.taskId
      && item.itemId === record.itemId
    )
  ))
  const nextItem = index >= 0
    ? {
      ...recordView,
      id: items[index].id,
      origin: items[index].origin,
    }
    : recordView
  const next = index >= 0
    ? items.map((item, itemIndex) => (itemIndex === index ? nextItem : item))
    : [nextItem, ...items]
  return next.sort((left, right) => right.updatedAt - left.updatedAt)
}

function hasSameListData(left: readonly unknown[], right: readonly unknown[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right)
}

function mergeRefreshedTaskPage(
  current: QualityInspectionTaskDto[],
  incoming: QualityInspectionTaskDto[],
  total: number,
): QualityInspectionTaskDto[] {
  const incomingIds = new Set(incoming.map((item) => item.id))
  return [
    ...incoming,
    ...current.filter((item) => !incomingIds.has(item.id)),
  ].slice(0, total)
}

function appendTaskPage(
  current: QualityInspectionTaskDto[],
  incoming: QualityInspectionTaskDto[],
  total: number,
): QualityInspectionTaskDto[] {
  const currentIds = new Set(current.map((item) => item.id))
  return [
    ...current,
    ...incoming.filter((item) => !currentIds.has(item.id)),
  ].slice(0, total)
}

Component({
  data: {
    navigationBarHeight: 91,
    activeTab: 'scan' as WorkspaceTab,
    taskItems: [] as QualityInspectionTaskDto[],
    taskPage: 1,
    taskTotal: 0,
    taskSearch: '',
    taskAppliedSearch: '',
    taskStatus: 'all',
    taskLoading: false,
    taskInitialized: false,
    taskPullRefreshing: false,
    taskPulling: false,
    taskLoadedQueryKey: '',
    taskLoadingQueryKey: '',
    taskRequestId: 0,
    taskOpenRequestId: 0,
    taskOpeningId: 0,
    selectedTaskId: 0,
    selectedItemId: 0,
    workbenchModalVisible: false,
    workbenchModalTaskId: 0,
    workbenchModalItemId: 0,
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
    illustrationCells: Array.from({ length: 9 }, (_, index) => index + 1),
    record: createMockRecord(),
    submitting: false,
    exporting: false,
    recordId: '',
    editingRecordId: '',
    historyRecords: [] as HistoryViewItem[],
    historyLoading: false,
    historyInitialized: false,
    historyPullRefreshing: false,
    historyPulling: false,
    historyError: '',
    historyRequestId: 0,
    historyDeletingId: '',
    historyEditorVisible: false,
    historyEditorOrigin: 'local' as 'local' | 'remote',
    historyEditorId: '',
    historyEditorSourceType: 'standalone' as 'purchase_order' | 'standalone',
    historyEditorTaskId: 0,
    historyEditorItemId: 0,
    pressedTab: '' as WorkspaceTab | '',
    workspaceScrollTop: 0,
    currentUser: null as AuthUser | null,
    accountInitial: '账',
    accountLoading: !DEMO_MODE,
    accountError: DEMO_MODE ? '演示模式不包含登录账户' : '',
    loggingOut: false,
  },
  lifetimes: {
    attached() {
      attachedWorkspaceComponents.add(this)
      if (!DEMO_MODE) {
        getCurrentUser()
          .then((currentUser) => {
            this.setData({
              currentUser,
              accountInitial: getAccountInitial(currentUser),
              accountLoading: false,
              accountError: '',
            }, () => this.loadActiveListOnce())
          })
          .catch((error: Error) => {
            if (error instanceof ServerClientError && error.statusCode === 401) {
              wx.reLaunch({ url: '/pages/login/login' })
              return
            }
            this.setData({
              accountLoading: false,
              accountError: error.message || '账户信息加载失败',
            })
            showTopToast({ title: error.message || '会话检查失败', icon: 'none' })
          })
      }
    },
    detached() {
      attachedWorkspaceComponents.delete(this)
      clearRecognitionStageTimers(this)
      this.stopAllRecognitionProgress()
    },
  },
  methods: {
    onNavigationHeightChange(event: NavigationHeightChangeEvent) {
      const navigationBarHeight = Number(event.detail.height)
      if (!Number.isFinite(navigationBarHeight) || navigationBarHeight <= 0) return
      if (this.data.navigationBarHeight === navigationBarHeight) return
      this.setData({ navigationBarHeight })
    },
    loadAccountUser() {
      if (DEMO_MODE || this.data.accountLoading) return
      this.setData({ accountLoading: true, accountError: '' })
      getCurrentUser()
        .then((currentUser) => {
          this.setData({
            currentUser,
            accountInitial: getAccountInitial(currentUser),
            accountLoading: false,
            accountError: '',
          })
        })
        .catch((error: Error) => {
          if (error instanceof ServerClientError && error.statusCode === 401) {
            wx.reLaunch({ url: '/pages/login/login' })
            return
          }
          this.setData({
            accountLoading: false,
            accountError: error.message || '账户信息加载失败',
          })
        })
    },
    confirmLogout() {
      if (this.data.loggingOut) return
      wx.showModal({
        title: '退出登录',
        content: '退出后需要重新登录，是否继续？',
        confirmText: '退出',
        confirmColor: '#b93d49',
        success: (result) => {
          if (!result.confirm) return
          this.setData({ loggingOut: true })
          logout()
            .catch(() => undefined)
            .finally(() => {
              this.setData({ loggingOut: false })
              wx.reLaunch({ url: '/pages/login/login' })
            })
        },
      })
    },
    loadHistory(): Promise<void> {
      if (this.data.historyLoading) {
        return historyListRequests.get(this) ?? Promise.resolve()
      }
      const requestId = this.data.historyRequestId + 1
      const local = loadInspectionHistory()
      this.setData({
        historyRecords: this.data.historyRecords.length > 0
          ? this.data.historyRecords
          : mergeInspectionHistory(local, []),
        historyLoading: true,
        historyInitialized: true,
        historyError: '',
        historyRequestId: requestId,
      })
      const request = listInspectionHistory()
        .then((data) => {
          if (this.data.historyRequestId !== requestId) return
          const historyRecords = mergeInspectionHistory(loadInspectionHistory(), data.items)
          const historyChanged = !hasSameListData(this.data.historyRecords, historyRecords)
          if (!historyChanged && !this.data.historyError) return
          this.setData({
            ...(historyChanged ? { historyRecords } : {}),
            historyError: '',
          })
        })
        .catch((error: Error) => {
          if (this.data.historyRequestId !== requestId) return
          this.setData({
            historyRecords: this.data.historyRecords.length > 0
              ? this.data.historyRecords
              : mergeInspectionHistory(loadInspectionHistory(), []),
            historyError: `服务器记录加载失败：${error.message || '请稍后重试'}`,
          })
        })
        .finally(() => {
          if (this.data.historyRequestId === requestId) {
            this.setData({ historyLoading: false })
          }
          if (historyListRequests.get(this) === request) {
            historyListRequests.delete(this)
          }
        })
      historyListRequests.set(this, request)
      return request
    },
    loadActiveListOnce() {
      if (this.data.accountLoading) return
      if (this.data.activeTab === 'tasks' && !this.data.taskInitialized) {
        void this.loadTasks(true)
      }
      if (this.data.activeTab === 'history' && !this.data.historyInitialized) {
        void this.loadHistory()
      }
    },
    onListPullDownRefresh() {
      if (this.data.activeTab === 'tasks') {
        if (this.data.taskPullRefreshing) return
        this.setData({
          taskPullRefreshing: true,
        })
        void keepPullRefreshVisible(this.loadTasks(true, true)).finally(() => {
          this.setData({ taskPullRefreshing: false })
        })
        return
      }
      if (this.data.activeTab === 'history') {
        if (this.data.historyPullRefreshing) return
        this.setData({
          historyPullRefreshing: true,
        })
        void keepPullRefreshVisible(this.loadHistory()).finally(() => {
          this.setData({ historyPullRefreshing: false })
        })
      }
    },
    onListPulling() {
      if (this.data.activeTab === 'tasks' && !this.data.taskPulling) {
        this.setData({ taskPulling: true })
        return
      }
      if (this.data.activeTab === 'history' && !this.data.historyPulling) {
        this.setData({ historyPulling: true })
      }
    },
    onListPullRefreshRestore() {
      const updates: Record<string, boolean> = {}
      if (this.data.taskPulling) updates.taskPulling = false
      if (this.data.historyPulling) updates.historyPulling = false
      if (Object.keys(updates).length > 0) this.setData(updates)
    },
    activateTab(activeTab: WorkspaceTab) {
      const tabChanged = activeTab !== this.data.activeTab
      this.setData({
        activeTab,
        ...(tabChanged ? { workspaceScrollTop: 1 } : {}),
        ...(activeTab === 'scan'
          ? { selectedTaskId: 0, selectedItemId: 0 }
          : {}),
      }, () => {
        if (!tabChanged) {
          this.loadActiveListOnce()
          return
        }
        this.setData({ workspaceScrollTop: 0 }, () => this.loadActiveListOnce())
      })
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
    loadTasks(reset = false, preserveLoadedPages = false): Promise<void> {
      const resetList = reset === true
      const search = this.data.taskAppliedSearch.trim()
      const status = this.data.taskStatus
      const queryKey = JSON.stringify([status, search])
      const queryChanged = queryKey !== this.data.taskLoadedQueryKey
      if (
        this.data.taskLoading
        && (!resetList || queryKey === this.data.taskLoadingQueryKey)
      ) {
        return taskListRequests.get(this) ?? Promise.resolve()
      }
      if (!resetList && this.data.taskItems.length >= this.data.taskTotal) return Promise.resolve()

      const page = resetList ? 1 : this.data.taskPage
      const requestId = this.data.taskRequestId + 1
      this.setData({
        taskLoading: true,
        taskLoadingQueryKey: queryKey,
        ...(resetList ? { taskInitialized: true } : {}),
        taskRequestId: requestId,
        ...(resetList && queryChanged ? {
          taskItems: [],
          taskPage: 1,
          taskTotal: 0,
          selectedTaskId: 0,
          selectedItemId: 0,
        } : {}),
      })
      const request = listInspectionTasks({
        page,
        pageSize: TASK_PAGE_SIZE,
        search: search || undefined,
        status: status === 'all' ? undefined : status,
        sourceType: 'all',
        compact: true,
      })
        .then((data) => {
          if (this.data.taskRequestId !== requestId) return
          const currentQueryKey = JSON.stringify([
            this.data.taskStatus,
            this.data.taskAppliedSearch.trim(),
          ])
          if (currentQueryKey !== queryKey) {
            return
          }
          const keepCurrentPages = resetList && preserveLoadedPages && !queryChanged
          const taskItems = keepCurrentPages
            ? mergeRefreshedTaskPage(this.data.taskItems, data.items, data.total)
            : resetList
              ? data.items
              : appendTaskPage(this.data.taskItems, data.items, data.total)
          const taskPage = keepCurrentPages
            ? Math.max(this.data.taskPage, page + 1)
            : page + 1
          const itemsChanged = !hasSameListData(this.data.taskItems, taskItems)
          const updates: Record<string, unknown> = {}
          if (itemsChanged) updates.taskItems = taskItems
          if (this.data.taskTotal !== data.total) updates.taskTotal = data.total
          if (this.data.taskPage !== taskPage) updates.taskPage = taskPage
          if (resetList && this.data.taskLoadedQueryKey !== queryKey) {
            updates.taskLoadedQueryKey = queryKey
          }
          if (Object.keys(updates).length > 0) this.setData(updates)
        })
        .catch((error: Error) => {
          if (this.data.taskRequestId !== requestId) return
          showTopToast({ title: error.message || '待检任务加载失败', icon: 'none' })
        })
        .finally(() => {
          if (this.data.taskRequestId !== requestId) return
          this.setData({
            taskLoading: false,
            taskLoadingQueryKey: '',
          })
          if (taskListRequests.get(this) === request) {
            taskListRequests.delete(this)
          }
        })
      taskListRequests.set(this, request)
      return request
    },
    loadMoreTasks() {
      if (this.data.activeTab === 'tasks') this.loadTasks(false)
    },
    onTaskSearchInput(event: WechatMiniprogram.Input) {
      this.setData({ taskSearch: event.detail.value })
    },
    confirmTaskSearch() {
      const taskAppliedSearch = this.data.taskSearch.trim()
      if (taskAppliedSearch === this.data.taskAppliedSearch) return
      this.setData({ taskAppliedSearch }, () => this.loadTasks(true))
    },
    changeTaskStatus(event: WechatMiniprogram.TouchEvent) {
      const taskStatus = String(event.currentTarget.dataset.status || 'pending')
      if (taskStatus === this.data.taskStatus) return
      this.setData({ taskStatus }, () => this.loadTasks(true))
    },
    openTask(event: WechatMiniprogram.TouchEvent) {
      const taskId = Number(event.currentTarget.dataset.id)
      if (!taskId) return
      const requestId = this.data.taskOpenRequestId + 1
      if (this.data.selectedTaskId === taskId) {
        this.setData({
          selectedTaskId: 0,
          selectedItemId: 0,
          taskOpenRequestId: requestId,
          taskOpeningId: 0,
        })
        return
      }
      this.setData({
        selectedTaskId: taskId,
        selectedItemId: 0,
        taskOpenRequestId: requestId,
        taskOpeningId: taskId,
      })
      getInspectionTask(taskId, true)
        .then((task) => {
          if (this.data.taskOpenRequestId !== requestId || this.data.selectedTaskId !== taskId) return
          this.setData({
            taskItems: this.data.taskItems.map((item) => (
              item.id === task.id ? task : item
            )),
          })
        })
        .catch((error: Error) => {
          if (this.data.taskOpenRequestId !== requestId || this.data.selectedTaskId !== taskId) return
          showTopToast({ title: error.message || '线上产品同步失败，已显示当前列表', icon: 'none' })
        })
        .finally(() => {
          if (this.data.taskOpenRequestId === requestId) this.setData({ taskOpeningId: 0 })
        })
    },
    selectTaskItem(event: WechatMiniprogram.TouchEvent) {
      const taskId = Number(event.currentTarget.dataset.taskId)
      const itemId = Number(event.currentTarget.dataset.itemId)
      if (!taskId || !itemId) return
      this.openWorkbenchModal(taskId, itemId)
    },
    previewTaskItemPhoto(event: WechatMiniprogram.TouchEvent) {
      const taskId = Number(event.currentTarget.dataset.taskId)
      const itemId = Number(event.currentTarget.dataset.itemId)
      const current = String(event.currentTarget.dataset.url || '')
      const task = this.data.taskItems.find((item) => item.id === taskId)
      const item = task?.items?.find((candidate) => candidate.id === itemId)
      const urls = item?.preview_images || []
      if (!current || urls.length === 0) return
      wx.previewImage({ current, urls })
    },
    openWorkbenchModal(taskId: number, itemId: number) {
      this.setData({
        selectedItemId: itemId,
        workbenchModalVisible: true,
        workbenchModalTaskId: taskId,
        workbenchModalItemId: itemId,
      })
    },
    closeWorkbenchModal() {
      this.setData({
        workbenchModalVisible: false,
        workbenchModalTaskId: 0,
        workbenchModalItemId: 0,
      })
    },
    onWorkbenchSaved() {},
    onHistoryEditorSaved(result: StoredInspectionRecord) {
      if (
        result.syncStatus === 'synced'
        && result.taskId
        && result.itemId
      ) {
        this.setData({
          taskItems: applyInspectionDateToTaskItems(
            this.data.taskItems,
            result.taskId,
            result.itemId,
            result.record.inspectionDate,
          ),
        })
      }
      this.setData({
        historyRecords: upsertHistoryRecord(this.data.historyRecords, result),
      })
      showTopToast({
        title: result.syncStatus === 'synced'
          ? '记录已更新并同步'
          : result.syncError || '已本地保存，未同步',
        icon: 'none',
      })
    },
    onHistoryEditorModalSaved(
      event: WechatMiniprogram.CustomEvent<HistoryEditorSavedPayload>,
    ) {
      this.onHistoryEditorSaved(event.detail.record)
    },
    syncHistoryRecord(record: StoredInspectionRecord): Promise<StoredInspectionRecord> {
      return syncInspectionHistoryRecord(record).then((synced) => {
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
        .then((result) => {
          this.setData({
            historyRecords: upsertHistoryRecord(this.data.historyRecords, result),
          })
          showTopToast({
            title: result.syncStatus === 'synced'
              ? '同步成功'
              : result.syncError || '同步失败，请重试',
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
          showTopToast({ title: 'JSON已生成', icon: 'none' })
        })
        .catch((error: Error) => {
          showTopToast({
            message: error.message || '导出失败，请重试',
            type: 'error',
            duration: 3600,
          })
        })
        .finally(() => this.setData({ exporting: false }))
    },
    takePhoto() {
      const remaining = MAX_RECOGNITION_QUEUE_SIZE - this.data.recognitionQueueStats.total
      if (remaining <= 0) {
        showTopToast({ title: '识别队列最多保留 10 张图片', icon: 'none' })
        return
      }
      wx.navigateTo({
        url: '/pages/document-camera/document-camera',
        events: {
          documentPhotoConfirmed: ({ tempFilePath }: { tempFilePath?: string }) => {
            if (tempFilePath) this.enqueueRecognitionFiles([tempFilePath])
          },
        },
        fail: () => {
          showTopToast({ title: '无法打开相机，请稍后重试', icon: 'none' })
        },
      })
    },
    chooseFromAlbum() {
      this.chooseImage(['album'])
    },
    chooseImage(sourceType: Array<'album' | 'camera'>) {
      const remaining = MAX_RECOGNITION_QUEUE_SIZE - this.data.recognitionQueueStats.total
      if (remaining <= 0) {
        showTopToast({ title: '识别队列最多保留 10 张图片', icon: 'none' })
        return
      }
      wx.chooseMedia({
        count: sourceType.includes('album') ? Math.min(9, remaining) : 1,
        mediaType: ['image'],
        sourceType,
        sizeType: ['original'],
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
        if (!attachedWorkspaceComponents.has(this)) {
          this.stopRecognitionProgress(id)
          return
        }
        const queueIndex = this.data.recognitionQueue.findIndex((item) => item.id === id)
        const current = this.data.recognitionQueue[queueIndex]
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
        if (progress === current.progress) {
          if (progress >= current.progressProfile.tailCeiling) this.stopRecognitionProgress(id)
          return
        }
        const progressPath = `recognitionQueue[${queueIndex}].progress`
        this.setData({ [progressPath]: progress })
        if (progress >= current.progressProfile.tailCeiling) this.stopRecognitionProgress(id)
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
      if (!attachedWorkspaceComponents.has(this)) return
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
      if (!attachedWorkspaceComponents.has(this)) return
      const next = this.data.recognitionQueue.find((item) => item.id === id)
      if (!next || next.status !== 'preparing') return
      this.startRecognitionProgress(id)
      scheduleRecognitionStage(this, () => {
        const current = this.data.recognitionQueue.find((item) => item.id === id)
        if (!current || current.status !== 'preparing') return
        const recognizingQueue = markQueueItemRecognizing(this.data.recognitionQueue, id)
        this.applyRecognitionQueue(recognizingQueue)
      })
      recognizeInspection(next.imagePath)
        .then((result) => {
          if (!attachedWorkspaceComponents.has(this)) return
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
          void this.autoWriteQueueRecognition(id, recognizedRecord, next.imagePath)
        })
        .catch((error: Error) => {
          if (!attachedWorkspaceComponents.has(this)) return
          const failed = failQueueItem(
            this.data.recognitionQueue,
            id,
            error.message || '识别失败',
          )
          this.applyRecognitionQueue(failed)
        })
        .finally(() => {
          this.stopRecognitionProgress(id)
          if (attachedWorkspaceComponents.has(this)) this.runRecognitionQueue()
        })
    },
    async autoWriteQueueRecognition(
      id: string,
      record: InspectionRecord,
      imagePath: string,
    ) {
      try {
        const matched = await autoWriteRecognizedInspectionToPendingItem(record, imagePath)
        if (!attachedWorkspaceComponents.has(this)) return
        const current = this.data.recognitionQueue.find((item) => item.id === id)
        if (!current || current.status !== 'ready') return
        if (matched.status === 'matched' && matched.task && matched.item) {
          const taskPrefill = taskItemToInspectionRecord(matched.task, matched.item)
          this.applyRecognitionQueue(updateQueueItem(this.data.recognitionQueue, id, {
            sourceType: 'purchase_order',
            taskId: matched.task.id,
            itemId: matched.item.id,
            taskPrefill,
            stage: '已写入待检产品，可直接进入',
          }))
          if (this.data.reviewQueueItemId === id) {
            this.setData({
              selectedTaskId: matched.task.id,
              selectedItemId: matched.item.id,
            })
          }
          return
        }
        let stage = '识别完成，请手动选择待检产品'
        switch (matched.status) {
          case 'missing_order_number': stage = '识别完成，未识别到合同号'; break
          case 'order_not_found': stage = '识别完成，未匹配到合同号对应的质检订单'; break
          case 'order_ambiguous': stage = '识别完成，合同号对应多个质检订单，请手动选择'; break
          case 'item_not_found': stage = '识别完成，质检订单中没有待检产品'; break
          case 'item_ambiguous': stage = '识别完成，质检订单内产品无法唯一匹配，请手动选择'; break
        }
        this.applyRecognitionQueue(updateQueueItem(this.data.recognitionQueue, id, { stage }))
      } catch (error) {
        if (!attachedWorkspaceComponents.has(this)) return
        const current = this.data.recognitionQueue.find((item) => item.id === id)
        if (!current || current.status !== 'ready') return
        const message = error instanceof Error && error.message
          ? error.message
          : '自动写入失败'
        this.applyRecognitionQueue(updateQueueItem(this.data.recognitionQueue, id, {
          stage: `识别完成，自动写入失败：${message}`,
        }))
      }
    },
    jumpToMatchedInspection(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const item = this.data.recognitionQueue.find((candidate) => candidate.id === id)
      if (!item?.taskId || !item.itemId) return
      this.openWorkbenchModal(item.taskId, item.itemId)
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
        fail: () => showTopToast({ title: '本地图片已失效', icon: 'none' }),
      })
    },
    openHistory(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const selected = this.data.historyRecords.find((item) => item.id === id)
      if (!selected || this.data.historyEditorVisible) return
      if (selected.origin === 'local' && !loadInspectionHistory().some((item) => item.id === id)) {
        this.setData({
          historyRecords: this.data.historyRecords.filter((item) => item.id !== id),
        })
        showTopToast({ title: '记录已不存在，已从列表移除', icon: 'none' })
        return
      }
      if (selected.origin === 'remote' && (!selected.taskId || !selected.itemId)) return
      this.setData({
        historyEditorVisible: true,
        historyEditorOrigin: selected.origin,
        historyEditorId: selected.id,
        historyEditorSourceType: selected.sourceType,
        historyEditorTaskId: selected.taskId || 0,
        historyEditorItemId: selected.itemId || 0,
      })
    },
    closeHistoryEditorModal() {
      this.setData({
        historyEditorVisible: false,
        historyEditorOrigin: 'local',
        historyEditorId: '',
        historyEditorSourceType: 'standalone',
        historyEditorTaskId: 0,
        historyEditorItemId: 0,
      })
    },
    noop() {},
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
            .then(() => {
              this.setData({
                historyRecords: this.data.historyRecords.filter((item) => (
                  isRemote
                    ? item.taskId !== selected.taskId || item.itemId !== selected.itemId
                    : item.id !== id
                )),
              })
              showTopToast({ title: '已删除', icon: 'success' })
            })
            .catch((error: Error) => {
              showTopToast({
                message: error.message || '删除失败，请稍后重试',
                type: 'error',
                duration: 3600,
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
      const value = event.detail.value
      this.setData({
        [`record.${String(field)}`]: value,
        reviewHints: markReviewHintReviewed(this.data.reviewHints, `record.${String(field)}`),
      })
      return value
    },
    onRowInput(event: WechatMiniprogram.Input) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const field = event.currentTarget.dataset.field as InspectionRowField
      const value = event.detail.value
      this.setData({
        [`record.rows[${rowIndex}].${field}`]: value,
        reviewHints: markReviewHintReviewed(
          this.data.reviewHints,
          `rows.${rowIndex}.${field}`,
        ),
      })
      return value
    },
    onMeasurementInput(event: WechatMiniprogram.Input) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const measurementIndex = Number(event.currentTarget.dataset.measurementIndex)
      const value = event.detail.value
      this.setData({
        [`record.rows[${rowIndex}].measurements[${measurementIndex}]`]: value,
        reviewHints: markReviewHintReviewed(
          this.data.reviewHints,
          `rows.${rowIndex}.measurements.${measurementIndex}`,
        ),
      })
      return value
    },
    onJudgementChange(event: WechatMiniprogram.CustomEvent<{ value: boolean }>) {
      const sampleIndex = Number(event.currentTarget.dataset.sampleIndex)
      const judgement = event.detail.value ? 'OK' : 'NG'
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
        showTopToast({ title: `请完善${missing[0]}`, icon: 'none' })
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
            historyRecords: upsertHistoryRecord(this.data.historyRecords, stored),
          })
          if (stored.syncStatus !== 'synced' && stored.syncError) {
            showTopToast({
              title: stored.syncError,
              icon: 'none',
              duration: 2800,
            })
          }
        })
        .catch((error: Error) => {
          showTopToast({
            message: error.message || '保存失败，请重试',
            type: 'error',
            duration: 3600,
          })
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
