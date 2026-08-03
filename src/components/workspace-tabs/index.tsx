import { Text, View } from '@tarojs/components'
import type { BaseEventOrig, ITouchEvent } from '@tarojs/components/types/common'
import type { CSSProperties } from 'react'
import { useEffect, useRef, useState } from 'react'

import {
  getTabDragScaleY,
  getTabDragStretch,
  getTabIndicatorOffset,
  getTabSwitchStretch,
  getTabVisualColors,
  isHorizontalTabSwipe,
  resolveContinuousTabDrag,
  resolveTabDragDirection,
  TAB_SWIPE_STEP_PX,
  type TabDragDirection,
  type WorkspaceTab,
  WORKSPACE_TABS,
} from '@legacy/domain/tab-swipe'

import { Icon } from '@/ui/icon'

import './index.scss'

const SETTLE_DURATION_MS = 420

const labels: Record<WorkspaceTab, string> = {
  scan: '识别',
  tasks: '待检',
  history: '记录',
  account: '账户',
}

interface GestureState {
  startX: number
  startY: number
  latestX: number
  currentTab: WorkspaceTab
  direction: TabDragDirection
  dragging: boolean
  suppressClick: boolean
}

interface WorkspaceTabsProps {
  activeTab: WorkspaceTab
  onChange: (tab: WorkspaceTab) => void
}

interface IndicatorStyle extends CSSProperties {
  '--tab-stretch': string
  '--tab-stretch-offset': string
  '--tab-scale-y': number
}

function asTouchEvent(event: BaseEventOrig): ITouchEvent {
  // Taro View 将触摸回调声明成 BaseEventOrig，但运行时仍提供标准 touches。
  return event as ITouchEvent
}

export function WorkspaceTabs({ activeTab, onChange }: WorkspaceTabsProps) {
  const [indicatorOffset, setIndicatorOffset] = useState(getTabIndicatorOffset(activeTab))
  const [stretch, setStretch] = useState(0)
  const [scaleY, setScaleY] = useState(1)
  const [direction, setDirection] = useState<TabDragDirection>('right')
  const [dragging, setDragging] = useState(false)
  const [settling, setSettling] = useState(false)
  const [routeCycle, setRouteCycle] = useState(0)
  const gestureRef = useRef<GestureState | null>(null)
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => () => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
  }, [])

  useEffect(() => {
    if (!dragging) setIndicatorOffset(getTabIndicatorOffset(activeTab))
  }, [activeTab, dragging])

  const settleTo = (
    targetTab: WorkspaceTab,
    nextDirection: TabDragDirection,
    distance = TAB_SWIPE_STEP_PX,
  ): void => {
    if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
    const preStretch = getTabDragStretch(distance)
    setDirection(nextDirection)
    setStretch(preStretch)
    setScaleY(getTabDragScaleY(preStretch))
    setDragging(false)
    setSettling(true)
    setRouteCycle((cycle) => cycle + 1)
    setIndicatorOffset(getTabIndicatorOffset(targetTab))
    onChange(targetTab)
    settleTimerRef.current = setTimeout(() => {
      setStretch(0)
      setScaleY(1)
      setSettling(false)
      settleTimerRef.current = null
    }, SETTLE_DURATION_MS)
  }

  const selectTab = (targetTab: WorkspaceTab): void => {
    const gesture = gestureRef.current
    if (gesture?.suppressClick) {
      gesture.suppressClick = false
      return
    }
    if (targetTab === activeTab) return
    const nextDirection = getTabIndicatorOffset(targetTab) < getTabIndicatorOffset(activeTab)
      ? 'left'
      : 'right'
    const distance = Math.abs(getTabIndicatorOffset(targetTab) - getTabIndicatorOffset(activeTab))
    settleTo(targetTab, nextDirection, distance)
  }

  const startGesture = (event: ITouchEvent): void => {
    const touch = event.touches[0]
    if (!touch) return
    gestureRef.current = {
      startX: touch.clientX,
      startY: touch.clientY,
      latestX: touch.clientX,
      currentTab: activeTab,
      direction,
      dragging: false,
      suppressClick: false,
    }
  }

  const moveGesture = (event: ITouchEvent): void => {
    const gesture = gestureRef.current
    const touch = event.touches[0]
    if (!gesture || !touch) return
    const deltaX = touch.clientX - gesture.startX
    const deltaY = touch.clientY - gesture.startY
    if (!gesture.dragging && !isHorizontalTabSwipe(deltaX, deltaY)) return
    const movementX = touch.clientX - gesture.latestX
    gesture.direction = resolveTabDragDirection(movementX || deltaX, gesture.direction)
    gesture.latestX = touch.clientX
    gesture.dragging = true
    gesture.suppressClick = true

    const dragResult = resolveContinuousTabDrag(gesture.currentTab, deltaX)
    if (dragResult.targetTab !== gesture.currentTab) {
      gesture.currentTab = dragResult.targetTab
      gesture.startX += dragResult.consumedX
      settleTo(dragResult.targetTab, gesture.direction, deltaX)
    }

    const remainingX = dragResult.remainingX
    const dragStretch = getTabDragStretch(remainingX)
    const resistedOffset = getTabIndicatorOffset(gesture.currentTab) + remainingX * .18
    setDirection(gesture.direction)
    setDragging(true)
    setSettling(false)
    setStretch(dragStretch)
    setScaleY(getTabDragScaleY(dragStretch))
    setIndicatorOffset(resistedOffset)
  }

  const endGesture = (): void => {
    const gesture = gestureRef.current
    if (!gesture) return
    if (gesture.dragging) {
      const targetTab = gesture.currentTab
      setDragging(false)
      setSettling(true)
      setRouteCycle((cycle) => cycle + 1)
      setStretch(getTabSwitchStretch(0))
      setScaleY(1)
      setIndicatorOffset(getTabIndicatorOffset(targetTab))
      if (settleTimerRef.current) clearTimeout(settleTimerRef.current)
      settleTimerRef.current = setTimeout(() => {
        setSettling(false)
        settleTimerRef.current = null
      }, SETTLE_DURATION_MS)
    }
  }

  const colors = getTabVisualColors(indicatorOffset)
  const indicatorStyle: IndicatorStyle = {
    transform: `translate3d(${indicatorOffset}px, 0, 0)`,
    '--tab-stretch': `${stretch}px`,
    '--tab-stretch-offset': direction === 'left' ? `${-stretch}px` : '0px',
    '--tab-scale-y': scaleY,
  }

  return (
    <View
      className={`workspace-tabs ${dragging ? 'is-dragging' : ''} ${settling ? `is-settling is-${direction}` : ''}`}
      onTouchStart={(event) => startGesture(asTouchEvent(event))}
      onTouchMove={(event) => moveGesture(asTouchEvent(event))}
      onTouchEnd={endGesture}
      onTouchCancel={endGesture}
    >
      <View className='workspace-tabs__track'>
        <View className='workspace-tabs__indicator' style={indicatorStyle}>
          <View
            key={`${direction}-${routeCycle % 2}`}
            className={`workspace-tabs__indicator-fill route-${routeCycle % 2}`}
          />
        </View>
        {WORKSPACE_TABS.map((tab) => (
          <View
            key={tab}
            className='workspace-tabs__button'
            style={{ color: colors[tab] }}
            role='button'
            aria-label={labels[tab]}
            onClick={() => selectTab(tab)}
          >
            <Icon name={tab} size={20} />
            <Text className='workspace-tabs__label'>{labels[tab]}</Text>
          </View>
        ))}
      </View>
    </View>
  )
}
