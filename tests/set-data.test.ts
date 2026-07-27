import test from 'node:test'
import assert from 'node:assert/strict'
import { buildChangedDataPatch } from '../miniprogram/utils/set-data'

test('buildChangedDataPatch omits unchanged primitive fields', () => {
  assert.deepEqual(
    buildChangedDataPatch(
      { phase: 'searching', message: '保持稳定', progress: 0, held: false },
      { phase: 'searching', message: '保持稳定', progress: 0, held: false },
    ),
    {},
  )
})

test('buildChangedDataPatch includes only fields whose values changed', () => {
  assert.deepEqual(
    buildChangedDataPatch(
      { phase: 'searching', message: '保持稳定', progress: 0, held: false },
      { phase: 'tracking', message: '正在识别边缘', progress: 25, held: false },
    ),
    { phase: 'tracking', message: '正在识别边缘', progress: 25 },
  )
})
