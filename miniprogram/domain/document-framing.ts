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
export type DocumentTrackingPhase = 'searching' | 'tracking' | 'ready'
export type DocumentCaptureMode = 'auto' | 'manual'
export type AutoCaptureStatus = 'idle' | 'countdown' | 'triggered'

export interface ImageCrop {
  x: number
  y: number
  width: number
  height: number
}

export interface ImageSize {
  width: number
  height: number
}

export interface DocumentTrackingSnapshot {
  frame: DocumentFrame | null
  phase: DocumentTrackingPhase
  stableProgress: number
  stableSince: number | null
  lastSeenAt: number | null
  held: boolean
}

export interface AutoCaptureSnapshot {
  status: AutoCaptureStatus
  startedAt: number | null
  countdown: number
  shouldCapture: boolean
}

export interface AutoCaptureUpdate {
  mode: DocumentCaptureMode
  trackingPhase: DocumentTrackingPhase
  now: number
  blocked?: boolean
}

interface EdgePoint {
  independent: number
  dependent: number
  energy: number
}

interface FittedLine {
  slope: number
  intercept: number
  residual: number
  energy: number
}

const STABLE_FRAME_COUNT = 3
const MIN_DOCUMENT_CONFIDENCE = 0.5
const MAX_CORNER_DRIFT = 0.075
const MAX_AREA_DELTA = 0.28
const MAX_ANALYSIS_DIMENSION = 192
const MIN_EDGE_ENERGY = 18
const TRACKING_HOLD_MS = 600
const READY_AFTER_MS = 600
const AUTO_CAPTURE_DELAY_MS = 1000

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

