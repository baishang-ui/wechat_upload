import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import {
  getTabDragScaleY,
  getTabDragStretch,
  getTabIndicatorOffset,
  getTabVisualColors,
  getTabSwitchStretch,
  isHorizontalTabSwipe,
  resolveContinuousTabDrag,
  resolveReachedTab,
  resolveTabDragDirection,
  shouldContinueTabSettleRoute,
  TAB_DRAG_MAX_STRETCH_PX,
  TAB_DRAG_FEEDBACK_RATIO,
  TAB_DRAG_MIN_SCALE_Y,
  TAB_DRAG_RESISTANCE,
  TAB_SWIPE_STEP_PX,
  TAB_SWIPE_SWITCH_THRESHOLD_PX,
} from '../miniprogram/domain/tab-swipe'

test('tab indicator offsets follow the fixed button width and gap', () => {
  assert.equal(TAB_SWIPE_STEP_PX, 76)
  assert.equal(getTabIndicatorOffset('scan'), 0)
  assert.equal(getTabIndicatorOffset('tasks'), 76)
  assert.equal(getTabIndicatorOffset('history'), 152)
  assert.equal(getTabIndicatorOffset('account'), 228)
})

test('tab swipe activates only for a deliberate horizontal gesture', () => {
  assert.equal(isHorizontalTabSwipe(5, 0), false)
  assert.equal(isHorizontalTabSwipe(12, 15), false)
  assert.equal(isHorizontalTabSwipe(-12, 3), true)
})

test('tab switches shortly before the finger reaches the adjacent option', () => {
  assert.equal(TAB_SWIPE_SWITCH_THRESHOLD_PX, 54)
  assert.ok(TAB_SWIPE_SWITCH_THRESHOLD_PX < TAB_SWIPE_STEP_PX)
  assert.equal(
    resolveReachedTab('scan', TAB_SWIPE_SWITCH_THRESHOLD_PX - 1),
    'scan',
  )
  assert.equal(
    resolveReachedTab('scan', TAB_SWIPE_SWITCH_THRESHOLD_PX),
    'tasks',
  )
  assert.equal(
    resolveReachedTab('history', -TAB_SWIPE_SWITCH_THRESHOLD_PX),
    'tasks',
  )
})

test('one continuous drag crosses every reached option and retains partial travel', () => {
  assert.deepEqual(resolveContinuousTabDrag('scan', TAB_SWIPE_STEP_PX * 2 + 18), {
    targetTab: 'history',
    consumedX: TAB_SWIPE_STEP_PX * 2,
    remainingX: 18,
  })
  assert.deepEqual(resolveContinuousTabDrag('account', -TAB_SWIPE_STEP_PX * 2 - 12), {
    targetTab: 'tasks',
    consumedX: -TAB_SWIPE_STEP_PX * 2,
    remainingX: -12,
  })
})

test('continuous drag advances at an early first threshold then keeps button spacing', () => {
  assert.equal(
    resolveContinuousTabDrag('scan', TAB_SWIPE_SWITCH_THRESHOLD_PX - 1).targetTab,
    'scan',
  )
  assert.equal(
    resolveContinuousTabDrag('scan', TAB_SWIPE_SWITCH_THRESHOLD_PX).targetTab,
    'tasks',
  )
  assert.equal(
    resolveContinuousTabDrag(
      'scan',
      TAB_SWIPE_SWITCH_THRESHOLD_PX + TAB_SWIPE_STEP_PX - 1,
    ).targetTab,
    'tasks',
  )
  assert.equal(
    resolveContinuousTabDrag(
      'scan',
      TAB_SWIPE_SWITCH_THRESHOLD_PX + TAB_SWIPE_STEP_PX,
    ).targetTab,
    'history',
  )
})

