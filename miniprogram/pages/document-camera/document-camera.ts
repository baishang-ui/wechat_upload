import { showTopToast } from '../../services/top-toast-service'
import { loadUiThemePageData } from '../../services/ui-preferences-service'
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
import {
  getManualRotationPlan,
  getPhotoOrientationPlan,
  ManualRotationDirection,
  PhotoOrientationPlan,
} from '../../domain/photo-orientation'
import { buildChangedDataPatch } from '../../utils/set-data'

interface ConfirmedPhotoPayload {
  tempFilePath?: string
}

interface PhotoOrientationCanvas extends WechatMiniprogram.Canvas {
  width: number
  height: number
}

interface PhotoOrientationCanvasQueryResult extends WechatMiniprogram.IAnyObject {
  node?: PhotoOrientationCanvas
}

interface CaptureModeEvent {
  currentTarget: {
    dataset: {
      mode?: DocumentCaptureMode
    }
  }
}

interface ManualRotationEvent {
  currentTarget: {
    dataset: {
      direction?: ManualRotationDirection
    }
  }
}

const SEARCH_DETECTION_INTERVAL_MS = 320
const TRACKING_DETECTION_INTERVAL_MS = 180

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

function waitForNextTick(): Promise<void> {
  return new Promise((resolve) => wx.nextTick(resolve))
}

