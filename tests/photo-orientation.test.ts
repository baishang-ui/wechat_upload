import test from 'node:test'
import strictAssert from 'node:assert/strict'

const assert: typeof strictAssert = strictAssert

import {
  getLandscapeFallbackRotation,
  getManualRotationPlan,
  getPhotoOrientationPlan,
} from '../miniprogram/domain/photo-orientation'

test('upright photos keep their original dimensions and skip pixel normalization', () => {
  assert.deepEqual(getPhotoOrientationPlan('up', 3024, 4032), {
    outputWidth: 3024,
    outputHeight: 4032,
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

test('device gamma selects the inverse compensation rotation for landscape capture', () => {
  assert.equal(getLandscapeFallbackRotation(0.9), 'counterclockwise')
  assert.equal(getLandscapeFallbackRotation(-0.9), 'clockwise')
  assert.equal(getLandscapeFallbackRotation(0.3), 'unknown')
  assert.equal(getLandscapeFallbackRotation(null), 'unknown')
  assert.equal(getLandscapeFallbackRotation(null, 'landscape'), 'clockwise')
})

test('upright EXIF landscape pixels use the capture-time fallback rotation', () => {
  assert.deepEqual(getPhotoOrientationPlan('up', 4032, 3024, 'clockwise'), {
    outputWidth: 3024,
    outputHeight: 4032,
    matrix: [0, 1, -1, 0, 3024, 0],
    requiresNormalization: true,
  })
  assert.deepEqual(getPhotoOrientationPlan('up', 4032, 3024, 'counterclockwise'), {
    outputWidth: 3024,
    outputHeight: 4032,
    matrix: [0, -1, 1, 0, 0, 4032],
    requiresNormalization: true,
  })
})

test('upright EXIF does not guess rotation from landscape pixel dimensions', () => {
  assert.deepEqual(getPhotoOrientationPlan('up', 4032, 3024, 'unknown'), {
    outputWidth: 4032,
    outputHeight: 3024,
    matrix: [1, 0, 0, 1, 0, 0],
    requiresNormalization: false,
  })
  assert.deepEqual(getPhotoOrientationPlan('up', 3024, 4032, 'clockwise'), {
    outputWidth: 4032,
    outputHeight: 3024,
    matrix: [0, 1, -1, 0, 4032, 0],
    requiresNormalization: true,
  })
  assert.deepEqual(getPhotoOrientationPlan('up', 3024, 4032, 'counterclockwise'), {
    outputWidth: 4032,
    outputHeight: 3024,
    matrix: [0, -1, 1, 0, 0, 3024],
    requiresNormalization: true,
  })
})

test('manual rotation plans rotate the current preview exactly ninety degrees', () => {
  assert.deepEqual(getManualRotationPlan(1200, 1600, 'clockwise'), {
    outputWidth: 1600,
    outputHeight: 1200,
    matrix: [0, 1, -1, 0, 1600, 0],
    requiresNormalization: true,
  })
  assert.deepEqual(getManualRotationPlan(1200, 1600, 'counterclockwise'), {
    outputWidth: 1600,
    outputHeight: 1200,
    matrix: [0, -1, 1, 0, 0, 1200],
    requiresNormalization: true,
  })
})
