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
  getTabDragScaleY,
  getTabDragStretch,
  getTabIndicatorOffset,
  getTabSwitchStretch,
  getTabVisualColors,
  isHorizontalTabSwipe,
  resolveContinuousTabDrag,
  resolveTabDragDirection,
  shouldContinueTabSettleRoute,
  TabDragDirection,
  TAB_SWIPE_ACTIVATION_PX,
  TAB_SWIPE_STEP_PX,
  WorkspaceTab,
  DARK_INACTIVE_TAB_COLOR,
} from '../../domain/tab-swipe'
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
  hydrateMissingHistoryImages,
  listInspectionHistory,
  listInspectionTasks,
  materializeHistoryCardImages,
  mergeInspectionHistory,
  QualityInspectionTaskDto,
  TASK_PAGE_SIZE,
  taskItemToInspectionRecord,
} from '../../services/quality-inspection-service'
import {
  buildUiThemePresentation,
  UiPreferences,
  UiThemeColor,
  UiThemeMode,
  UI_THEME_COLORS,
  UI_THEME_MODES,
} from '../../domain/ui-preferences'
import {
  loadUiPreferences,
  saveUiPreferences,
} from '../../services/ui-preferences-service'
import { pullRefreshRotationForDistance } from '../../domain/pull-refresh'

interface NavigationHeightChangeEvent {
  detail: { height: number }
}

interface HistoryEditorSavedPayload {
  record: StoredInspectionRecord
}

interface WorkbenchSavedPayload {
  taskId: number
  itemId: number
  closing?: boolean
}

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
const tabSettleTimers = new WeakMap<object, ReturnType<typeof setTimeout>>()
const workbenchRefreshTimers = new WeakMap<object, ReturnType<typeof setTimeout>>()
const workbenchRefreshTargets = new WeakMap<object, WorkbenchSavedPayload>()
const workbenchRefreshInFlight = new WeakSet<object>()
const taskCardOverlayCleanupTimers = new WeakMap<object, ReturnType<typeof setTimeout>>()
const TAB_SETTLE_DURATION_MS = 400
const WORKBENCH_REFRESH_DEBOUNCE_MS = 600
const TASK_CARD_OVERLAY_DURATION_MS = 460
const HISTORY_IMAGE_BATCH_SIZE = 4
const HISTORY_IMAGE_BATCH_DELAY_MS = 24
const initialUiPreferences = loadUiPreferences()

function createUiThemeData(preferences: UiPreferences) {
  const presentation = buildUiThemePresentation(preferences)
  return {
    uiPreferences: preferences,
    uiThemeColorLabel: UI_THEME_COLORS.find((option) => option.value === preferences.color)?.label || '雾蓝',
    uiThemePageStyle: presentation.pageStyle,
    uiNavigationTextColor: presentation.navigationTextColor,
    uiNavigationBackground: presentation.navigationBackground,
    uiRefresherBackground: presentation.refresherBackground,
  }
}

function getThemedTabVisualColors(
  indicatorOffset: number,
  mode: UiThemeMode,
) {
  return getTabVisualColors(
    indicatorOffset,
    mode === 'dark' ? DARK_INACTIVE_TAB_COLOR : undefined,
  )
}

function deferHistoryCardImages(
  items: HistoryViewItem[],
  existing: HistoryViewItem[] = [],
): HistoryViewItem[] {
  const existingById = new Map(existing.map((item) => [item.id, item]))
  return items.map((item) => {
    const current = existingById.get(item.id)
    if (current?.imagePaths.length) {
      return {
        ...item,
        imagePath: current.imagePath,
        imagePaths: current.imagePaths,
      }
    }
    if (item.imagePaths.length === 0) return item
    return {
      ...item,
      imagePath: '',
      imagePaths: [],
    }
  })
}

function waitForHistoryImageTurn(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, HISTORY_IMAGE_BATCH_DELAY_MS)
  })
}

interface TabSwipeGesture {
  startX: number
  startY: number
  latestX: number
  direction: TabDragDirection
  dragging: boolean
  cancelled: boolean
  suppressNextTap: boolean
}

const tabSwipeGestures = new WeakMap<object, TabSwipeGesture>()

interface TabSettleMetrics {
  preStretch: number
  peakStretch: number
  preScaleY: number
  peakScaleY: number
}