function loadCanvasImage(
  canvas: PhotoOrientationCanvas,
  source: string,
): Promise<WechatMiniprogram.Image> {
  return new Promise((resolve, reject) => {
    const image = canvas.createImage()
    image.onload = () => resolve(image)
    image.onerror = (error) => reject(error || new Error('Canvas 无法读取相机照片'))
    image.src = source
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
    ...loadUiThemePageData(),
  },
  lifetimes: {
    ready() {
      this.setData(loadUiThemePageData())
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
        ? Math.max(0, 100 - elapsed / 6)
        : trackingSnapshot.stableProgress * 100
      const shouldCapture = autoCaptureSnapshot.shouldCapture
      const detectionPatch = buildChangedDataPatch(this.data, {
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
      })
      const captureIfReady = () => {
        if (shouldCapture) this.capturePhoto()
      }
      if (Object.keys(detectionPatch).length > 0) {
        this.setData(detectionPatch, captureIfReady)
      } else {
        captureIfReady()
      }
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
        showTopToast({ title: '当前设备不支持自动拍摄', icon: 'none' })
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
        showTopToast({ title: '相机正在准备，请稍后重试', icon: 'none' })
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
          this.setData({
            previewPath: tempImagePath,
            previewMessage: '正在读取照片方向并校正…',
            captureProcessing: true,
          }, () => {
            void this.preparePreview(tempImagePath)
          })
        },
        fail: () => {
          captureRunning = false
          this.setData({ captureProcessing: false })
          showTopToast({ title: '拍摄失败，请重试', icon: 'none' })
          this.startFrameDetection()
        },
      })
    },
    async preparePreview(originalPath: string) {
      let previewPath = originalPath
      let previewMessage = '照片方向正常，已保留相机高清原图'
      try {
        previewPath = await this.normalizePhotoOrientation(originalPath)
        if (previewPath !== originalPath) {
          previewMessage = '照片方向已自动转正，并保持原始高清尺寸'
        }
      } catch (error) {
        console.error('[document-camera] 照片方向校正失败', error)
        previewMessage = '照片转正失败，已保留原始照片，请重拍或继续使用'
        showTopToast({
          title: '照片转正失败，已保留原图',
          icon: 'none',
        })
      }
      this.setData({
        previewPath,
        previewMessage,
        captureProcessing: false,
      })
      captureRunning = false
    },
    getPhotoOrientationCanvas(): Promise<PhotoOrientationCanvas> {
      return new Promise((resolve, reject) => {
        wx.createSelectorQuery()
          .in(this)
          .select('#photo-orientation-canvas')
          .fields({ node: true, size: true }, (result) => {
            const { node } = result as PhotoOrientationCanvasQueryResult
            if (node) {
              resolve(node)
              return
            }
            reject(new Error('未找到照片方向校正画布'))
          })
          .exec()
      })
    },
    exportOrientationCanvas(
      canvas: PhotoOrientationCanvas,
      width: number,
      height: number,
    ): Promise<string> {
      return new Promise((resolve, reject) => {
        wx.canvasToTempFilePath({
          canvas,
          x: 0,
          y: 0,
          width,
          height,
          destWidth: width,
          destHeight: height,
          fileType: 'jpg',
          quality: 1,
          success: ({ tempFilePath }) => resolve(tempFilePath),
          fail: reject,
        }, this)
      })
    },
    async renderPhotoWithPlan(
      sourcePath: string,
      image: WechatMiniprogram.GetImageInfoSuccessCallbackResult,
      plan: PhotoOrientationPlan,
    ): Promise<string> {
      this.setData({
        orientationCanvasWidth: plan.outputWidth,
        orientationCanvasHeight: plan.outputHeight,
      })
      await waitForNextTick()

      const canvas = await this.getPhotoOrientationCanvas()
      canvas.width = plan.outputWidth
      canvas.height = plan.outputHeight
      const context = canvas.getContext('2d')
      if (!context) throw new Error('无法创建照片方向校正上下文')

      const canvasImage = await loadCanvasImage(canvas, sourcePath)
      context.clearRect(0, 0, plan.outputWidth, plan.outputHeight)
      context.save()
      context.transform(...plan.matrix)
      context.drawImage(canvasImage, 0, 0, image.width, image.height)
      context.restore()
      await waitForNextTick()

      const renderedPath = await this.exportOrientationCanvas(
        canvas,
        plan.outputWidth,
        plan.outputHeight,
      )
      const renderedImage = await getImageInfo(renderedPath)
      const expectedPortrait = plan.outputHeight > plan.outputWidth
      const actualPortrait = renderedImage.height > renderedImage.width

      if (expectedPortrait !== actualPortrait) {
        throw new Error(`照片导出方向未生效：${renderedImage.width}x${renderedImage.height}`)
      }
      return renderedPath
    },
    async normalizePhotoOrientation(originalPath: string): Promise<string> {
      const image = await getImageInfo(originalPath)
      const plan = getPhotoOrientationPlan(
        image.orientation,
        image.width,
        image.height,
      )

      console.info('[document-camera] 照片方向信息', {
        orientation: image.orientation,
        width: image.width,
        height: image.height,
        plan,
      })

      if (!plan.requiresNormalization) return originalPath
      const normalizedPath = await this.renderPhotoWithPlan(originalPath, image, plan)
      const normalizedImage = await getImageInfo(normalizedPath)
      console.info('[document-camera] 照片方向校正完成', {
        normalizedPath,
        width: normalizedImage.width,
        height: normalizedImage.height,
        orientation: normalizedImage.orientation,
      })
      return normalizedPath
    },
    async rotatePreview(event: ManualRotationEvent) {
      if (this.data.captureProcessing) return
      const direction = event.currentTarget.dataset.direction
      const sourcePath = this.data.previewPath
      if (
        !sourcePath
        || (direction !== 'clockwise' && direction !== 'counterclockwise')
      ) return

      this.setData({
        captureProcessing: true,
        previewMessage: '正在手动旋转照片…',
      })
      try {
        const image = await getImageInfo(sourcePath)
        const rotatedPath = await this.renderPhotoWithPlan(
          sourcePath,
          image,
          getManualRotationPlan(image.width, image.height, direction),
        )
        this.setData({
          previewPath: rotatedPath,
          previewMessage: '已手动旋转照片，可继续调整',
          captureProcessing: false,
        })
      } catch (error) {
        console.error('[document-camera] 手动旋转照片失败', error)
        this.setData({
          previewMessage: '手动旋转失败，已保留当前照片',
          captureProcessing: false,
        })
        showTopToast({ title: '旋转失败，请重试', icon: 'none' })
      }
    },
    retakePhoto() {
      if (this.data.captureProcessing) return
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
      if (this.data.captureProcessing) {
        showTopToast({ title: '照片方向仍在处理中', icon: 'none' })
        return
      }
      const tempFilePath = this.data.previewPath
      if (!tempFilePath) return
      try {
        this.getOpenerEventChannel().emit('documentPhotoConfirmed', {
          tempFilePath,
        } as ConfirmedPhotoPayload)
      } catch {
        showTopToast({ title: '照片返回失败，请重试', icon: 'none' })
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
