import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import {
  detectDocumentFrameFromRgba,
  getDocumentFrameState,
  normalizedFrameToImageCrop,
  type DocumentFrame,
} from '../miniprogram/domain/document-framing'

function createRgba(
  width: number,
  height: number,
  paint: (x: number, y: number) => number,
): Uint8ClampedArray {
  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4
      const luminance = paint(x, y)
      rgba[offset] = luminance
      rgba[offset + 1] = luminance
      rgba[offset + 2] = luminance
      rgba[offset + 3] = 255
    }
  }
  return rgba
}

function frame(offsetX = 0, offsetY = 0): DocumentFrame {
  return {
    topLeft: { x: 0.12 + offsetX, y: 0.1 + offsetY },
    topRight: { x: 0.88 + offsetX, y: 0.1 + offsetY },
    bottomRight: { x: 0.88 + offsetX, y: 0.9 + offsetY },
    bottomLeft: { x: 0.12 + offsetX, y: 0.9 + offsetY },
    confidence: 0.86,
  }
}


function insetFrame(inset: number): DocumentFrame {
  return {
    topLeft: { x: 0.12 + inset, y: 0.1 + inset },
    topRight: { x: 0.88 - inset, y: 0.1 + inset },
    bottomRight: { x: 0.88 - inset, y: 0.9 - inset },
    bottomLeft: { x: 0.12 + inset, y: 0.9 - inset },
    confidence: 0.86,
  }
}

test('detects the centered high-contrast document boundaries from an RGBA frame', () => {
  const width = 96
  const height = 72
  const rgba = createRgba(width, height, (x, y) => (
    x >= 14 && x <= 82 && y >= 10 && y <= 62 ? 232 : 22
  ))

  const detected = detectDocumentFrameFromRgba(rgba, width, height)

  assert.ok(detected)
  assert.ok(Math.abs(detected.topLeft.x - 14 / width) < 0.08)
  assert.ok(Math.abs(detected.topLeft.y - 10 / height) < 0.08)
  assert.ok(Math.abs(detected.bottomRight.x - 82 / width) < 0.08)
  assert.ok(Math.abs(detected.bottomRight.y - 62 / height) < 0.08)
  assert.ok(detected.confidence >= 0.65)
})

test('does not invent a document boundary for a uniform camera frame', () => {
  const rgba = createRgba(80, 60, () => 128)

  assert.equal(detectDocumentFrameFromRgba(rgba, 80, 60), null)
})

test('marks consecutive low-drift detections as ready to capture', () => {
  assert.equal(getDocumentFrameState([
    frame(0, 0),
    frame(0.004, -0.002),
    frame(-0.003, 0.003),
  ]), 'ready')
})

test('keeps a moving document frame in the aligning state', () => {
  assert.equal(getDocumentFrameState([
    frame(0, 0),
    frame(0.01, 0),
    frame(0.075, 0.02),
  ]), 'aligning')
})

test('returns searching when the latest camera frame has no detectable document', () => {
  assert.equal(getDocumentFrameState([frame(), null]), 'searching')
})

test('converts a normalized document frame into a bounded source-image crop', () => {
  assert.deepEqual(
    normalizedFrameToImageCrop(frame(), 1200, 800),
    { x: 144, y: 80, width: 912, height: 640 },
  )
})

function pointInPolygon(x: number, y: number, points: Array<{ x: number; y: number }>): boolean {
  let inside = false
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index]
    const previousPoint = points[previous]
    const crosses = ((currentPoint.y > y) !== (previousPoint.y > y))
      && x < (previousPoint.x - currentPoint.x) * (y - currentPoint.y)
        / (previousPoint.y - currentPoint.y || 1) + currentPoint.x
    if (crosses) inside = !inside
  }
  return inside
}