function getTabSettleMetrics(deltaX: number): TabSettleMetrics {
  const preStretch = getTabDragStretch(deltaX)
  const peakStretch = getTabSwitchStretch(deltaX)
  return {
    preStretch,
    peakStretch,
    preScaleY: getTabDragScaleY(preStretch),
    peakScaleY: getTabDragScaleY(peakStretch),
  }
}

function clearTabSettleTimer(component: object): void {
  const timer = tabSettleTimers.get(component)
  if (timer) clearTimeout(timer)
  tabSettleTimers.delete(component)
}

function clearWorkbenchRefreshTimer(component: object): void {
  const timer = workbenchRefreshTimers.get(component)
  if (timer) clearTimeout(timer)
  workbenchRefreshTimers.delete(component)
}

function disposeWorkbenchRefresh(component: object): void {
  clearWorkbenchRefreshTimer(component)
  workbenchRefreshTargets.delete(component)
  workbenchRefreshInFlight.delete(component)
}

function clearTaskCardOverlayCleanupTimer(component: object): void {
  const timer = taskCardOverlayCleanupTimers.get(component)
  if (timer) clearTimeout(timer)
  taskCardOverlayCleanupTimers.delete(component)
}

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
    navigationBarHeight: 99,
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
    pullRefreshRotation: 0,
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
    tabDragging: false,
    tabDragDirection: 'right' as TabDragDirection,
    tabDragStretch: 0,
    tabDragStretchOffset: 0,
    tabDragScaleY: 1,
    tabSettling: false,
    tabSettlingDirection: 'right' as TabDragDirection,
    tabSettleInitialStretch: 0,
    tabSettlePreStretch: 0,
    tabSettlePeakStretch: 0,
    tabSettleInitialScaleY: 1,
    tabSettlePreScaleY: 1,
    tabSettlePeakScaleY: 1,
    tabIndicatorOffset: 0,
    tabVisualColors: getThemedTabVisualColors(0, initialUiPreferences.mode),
    workspaceScrollTop: 0,
    workspaceScrollWithAnimation: false,
    activeTask: null as QualityInspectionTaskDto | null,
    taskCardOverlayVisible: false,
    taskCardOverlayOpen: false,
    taskCardOverlayClosing: false,
    taskCardOverlayId: 0,
    taskCardOverlayTargetLeft: 0,
    taskCardOverlayTargetTop: 0,
    taskCardOverlayTargetWidth: 0,
    taskCardOverlayTargetHeight: 0,
    taskCardOverlayOriginLeft: 0,
    taskCardOverlayOriginTop: 0,
    taskCardOverlayOriginWidth: 0,
    taskCardOverlayOriginHeight: 0,
    currentUser: null as AuthUser | null,
    accountInitial: '账',
    accountLoading: !DEMO_MODE,
    accountError: DEMO_MODE ? '演示模式不包含登录账户' : '',
    loggingOut: false,
    uiThemeModes: UI_THEME_MODES,
    uiThemeColors: UI_THEME_COLORS,
    ...createUiThemeData(initialUiPreferences),
  },
  lifetimes: {
    attached() {
      attachedWorkspaceComponents.add(this)
      this.setData(createUiThemeData(loadUiPreferences()))
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
      tabSwipeGestures.delete(this)
      clearTabSettleTimer(this)
      disposeWorkbenchRefresh(this)
      clearTaskCardOverlayCleanupTimer(this)
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
    selectUiThemeMode(event: WechatMiniprogram.TouchEvent) {
      const mode = String(event.currentTarget.dataset.mode || '') as UiThemeMode
      if (!UI_THEME_MODES.some((option) => option.value === mode)) return
      const nextPreferences: UiPreferences = {
        ...this.data.uiPreferences,
        mode,
      }
      if (nextPreferences.mode === this.data.uiPreferences.mode) return
      this.setData({
        ...createUiThemeData(nextPreferences),
        tabVisualColors: getThemedTabVisualColors(
          this.data.tabIndicatorOffset,
          nextPreferences.mode,
        ),
      })
      try {
        saveUiPreferences(nextPreferences)
      } catch {
        showTopToast({ title: '主题设置保存失败', icon: 'none' })
      }
    },
    selectUiThemeColor(event: WechatMiniprogram.TouchEvent) {
      const color = String(event.currentTarget.dataset.color || '') as UiThemeColor
      if (!UI_THEME_COLORS.some((option) => option.value === color)) return
      const nextPreferences: UiPreferences = {
        ...this.data.uiPreferences,
        color,
      }
      if (nextPreferences.color === this.data.uiPreferences.color) return
      this.setData(createUiThemeData(nextPreferences))
      try {
        saveUiPreferences(nextPreferences)
      } catch {
        showTopToast({ title: '主题设置保存失败', icon: 'none' })
      }
    },
    loadHistory(): Promise<void> {
      if (this.data.historyLoading) {
        return historyListRequests.get(this) ?? Promise.resolve()
      }
      const requestId = this.data.historyRequestId + 1
      const local = loadInspectionHistory()
      const localRecords = mergeInspectionHistory(local, [])
      this.setData({
        historyRecords: this.data.historyRecords.length > 0
          ? this.data.historyRecords
          : deferHistoryCardImages(localRecords),
        historyLoading: true,
        historyInitialized: true,
        historyError: '',
        historyRequestId: requestId,
      })
      const request = listInspectionHistory()
        .then((data) => {
          if (this.data.historyRequestId !== requestId) return
          const historyRecords = mergeInspectionHistory(
            loadInspectionHistory(),
            data.items,
          )
          const deferredRecords = deferHistoryCardImages(
            historyRecords,
            this.data.historyRecords,
          )
          const historyChanged = !hasSameListData(this.data.historyRecords, deferredRecords)
          if (historyChanged || this.data.historyError) {
            this.setData({
              ...(historyChanged ? { historyRecords: deferredRecords } : {}),
              historyError: '',
            })
          }
          void this.loadHistoryImagesInBackground(historyRecords, requestId)
        })
        .catch((error: Error) => {
          if (this.data.historyRequestId !== requestId) return
          const fallbackRecords = mergeInspectionHistory(loadInspectionHistory(), [])
          this.setData({
            historyRecords: this.data.historyRecords.length > 0
              ? this.data.historyRecords
              : deferHistoryCardImages(fallbackRecords),
            historyError: `服务器记录加载失败：${error.message || '请稍后重试'}`,
          })
          void this.loadHistoryImagesInBackground(fallbackRecords, requestId)
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
    async loadHistoryImagesInBackground(
      historyRecords: HistoryViewItem[],
      requestId: number,
    ): Promise<void> {
      for (let index = 0; index < historyRecords.length; index += HISTORY_IMAGE_BATCH_SIZE) {
        await waitForHistoryImageTurn()
        if (
          !attachedWorkspaceComponents.has(this)
          || this.data.historyRequestId !== requestId
        ) return
        const batch = historyRecords.slice(index, index + HISTORY_IMAGE_BATCH_SIZE)
        const materialized = await materializeHistoryCardImages(batch)
        if (
          !attachedWorkspaceComponents.has(this)
          || this.data.historyRequestId !== requestId
        ) return
        const materializedById = new Map(materialized.map((item) => [item.id, item]))
        const nextRecords = this.data.historyRecords.map((item) => {
          const loaded = materializedById.get(item.id)
          if (!loaded || hasSameListData(item.imagePaths, loaded.imagePaths)) return item
          return {
            ...item,
            imagePath: loaded.imagePath,
            imagePaths: loaded.imagePaths,
          }
        })
        if (!hasSameListData(this.data.historyRecords, nextRecords)) {
          this.setData({ historyRecords: nextRecords })
        }
      }

      if (
        !attachedWorkspaceComponents.has(this)
        || this.data.historyRequestId !== requestId
      ) return
      const hydratedRecords = await hydrateMissingHistoryImages(this.data.historyRecords)
      if (
        !attachedWorkspaceComponents.has(this)
        || this.data.historyRequestId !== requestId
      ) return
      const hydratedById = new Map(hydratedRecords.map((item) => [item.id, item]))
      const nextRecords = this.data.historyRecords.map((item) => {
        const hydrated = hydratedById.get(item.id)
        if (!hydrated || !hydrated.imageSummaryComplete) return item
        if (
          item.imageSummaryComplete
          && item.imageCount === hydrated.imageCount
          && hasSameListData(item.imagePaths, hydrated.imagePaths)
        ) return item
        return {
          ...item,
          imagePath: hydrated.imagePath,
          imagePaths: hydrated.imagePaths,
          imageCount: hydrated.imageCount,
          imageSummaryComplete: true,
        }
      })
      if (!hasSameListData(this.data.historyRecords, nextRecords)) {
        this.setData({ historyRecords: nextRecords })
      }
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
    onListPulling(event: WechatMiniprogram.CustomEvent<{ dy?: number }>) {
      const rotation = pullRefreshRotationForDistance(event.detail.dy || 0)
      const rotationChanged = rotation !== this.data.pullRefreshRotation
      if (this.data.activeTab === 'tasks') {
        if (rotationChanged || !this.data.taskPulling) {
          this.setData({ taskPulling: true, pullRefreshRotation: rotation })
        }
        return
      }
      if (this.data.activeTab === 'history' && (rotationChanged || !this.data.historyPulling)) {
        this.setData({ historyPulling: true, pullRefreshRotation: rotation })
      }
    },
    onListPullRefreshRestore() {
      const updates: Record<string, boolean | number> = {}
      if (this.data.taskPulling) updates.taskPulling = false
      if (this.data.historyPulling) updates.historyPulling = false
      if (this.data.pullRefreshRotation !== 0) updates.pullRefreshRotation = 0
      if (Object.keys(updates).length > 0) this.setData(updates)
    },
    activateTab(
      activeTab: WorkspaceTab,
      settlingDirection: TabDragDirection | '' = '',
      settlingMetrics?: TabSettleMetrics,
      settlingInitialStretch = 0,
      settlingInitialScaleY = 1,
    ) {
      const tabChanged = activeTab !== this.data.activeTab
      const tabIndicatorOffset = getTabIndicatorOffset(activeTab)
      const shouldSettle = tabChanged
        && settlingDirection !== ''
        && settlingMetrics !== undefined
      const taskOverlayReset = activeTab !== 'tasks'
        ? {
          activeTask: null,
          taskCardOverlayVisible: false,
          taskCardOverlayOpen: false,
          taskCardOverlayClosing: false,
          taskCardOverlayId: 0,
        }
        : {}
      if (activeTab !== 'tasks') clearTaskCardOverlayCleanupTimer(this)
      const continuesCurrentRoute = shouldSettle
        && shouldContinueTabSettleRoute(
          this.data.activeTab,
          activeTab,
          this.data.tabSettlingDirection,
          settlingDirection,
          this.data.tabSettling,
        )
      if (continuesCurrentRoute) {
        this.setData({
          activeTab,
          pressedTab: '',
          tabDragging: false,
          tabDragStretch: 0,
          tabDragStretchOffset: 0,
          tabDragScaleY: 1,
          tabIndicatorOffset,
          tabVisualColors: getThemedTabVisualColors(tabIndicatorOffset, this.data.uiPreferences.mode),
          workspaceScrollTop: 1,
          ...(activeTab === 'scan'
            ? { selectedTaskId: 0, selectedItemId: 0 }
            : {}),
          ...taskOverlayReset,
        }, () => {
          this.setData({ workspaceScrollTop: 0 }, () => this.loadActiveListOnce())
        })
        return
      }
      const finishActivation = () => {
        if (!tabChanged) {
          this.loadActiveListOnce()
          return
        }
        this.setData({ workspaceScrollTop: 0 }, () => this.loadActiveListOnce())
      }
      clearTabSettleTimer(this)
      this.setData({
        activeTab,
        pressedTab: '',
        tabDragging: false,
        tabDragDirection: settlingDirection || 'right',
        tabDragStretch: 0,
        tabDragStretchOffset: 0,
        tabDragScaleY: 1,
        tabSettling: false,
        tabSettlingDirection: settlingDirection || 'right',
        tabSettleInitialStretch: shouldSettle ? settlingInitialStretch : 0,
        tabSettlePreStretch: shouldSettle ? settlingMetrics.preStretch : 0,
        tabSettlePeakStretch: shouldSettle ? settlingMetrics.peakStretch : 0,
        tabSettleInitialScaleY: shouldSettle ? settlingInitialScaleY : 1,
        tabSettlePreScaleY: shouldSettle ? settlingMetrics.preScaleY : 1,
        tabSettlePeakScaleY: shouldSettle ? settlingMetrics.peakScaleY : 1,
        tabIndicatorOffset,
        tabVisualColors: getThemedTabVisualColors(tabIndicatorOffset, this.data.uiPreferences.mode),
        ...(tabChanged ? { workspaceScrollTop: 1 } : {}),
        ...(activeTab === 'scan'
          ? { selectedTaskId: 0, selectedItemId: 0 }
          : {}),
        ...taskOverlayReset,
      }, () => {
        if (shouldSettle) {
          this.setData({ tabSettling: true }, () => {
            const timer = setTimeout(() => {
              tabSettleTimers.delete(this)
              if (attachedWorkspaceComponents.has(this)) {
                this.setData({
                  tabSettling: false,
                  tabSettleInitialStretch: 0,
                  tabSettlePreStretch: 0,
                  tabSettlePeakStretch: 0,
                  tabSettleInitialScaleY: 1,
                  tabSettlePreScaleY: 1,
                  tabSettlePeakScaleY: 1,
                })
              }
            }, TAB_SETTLE_DURATION_MS)
            tabSettleTimers.set(this, timer)
            finishActivation()
          })
          return
        }
        finishActivation()
      })
    },
    switchTab(event: WechatMiniprogram.TouchEvent) {
      const gesture = tabSwipeGestures.get(this)
      if (gesture?.suppressNextTap) {
        tabSwipeGestures.delete(this)
        return
      }
      const targetTab = event.currentTarget.dataset.tab as WorkspaceTab
      if (targetTab === this.data.activeTab) {
        this.activateTab(targetTab)
        return
      }
      const direction: TabDragDirection = getTabIndicatorOffset(targetTab)
        < getTabIndicatorOffset(this.data.activeTab)
        ? 'left'
        : 'right'
      const deltaX = direction === 'left' ? -TAB_SWIPE_STEP_PX : TAB_SWIPE_STEP_PX
      const settleMetrics = getTabSettleMetrics(deltaX)
      this.activateTab(targetTab, direction, settleMetrics)
    },
    onTabPressEnd() {
      this.setData({ pressedTab: '' })
    },
    onTabSwipeStart(event: WechatMiniprogram.TouchEvent) {
      const touch = event.touches[0]
      if (!touch) return
      const touchedTab = event.currentTarget.dataset.tab as WorkspaceTab
      if (touchedTab !== this.data.activeTab) {
        tabSwipeGestures.delete(this)
        this.setData({ pressedTab: '' })
        return
      }
      clearTabSettleTimer(this)
      this.setData({
        pressedTab: touchedTab,
        tabSettling: false,
        tabSettleInitialStretch: 0,
        tabSettlePreStretch: 0,
        tabSettlePeakStretch: 0,
        tabSettleInitialScaleY: 1,
        tabSettlePreScaleY: 1,
        tabSettlePeakScaleY: 1,
      })
      tabSwipeGestures.set(this, {
        startX: touch.clientX,
        startY: touch.clientY,
        latestX: touch.clientX,
        direction: 'right',
        dragging: false,
        cancelled: false,
        suppressNextTap: false,
      })
    },
    onTabSwipeMove(event: WechatMiniprogram.TouchEvent) {
      const gesture = tabSwipeGestures.get(this)
      const touch = event.touches[0]
      if (!gesture || !touch || gesture.cancelled) return
      const deltaX = touch.clientX - gesture.startX
      const deltaY = touch.clientY - gesture.startY
      if (!gesture.dragging) {
        if (
          Math.abs(deltaY) >= TAB_SWIPE_ACTIVATION_PX
          && Math.abs(deltaY) >= Math.abs(deltaX)
        ) {
          gesture.cancelled = true
          const offset = getTabIndicatorOffset(this.data.activeTab)
          this.setData({
            pressedTab: '',
            tabDragging: false,
            tabDragDirection: gesture.direction,
            tabDragStretch: 0,
            tabDragStretchOffset: 0,
            tabIndicatorOffset: offset,
            tabVisualColors: getThemedTabVisualColors(offset, this.data.uiPreferences.mode),
          })
          return
        }
        if (!isHorizontalTabSwipe(deltaX, deltaY)) return
        gesture.dragging = true
      }
      const movementX = touch.clientX - gesture.latestX
      gesture.direction = resolveTabDragDirection(movementX || deltaX, gesture.direction)
      gesture.latestX = touch.clientX
      const dragResult = resolveContinuousTabDrag(this.data.activeTab, deltaX)
      if (dragResult.targetTab !== this.data.activeTab) {
        const settleMetrics = getTabSettleMetrics(deltaX)
        gesture.startX += dragResult.consumedX
        gesture.suppressNextTap = true
        this.activateTab(
          dragResult.targetTab,
          gesture.direction,
          settleMetrics,
          settleMetrics.preStretch,
          settleMetrics.preScaleY,
        )
        return
      }
      const tabIndicatorOffset = getTabIndicatorOffset(this.data.activeTab)
      const tabDragStretch = getTabDragStretch(deltaX)
      this.setData({
        pressedTab: '',
        tabDragging: true,
        tabDragDirection: gesture.direction,
        tabDragStretch,
        tabDragStretchOffset: gesture.direction === 'left' ? -tabDragStretch : 0,
        tabDragScaleY: getTabDragScaleY(tabDragStretch),
        tabIndicatorOffset,
        tabVisualColors: getThemedTabVisualColors(tabIndicatorOffset, this.data.uiPreferences.mode),
      })
    },
    onTabSwipeEnd() {
      const gesture = tabSwipeGestures.get(this)
      if (!gesture) return
      if (!gesture.dragging || gesture.cancelled) {
        tabSwipeGestures.delete(this)
        const offset = getTabIndicatorOffset(this.data.activeTab)
        this.setData({
          pressedTab: '',
          tabDragging: false,
          tabDragDirection: gesture.direction,
          tabDragStretch: 0,
          tabDragStretchOffset: 0,
          tabDragScaleY: 1,
          tabIndicatorOffset: offset,
          tabVisualColors: getThemedTabVisualColors(offset, this.data.uiPreferences.mode),
        })
        return
      }
      gesture.suppressNextTap = true
      const offset = getTabIndicatorOffset(this.data.activeTab)
      this.setData({
        pressedTab: '',
        tabDragging: false,
        tabDragDirection: gesture.direction,
        tabDragStretch: 0,
        tabDragStretchOffset: 0,
        tabDragScaleY: 1,
        tabIndicatorOffset: offset,
        tabVisualColors: getThemedTabVisualColors(offset, this.data.uiPreferences.mode),
      })
    },
    onTabSwipeCancel() {
      tabSwipeGestures.delete(this)
      const offset = getTabIndicatorOffset(this.data.activeTab)
      this.setData({
        pressedTab: '',
        tabDragging: false,
        tabDragDirection: 'right',
        tabDragStretch: 0,
        tabDragStretchOffset: 0,
        tabDragScaleY: 1,
        tabIndicatorOffset: offset,
        tabVisualColors: getThemedTabVisualColors(offset, this.data.uiPreferences.mode),
      })
    },
    goToScan() {
      this.activateTab('scan')
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
      if (this.data.taskCardOverlayVisible
        && this.data.taskCardOverlayId === taskId
        && !this.data.taskCardOverlayClosing) {
        this.closeTaskCardOverlay()
        return
      }

      const startOpening = () => {
        this.setData({
          taskOpenRequestId: requestId,
          taskOpeningId: taskId,
        }, () => this.measureTaskCardOverlay(taskId, requestId))
      }

      clearTaskCardOverlayCleanupTimer(this)
      if (this.data.taskCardOverlayVisible) {
        this.setData({
          taskCardOverlayVisible: false,
          taskCardOverlayOpen: false,
          taskCardOverlayClosing: false,
          taskCardOverlayId: 0,
          activeTask: null,
        }, startOpening)
      } else {
        startOpening()
      }

      getInspectionTask(taskId, true)
        .then((task) => {
          if (this.data.taskOpenRequestId !== requestId) return
          this.setData({
            taskItems: this.data.taskItems.map((item) => (
              item.id === task.id ? task : item
            )),
            ...(this.data.taskCardOverlayId === task.id
              ? { activeTask: task }
              : {}),
          })
        })
        .catch((error: Error) => {
          if (this.data.taskOpenRequestId !== requestId) return
          showTopToast({ title: error.message || '线上产品同步失败，已显示当前列表', icon: 'none' })
        })
        .finally(() => {
          if (this.data.taskOpenRequestId === requestId) this.setData({ taskOpeningId: 0 })
        })
    },
    measureTaskCardOverlay(taskId: number, requestId: number) {
      wx.createSelectorQuery()
        .in(this)
        .select(`#task-card-${taskId}`)
        .boundingClientRect((rect) => {
          if (!rect || this.data.taskOpenRequestId !== requestId) return
          const task = this.data.taskItems.find((item) => item.id === taskId)
          if (!task) return
          const windowInfo = wx.getSystemInfoSync()
          const targetLeft = windowInfo.windowWidth * 32 / 750
          const targetTop = this.data.navigationBarHeight + targetLeft
          const targetWidth = Math.max(rect.width, windowInfo.windowWidth - targetLeft * 2)
          const safeAreaBottom = windowInfo.safeArea?.bottom || windowInfo.windowHeight
          const targetHeight = Math.max(
            rect.height,
            safeAreaBottom - targetTop - targetLeft,
          )
          this.setData({
            activeTask: task,
            taskCardOverlayVisible: true,
            taskCardOverlayOpen: false,
            taskCardOverlayClosing: false,
            taskCardOverlayId: taskId,
            taskCardOverlayTargetLeft: targetLeft,
            taskCardOverlayTargetTop: targetTop,
            taskCardOverlayTargetWidth: targetWidth,
            taskCardOverlayTargetHeight: targetHeight,
            taskCardOverlayOriginLeft: rect.left,
            taskCardOverlayOriginTop: rect.top,
            taskCardOverlayOriginWidth: rect.width,
            taskCardOverlayOriginHeight: rect.height,
            selectedTaskId: taskId,
            selectedItemId: 0,
          }, () => {
            if (this.data.taskOpenRequestId !== requestId) return
            this.setData({ taskCardOverlayOpen: true })
          })
        })
        .exec()
    },
    closeTaskCardOverlay() {
      if (!this.data.taskCardOverlayVisible || this.data.taskCardOverlayClosing) return
      const requestId = this.data.taskOpenRequestId + 1
      this.setData({
        taskOpenRequestId: requestId,
        taskOpeningId: 0,
        selectedTaskId: 0,
        selectedItemId: 0,
        taskCardOverlayOpen: false,
        taskCardOverlayClosing: true,
      })
      clearTaskCardOverlayCleanupTimer(this)
      const timer = setTimeout(() => {
        taskCardOverlayCleanupTimers.delete(this)
        if (!attachedWorkspaceComponents.has(this)) return
        if (this.data.taskOpenRequestId !== requestId) return
        this.setData({
          activeTask: null,
          taskCardOverlayVisible: false,
          taskCardOverlayClosing: false,
          taskCardOverlayId: 0,
        })
      }, TASK_CARD_OVERLAY_DURATION_MS)
      taskCardOverlayCleanupTimers.set(this, timer)
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
    queueWorkbenchTaskRefresh(target: WorkbenchSavedPayload) {
      workbenchRefreshTargets.set(this, target)
      clearWorkbenchRefreshTimer(this)
      if (workbenchRefreshInFlight.has(this)) return
      const timer = setTimeout(() => {
        workbenchRefreshTimers.delete(this)
        if (!attachedWorkspaceComponents.has(this)) return
        void this.refreshQueuedWorkbenchTask()
      }, WORKBENCH_REFRESH_DEBOUNCE_MS)
      workbenchRefreshTimers.set(this, timer)
    },
    async refreshQueuedWorkbenchTask() {
      if (workbenchRefreshInFlight.has(this)) return
      const target = workbenchRefreshTargets.get(this)
      if (!target || !attachedWorkspaceComponents.has(this)) return
      workbenchRefreshTargets.delete(this)
      workbenchRefreshInFlight.add(this)
      try {
        const task = await getInspectionTask(target.taskId, true)
        if (!attachedWorkspaceComponents.has(this)) return
        if (!task.items?.some((item) => item.id === target.itemId)) {
          throw new Error('线上订单中未找到已保存产品')
        }
        this.setData({
          taskItems: this.data.taskItems.map((item) => (
            item.id === task.id ? task : item
          )),
        })
      } catch {
        if (attachedWorkspaceComponents.has(this)) {
          showTopToast({ title: '数据已保存，列表同步失败，请下拉刷新', icon: 'none' })
        }
      } finally {
        workbenchRefreshInFlight.delete(this)
        const nextTarget = workbenchRefreshTargets.get(this)
        if (nextTarget && attachedWorkspaceComponents.has(this)) {
          this.queueWorkbenchTaskRefresh(nextTarget)
        }
      }
    },
    onWorkbenchSaved(
      event: WechatMiniprogram.CustomEvent<WorkbenchSavedPayload>,
    ) {
      if (event.detail.closing) return
      const taskId = Number(event.detail.taskId)
      const itemId = Number(event.detail.itemId)
      if (!taskId || !itemId) return
      this.queueWorkbenchTaskRefresh({ taskId, itemId })
    },
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
