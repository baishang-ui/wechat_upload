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

export interface PhotoOrientationPlan {
  outputWidth: number
  outputHeight: number
  matrix: CanvasTransformMatrix
  requiresNormalization: boolean
}

/** Returns the canvas transform that physically applies an image's EXIF orientation. */
export function getPhotoOrientationPlan(
  orientation: PhotoExifOrientation,
  width: number,
  height: number,
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
      return {
        outputWidth: width,
        outputHeight: height,
        matrix: [1, 0, 0, 1, 0, 0],
        requiresNormalization: false,
      }
  }
}