test('detects four non-axis-aligned corners for a tilted document', async () => {
  const { detectDocumentFrameFromRgba: detect } = await import('../miniprogram/domain/document-framing')
  const width = 96
  const height = 72
  const polygon = [
    { x: 17, y: 9 },
    { x: 82, y: 15 },
    { x: 75, y: 64 },
    { x: 11, y: 57 },
  ]
  const rgba = createRgba(width, height, (x, y) => pointInPolygon(x, y, polygon) ? 236 : 20)

  const detected = detect(rgba, width, height)

  assert.ok(detected)
  assert.ok(Math.abs(detected.topLeft.y - detected.topRight.y) > 0.025)
  assert.ok(Math.abs(detected.topLeft.x - detected.bottomLeft.x) > 0.025)
  assert.ok(Math.abs(detected.topLeft.x - 17 / width) < 0.1)
  assert.ok(Math.abs(detected.bottomRight.y - 64 / height) < 0.1)
})

test('adaptive tracking smooths micro jitter but follows deliberate movement', async () => {
  const {
    createDocumentTrackingSnapshot,
    updateDocumentTracking,
  } = await import('../miniprogram/domain/document-framing')

  const initial = updateDocumentTracking(createDocumentTrackingSnapshot(), frame(), 0)
  const jittered = updateDocumentTracking(initial, frame(0.01, -0.008), 200)
  const moved = updateDocumentTracking(jittered, frame(0.12, 0.04), 400)

  assert.ok(jittered.frame)
  assert.ok(moved.frame)
  assert.ok(Math.abs(jittered.frame.topLeft.x - initial.frame!.topLeft.x) < 0.006)
  assert.ok(moved.frame.topLeft.x - jittered.frame.topLeft.x > 0.055)
})

test('tracking accepts the relaxed handheld drift and area change selected for mobile capture', async () => {
  const {
    createDocumentTrackingSnapshot,
    updateDocumentTracking,
  } = await import('../miniprogram/domain/document-framing')

  let driftTracking = updateDocumentTracking(createDocumentTrackingSnapshot(), frame(), 100)
  driftTracking = updateDocumentTracking(driftTracking, frame(0.07, 0), 400)
  driftTracking = updateDocumentTracking(driftTracking, frame(0.07, 0), 700)
  assert.equal(driftTracking.phase, 'ready')

  let areaTracking = updateDocumentTracking(createDocumentTrackingSnapshot(), frame(), 100)
  areaTracking = updateDocumentTracking(areaTracking, insetFrame(0.052), 400)
  areaTracking = updateDocumentTracking(areaTracking, insetFrame(0.052), 700)
  assert.equal(areaTracking.phase, 'ready')
})

test('tracking accepts moderate handheld drift and becomes ready after 600ms', async () => {
  const {
    createDocumentTrackingSnapshot,
    updateDocumentTracking,
  } = await import('../miniprogram/domain/document-framing')

  let tracking = updateDocumentTracking(createDocumentTrackingSnapshot(), frame(), 100)
  tracking = updateDocumentTracking(tracking, frame(0.045, 0.015), 400)
  assert.ok(tracking.stableProgress > 0)
  tracking = updateDocumentTracking(tracking, frame(0.045, 0.015), 700)

  assert.equal(tracking.phase, 'ready')
  assert.equal(tracking.stableProgress, 1)
})

test('tracking holds the last frame through a short miss without becoming ready', async () => {
  const {
    createDocumentTrackingSnapshot,
    updateDocumentTracking,
  } = await import('../miniprogram/domain/document-framing')

  let tracking = updateDocumentTracking(createDocumentTrackingSnapshot(), frame(), 0)
  tracking = updateDocumentTracking(tracking, frame(0.002, 0), 500)
  const held = updateDocumentTracking(tracking, null, 900)
  const expired = updateDocumentTracking(held, null, 1301)

  assert.ok(held.frame)
  assert.equal(held.held, true)
  assert.equal(held.phase, 'tracking')
  assert.equal(held.stableProgress, 0)
  assert.equal(expired.frame, null)
  assert.equal(expired.phase, 'searching')
})

test('tracking becomes ready after stable elapsed time rather than a fixed frame count', async () => {
  const {
    createDocumentTrackingSnapshot,
    updateDocumentTracking,
  } = await import('../miniprogram/domain/document-framing')

  let tracking = updateDocumentTracking(createDocumentTrackingSnapshot(), frame(), 100)
  tracking = updateDocumentTracking(tracking, frame(0.002, 0), 550)
  assert.equal(tracking.phase, 'tracking')
  assert.ok(tracking.stableProgress > 0.7 && tracking.stableProgress < 0.8)
  tracking = updateDocumentTracking(tracking, frame(-0.002, 0.001), 700)

  assert.equal(tracking.phase, 'ready')
  assert.equal(tracking.stableProgress, 1)
})

