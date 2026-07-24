import {
  detectDocumentFrameFromRgba,
  DocumentFrame,
  DocumentFrameState,
  getDocumentFrameState,
  normalizedFrameToImageCrop,
} from '../../domain/document-framing'

interface FrameBox {
  left: number
  top: number
  width: number
  height: number
}

interface ConfirmedPhotoPayload {
  tempFilePath?: string
}

const DETECTION_INTERVAL_MS = 420
const MAX_CROP_OUTPUT_DIMENSION = 1800
const DEFAULT_FRAME_BOX: FrameBox = {
  left: 10,
  top: 17,
  width: 80,
  height: 66,
}

let cameraContext: WechatMiniprogram.CameraContext | null = null
let cameraFrameListener: WechatMiniprogram.CameraFrameListener | null = null
let latestDocumentFrame: DocumentFrame | null = null
let detectionHistory: Array<DocumentFrame | null> = []
let lastDetectionAt = 0
let detectionRunning = false
let captureRunning = false

function resetDetection(): void {
  latestDocumentFrame = null
  detectionHistory = []
  lastDetectionAt = 0
  detectionRunning = false
}

function stopFrameListener(): void {
  cameraFrameListener?.stop()
  cameraFrameListener = null
  detectionRunning = false
}

function frameBoxFromDocument(frame: DocumentFrame | null): FrameBox {
  if (!frame) return DEFAULT_FRAME_BOX
  const points = [frame.topLeft, frame.topRight, frame.bottomRight, frame.bottomLeft]
  const xValues = points.map((point) => point.x)
  const yValues = points.map((point) => point.y)
  const left = Math.min(...xValues)
  const top = Math.min(...yValues)
  const right = Math.max(...xValues)
  const bottom = Math.max(...yValues)
  return {
    left: Number((left * 100).toFixed(2)),
    top: Number((top * 100).toFixed(2)),
    width: Number(((right - left) * 100).toFixed(2)),
    height: Number(((bottom - top) * 100).toFixed(2)),
  }
}

function frameMessage(state: DocumentFrameState, available: boolean): string {
  if (!available) return '当前设备不支持实时边缘检测，可直接拍摄'
  if (state === 'ready') return '已识别文档边缘，可拍摄'
  if (state === 'aligning') return '正在定位单据边缘，请保持稳定'
  return '请将检验报告完整放入取景框'
}

function getImageInfo(source: string): Promise<WechatMiniprogram.GetImageInfoSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.getImageInfo({
      src: source,
      success: resolve,
      fail: reject,
    })
  })
}

