import {
  AutoCaptureSnapshot,
  createAutoCaptureSnapshot,
  createDocumentTrackingSnapshot,
  detectDocumentFrameFromRgba,
  DocumentCaptureMode,
  DocumentFrame,
  DocumentFrameState,
  DocumentTrackingSnapshot,
  updateAutoCapture,
  updateDocumentTracking,
} from '../../domain/document-framing'
import { getPhotoOrientationPlan } from '../../domain/photo-orientation'

interface ConfirmedPhotoPayload {
  tempFilePath?: string
}

interface CaptureModeEvent {
  currentTarget: {
    dataset: {
      mode?: DocumentCaptureMode
    }
  }
}

const SEARCH_DETECTION_INTERVAL_MS = 320
const TRACKING_DETECTION_INTERVAL_MS = 180
const PHOTO_ORIENTATION_CANVAS_ID = 'photo-orientation-canvas'

let cameraContext: WechatMiniprogram.CameraContext | null = null
let cameraFrameListener: WechatMiniprogram.CameraFrameListener | null = null
let trackingSnapshot: DocumentTrackingSnapshot = createDocumentTrackingSnapshot()
let autoCaptureSnapshot: AutoCaptureSnapshot = createAutoCaptureSnapshot()
let lastDetectionAt = 0
let detectionRunning = false
let captureRunning = false

function getImageInfo(source: string): Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: source,
      success: resolve,
      fail: reject,
    })
  })
}

function cancelAutoCapture(): void {
  autoCaptureSnapshot = createAutoCaptureSnapshot()
}

function resetDetection(): void {
  trackingSnapshot = createDocumentTrackingSnapshot()
  cancelAutoCapture()
  lastDetectionAt = 0
  detectionRunning = false
}

function stopFrameListener(): void {
  cameraFrameListener?.stop()
  cameraFrameListener = null
  detectionRunning = false
}

function frameStateFromTracking(snapshot: DocumentTrackingSnapshot): DocumentFrameState {
  if (snapshot.phase === 'ready') return 'ready'
  if (snapshot.phase === 'tracking') return 'aligning'
  return 'searching'
}

function frameMessage(
  snapshot: DocumentTrackingSnapshot,
  available: boolean,
  mode: DocumentCaptureMode,
  capture: AutoCaptureSnapshot,
): string {
  if (!available) return '当前设备不支持自动检测，请使用手动拍摄'
  if (snapshot.held) return '画面短暂受遮挡，请保持手机和报告稳定'
  if (capture.status === 'countdown') return `${capture.countdown} 秒后自动拍摄，移动报告可取消`
  if (snapshot.phase === 'ready') {
    return mode === 'auto' ? '画面已稳定，正在准备自动拍摄' : '画面已稳定，可手动拍摄'
  }
  if (snapshot.phase === 'tracking') return '正在判断画面稳定性，请保持手机平稳'
  return '请将检验报告完整放入固定取景框'
}