test('continuous drag clamps at both ends of the tab bar', () => {
  assert.deepEqual(resolveContinuousTabDrag('scan', -TAB_SWIPE_STEP_PX * 2), {
    targetTab: 'scan',
    consumedX: 0,
    remainingX: -TAB_SWIPE_STEP_PX * 2,
  })
  assert.equal(
    resolveContinuousTabDrag('history', TAB_SWIPE_STEP_PX * 4).targetTab,
    'account',
  )
})

test('fast same-direction crossings extend the active route without restarting it', () => {
  assert.equal(
    shouldContinueTabSettleRoute('tasks', 'history', 'right', 'right', true),
    true,
  )
  assert.equal(
    shouldContinueTabSettleRoute('history', 'account', 'right', 'right', false),
    false,
  )
  assert.equal(
    shouldContinueTabSettleRoute('history', 'tasks', 'right', 'left', true),
    false,
  )
  assert.equal(
    shouldContinueTabSettleRoute('history', 'scan', 'left', 'left', true),
    true,
  )
})

test('tab text and icons brighten continuously as the indicator covers them', () => {
  assert.deepEqual(getTabVisualColors(0), {
    scan: 'rgb(255, 255, 255)',
    tasks: 'rgb(117, 130, 151)',
    history: 'rgb(117, 130, 151)',
    account: 'rgb(117, 130, 151)',
  })
  const halfway = getTabVisualColors(TAB_SWIPE_STEP_PX / 2)
  assert.equal(halfway.scan, halfway.tasks)
  assert.notEqual(halfway.scan, 'rgb(255, 255, 255)')
  assert.notEqual(halfway.scan, 'rgb(117, 130, 151)')
})

test('drag deformation follows the latest horizontal movement direction', () => {
  assert.equal(resolveTabDragDirection(-4, 'right'), 'left')
  assert.equal(resolveTabDragDirection(4, 'left'), 'right')
  assert.equal(resolveTabDragDirection(0.2, 'left'), 'left')
})

test('drag extension grows with distance and gains resistance near the next option', () => {
  const start = getTabDragStretch(0)
  const quarter = getTabDragStretch(TAB_SWIPE_STEP_PX / 4)
  const halfway = getTabDragStretch(TAB_SWIPE_STEP_PX / 2)
  const reached = getTabDragStretch(TAB_SWIPE_STEP_PX)
  assert.equal(start, 0)
  assert.ok(quarter > start)
  assert.ok(halfway > quarter)
  assert.ok(reached > halfway)
  assert.ok(reached - halfway < halfway - start)
  assert.equal(reached, getTabDragStretch(TAB_SWIPE_STEP_PX * 3))
  assert.equal(getTabDragStretch(-TAB_SWIPE_STEP_PX / 2), halfway)
  assert.equal(TAB_DRAG_MAX_STRETCH_PX, 20)
  assert.equal(TAB_DRAG_FEEDBACK_RATIO, .4)
  assert.equal(TAB_DRAG_RESISTANCE, 2.4)
})

test('finger feedback stays subtle while switching uses the full deformation', () => {
  const dragStretch = getTabDragStretch(TAB_SWIPE_STEP_PX)
  const switchStretch = getTabSwitchStretch(TAB_SWIPE_STEP_PX)
  assert.equal(dragStretch, TAB_DRAG_MAX_STRETCH_PX * TAB_DRAG_FEEDBACK_RATIO)
  assert.equal(switchStretch, TAB_DRAG_MAX_STRETCH_PX)
  assert.ok(switchStretch > dragStretch * 2)
})

test('button height shrinks in proportion to horizontal extension', () => {
  assert.equal(getTabDragScaleY(0), 1)
  assert.equal(getTabDragScaleY(TAB_DRAG_MAX_STRETCH_PX / 2), .93)
  assert.equal(getTabDragScaleY(TAB_DRAG_MAX_STRETCH_PX), TAB_DRAG_MIN_SCALE_Y)
  assert.equal(getTabDragScaleY(TAB_DRAG_MAX_STRETCH_PX * 3), TAB_DRAG_MIN_SCALE_Y)
})
