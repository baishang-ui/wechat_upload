export const WORKSPACE_TABS = ['scan', 'tasks', 'history', 'account'] as const

export type WorkspaceTab = typeof WORKSPACE_TABS[number]
export type TabVisualColors = Record<WorkspaceTab, string>
export type TabDragDirection = 'left' | 'right'

export const TAB_SWIPE_STEP_PX = 78
export const TAB_SWIPE_SWITCH_THRESHOLD_PX = 56
export const TAB_SWIPE_ACTIVATION_PX = 6
export const TAB_BUTTON_WIDTH_PX = 74
export const TAB_DRAG_MAX_STRETCH_PX = 20
export const TAB_DRAG_RESISTANCE = 2.4
export const TAB_DRAG_FEEDBACK_RATIO = .4
export const TAB_DRAG_MIN_SCALE_Y = .86
const INACTIVE_TAB_COLOR = [113, 113, 122] as const
const COVERED_TAB_COLOR = [24, 24, 27] as const
export const DARK_INACTIVE_TAB_COLOR = [161, 161, 170] as const

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function getTabIndex(tab: WorkspaceTab): number {
  return WORKSPACE_TABS.indexOf(tab)
}

export function getTabIndicatorOffset(tab: WorkspaceTab): number {
  return getTabIndex(tab) * TAB_SWIPE_STEP_PX
}

export function isHorizontalTabSwipe(deltaX: number, deltaY: number): boolean {
  return Math.abs(deltaX) >= TAB_SWIPE_ACTIVATION_PX
    && Math.abs(deltaX) > Math.abs(deltaY)
}

export function resolveTabDragDirection(
  movementX: number,
  currentDirection: TabDragDirection,
): TabDragDirection {
  if (Math.abs(movementX) <= .5) return currentDirection
  return movementX < 0 ? 'left' : 'right'
}

export function shouldContinueTabSettleRoute(
  currentTab: WorkspaceTab,
  targetTab: WorkspaceTab,
  currentDirection: TabDragDirection,
  nextDirection: TabDragDirection,
  settling: boolean,
): boolean {
  if (!settling || currentDirection !== nextDirection) return false
  const currentOffset = getTabIndicatorOffset(currentTab)
  const targetOffset = getTabIndicatorOffset(targetTab)
  return nextDirection === 'right'
    ? targetOffset > currentOffset
    : targetOffset < currentOffset
}

export function getTabDragStretch(deltaX: number): number {
  const progress = clamp(Math.abs(deltaX) / TAB_SWIPE_STEP_PX, 0, 1)
  const resistedProgress = 1 - (1 - progress) ** TAB_DRAG_RESISTANCE
  const stretch = TAB_DRAG_MAX_STRETCH_PX
    * TAB_DRAG_FEEDBACK_RATIO
    * resistedProgress
  return Math.round(stretch * 10) / 10
}

export function getTabSwitchStretch(deltaX: number): number {
  const progress = clamp(Math.abs(deltaX) / TAB_SWIPE_STEP_PX, 0, 1)
  const resistedProgress = 1 - (1 - progress) ** TAB_DRAG_RESISTANCE
  const stretch = TAB_DRAG_MAX_STRETCH_PX * resistedProgress
  return Math.round(stretch * 10) / 10
}

export function getTabDragScaleY(stretch: number): number {
  const stretchProgress = clamp(
    Math.abs(stretch) / TAB_DRAG_MAX_STRETCH_PX,
    0,
    1,
  )
  const scale = 1 - (1 - TAB_DRAG_MIN_SCALE_Y) * stretchProgress
  return Math.round(scale * 1000) / 1000
}

export interface ContinuousTabDragResult {
  targetTab: WorkspaceTab
  consumedX: number
  remainingX: number
}

export function resolveContinuousTabDrag(
  activeTab: WorkspaceTab,
  deltaX: number,
): ContinuousTabDragResult {
  const direction = deltaX < 0 ? -1 : 1
  const distance = Math.abs(deltaX)
  const requestedSteps = distance < TAB_SWIPE_SWITCH_THRESHOLD_PX
    ? 0
    : 1 + Math.floor(
      (distance - TAB_SWIPE_SWITCH_THRESHOLD_PX) / TAB_SWIPE_STEP_PX,
    )
  const activeIndex = getTabIndex(activeTab)
  const availableSteps = direction < 0
    ? activeIndex
    : WORKSPACE_TABS.length - 1 - activeIndex
  const crossedSteps = Math.min(requestedSteps, availableSteps)
  const consumedX = crossedSteps === 0
    ? 0
    : direction * crossedSteps * TAB_SWIPE_STEP_PX
  return {
    targetTab: WORKSPACE_TABS[activeIndex + direction * crossedSteps],
    consumedX,
    remainingX: deltaX - consumedX,
  }
}

export function resolveReachedTab(
  activeTab: WorkspaceTab,
  deltaX: number,
): WorkspaceTab {
  if (Math.abs(deltaX) < TAB_SWIPE_SWITCH_THRESHOLD_PX) return activeTab
  const direction = deltaX < 0 ? -1 : 1
  const targetIndex = clamp(
    getTabIndex(activeTab) + direction,
    0,
    WORKSPACE_TABS.length - 1,
  )
  return WORKSPACE_TABS[targetIndex]
}

function mixColor(
  coverage: number,
  inactiveColor: readonly [number, number, number],
): string {
  const smoothedCoverage = coverage * coverage * (3 - 2 * coverage)
  const channels = inactiveColor.map((channel, index) => Math.round(
    channel + (COVERED_TAB_COLOR[index] - channel) * smoothedCoverage,
  ))
  return `rgb(${channels.join(', ')})`
}

export function getTabVisualColors(
  indicatorOffset: number,
  inactiveColor: readonly [number, number, number] = INACTIVE_TAB_COLOR,
): TabVisualColors {
  const colorFor = (tab: WorkspaceTab): string => {
    const distance = Math.abs(getTabIndicatorOffset(tab) - indicatorOffset)
    const coverage = clamp(1 - distance / TAB_BUTTON_WIDTH_PX, 0, 1)
    return mixColor(coverage, inactiveColor)
  }
  return {
    scan: colorFor('scan'),
    tasks: colorFor('tasks'),
    history: colorFor('history'),
    account: colorFor('account'),
  }
}