Component({
  data: {
    frameState: 'searching' as DocumentFrameState,
    frameMessage: '请将检验报告完整放入固定取景框',
    cameraAvailable: true,
    trackingAvailable: true,
    cameraError: '',
    previewPath: '',
    previewMessage: '',
    captureProcessing: false,
    captureMode: 'auto' as DocumentCaptureMode,
    pressedCaptureMode: '' as DocumentCaptureMode | '',
    autoCaptureStatus: 'idle',
    countdown: 0,
    shutterProgress: 0,
    trackingHeld: false,
    cameraViewportWidth: 1,
    cameraViewportHeight: 1,
    cameraTopInset: 24,
    cameraGuidanceTop: 102,
    cameraErrorTop: 144,
    orientationCanvasWidth: 1,
    orientationCanvasHeight: 1,
  },
  lifetimes: {
    ready() {
      const systemInfo = wx.getSystemInfoSync()
      const menuButtonRect = wx.getMenuButtonBoundingClientRect()
      const cameraViewportWidth = Math.max(1, systemInfo.windowWidth)
      const cameraViewportHeight = Math.round(cameraViewportWidth * 4 / 3)
      const cameraTopInset = Math.max(
        20,
        systemInfo.statusBarHeight || 0,
        menuButtonRect.top || 0,
      )
      this.setData({
        cameraViewportWidth,
        cameraViewportHeight,
        cameraTopInset,
        cameraGuidanceTop: cameraTopInset + 78,
        cameraErrorTop: cameraTopInset + 120,
      })
      cameraContext = wx.createCameraContext()
    },
    detached() {
      stopFrameListener()
      cancelAutoCapture()
      cameraContext = null
      captureRunning = false
      resetDetection()
    },
  },
  pageLifetimes: {
    show() {
      if (!this.data.previewPath) this.startFrameDetection()
    },
    hide() {
      stopFrameListener()
      cancelAutoCapture()
      this.setData({ autoCaptureStatus: 'idle', countdown: 0 })
    },
  },
  methods: {
    onCameraReady() {
      this.setData({
        cameraAvailable: true,
        trackingAvailable: wx.canIUse('CameraContext.onCameraFrame'),
        cameraError: '',
      })
      this.startFrameDetection()
    },
    onCameraError(event: WechatMiniprogram.CustomEvent) {
      stopFrameListener()
      resetDetection()
      const detail = event.detail as { errMsg?: string }
      this.setData({
        cameraAvailable: false,
        trackingAvailable: false,
        cameraError: detail?.errMsg || '无法打开相机，请确认已授权相机权限',
        frameState: 'searching',
        frameMessage: frameMessage(trackingSnapshot, false, 'manual', autoCaptureSnapshot),
        captureMode: 'manual',
        autoCaptureStatus: 'idle',
        countdown: 0,
        shutterProgress: 0,
      })
    },
    startFrameDetection() {
      if (
        !cameraContext
        || this.data.previewPath
        || cameraFrameListener
        || !wx.canIUse('CameraContext.onCameraFrame')
      ) {
        if (!wx.canIUse('CameraContext.onCameraFrame')) {
          cancelAutoCapture()
          this.setData({
            captureMode: 'manual',
            trackingAvailable: false,
            frameMessage: frameMessage(trackingSnapshot, false, 'manual', autoCaptureSnapshot),
          })
        }
        return
      }

      cameraFrameListener = cameraContext.onCameraFrame((cameraFrame) => {
        const now = Date.now()
        const interval = trackingSnapshot.phase === 'searching'
          ? SEARCH_DETECTION_INTERVAL_MS
          : TRACKING_DETECTION_INTERVAL_MS
        if (detectionRunning || now - lastDetectionAt < interval) return
        lastDetectionAt = now
        detectionRunning = true
        try {
          const detected = detectDocumentFrameFromRgba(
            new Uint8ClampedArray(cameraFrame.data),
            cameraFrame.width,
            cameraFrame.height,
          )
          this.applyDetection(detected, now)
        } catch {
          this.applyDetection(null, now)
        } finally {
          detectionRunning = false
        }
      })
      cameraFrameListener.start({
        fail: () => {
          stopFrameListener()
          cancelAutoCapture()
          this.setData({
            captureMode: 'manual',
            trackingAvailable: false,
            frameMessage: frameMessage(trackingSnapshot, false, 'manual', autoCaptureSnapshot),
          })
        },
      })
    },
    applyDetection(detected: DocumentFrame | null, now: number) {
      trackingSnapshot = updateDocumentTracking(trackingSnapshot, detected, now)
      autoCaptureSnapshot = updateAutoCapture(autoCaptureSnapshot, {
        mode: this.data.captureMode,
        trackingPhase: trackingSnapshot.phase,
        now,
        blocked: captureRunning || !this.data.cameraAvailable || !this.data.trackingAvailable,
      })
      const elapsed = autoCaptureSnapshot.startedAt === null
        ? 0
        : Math.max(0, now - autoCaptureSnapshot.startedAt)
      const shutterProgress = autoCaptureSnapshot.status === 'countdown'
        ? Math.max(0, 100 - elapsed / 10)
        : trackingSnapshot.stableProgress * 100
      const shouldCapture = autoCaptureSnapshot.shouldCapture
      this.setData({
        frameState: frameStateFromTracking(trackingSnapshot),
        frameMessage: frameMessage(
          trackingSnapshot,
          this.data.trackingAvailable,
          this.data.captureMode,
          autoCaptureSnapshot,
        ),
        autoCaptureStatus: autoCaptureSnapshot.status,
        countdown: autoCaptureSnapshot.countdown,
        shutterProgress: Number(shutterProgress.toFixed(1)),
        trackingHeld: trackingSnapshot.held,
      }, () => {
        if (shouldCapture) this.capturePhoto()
      })
    },
    onCaptureModePressStart(event: CaptureModeEvent) {
      const mode = event.currentTarget.dataset.mode
      this.setData({ pressedCaptureMode: mode === this.data.captureMode ? mode : '' })
    },
    onCaptureModePressEnd() {
      this.setData({ pressedCaptureMode: '' })
    },
    switchCaptureMode(event: CaptureModeEvent) {
      const mode = event.currentTarget.dataset.mode
      if (mode !== 'auto' && mode !== 'manual') return
      if (mode === 'auto' && !this.data.trackingAvailable) {
        wx.showToast({ title: '当前设备不支持自动拍摄', icon: 'none' })
        return
      }
      cancelAutoCapture()
      this.setData({
        captureMode: mode,
        pressedCaptureMode: '',
        autoCaptureStatus: 'idle',
        countdown: 0,
        shutterProgress: trackingSnapshot.stableProgress * 100,
        frameMessage: frameMessage(
          trackingSnapshot,
          this.data.trackingAvailable,
          mode,
          autoCaptureSnapshot,
        ),
      })
    },
    capturePhoto() {
      if (captureRunning || this.data.captureProcessing) return
      if (!cameraContext) {
        wx.showToast({ title: '相机正在准备，请稍后重试', icon: 'none' })
        return
      }
      captureRunning = true
      cancelAutoCapture()
      stopFrameListener()
      this.setData({
        captureProcessing: true,
        autoCaptureStatus: 'idle',
        countdown: 0,
      })
      cameraContext.takePhoto({
        quality: 'high',
        success: ({ tempImagePath }) => {
          this.preparePreview(tempImagePath)
        },
        fail: () => {
          captureRunning = false
          this.setData({ captureProcessing: false })
          wx.showToast({ title: '拍摄失败，请重试', icon: 'none' })
          this.startFrameDetection()
        },
      })
    },
    async preparePreview(originalPath: string) {
      let previewPath = originalPath
      let previewMessage = '已保留相机高清原图，请确认报告内容完整清晰'
      try {
        previewPath = await this.normalizePhotoOrientation(originalPath)
        if (previewPath !== originalPath) {
          previewMessage = '照片方向已自动转正，并保持原始高清尺寸'
        }
      } catch {
        previewMessage = '方向校正未完成，已保留相机高清原图'
      }
      this.setData({
        previewPath,
        previewMessage,
        captureProcessing: false,
      })
      captureRunning = false
    },
    async normalizePhotoOrientation(originalPath: string): Promise<string> {
      const image = await getImageInfo(originalPath)
      const plan = getPhotoOrientationPlan(image.orientation, image.width, image.height)
      if (!plan.requiresNormalization) return originalPath

      await new Promise<void>((resolve) => {
        this.setData({
          orientationCanvasWidth: plan.outputWidth,
          orientationCanvasHeight: plan.outputHeight,
        }, resolve)
      })

      return new Promise((resolve, reject) => {
        const context = wx.createCanvasContext(PHOTO_ORIENTATION_CANVAS_ID, this)
        context.clearRect(0, 0, plan.outputWidth, plan.outputHeight)
        context.save()
        context.transform(...plan.matrix)
        context.drawImage(originalPath, 0, 0, image.width, image.height)
        context.restore()
        context.draw(false, () => {
          wx.canvasToTempFilePath({
            canvasId: PHOTO_ORIENTATION_CANVAS_ID,
            x: 0,
            y: 0,
            width: plan.outputWidth,
            height: plan.outputHeight,
            destWidth: plan.outputWidth,
            destHeight: plan.outputHeight,
            fileType: 'jpg',
            quality: 1,
            success: ({ tempFilePath }) => resolve(tempFilePath),
            fail: reject,
          }, this)
        })
      })
    },
    retakePhoto() {
      captureRunning = false
      resetDetection()
      this.setData({
        previewPath: '',
        previewMessage: '',
        frameState: 'searching',
        frameMessage: frameMessage(trackingSnapshot, this.data.trackingAvailable, this.data.captureMode, autoCaptureSnapshot),
        autoCaptureStatus: 'idle',
        countdown: 0,
        shutterProgress: 0,
        trackingHeld: false,
      }, () => this.startFrameDetection())
    },
    usePhoto() {
      const tempFilePath = this.data.previewPath
      if (!tempFilePath) return
      try {
        this.getOpenerEventChannel().emit('documentPhotoConfirmed', {
          tempFilePath,
        } as ConfirmedPhotoPayload)
      } catch {
        wx.showToast({ title: '照片返回失败，请重试', icon: 'none' })
        return
      }
      wx.navigateBack()
    },
    closeCamera() {
      cancelAutoCapture()
      wx.navigateBack()
    },
  },
})
