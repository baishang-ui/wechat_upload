import {
  partitionTopToastStack,
  subscribeTopToast,
  TopToastEvent,
  TopToastType,
} from '../../services/top-toast-service'

type ToastPhase = 'entering' | 'visible' | 'leaving'

interface ActiveToast extends TopToastEvent {
  phase: ToastPhase
}

interface ToastViewItem {
  key: string
  mode: 'expanded' | 'stacked'
  id: number
  message: string
  type: TopToastType
  phase: ToastPhase
  icon: string
  title: string
  offset: number
  scale: number
  zIndex: number
}

interface ToastTimers {
  revealTimer?: ReturnType<typeof setTimeout>
  dismissTimer?: ReturnType<typeof setTimeout>
  removeTimer?: ReturnType<typeof setTimeout>
}

interface ToastRuntime {
  unsubscribe: () => void
  activeToasts: ActiveToast[]
  timers: Map<number, ToastTimers>
}

const TOAST_REVEAL_DELAY_MS = 32
const TOAST_REMOVE_DELAY_MS = 420
const TOAST_HEIGHT_RPX = 96
const TOAST_SHADOW_VERTICAL_GUTTER_RPX = 96
const TOAST_OUTER_HEIGHT_RPX = TOAST_HEIGHT_RPX + TOAST_SHADOW_VERTICAL_GUTTER_RPX
const TOAST_SLOT_STEP_RPX = 108
const STACKED_TOAST_OFFSET_RPX = 14
const MIN_STACKED_TOAST_SCALE = .9
const toastRuntimes = new WeakMap<object, ToastRuntime>()

function clearToastTimers(timers: ToastTimers): void {
  if (timers.revealTimer) clearTimeout(timers.revealTimer)
  if (timers.dismissTimer) clearTimeout(timers.dismissTimer)
  if (timers.removeTimer) clearTimeout(timers.removeTimer)
}

function clearRuntimeTimers(runtime: ToastRuntime): void {
  runtime.timers.forEach(clearToastTimers)
  runtime.timers.clear()
}

function toastPresentation(type: TopToastType): { icon: string; title: string } {
  if (type === 'success') return { icon: 'check', title: '操作成功' }
  if (type === 'error') return { icon: 'exclamation-circle', title: '操作失败' }
  if (type === 'warning') return { icon: 'exclamation-triangle', title: '请注意' }
  return { icon: 'information-circle', title: '提示' }
}

Component({
  options: {
    virtualHost: true,
  },

  data: {
    items: [] as ToastViewItem[],
    stackHeight: 0,
    topOffset: 56,
  },

  lifetimes: {
    attached() {
      let topOffset = 56
      try {
        const menuButton = wx.getMenuButtonBoundingClientRect()
        topOffset = Math.max(12, menuButton.bottom + 8)
      } catch {
        try {
          topOffset = Math.max(12, (wx.getWindowInfo().statusBarHeight || 0) + 12)
        } catch {
          topOffset = 56
        }
      }
      this.setData({ topOffset })

      const runtime: ToastRuntime = {
        unsubscribe: () => undefined,
        activeToasts: [],
        timers: new Map(),
      }
      toastRuntimes.set(this, runtime)
      runtime.unsubscribe = subscribeTopToast((event: TopToastEvent) => {
        const toast: ActiveToast = { ...event, phase: 'entering' }
        runtime.activeToasts.push(toast)

        const timers: ToastTimers = {}
        runtime.timers.set(event.id, timers)
        this.syncToastStack(() => {
          timers.revealTimer = setTimeout(() => {
            const activeToast = runtime.activeToasts.find((item) => item.id === event.id)
            if (!activeToast || activeToast.phase !== 'entering') return
            activeToast.phase = 'visible'
            this.syncToastStack()
          }, TOAST_REVEAL_DELAY_MS)
        })
        timers.dismissTimer = setTimeout(() => {
          this.dismissToastById(event.id)
        }, event.duration)
      })
    },

    detached() {
      const runtime = toastRuntimes.get(this)
      if (!runtime) return
      clearRuntimeTimers(runtime)
      runtime.unsubscribe()
      toastRuntimes.delete(this)
    },
  },

  methods: {
    syncToastStack(onSynced?: () => void) {
      const runtime = toastRuntimes.get(this)
      if (!runtime) return
      const { expanded, stacked } = partitionTopToastStack(runtime.activeToasts)
      const orderedToasts = [...expanded, ...stacked]
      const items: ToastViewItem[] = orderedToasts.map((event, index) => {
        const toast = event as ActiveToast
        const presentation = toastPresentation(toast.type)
        const isStacked = index >= 2
        const stackedDepth = Math.max(0, index - 1)
        return {
          key: `toast-${toast.id}`,
          mode: isStacked ? 'stacked' : 'expanded',
          id: toast.id,
          message: toast.message,
          type: toast.type,
          phase: toast.phase,
          icon: presentation.icon,
          title: presentation.title,
          offset: isStacked
            ? TOAST_SLOT_STEP_RPX + (stackedDepth * STACKED_TOAST_OFFSET_RPX)
            : index * TOAST_SLOT_STEP_RPX,
          scale: isStacked
            ? Math.max(MIN_STACKED_TOAST_SCALE, 1 - (stackedDepth * .025))
            : 1,
          zIndex: orderedToasts.length - index,
        }
      })

      const stackHeight = orderedToasts.length === 0
        ? 0
        : orderedToasts.length <= 2
          ? ((orderedToasts.length - 1) * TOAST_SLOT_STEP_RPX) + TOAST_OUTER_HEIGHT_RPX
          : TOAST_SLOT_STEP_RPX
            + ((orderedToasts.length - 2) * STACKED_TOAST_OFFSET_RPX)
            + TOAST_OUTER_HEIGHT_RPX
      this.setData({
        items,
        stackHeight,
      }, onSynced)
    },

    dismissToast(event: WechatMiniprogram.TouchEvent) {
      this.dismissToastById(Number(event.currentTarget.dataset.id))
    },

    dismissToastById(id: number) {
      if (!Number.isFinite(id)) return
      const runtime = toastRuntimes.get(this)
      if (!runtime) return
      const toast = runtime.activeToasts.find((item) => item.id === id)
      if (!toast || toast.phase === 'leaving') return

      const timers = runtime.timers.get(id) || {}
      if (timers.revealTimer) clearTimeout(timers.revealTimer)
      if (timers.dismissTimer) clearTimeout(timers.dismissTimer)
      timers.revealTimer = undefined
      timers.dismissTimer = undefined
      toast.phase = 'leaving'
      this.syncToastStack()

      timers.removeTimer = setTimeout(() => {
        runtime.activeToasts = runtime.activeToasts.filter((item) => item.id !== id)
        runtime.timers.delete(id)
        this.syncToastStack()
      }, TOAST_REMOVE_DELAY_MS)
      runtime.timers.set(id, timers)
    },
  },
})