test('automatic capture counts down and movement cancels it', async () => {
  const {
    createAutoCaptureSnapshot,
    updateAutoCapture,
  } = await import('../miniprogram/domain/document-framing')

  let capture = updateAutoCapture(createAutoCaptureSnapshot(), {
    mode: 'auto',
    trackingPhase: 'ready',
    now: 1000,
  })
  assert.equal(capture.status, 'countdown')
  assert.equal(capture.countdown, 1)

  capture = updateAutoCapture(capture, {
    mode: 'auto',
    trackingPhase: 'ready',
    now: 1500,
  })
  assert.equal(capture.countdown, 1)
  assert.equal(capture.shouldCapture, false)

  capture = updateAutoCapture(capture, {
    mode: 'auto',
    trackingPhase: 'tracking',
    now: 1600,
  })
  assert.deepEqual(capture, createAutoCaptureSnapshot())
})

test('automatic capture emits one trigger after 600 stable milliseconds', async () => {
  const {
    createAutoCaptureSnapshot,
    updateAutoCapture,
  } = await import('../miniprogram/domain/document-framing')

  let capture = updateAutoCapture(createAutoCaptureSnapshot(), {
    mode: 'auto',
    trackingPhase: 'ready',
    now: 500,
  })
  capture = updateAutoCapture(capture, {
    mode: 'auto',
    trackingPhase: 'ready',
    now: 1099,
  })
  assert.equal(capture.status, 'countdown')
  assert.equal(capture.shouldCapture, false)

  capture = updateAutoCapture(capture, {
    mode: 'auto',
    trackingPhase: 'ready',
    now: 1100,
  })

  assert.equal(capture.status, 'triggered')
  assert.equal(capture.countdown, 0)
  assert.equal(capture.shouldCapture, true)
})

test('maps preview frame points into a differently shaped photo using aspect-fill geometry', async () => {
  const { mapDocumentFrameToImage } = await import('../miniprogram/domain/document-framing')
  const mapped = mapDocumentFrameToImage(frame(), 900, 1200, 1600, 1200)

  assert.ok(mapped.topLeft.x > frame().topLeft.x)
  assert.ok(mapped.topRight.x < frame().topRight.x)
  assert.equal(mapped.topLeft.y, frame().topLeft.y)
})

test('perspective output size follows quadrilateral edges and caps the longest dimension', async () => {
  const { getPerspectiveOutputSize } = await import('../miniprogram/domain/document-framing')
  const size = getPerspectiveOutputSize(frame(), 4000, 3000, 1800)

  assert.equal(Math.max(size.width, size.height), 1800)
  assert.ok(size.width > size.height)
})

test('affine triangle transform maps source pixels onto destination mesh cells', async () => {
  const { createAffineTriangleTransform } = await import('../miniprogram/domain/document-framing')
  const transform = createAffineTriangleTransform(
    [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }],
    [{ x: 10, y: 20 }, { x: 210, y: 20 }, { x: 10, y: 120 }],
  )

  assert.deepEqual(transform, { a: 2, b: 0, c: 0, d: 1, e: 10, f: 20 })
})

test('bilinear frame sampling follows all four document corners', async () => {
  const { sampleDocumentFramePoint } = await import('../miniprogram/domain/document-framing')
  const tilted: DocumentFrame = {
    topLeft: { x: 0.1, y: 0.2 },
    topRight: { x: 0.9, y: 0.1 },
    bottomRight: { x: 0.8, y: 0.9 },
    bottomLeft: { x: 0.2, y: 0.8 },
    confidence: 0.9,
  }

  assert.deepEqual(sampleDocumentFramePoint(tilted, 0, 0, 1000, 500), { x: 100, y: 100 })
  assert.deepEqual(sampleDocumentFramePoint(tilted, 1, 1, 1000, 500), { x: 800, y: 450 })
  assert.deepEqual(sampleDocumentFramePoint(tilted, 0.5, 0.5, 1000, 500), { x: 500, y: 250 })
})
