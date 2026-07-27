export type PhotoExifOrientation =
  | 'up'
  | 'up-mirrored'
  | 'down'
  | 'down-mirrored'
  | 'left-mirrored'
  | 'right'
  | 'right-mirrored'
  | 'left'

export type CanvasTransformMatrix = [number, number, number, number, number, number]
export type LandscapeFallbackRotation = 'clockwise' | 'counterclockwise' | 'unknown'
export type ManualRotationDirection = Exclude<LandscapeFallbackRotation, 'unknown'>
export type CaptureDeviceOrientation = 'portrait' | 'landscape'

const LANDSCAPE_GAMMA_THRESHOLD = 0.7

export interface PhotoOrientationPlan {
  outputWidth: number
  outputHeight: number
  matrix: CanvasTransformMatrix
  requiresNormalization: boolean
}

/** Maps capture-time device roll to the inverse pixel compensation used when EXIF stays `up`. */
export function getLandscapeFallbackRotation(
  gamma: number | null | undefined,
  deviceOrientation: CaptureDeviceOrientation = 'portrait',
): LandscapeFallbackRotation {
  if (typeof gamma === 'number' && Number.isFinite(gamma)) {
    if (gamma >= LANDSCAPE_GAMMA_THRESHOLD) return 'counterclockwise'
    if (gamma <= -LANDSCAPE_GAMMA_THRESHOLD) return 'clockwise'
  }
  return deviceOrientation === 'landscape' ? 'clockwise' : 'unknown'
}

/** Returns the canvas transform that physically applies an image's EXIF orientation. */
export function getPhotoOrientationPlan(
  orientation: PhotoExifOrientation,
  width: number,
  height: number,
  fallbackRotation: LandscapeFallbackRotation = 'unknown',
): PhotoOrientationPlan {
  switch (orientation) {
    case 'up-mirrored':
      return {
        outputWidth: width,
        outputHeight: height,
        matrix: [-1, 0, 0, 1, width, 0],
        requiresNormalization: true,
      }
    case 'down':
      return {
        outputWidth: width,
        outputHeight: height,
        matrix: [-1, 0, 0, -1, width, height],
        requiresNormalization: true,
      }
    case 'down-mirrored':
      return {
        outputWidth: width,
        outputHeight: height,
        matrix: [1, 0, 0, -1, 0, height],
        requiresNormalization: true,
      }
    case 'left-mirrored':
      return {
        outputWidth: height,
        outputHeight: width,
        matrix: [0, 1, 1, 0, 0, 0],
        requiresNormalization: true,
      }
    case 'right':
      return {
        outputWidth: height,
        outputHeight: width,
        matrix: [0, 1, -1, 0, height, 0],
        requiresNormalization: true,
      }
    case 'right-mirrored':
      return {
        outputWidth: height,
        outputHeight: width,
        matrix: [0, -1, -1, 0, height, width],
        requiresNormalization: true,
      }
    case 'left':
      return {
        outputWidth: height,
        outputHeight: width,
        matrix: [0, -1, 1, 0, 0, width],
        requiresNormalization: true,
      }
    case 'up':
    default:
      if (fallbackRotation !== 'unknown') {
        if (fallbackRotation === 'counterclockwise') {
          return {
            outputWidth: height,
            outputHeight: width,
            matrix: [0, -1, 1, 0, 0, width],
            requiresNormalization: true,
          }
        }
        return {
          outputWidth: height,
          outputHeight: width,
          matrix: [0, 1, -1, 0, height, 0],
          requiresNormalization: true,
        }
      }
      return {
        outputWidth: width,
        outputHeight: height,
        matrix: [1, 0, 0, 1, 0, 0],
        requiresNormalization: false,
      }
  }
}

/** Returns a lossless-size canvas plan for one explicit 90-degree user rotation. */
export function getManualRotationPlan(
  width: number,
  height: number,
  direction: ManualRotationDirection,
): PhotoOrientationPlan {
  if (direction === 'counterclockwise') {
    return {
      outputWidth: height,
      outputHeight: width,
      matrix: [0, -1, 1, 0, 0, width],
      requiresNormalization: true,
    }
  }
  return {
    outputWidth: height,
    outputHeight: width,
    matrix: [0, 1, -1, 0, height, 0],
    requiresNormalization: true,
  }
}