Component({
  data: {
    frameState: 'searching' as DocumentFrameState,
    frameMessage: '请将检验报告完整放入取景框',
    frameBox: DEFAULT_FRAME_BOX,
    cameraAvailable: true,
    cameraError: '',
    previewPath: '',
    previewMessage: '',
    cropCanvasWidth: 1,
    cropCanvasHeight: 1,
    captureProcessing: false,
  },
  lifetimes: {
    ready() {
      cameraContext = wx.createCameraContext()
    },
    detached() {
      stopFrameListener()
      cameraContext = null
      resetDetection()
    },
  },
  pageLifetimes: {
    show() {
      if (!this.data.previewPath) this.startFrameDetection()
    },
    hide() {
      stopFrameListener()
    },
  },
  methods: {
    onCameraReady() {
      this.setData({ cameraAvailable: true, cameraError: '' })
      this.startFrameDetection()
    },
    onCameraError(event: WechatMiniprogram.CustomEvent) {
      stopFrameListener()
      resetDetection()
      const detail = event.detail as { errMsg?: string }
      this.setData({
        cameraAvailable: false,
        cameraError: detail?.errMsg || '无法打开相机，请确认已授权相机权限',
        frameState: 'searching',
        frameMessage: frameMessage('searching', false),
        frameBox: DEFAULT_FRAME_BOX,
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
          this.setData({
            frameMessage: frameMessage('searching', false),
          })
        }
        return
      }

      cameraFrameListener = cameraContext.onCameraFrame((cameraFrame) => {
        const now = Date.now()
        if (detectionRunning || now - lastDetectionAt < DETECTION_INTERVAL_MS) return
        lastDetectionAt = now
        detectionRunning = true
        try {
          const detected = detectDocumentFrameFromRgba(
            new Uint8ClampedArray(cameraFrame.data),
            cameraFrame.width,
            cameraFrame.height,
          )
          latestDocumentFrame = detected
          detectionHistory = [...detectionHistory.slice(-2), detected]
          const frameState = getDocumentFrameState(detectionHistory)
          this.setData({
            frameState,
            frameMessage: frameMessage(frameState, true),
            frameBox: frameBoxFromDocument(detected),
          })
        } catch {
          latestDocumentFrame = null
          detectionHistory = [...detectionHistory.slice(-2), null]
          this.setData({
            frameState: 'searching',
            frameMessage: frameMessage('searching', true),
            frameBox: DEFAULT_FRAME_BOX,
          })
        } finally {
          detectionRunning = false
        }
      })
      cameraFrameListener.start({
        fail: () => {
          stopFrameListener()
          this.setData({
            frameMessage: frameMessage('searching', false),
          })
        },
      })
    },
    capturePhoto() {
      if (captureRunning) return
      if (!cameraContext) {
        wx.showToast({ title: '相机正在准备，请稍后重试', icon: 'none' })
        return
      }
      captureRunning = true
      stopFrameListener()
      this.setData({ captureProcessing: true })
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
      let previewMessage = '请确认报告内容完整清晰'
      const stableDocumentFrame = this.data.frameState === 'ready' ? latestDocumentFrame : null

      if (stableDocumentFrame) {
        try {
          previewPath = await this.cropDocumentPhoto(originalPath, stableDocumentFrame)
          previewMessage = '已按识别到的文档边缘自动裁切'
        } catch {
          previewMessage = '自动裁切未完成，已保留原始照片'
        }
      } else if (latestDocumentFrame) {
        previewMessage = '文档边缘尚未稳定，已保留原始照片'
      }

      this.setData({
        previewPath,
        previewMessage,
        captureProcessing: false,
      })
      captureRunning = false
    },
    async cropDocumentPhoto(originalPath: string, frame: DocumentFrame): Promise<string> {
      const image = await getImageInfo(originalPath)
      const crop = normalizedFrameToImageCrop(frame, image.width, image.height)
      const scale = Math.min(1, MAX_CROP_OUTPUT_DIMENSION / Math.max(crop.width, crop.height))
      const destinationWidth = Math.max(1, Math.round(crop.width * scale))
      const destinationHeight = Math.max(1, Math.round(crop.height * scale))

      await new Promise<void>((resolve) => {
        this.setData({
          cropCanvasWidth: destinationWidth,
          cropCanvasHeight: destinationHeight,
        }, resolve)
      })

      return new Promise((resolve, reject) => {
        const context = wx.createCanvasContext('document-crop-canvas', this)
        context.clearRect(0, 0, destinationWidth, destinationHeight)
        context.drawImage(
          originalPath,
          crop.x,
          crop.y,
          crop.width,
          crop.height,
          0,
          0,
          destinationWidth,
          destinationHeight,
        )
        context.draw(false, () => {
          wx.canvasToTempFilePath({
            canvasId: 'document-crop-canvas',
            x: 0,
            y: 0,
            width: destinationWidth,
            height: destinationHeight,
            destWidth: destinationWidth,
            destHeight: destinationHeight,
            fileType: 'jpg',
            quality: 0.92,
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
        frameMessage: frameMessage('searching', this.data.cameraAvailable),
        frameBox: DEFAULT_FRAME_BOX,
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
      wx.navigateBack()
    },
  },
})
