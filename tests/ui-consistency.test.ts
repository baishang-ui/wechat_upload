import test from 'node:test'
import strictAssert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const assert: typeof strictAssert = strictAssert
const root = resolve(__dirname, '..')
const source = (path: string) => readFileSync(resolve(root, path), 'utf8')

test('login and index pages share the inspection design tokens', () => {
  const loginScss = source('miniprogram/pages/login/login.scss')
  const indexScss = source('miniprogram/pages/index/index.scss')
  assert.match(loginScss, /@import ['"]\.\.\/\.\.\/styles\/design-tokens['"];/)
  assert.match(indexScss, /@import ['"]\.\.\/\.\.\/styles\/design-tokens['"];/)
})

test('login page uses the internal card and form hierarchy', () => {
  const wxml = source('miniprogram/pages/login/login.wxml')
  const scss = source('miniprogram/pages/login/login.scss')
  assert.match(wxml, /class="login-intro"/)
  assert.match(wxml, /class="login-form-heading"/)
  assert.match(wxml, /class="login-field"/)
  assert.match(wxml, /class="error-message"/)
  assert.doesNotMatch(scss, /linear-gradient/)
})

test('pending inspection page exposes unified toolbar, state and task metadata classes', () => {
  const wxml = source('miniprogram/pages/index/index.wxml')
  assert.match(wxml, /class="task-toolbar-heading"/)
  assert.match(wxml, /class="task-state-icon/)
  assert.match(wxml, /class="task-card-kicker"/)
  assert.match(wxml, /class="task-card-details"/)
})
