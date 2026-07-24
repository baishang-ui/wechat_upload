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
