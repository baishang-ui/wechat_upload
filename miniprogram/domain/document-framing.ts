export interface NormalizedPoint {
  x: number
  y: number
}

export interface DocumentFrame {
  topLeft: NormalizedPoint
  topRight: NormalizedPoint
  bottomRight: NormalizedPoint
  bottomLeft: NormalizedPoint
  confidence: number
}

export type DocumentFrameState = 'searching' | 'aligning' | 'ready'

export interface ImageCrop {
  x: number
  y: number
  width: number
  height: number
}

const STABLE_FRAME_COUNT = 3
const MIN_DOCUMENT_CONFIDENCE = 0.5
const MAX_CORNER_DRIFT = 0.035
const MAX_AREA_DELTA = 0.12
const MAX_ANALYSIS_DIMENSION = 160
const MIN_EDGE_ENERGY = 18

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function average(values: number[]): number {
  if (!values.length) return 0
  return values.reduce((total, value) => total + value, 0) / values.length
}

function framePoints(frame: DocumentFrame): NormalizedPoint[] {
  return [frame.topLeft, frame.topRight, frame.bottomRight, frame.bottomLeft]
}

function frameArea(frame: DocumentFrame): number {
  const points = framePoints(frame)
  let doubledArea = 0
  for (let index = 0; index < points.length; index += 1) {
    const current = points[index]
    const next = points[(index + 1) % points.length]
    doubledArea += current.x * next.y - next.x * current.y
  }
  return Math.abs(doubledArea) / 2
}

function edgePeak(scores: number[], start: number, end: number): { index: number; value: number } | null {
  let index = -1
  let value = -Infinity
  for (let current = Math.max(1, start); current <= Math.min(scores.length - 2, end); current += 1) {
    if (scores[current] > value) {
      index = current
      value = scores[current]
    }
  }
  return index >= 0 ? { index, value } : null
}

function isValidFrame(frame: DocumentFrame | null | undefined): frame is DocumentFrame {
  if (!frame || !Number.isFinite(frame.confidence) || frame.confidence < MIN_DOCUMENT_CONFIDENCE) {
    return false
  }
  return framePoints(frame).every((point) => (
    Number.isFinite(point.x)
    && Number.isFinite(point.y)
    && point.x >= 0
    && point.x <= 1
    && point.y >= 0
    && point.y <= 1
  ))
}

/**
 * Finds a high-contrast, axis-aligned document candidate from a low-frequency RGBA preview frame.
 * The result deliberately keeps four corner points so later versions can replace the detector with
 * a perspective-aware implementation without changing the camera page contract.
 */
