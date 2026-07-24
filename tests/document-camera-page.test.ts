import test from 'node:test'
import strictAssert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const assert: typeof strictAssert = strictAssert

const projectRoot = path.resolve(import.meta.dirname, '..')

function readProjectFile(relativePath: string): string {
  return fs.readFileSync(path.join(projectRoot, relativePath), 'utf8')
}

test('document camera shows a realtime framing overlay while keeping capture manual', () => {
  const cameraWxml = readProjectFile('miniprogram/pages/document-camera/document-camera.wxml')
  const cameraTs = readProjectFile('miniprogram/pages/document-camera/document-camera.ts')

  assert.match(cameraWxml, /<camera[\s\S]*frame-size="small"/)
  assert.match(cameraWxml, /document-frame--\{\{frameState\}\}/)
  assert.match(cameraWxml, /bindtap="capturePhoto"/)
  assert.match(cameraTs, /onCameraFrame\(/)
  assert.match(cameraTs, /takePhoto\(/)
  assert.doesNotMatch(cameraTs, /setTimeout\([^\n]*takePhoto/)
})

test('confirmed camera photos rejoin the existing recognition queue through the index page', () => {
  const indexTs = readProjectFile('miniprogram/pages/index/index.ts')

  assert.match(indexTs, /url:\s*'\/pages\/document-camera\/document-camera'/)
  assert.match(indexTs, /documentPhotoConfirmed/)
  assert.match(indexTs, /this\.enqueueRecognitionFiles\(\[tempFilePath\]\)/)
})