function frameFromPoints(points: NormalizedPoint[], confidence: number): DocumentFrame {
  return {
    topLeft: points[0],
    topRight: points[1],
    bottomRight: points[2],
    bottomLeft: points[3],
    confidence,
  }
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

function frameMaximumDrift(first: DocumentFrame, second: DocumentFrame): number {
  const firstPoints = framePoints(first)
  return Math.max(...framePoints(second).map((point, index) => (
    Math.hypot(point.x - firstPoints[index].x, point.y - firstPoints[index].y)
  )))
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

function fitLine(points: EdgePoint[]): FittedLine | null {
  if (points.length < 6) return null
  const meanIndependent = average(points.map((point) => point.independent))
  const meanDependent = average(points.map((point) => point.dependent))
  let numerator = 0
  let denominator = 0
  points.forEach((point) => {
    const delta = point.independent - meanIndependent
    numerator += delta * (point.dependent - meanDependent)
    denominator += delta * delta
  })
  const slope = denominator > 1e-8 ? numerator / denominator : 0
  const intercept = meanDependent - slope * meanIndependent
  const residuals = points.map((point) => Math.abs(point.dependent - (slope * point.independent + intercept)))
  const residual = average(residuals)
  const cutoff = Math.max(0.012, residual * 2.4)
  const filtered = points.filter((_, index) => residuals[index] <= cutoff)
  if (filtered.length >= 6 && filtered.length < points.length) {
    const refined = fitLineOnce(filtered)
    if (refined) return refined
  }
  return {
    slope,
    intercept,
    residual,
    energy: average(points.map((point) => point.energy)),
  }
}

function fitLineOnce(points: EdgePoint[]): FittedLine | null {
  if (points.length < 6) return null
  const meanIndependent = average(points.map((point) => point.independent))
  const meanDependent = average(points.map((point) => point.dependent))
  let numerator = 0
  let denominator = 0
  points.forEach((point) => {
    const delta = point.independent - meanIndependent
    numerator += delta * (point.dependent - meanDependent)
    denominator += delta * delta
  })
  const slope = denominator > 1e-8 ? numerator / denominator : 0
  const intercept = meanDependent - slope * meanIndependent
  return {
    slope,
    intercept,
    residual: average(points.map((point) => Math.abs(point.dependent - (slope * point.independent + intercept)))),
    energy: average(points.map((point) => point.energy)),
  }
}

function collectVerticalEdgePoints(
  luminance: Uint8Array,
  width: number,
  height: number,
  startX: number,
  endX: number,
): EdgePoint[] {
  const points: EdgePoint[] = []
  const startY = Math.max(2, Math.floor(height * 0.06))
  const endY = Math.min(height - 3, Math.ceil(height * 0.94))
  for (let y = startY; y <= endY; y += 2) {
    let bestX = -1
    let bestEnergy = 0
    for (let x = Math.max(2, startX); x <= Math.min(width - 3, endX); x += 1) {
      const offset = y * width + x
      const energy = Math.abs(luminance[offset + 1] - luminance[offset - 1])
      if (energy > bestEnergy) {
        bestEnergy = energy
        bestX = x
      }
    }
    if (bestX >= 0 && bestEnergy >= MIN_EDGE_ENERGY) {
      points.push({
        independent: y / (height - 1),
        dependent: bestX / (width - 1),
        energy: bestEnergy,
      })
    }
  }
  return points
}

function collectHorizontalEdgePoints(
  luminance: Uint8Array,
  width: number,
  height: number,
  startY: number,
  endY: number,
): EdgePoint[] {
  const points: EdgePoint[] = []
  const startX = Math.max(2, Math.floor(width * 0.06))
  const endX = Math.min(width - 3, Math.ceil(width * 0.94))
  for (let x = startX; x <= endX; x += 2) {
    let bestY = -1
    let bestEnergy = 0
    for (let y = Math.max(2, startY); y <= Math.min(height - 3, endY); y += 1) {
      const offset = y * width + x
      const energy = Math.abs(luminance[offset + width] - luminance[offset - width])
      if (energy > bestEnergy) {
        bestEnergy = energy
        bestY = y
      }
    }
    if (bestY >= 0 && bestEnergy >= MIN_EDGE_ENERGY) {
      points.push({
        independent: x / (width - 1),
        dependent: bestY / (height - 1),
        energy: bestEnergy,
      })
    }
  }
  return points
}

function intersectVerticalAndHorizontal(vertical: FittedLine, horizontal: FittedLine): NormalizedPoint | null {
  const denominator = 1 - vertical.slope * horizontal.slope
  if (Math.abs(denominator) < 1e-5) return null
  const x = (vertical.slope * horizontal.intercept + vertical.intercept) / denominator
  const y = horizontal.slope * x + horizontal.intercept
  if (x < -0.08 || x > 1.08 || y < -0.08 || y > 1.08) return null
  return { x: clamp(x, 0, 1), y: clamp(y, 0, 1) }
}

function cross(first: NormalizedPoint, second: NormalizedPoint, third: NormalizedPoint): number {
  return (second.x - first.x) * (third.y - second.y)
    - (second.y - first.y) * (third.x - second.x)
}

function isConvexFrame(frame: DocumentFrame): boolean {
  const points = framePoints(frame)
  const crosses = points.map((point, index) => cross(
    point,
    points[(index + 1) % points.length],
    points[(index + 2) % points.length],
  ))
  return crosses.every((value) => value > 0.0001) || crosses.every((value) => value < -0.0001)
}

function detectPerspectiveCandidate(luminance: Uint8Array, width: number, height: number): DocumentFrame | null {
  const left = fitLine(collectVerticalEdgePoints(luminance, width, height, Math.floor(width * 0.03), Math.floor(width * 0.49)))
  const right = fitLine(collectVerticalEdgePoints(luminance, width, height, Math.ceil(width * 0.51), Math.ceil(width * 0.97)))
  const top = fitLine(collectHorizontalEdgePoints(luminance, width, height, Math.floor(height * 0.03), Math.floor(height * 0.48)))
  const bottom = fitLine(collectHorizontalEdgePoints(luminance, width, height, Math.ceil(height * 0.52), Math.ceil(height * 0.97)))
  if (!left || !right || !top || !bottom) return null

  const points = [
    intersectVerticalAndHorizontal(left, top),
    intersectVerticalAndHorizontal(right, top),
    intersectVerticalAndHorizontal(right, bottom),
    intersectVerticalAndHorizontal(left, bottom),
  ]
  if (points.some((point) => !point)) return null

  const lines = [left, right, top, bottom]
  const minimumEnergy = Math.min(...lines.map((line) => line.energy))
  const fitScore = clamp(1 - average(lines.map((line) => line.residual)) / 0.05, 0, 1)
  const provisional = frameFromPoints(points as NormalizedPoint[], 1)
  const area = frameArea(provisional)
  const sideLengths = framePoints(provisional).map((point, index) => {
    const next = framePoints(provisional)[(index + 1) % 4]
    return Math.hypot(next.x - point.x, next.y - point.y)
  })
  if (
    !isConvexFrame(provisional)
    || area < 0.12
    || area > 0.9
    || Math.min(...sideLengths) < 0.22
  ) {
    return null
  }

  const areaScore = clamp((area - 0.12) / 0.46, 0, 1)
  const edgeScore = clamp(minimumEnergy / 80, 0, 1)
  const confidence = Number((0.45 * edgeScore + 0.3 * areaScore + 0.25 * fitScore).toFixed(3))
  if (confidence < MIN_DOCUMENT_CONFIDENCE) return null
  return { ...provisional, confidence }
}

function detectAxisAlignedCandidate(luminance: Uint8Array, width: number, height: number): DocumentFrame | null {
  const verticalEdges = new Array<number>(width).fill(0)
  const horizontalEdges = new Array<number>(height).fill(0)
  const innerTop = Math.floor(height * 0.08)
  const innerBottom = Math.ceil(height * 0.92)
  const innerLeft = Math.floor(width * 0.08)
  const innerRight = Math.ceil(width * 0.92)

  for (let x = 1; x < width - 1; x += 1) {
    const samples: number[] = []
    for (let y = innerTop; y < innerBottom; y += 1) {
      const offset = y * width + x
      samples.push(Math.abs(luminance[offset + 1] - luminance[offset - 1]))
    }
    verticalEdges[x] = average(samples)
  }
  for (let y = 1; y < height - 1; y += 1) {
    const samples: number[] = []
    for (let x = innerLeft; x < innerRight; x += 1) {
      const offset = y * width + x
      samples.push(Math.abs(luminance[offset + width] - luminance[offset - width]))
    }
    horizontalEdges[y] = average(samples)
  }

  const left = edgePeak(verticalEdges, Math.floor(width * 0.04), Math.floor(width * 0.46))
  const right = edgePeak(verticalEdges, Math.ceil(width * 0.54), Math.ceil(width * 0.96))
  const top = edgePeak(horizontalEdges, Math.floor(height * 0.04), Math.floor(height * 0.42))
  const bottom = edgePeak(horizontalEdges, Math.ceil(height * 0.58), Math.ceil(height * 0.96))
  if (!left || !right || !top || !bottom) return null

  const normalizedLeft = left.index / (width - 1)
  const normalizedRight = right.index / (width - 1)
  const normalizedTop = top.index / (height - 1)
  const normalizedBottom = bottom.index / (height - 1)
  const candidateWidth = normalizedRight - normalizedLeft
  const candidateHeight = normalizedBottom - normalizedTop
  const minimumEnergy = Math.min(left.value, right.value, top.value, bottom.value)
  if (
    minimumEnergy < MIN_EDGE_ENERGY
    || candidateWidth < 0.34
    || candidateHeight < 0.28
    || candidateWidth > 0.94
    || candidateHeight > 0.94
  ) return null

  const areaScore = clamp((candidateWidth * candidateHeight - 0.12) / 0.5, 0, 1)
  const edgeScore = clamp(minimumEnergy / 70, 0, 1)
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

/** Detects a high-contrast document quadrilateral from a throttled RGBA camera frame. */
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

  return detectPerspectiveCandidate(luminance, sampleWidth, sampleHeight)
    || detectAxisAlignedCandidate(luminance, sampleWidth, sampleHeight)
}

export function isStableDocumentFrame(frames: Array<DocumentFrame | null | undefined>): boolean {
  if (frames.length < STABLE_FRAME_COUNT) return false
  const recentFrames = frames.slice(-STABLE_FRAME_COUNT)
  if (!recentFrames.every(isValidFrame)) return false

  const validFrames = recentFrames as DocumentFrame[]
  const baseline = validFrames[0]
  const baselineArea = frameArea(baseline)
  if (baselineArea <= 0) return false

  return validFrames.every((candidate) => {
    const areaDelta = Math.abs(frameArea(candidate) - baselineArea) / baselineArea
    return frameMaximumDrift(baseline, candidate) <= MAX_CORNER_DRIFT && areaDelta <= MAX_AREA_DELTA
  })
}

export function getDocumentFrameState(
  frames: Array<DocumentFrame | null | undefined>,
): DocumentFrameState {
  const latest = frames[frames.length - 1]
  if (!isValidFrame(latest)) return 'searching'
  return isStableDocumentFrame(frames) ? 'ready' : 'aligning'
}

export function smoothDocumentFrame(previous: DocumentFrame, detected: DocumentFrame): DocumentFrame {
  const drift = frameMaximumDrift(previous, detected)
  const alpha = clamp(0.16 + drift * 4.8, 0.16, 0.78)
  const previousPoints = framePoints(previous)
  const points = framePoints(detected).map((point, index) => ({
    x: previousPoints[index].x + (point.x - previousPoints[index].x) * alpha,
    y: previousPoints[index].y + (point.y - previousPoints[index].y) * alpha,
  }))
  return frameFromPoints(points, previous.confidence + (detected.confidence - previous.confidence) * alpha)
}

export function createDocumentTrackingSnapshot(): DocumentTrackingSnapshot {
  return {
    frame: null,
    phase: 'searching',
    stableProgress: 0,
    stableSince: null,
    lastSeenAt: null,
    held: false,
  }
}

export function updateDocumentTracking(
  previous: DocumentTrackingSnapshot,
  detected: DocumentFrame | null | undefined,
  now: number,
): DocumentTrackingSnapshot {
  if (!isValidFrame(detected)) {
    const canHold = Boolean(previous.frame)
      && previous.lastSeenAt !== null
      && now - previous.lastSeenAt <= TRACKING_HOLD_MS
    if (canHold) {
      return {
        ...previous,
        phase: 'tracking',
        stableProgress: 0,
        stableSince: null,
        held: true,
      }
    }
    return createDocumentTrackingSnapshot()
  }

  if (!previous.frame) {
    return {
      frame: detected,
      phase: 'tracking',
      stableProgress: 0,
      stableSince: now,
      lastSeenAt: now,
      held: false,
    }
  }

  const drift = frameMaximumDrift(previous.frame, detected)
  const baselineArea = frameArea(previous.frame)
  const areaDelta = baselineArea > 0 ? Math.abs(frameArea(detected) - baselineArea) / baselineArea : 1
  const stable = drift <= MAX_CORNER_DRIFT && areaDelta <= MAX_AREA_DELTA
  const stableSince = stable && !previous.held ? (previous.stableSince ?? now) : now
  const stableProgress = stable ? clamp((now - stableSince) / READY_AFTER_MS, 0, 1) : 0
  return {
    frame: smoothDocumentFrame(previous.frame, detected),
    phase: stableProgress >= 1 ? 'ready' : 'tracking',
    stableProgress,
    stableSince,
    lastSeenAt: now,
    held: false,
  }
}

export function createAutoCaptureSnapshot(): AutoCaptureSnapshot {
  return {
    status: 'idle',
    startedAt: null,
    countdown: 0,
    shouldCapture: false,
  }
}

export function updateAutoCapture(
  previous: AutoCaptureSnapshot,
  update: AutoCaptureUpdate,
): AutoCaptureSnapshot {
  if (update.mode !== 'auto' || update.trackingPhase !== 'ready' || update.blocked) {
    return createAutoCaptureSnapshot()
  }
  if (previous.status === 'triggered') {
    return { ...previous, shouldCapture: false }
  }
  const startedAt = previous.startedAt ?? update.now
  const elapsed = Math.max(0, update.now - startedAt)
  if (elapsed >= AUTO_CAPTURE_DELAY_MS) {
    return {
      status: 'triggered',
      startedAt,
      countdown: 0,
      shouldCapture: true,
    }
  }
  return {
    status: 'countdown',
    startedAt,
    countdown: Math.max(1, Math.ceil((AUTO_CAPTURE_DELAY_MS - elapsed) / 1000)),
    shouldCapture: false,
  }
}

function mapPointToAspectFillImage(
  point: NormalizedPoint,
  previewWidth: number,
  previewHeight: number,
  imageWidth: number,
  imageHeight: number,
): NormalizedPoint {
  const scale = Math.max(previewWidth / imageWidth, previewHeight / imageHeight)
  const displayedWidth = imageWidth * scale
  const displayedHeight = imageHeight * scale
  const offsetX = (displayedWidth - previewWidth) / 2
  const offsetY = (displayedHeight - previewHeight) / 2
  return {
    x: clamp((point.x * previewWidth + offsetX) / displayedWidth, 0, 1),
    y: clamp((point.y * previewHeight + offsetY) / displayedHeight, 0, 1),
  }
}

export function mapDocumentFrameToImage(
  frame: DocumentFrame,
  previewWidth: number,
  previewHeight: number,
  imageWidth: number,
  imageHeight: number,
): DocumentFrame {
  if ([previewWidth, previewHeight, imageWidth, imageHeight].some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('预览或图片尺寸无效')
  }
  return frameFromPoints(
    framePoints(frame).map((point) => mapPointToAspectFillImage(
      point,
      previewWidth,
      previewHeight,
      imageWidth,
      imageHeight,
    )),
    frame.confidence,
  )
}

export function getPerspectiveOutputSize(
  frame: DocumentFrame,
  imageWidth: number,
  imageHeight: number,
  maximumDimension = 1800,
): ImageSize {
  if ([imageWidth, imageHeight, maximumDimension].some((value) => !Number.isFinite(value) || value <= 0)) {
    throw new Error('透视输出尺寸无效')
  }
  const [topLeft, topRight, bottomRight, bottomLeft] = framePoints(frame).map((point) => ({
    x: point.x * imageWidth,
    y: point.y * imageHeight,
  }))
  const width = Math.max(
    Math.hypot(topRight.x - topLeft.x, topRight.y - topLeft.y),
    Math.hypot(bottomRight.x - bottomLeft.x, bottomRight.y - bottomLeft.y),
  )
  const height = Math.max(
    Math.hypot(bottomLeft.x - topLeft.x, bottomLeft.y - topLeft.y),
    Math.hypot(bottomRight.x - topRight.x, bottomRight.y - topRight.y),
  )
  const scale = Math.min(1, maximumDimension / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
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

export interface PixelPoint {
  x: number
  y: number
}

export interface AffineTransform {
  a: number
  b: number
  c: number
  d: number
  e: number
  f: number
}

function cleanNumber(value: number): number {
  return Math.abs(value) < 1e-10 ? 0 : value
}

export function createAffineTriangleTransform(
  source: [PixelPoint, PixelPoint, PixelPoint],
  destination: [PixelPoint, PixelPoint, PixelPoint],
): AffineTransform {
  const [s0, s1, s2] = source
  const [d0, d1, d2] = destination
  const denominator = s0.x * (s1.y - s2.y)
    + s1.x * (s2.y - s0.y)
    + s2.x * (s0.y - s1.y)
  if (Math.abs(denominator) < 1e-8) throw new Error('透视网格三角形无效')

  const solve = (v0: number, v1: number, v2: number): [number, number, number] => [
    cleanNumber((v0 * (s1.y - s2.y) + v1 * (s2.y - s0.y) + v2 * (s0.y - s1.y)) / denominator),
    cleanNumber((v0 * (s2.x - s1.x) + v1 * (s0.x - s2.x) + v2 * (s1.x - s0.x)) / denominator),
    cleanNumber((
      v0 * (s1.x * s2.y - s2.x * s1.y)
      + v1 * (s2.x * s0.y - s0.x * s2.y)
      + v2 * (s0.x * s1.y - s1.x * s0.y)
    ) / denominator),
  ]
  const [a, c, e] = solve(d0.x, d1.x, d2.x)
  const [b, d, f] = solve(d0.y, d1.y, d2.y)
  return { a, b, c, d, e, f }
}

export function sampleDocumentFramePoint(
  frame: DocumentFrame,
  horizontalProgress: number,
  verticalProgress: number,
  imageWidth: number,
  imageHeight: number,
): PixelPoint {
  const u = clamp(horizontalProgress, 0, 1)
  const v = clamp(verticalProgress, 0, 1)
  const top = {
    x: frame.topLeft.x + (frame.topRight.x - frame.topLeft.x) * u,
    y: frame.topLeft.y + (frame.topRight.y - frame.topLeft.y) * u,
  }
  const bottom = {
    x: frame.bottomLeft.x + (frame.bottomRight.x - frame.bottomLeft.x) * u,
    y: frame.bottomLeft.y + (frame.bottomRight.y - frame.bottomLeft.y) * u,
  }
  return {
    x: (top.x + (bottom.x - top.x) * v) * imageWidth,
    y: (top.y + (bottom.y - top.y) * v) * imageHeight,
  }
}