export function detectDocumentFrameFromRgba(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
): DocumentFrame | null {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 8 || height < 8) return null
  if (rgba.length < width * height * 4) return null

  const stride = Math.max(1, Math.ceil(Math.max(width, height) / MAX_ANALYSIS_DIMENSION))
  const sampleWidth = Math.ceil(width / stride)
  const sampleHeight = Math.ceil(height / stride)
  if (sampleWidth < 8 || sampleHeight < 8) return null

  const luminance = new Uint8Array(sampleWidth * sampleHeight)
  for (let y = 0; y < sampleHeight; y += 1) {
    const sourceY = Math.min(height - 1, y * stride)
    for (let x = 0; x < sampleWidth; x += 1) {
      const sourceX = Math.min(width - 1, x * stride)
      const offset = (sourceY * width + sourceX) * 4
      luminance[y * sampleWidth + x] = Math.round(
        rgba[offset] * 0.299 + rgba[offset + 1] * 0.587 + rgba[offset + 2] * 0.114,
      )
    }
  }

  const verticalEdges = new Array<number>(sampleWidth).fill(0)
  const horizontalEdges = new Array<number>(sampleHeight).fill(0)
  const innerTop = Math.floor(sampleHeight * 0.08)
  const innerBottom = Math.ceil(sampleHeight * 0.92)
  const innerLeft = Math.floor(sampleWidth * 0.08)
  const innerRight = Math.ceil(sampleWidth * 0.92)

  for (let x = 1; x < sampleWidth - 1; x += 1) {
    const samples: number[] = []
    for (let y = innerTop; y < innerBottom; y += 1) {
      const offset = y * sampleWidth + x
      samples.push(Math.abs(luminance[offset + 1] - luminance[offset - 1]))
    }
    verticalEdges[x] = average(samples)
  }

  for (let y = 1; y < sampleHeight - 1; y += 1) {
    const samples: number[] = []
    for (let x = innerLeft; x < innerRight; x += 1) {
      const offset = y * sampleWidth + x
      samples.push(Math.abs(luminance[offset + sampleWidth] - luminance[offset - sampleWidth]))
    }
    horizontalEdges[y] = average(samples)
  }

  const left = edgePeak(verticalEdges, Math.floor(sampleWidth * 0.04), Math.floor(sampleWidth * 0.46))
  const right = edgePeak(verticalEdges, Math.ceil(sampleWidth * 0.54), Math.ceil(sampleWidth * 0.96))
  const top = edgePeak(horizontalEdges, Math.floor(sampleHeight * 0.04), Math.floor(sampleHeight * 0.42))
  const bottom = edgePeak(horizontalEdges, Math.ceil(sampleHeight * 0.58), Math.ceil(sampleHeight * 0.96))
  if (!left || !right || !top || !bottom) return null

  const normalizedLeft = left.index / (sampleWidth - 1)
  const normalizedRight = right.index / (sampleWidth - 1)
  const normalizedTop = top.index / (sampleHeight - 1)
  const normalizedBottom = bottom.index / (sampleHeight - 1)
  const candidateWidth = normalizedRight - normalizedLeft
  const candidateHeight = normalizedBottom - normalizedTop
  const minimumEdgeEnergy = Math.min(left.value, right.value, top.value, bottom.value)

  if (
    minimumEdgeEnergy < MIN_EDGE_ENERGY
    || candidateWidth < 0.34
    || candidateHeight < 0.28
    || candidateWidth > 0.94
    || candidateHeight > 0.94
  ) {
    return null
  }

  const areaScore = clamp((candidateWidth * candidateHeight - 0.12) / 0.5, 0, 1)
  const edgeScore = clamp(minimumEdgeEnergy / 70, 0, 1)
  const confidence = Number((0.5 * edgeScore + 0.5 * areaScore).toFixed(3))
  if (confidence < MIN_DOCUMENT_CONFIDENCE) return null

  return {
    topLeft: { x: normalizedLeft, y: normalizedTop },
    topRight: { x: normalizedRight, y: normalizedTop },
    bottomRight: { x: normalizedRight, y: normalizedBottom },
    bottomLeft: { x: normalizedLeft, y: normalizedBottom },
    confidence,
  }
}

export function isStableDocumentFrame(frames: Array<DocumentFrame | null | undefined>): boolean {
  if (frames.length < STABLE_FRAME_COUNT) return false
  const recentFrames = frames.slice(-STABLE_FRAME_COUNT)
  if (!recentFrames.every(isValidFrame)) return false

  const validFrames = recentFrames as DocumentFrame[]
  const baseline = validFrames[0]
  const baselineArea = frameArea(baseline)
  if (baselineArea <= 0) return false

  return validFrames.every((frame) => {
    const maximumCornerDrift = Math.max(...framePoints(frame).map((point, index) => {
      const reference = framePoints(baseline)[index]
      return Math.hypot(point.x - reference.x, point.y - reference.y)
    }))
    const areaDelta = Math.abs(frameArea(frame) - baselineArea) / baselineArea
    return maximumCornerDrift <= MAX_CORNER_DRIFT && areaDelta <= MAX_AREA_DELTA
  })
}

export function getDocumentFrameState(
  frames: Array<DocumentFrame | null | undefined>,
): DocumentFrameState {
  const latest = frames[frames.length - 1]
  if (!isValidFrame(latest)) return 'searching'
  return isStableDocumentFrame(frames) ? 'ready' : 'aligning'
}

export function normalizedFrameToImageCrop(
  frame: DocumentFrame,
  imageWidth: number,
  imageHeight: number,
): ImageCrop {
  if (!Number.isFinite(imageWidth) || !Number.isFinite(imageHeight) || imageWidth <= 0 || imageHeight <= 0) {
    throw new Error('图片尺寸无效')
  }

  const points = framePoints(frame)
  const xCoordinates = points.map((point) => clamp(point.x, 0, 1))
  const yCoordinates = points.map((point) => clamp(point.y, 0, 1))
  const x = Math.floor(Math.min(...xCoordinates) * imageWidth)
  const y = Math.floor(Math.min(...yCoordinates) * imageHeight)
  const right = Math.max(x + 1, Math.ceil(Math.max(...xCoordinates) * imageWidth))
  const bottom = Math.max(y + 1, Math.ceil(Math.max(...yCoordinates) * imageHeight))

  return {
    x: clamp(x, 0, imageWidth - 1),
    y: clamp(y, 0, imageHeight - 1),
    width: clamp(right, 1, imageWidth) - clamp(x, 0, imageWidth - 1),
    height: clamp(bottom, 1, imageHeight) - clamp(y, 0, imageHeight - 1),
  }
}
