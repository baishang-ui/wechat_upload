import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { DATA_SERVER_BASE_URL, RECOGNITION_API_URL } from '../miniprogram/config/server'

const root = resolve(import.meta.dirname, '..')

test('public configuration uses reserved non-production endpoints', () => {
  assert.equal(new URL(DATA_SERVER_BASE_URL).origin, 'https://example.invalid')
  assert.equal(new URL(RECOGNITION_API_URL).origin, 'https://example.invalid')
  assert.equal(new URL(RECOGNITION_API_URL).pathname, '/api/miniprogram/quality-inspections/recognize')
})

test('public project configuration does not embed a registered application identity', () => {
  const config = JSON.parse(readFileSync(resolve(root, 'project.config.json'), 'utf8'))
  assert.equal(config.appid, 'touristappid')
  const ignore = readFileSync(resolve(root, '.gitignore'), 'utf8')
  assert.match(ignore, /^project\.private\.config\.json$/m)
})
