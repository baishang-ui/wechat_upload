import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import { getPhotoOrientationPlan } from '../miniprogram/domain/photo-orientation'

test('upright photos keep their original dimensions and skip pixel normalization', () => {
  assert.deepEqual(getPhotoOrientationPlan('up', 4032, 3024), {
    outputWidth: 4032,
    outputHeight: 3024,
    matrix: [1, 0, 0, 1, 0, 0],
    requiresNormalization: false,
  })
})

test('right and left EXIF orientations swap dimensions and rotate pixels upright', () => {
  assert.deepEqual(getPhotoOrientationPlan('right', 4032, 3024), {
    outputWidth: 3024,
    outputHeight: 4032,
    matrix: [0, 1, -1, 0, 3024, 0],
    requiresNormalization: true,
  })
  assert.deepEqual(getPhotoOrientationPlan('left', 4032, 3024), {
    outputWidth: 3024,
    outputHeight: 4032,
    matrix: [0, -1, 1, 0, 0, 4032],
    requiresNormalization: true,
  })
})

test('down and mirrored EXIF orientations use bounded normalization matrices', () => {
  assert.deepEqual(getPhotoOrientationPlan('down', 1200, 1600), {
    outputWidth: 1200,
    outputHeight: 1600,
    matrix: [-1, 0, 0, -1, 1200, 1600],
    requiresNormalization: true,
  })
  assert.deepEqual(getPhotoOrientationPlan('left-mirrored', 1200, 1600), {
    outputWidth: 1600,
    outputHeight: 1200,
    matrix: [0, 1, 1, 0, 0, 0],
    requiresNormalization: true,
  })
  assert.deepEqual(getPhotoOrientationPlan('right-mirrored', 1200, 1600), {
    outputWidth: 1600,
    outputHeight: 1200,
    matrix: [0, -1, -1, 0, 1600, 1200],
    requiresNormalization: true,
  })
})
