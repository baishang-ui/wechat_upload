import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(__dirname, '..')

function source(relativePath: string): string {
  return fs.readFileSync(path.join(root, relativePath), 'utf8')
}

test('Taro migration locks the React 18 compatible runtime and HeroUI versions', () => {
  const packageJson = JSON.parse(source('package.json')) as {
    scripts: Record<string, string>
    dependencies: Record<string, string>
  }
  assert.equal(packageJson.dependencies['@tarojs/react'], '4.2.1')
  assert.equal(packageJson.dependencies.react, '18.3.1')
  assert.equal(packageJson.dependencies['react-dom'], '18.3.1')
  assert.equal(packageJson.dependencies['@heroui/react'], '2.8.10')
  assert.equal(packageJson.scripts['build:weapp'], 'taro build --type weapp')
  assert.equal(packageJson.scripts['build:h5'], 'taro build --type h5')
  assert.equal(packageJson.scripts['typecheck:taro'], 'tsc --noEmit -p tsconfig.taro.json')
})

test('HeroUI stays in H5 platform implementations and out of WEAPP UI modules', () => {
  const h5Sources = [
    source('src/ui/provider.h5.tsx'),
    source('src/ui/button.h5.tsx'),
    source('src/ui/card.h5.tsx'),
    source('src/ui/field.h5.tsx'),
  ].join('\n')
  const weappSources = [
    source('src/ui/provider.tsx'),
    source('src/ui/button.tsx'),
    source('src/ui/card.tsx'),
    source('src/ui/field.tsx'),
  ].join('\n')
  assert.match(h5Sources, /from '@heroui\/react'/)
  assert.doesNotMatch(weappSources, /@heroui\/react|react-dom|framer-motion/)
  assert.match(weappSources, /@tarojs\/components/)
})

test('Taro routes cover the existing five-page application shell', () => {
  const appConfig = source('src/app.config.ts')
  assert.match(appConfig, /'pages\/index\/index'/)
  assert.match(appConfig, /'pages\/login\/index'/)
  assert.match(appConfig, /'pages\/document-camera\/index'/)
  assert.match(appConfig, /'pages\/inspection-workbench\/index'/)
  assert.match(appConfig, /'pages\/logs\/index'/)
})

test('React workspace reuses the tested continuous damped tab domain', () => {
  const tabs = source('src/components/workspace-tabs/index.tsx')
  const styles = source('src/components/workspace-tabs/index.scss')
  assert.match(tabs, /resolveContinuousTabDrag/)
  assert.match(tabs, /getTabDragStretch/)
  assert.match(tabs, /getTabDragScaleY/)
  assert.match(styles, /cubic-bezier\(/)
  assert.match(styles, /tab-shape-right/)
  assert.match(styles, /tab-shape-left/)
})

test('migration design keeps the native production entry until parity verification', () => {
  const projectConfig = JSON.parse(source('project.config.json')) as {
    miniprogramRoot: string
  }
  const design = source('docs/superpowers/specs/2026-08-03-taro-react18-heroui-migration-design.md')
  assert.equal(projectConfig.miniprogramRoot, 'miniprogram/')
  assert.match(design, /不修改 `project\.config\.json` 的 `miniprogramRoot`/)
  assert.match(design, /HeroUI 3 要求 React 19/)
})

test('React recognition workspace orchestrates the existing queue state machine', () => {
  const workspace = source('src/components/recognition-workspace/index.tsx')
  assert.match(workspace, /appendRecognitionQueue/)
  assert.match(workspace, /claimQueuedRecognitionItems/)
  assert.match(workspace, /markQueueItemRecognizing/)
  assert.match(workspace, /completeQueueItem/)
  assert.match(workspace, /failQueueItem/)
  assert.match(workspace, /retryQueueItem/)
  assert.match(workspace, /requestQueueItemSkip/)
  assert.match(workspace, /removeQueueItem/)
  assert.match(workspace, /getTimedRecognitionProgress/)
})

test('Taro recognition service keeps upload preparation and read-only session boundaries', () => {
  const recognition = source('src/services/recognition.ts')
  assert.match(recognition, /recognizeInspection\(/)
  assert.match(recognition, /recognizeInspectionFile\(filePath, upload\)/)
  assert.match(recognition, /prepareImageForUpload/)
  assert.match(recognition, /getFileInfo/)
  assert.match(recognition, /compressImage/)
})

test('React review editor preserves ten samples and red-yellow review semantics', () => {
  const editor = source('src/components/recognition-review-editor/index.tsx')
  const styles = source('src/components/recognition-review-editor/index.scss')
  assert.match(editor, /MEASUREMENT_COUNT/)
  assert.match(editor, /markReviewHintReviewed/)
  assert.match(editor, /updateRecordField/)
  assert.match(editor, /updateRowField/)
  assert.match(editor, /updateMeasurement/)
  assert.match(editor, /updateSampleJudgement/)
  assert.match(styles, /is-confidence-danger/)
  assert.match(styles, /is-confidence-warning/)
})

test('React review save flow persists locally before sync and exports the stable schema', () => {
  const records = source('src/services/inspection-records.ts')
  const workspace = source('src/components/recognition-workspace/index.tsx')
  assert.match(records, /saveInspectionHistory/)
  assert.match(records, /syncStoredInspection/)
  assert.match(records, /exportInspectionJson/)
  assert.match(records, /historyAdapter/)
  assert.match(workspace, /saveRecognizedInspection/)
  assert.match(workspace, /exportRecognizedInspection/)
})

test('React inspection workbench reuses formal templates and server image lifecycle', () => {
  const page = source('src/pages/inspection-workbench/index.tsx')
  const service = source('src/services/inspection-workbench.ts')
  assert.match(page, /buildOnlineInspectionTemplate/)
  assert.match(page, /buildInspectionWorkbench/)
  assert.match(page, /workbenchToDraft/)
  assert.match(page, /updateWorkbenchMeasurement/)
  assert.match(page, /updateWorkbenchRowField/)
  assert.match(page, /addLocalPhotos/)
  assert.match(page, /deletedRecordImages/)
  assert.match(service, /prepareImageForUpload/)
  assert.match(service, /uploadInspectionRowImage/)
  assert.match(service, /uploadInspectionWorkbenchImage/)
  assert.match(service, /sessionMode|upload/)
})
