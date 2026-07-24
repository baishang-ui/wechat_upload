import test from 'node:test'
import strictAssert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const assert: typeof strictAssert = strictAssert

const projectRoot = path.resolve(import.meta.dirname, '..')

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

test('document camera keeps realtime tracking behind a fixed guide while allowing manual capture', () => {
  const cameraWxml = readProjectFile('miniprogram/pages/document-camera/document-camera.wxml')
  const cameraTs = readProjectFile('miniprogram/pages/document-camera/document-camera.ts')

  assert.match(cameraWxml, /<camera[\s\S]*frame-size="small"/)
  assert.match(cameraWxml, /document-fixed-guide/)
  assert.doesNotMatch(cameraWxml, /document-overlay-canvas/)
  assert.match(cameraWxml, /bindtap="capturePhoto"/)
  assert.match(cameraTs, /onCameraFrame\(/)
  assert.match(cameraTs, /takePhoto\(/)
  assert.doesNotMatch(cameraTs, /setTimeout\([^\n]*takePhoto/)
})

test('confirmed camera photos rejoin the existing recognition queue through the index page', () => {
  const indexTs = readProjectFile('miniprogram/pages/index/index.ts')

  assert.match(indexTs, /url:\s*'\/pages\/document-camera\/document-camera'/)
  assert.match(indexTs, /documentPhotoConfirmed/)
  assert.match(indexTs, /this\.enqueueRecognitionFiles\(\[tempFilePath\]\)/)
})

test('document camera defaults to automatic capture with a custom non-native shutter', () => {
  const cameraWxml = readProjectFile('miniprogram/pages/document-camera/document-camera.wxml')
  const cameraTs = readProjectFile('miniprogram/pages/document-camera/document-camera.ts')
  const cameraScss = readProjectFile('miniprogram/pages/document-camera/document-camera.scss')

  assert.doesNotMatch(cameraWxml, /document-overlay-canvas/)
  assert.match(cameraWxml, /bindtap="switchCaptureMode"/)
  assert.match(cameraWxml, /自动拍摄/)
  assert.match(cameraWxml, /手动拍摄/)
  assert.match(cameraWxml, /<view[\s\S]*class="camera-shutter/)
  assert.match(cameraWxml, /hover-class="camera-shutter--pressed"/)
  assert.doesNotMatch(cameraWxml, /<button[^>]*class="camera-shutter/)
  assert.match(cameraWxml, /shutter-progress/)
  assert.match(cameraWxml, /countdown/)
  assert.match(cameraTs, /captureMode:\s*'auto'/)
  assert.match(cameraTs, /updateDocumentTracking/)
  assert.match(cameraTs, /updateAutoCapture/)
  assert.match(cameraTs, /cancelAutoCapture/)
  assert.doesNotMatch(cameraTs, /drawDocumentOverlay/)
  assert.match(cameraScss, /camera-mode-switch/)
  assert.match(cameraScss, /camera-shutter--ready/)
  assert.match(cameraScss, /camera-shutter--countdown/)
})

test('document camera uses only a fixed guide and has no dynamic tracking canvas or outer shutter backdrop', () => {
  const cameraWxml = readProjectFile('miniprogram/pages/document-camera/document-camera.wxml')
  const cameraTs = readProjectFile('miniprogram/pages/document-camera/document-camera.ts')
  const cameraScss = readProjectFile('miniprogram/pages/document-camera/document-camera.scss')

  assert.match(cameraWxml, /document-fixed-guide/)
  assert.match(cameraWxml, /document-fixed-guide-corner/)
  assert.match(cameraScss, /\.document-fixed-guide\s*\{[\s\S]*inset:\s*0;/)
  assert.match(cameraScss, /\.camera-topbar\s*\{[\s\S]*z-index:\s*6;/)
  assert.match(cameraScss, /\.camera-shutter\s*\{[\s\S]*background:\s*transparent;/)
  assert.doesNotMatch(cameraTs, /drawPolygon|drawDocumentOverlay|frameCanvasPoints/)
})

test('document camera keeps high-quality pixels and only re-encodes photos that need EXIF orientation normalization', () => {
  const cameraWxml = readProjectFile('miniprogram/pages/document-camera/document-camera.wxml')
  const cameraTs = readProjectFile('miniprogram/pages/document-camera/document-camera.ts')

  assert.match(cameraTs, /quality:\s*'high'/)
  assert.match(cameraWxml, /canvas-id="photo-orientation-canvas"/)
  assert.match(cameraTs, /wx\.getImageInfo\(/)
  assert.match(cameraTs, /getPhotoOrientationPlan\(/)
  assert.match(cameraTs, /if \(!plan\.requiresNormalization\) return originalPath/)
  assert.match(cameraTs, /normalizePhotoOrientation\(originalPath\)/)
  assert.match(cameraTs, /canvasToTempFilePath\([\s\S]*quality:\s*1/)
  assert.match(cameraTs, /方向已自动转正/)
  assert.doesNotMatch(cameraTs, /perspectiveCorrectDocumentPhoto|cropDocumentPhoto/)
  assert.match(cameraTs, /cancelAutoCapture\(\)/)
  assert.match(cameraTs, /detached\(\)[\s\S]*cancelAutoCapture\(\)/)
})

test('document camera shutter progress matches the one-second automatic countdown', () => {
  const cameraTs = readProjectFile('miniprogram/pages/document-camera/document-camera.ts')

  assert.match(cameraTs, /100 - elapsed \/ 10/)
  assert.doesNotMatch(cameraTs, /100 - elapsed \/ 30/)
})

test('automatic mode is disabled when realtime frame tracking is unavailable', () => {
  const cameraTs = readProjectFile('miniprogram/pages/document-camera/document-camera.ts')

  assert.match(cameraTs, /trackingAvailable:\s*true/)
  assert.match(cameraTs, /mode === 'auto'\s*&&\s*!this\.data\.trackingAvailable/)
  assert.match(cameraTs, /当前设备不支持自动拍摄/)
})

test('document camera presents a screen-width portrait 3:4 viewport while preserving original high-quality capture output', () => {
  const cameraWxml = readProjectFile('miniprogram/pages/document-camera/document-camera.wxml')
  const cameraTs = readProjectFile('miniprogram/pages/document-camera/document-camera.ts')
  const cameraScss = readProjectFile('miniprogram/pages/document-camera/document-camera.scss')

  assert.match(cameraWxml, /class="camera-viewport"/)
  assert.match(cameraWxml, /style="width: \{\{cameraViewportWidth\}\}px; height: \{\{cameraViewportHeight\}\}px;"/)
  assert.match(cameraWxml, /<view[\s\S]*class="camera-viewport"[\s\S]*<camera[\s\S]*document-fixed-guide/)
  assert.match(cameraTs, /cameraViewportWidth:\s*1/)
  assert.match(cameraTs, /cameraViewportWidth = Math\.max\(1, systemInfo\.windowWidth\)/)
  assert.match(cameraTs, /cameraViewportHeight:\s*1/)
  assert.match(cameraTs, /cameraViewportHeight = Math\.round\(cameraViewportWidth \* 4 \/ 3\)/)
  assert.match(cameraScss, /\.camera-viewport\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*50%;[\s\S]*left:\s*50%;[\s\S]*transform:\s*translate\(-50%, -50%\)/)
  assert.match(cameraScss, /\.document-fixed-guide\s*\{[\s\S]*inset:\s*0;/)
  assert.match(cameraTs, /takePhoto\(\{[\s\S]*quality:\s*'high'/)
  assert.doesNotMatch(cameraTs, /perspectiveCorrectDocumentPhoto|cropDocumentPhoto/)
})

test('document camera stays mounted while the confirmation view is shown so retake restores the live preview', () => {
  const cameraWxml = readProjectFile('miniprogram/pages/document-camera/document-camera.wxml')
  const cameraTs = readProjectFile('miniprogram/pages/document-camera/document-camera.ts')

  const viewportIndex = cameraWxml.indexOf('class="camera-viewport"')
  const captureControlsIndex = cameraWxml.indexOf('<block wx:if="{{!previewPath}}">')

  assert.ok(viewportIndex >= 0)
  assert.ok(captureControlsIndex >= 0)
  assert.ok(viewportIndex < captureControlsIndex)
  assert.match(cameraWxml, /class="camera-viewport"[\s\S]*hidden="\{\{previewPath\}\}"[\s\S]*<camera/)
  assert.match(cameraWxml, /<view wx:if="\{\{previewPath\}\}" class="document-preview">/)
  assert.doesNotMatch(cameraWxml, /<view wx:else class="document-preview">/)
  const retakeMethod = cameraTs.match(/retakePhoto\(\) \{[\s\S]*?\n    \},\n    usePhoto/)?.[0] || ''
  assert.doesNotMatch(retakeMethod, /cameraViewportWidth|cameraViewportHeight/)
})

test('document camera centers and polishes the close control without a native oval press layer', () => {
  const cameraWxml = readProjectFile('miniprogram/pages/document-camera/document-camera.wxml')
  const cameraScss = readProjectFile('miniprogram/pages/document-camera/document-camera.scss')

  assert.match(cameraWxml, /class="camera-close"[\s\S]*hover-class="camera-close--pressed"/)
  assert.match(cameraScss, /\.camera-close\s*\{[\s\S]*display:\s*flex;[\s\S]*align-items:\s*center;[\s\S]*justify-content:\s*center;/)
  assert.match(cameraScss, /\.camera-close\s*\{[\s\S]*line-height:\s*1;/)
  assert.match(cameraScss, /\.camera-close--pressed\s*\{[\s\S]*transform:\s*scale\(/)
})

test('capture mode switch uses the same translating indicator motion as the home bottom bar', () => {
  const cameraWxml = readProjectFile('miniprogram/pages/document-camera/document-camera.wxml')
  const cameraTs = readProjectFile('miniprogram/pages/document-camera/document-camera.ts')
  const cameraScss = readProjectFile('miniprogram/pages/document-camera/document-camera.scss')

  assert.match(cameraWxml, /camera-mode-indicator camera-mode-indicator--\{\{captureMode\}\}/)
  assert.match(cameraWxml, /pressedCaptureMode === captureMode/)
  assert.match(cameraWxml, /bindtouchstart="onCaptureModePressStart"/)
  assert.match(cameraWxml, /bindtouchend="onCaptureModePressEnd"/)
  assert.match(cameraWxml, /bindtouchcancel="onCaptureModePressEnd"/)
  assert.match(cameraTs, /pressedCaptureMode:\s*''/)
  assert.match(cameraTs, /onCaptureModePressStart/)
  assert.match(cameraTs, /onCaptureModePressEnd/)
  assert.match(cameraScss, /\.camera-mode-indicator\s*\{[\s\S]*transition:\s*transform \.34s cubic-bezier\(\.22, \.8, \.28, 1\);/)
  assert.match(cameraScss, /\.camera-mode-indicator--manual\s*\{[\s\S]*transform:\s*translate3d\(100%, 0, 0\);/)
  assert.match(cameraScss, /\.camera-mode-indicator-fill--pressing|\.camera-mode-indicator--pressing \.camera-mode-indicator-fill/)
  const activeRule = cameraScss.match(/\.camera-mode-option--active\s*\{[\s\S]*?\}/)?.[0] || ''
  assert.doesNotMatch(activeRule, /background|box-shadow/)
})

test('document camera reserves an explicit top safe area and keeps the close control above the native camera layer', () => {
  const cameraWxml = readProjectFile('miniprogram/pages/document-camera/document-camera.wxml')
  const cameraTs = readProjectFile('miniprogram/pages/document-camera/document-camera.ts')
  const cameraScss = readProjectFile('miniprogram/pages/document-camera/document-camera.scss')

  assert.match(cameraWxml, /camera-top-safe-area/)
  assert.match(cameraWxml, /height: \{\{cameraTopInset\}\}px/)
  assert.match(cameraWxml, /<cover-view class="camera-topbar" style="top: \{\{cameraTopInset\}\}px;">/)
  assert.match(cameraWxml, /<cover-view[\s\S]*class="camera-close"[\s\S]*bindtap="closeCamera"[\s\S]*>关闭<\/cover-view>/)
  assert.match(cameraTs, /cameraTopInset:\s*\d+/)
  assert.match(cameraTs, /getMenuButtonBoundingClientRect\(\)/)
  assert.match(cameraTs, /statusBarHeight/)
  assert.match(cameraScss, /\.camera-top-safe-area\s*\{[\s\S]*position:\s*absolute;[\s\S]*top:\s*0;/)
})
