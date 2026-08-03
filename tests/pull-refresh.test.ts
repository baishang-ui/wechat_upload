import assert from 'node:assert/strict'
import { test } from 'node:test'

import { pullRefreshRotationForDistance } from '../miniprogram/domain/pull-refresh'

test('pull refresh rotation follows drag distance and stays bounded', () => {
  assert.equal(pullRefreshRotationForDistance(-10), 0)
  assert.equal(pullRefreshRotationForDistance(0), 0)
  assert.equal(pullRefreshRotationForDistance(18), 72)
  assert.equal(pullRefreshRotationForDistance(72), 288)
  assert.equal(pullRefreshRotationForDistance(80), 320)
  assert.equal(pullRefreshRotationForDistance(200), 320)
  assert.equal(pullRefreshRotationForDistance(Number.NaN), 0)
})
