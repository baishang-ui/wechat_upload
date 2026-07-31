import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const source = (relativePath: string) => fs.readFileSync(path.join(root, relativePath), 'utf8')

test('pending product selection opens a paged inspection workbench modal instead of navigating away', () => {
  const indexTs = source('miniprogram/pages/index/index.ts')
  const indexWxml = source('miniprogram/pages/index/index.wxml')
  const indexJson = source('miniprogram/pages/index/index.json')

  assert.match(indexTs, /workbenchModalVisible/)
  assert.match(indexTs, /openWorkbenchModal/)
  assert.doesNotMatch(indexTs, /wx\.navigateTo\(\{\s*url:\s*`\/pages\/inspection-workbench/)
  assert.match(indexWxml, /<inspection-workbench-modal/)
  assert.match(indexWxml, /visible="\{\{workbenchModalVisible\}\}"/)
  assert.match(indexJson, /"inspection-workbench-modal"/)
})

test('inspection workbench modal uses a record-style drawer, page controls, and focused expandable cards', () => {
  const wxml = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')
  const scss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(wxml, /class="workbench-modal-layer/)
  assert.match(wxml, /class="workbench-modal-mask/)
  assert.match(wxml, /class="workbench-modal-panel/)
  assert.match(wxml, /class="modal-grabber/)
  assert.match(wxml, /class="workbench-modal-body/)
  assert.match(wxml, /class="workbench-modal-actions/)
  assert.match(wxml, /上一页/)
  assert.match(wxml, /下一页/)
  assert.match(wxml, /保存草稿/)
  assert.match(wxml, /class="inspection-item-card/)
  assert.match(wxml, /bindtap="toggleRowExpanded"/)
  assert.doesNotMatch(wxml, /inspection-table-scroll/)
  assert.match(ts, /buildInspectionWorkbenchPages/)
  assert.match(ts, /requestClose/)
  assert.match(ts, /showUnsavedCloseDialog/)
  assert.match(scss, /@keyframes modal-sheet-up/)
})

test('inspection workbench modal always uses the Web-aligned online formal template', () => {
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(ts, /const template = buildOnlineInspectionTemplate\(detail\)/)
  assert.doesNotMatch(ts, /let template = item\.inspection_template/)
})

test('inspection workbench drawer mirrors the six online formal report sections and final decision content', () => {
  const wxml = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(ts, /buildInspectionWorkbenchFinalState/)
  assert.match(wxml, /currentPage\.kind === 'overview'/)
  assert.match(wxml, /报告编号/)
  assert.match(wxml, /检验日期/)
  assert.match(wxml, /产品名称/)
  assert.match(wxml, /物料编码/)
  assert.match(wxml, /批号/)
  assert.match(wxml, /规格型号/)
  assert.match(wxml, /订单号/)
  assert.match(wxml, /抽检数量/)
  assert.match(wxml, /检验模板/)
  assert.match(wxml, /currentPage\.kind === 'inspection'/)
  assert.match(wxml, /currentPage\.kind === 'final'/)
  assert.match(wxml, /合格/)
  assert.match(wxml, /让步接收/)
  assert.match(wxml, /不合格/)
  assert.match(wxml, /异常说明与处理建议/)
  assert.match(wxml, /总判定/)
  assert.doesNotMatch(wxml, /每页最多展示 3 项/)
})

test('inspection workbench drawer keeps record-style fixed height, scrollable content, and exit animation', () => {
  const wxml = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')
  const scss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(wxml, /class="workbench-modal-layer \{\{closing \? 'is-closing' : ''\}\}"/)
  assert.match(scss, /\.workbench-modal-panel\s*\{[\s\S]*?height:\s*88vh/)
  assert.doesNotMatch(scss, /\.workbench-modal-panel\s*\{[\s\S]*?max-height:\s*91vh/)
  assert.match(scss, /\.workbench-modal-body\s*\{[\s\S]*?min-height:\s*0[\s\S]*?flex:\s*1/)
  assert.match(scss, /\.workbench-modal-actions\s*\{[\s\S]*?flex:\s*none/)
  assert.match(scss, /\.workbench-modal-layer\.is-closing \.workbench-modal-mask\s*\{[\s\S]*?modal-mask-out/)
  assert.match(scss, /\.workbench-modal-layer\.is-closing \.workbench-modal-panel\s*\{[\s\S]*?modal-sheet-down/)
  assert.match(ts, /closing:\s*false/)
  assert.match(ts, /this\.setData\(\{ closing: true \}\)/)
  assert.match(ts, /setTimeout\([\s\S]*?this\.triggerEvent\('close'/)
})

test('inspection workbench keeps actions readable and content orderly on narrow screens', () => {
  const wxml = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')
  const scss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')

  assert.match(wxml, /class="workbench-modal-heading"/)
  assert.match(wxml, /<view class="recognition-button recognition-button--primary/)
  assert.match(wxml, /<view class="recognition-button[^"]*"[^>]*bindtap="chooseQualitySheetPhoto"[^>]*>从相册选择<\/view>/)
  assert.doesNotMatch(wxml, /<button class="recognition-button/)
  assert.match(wxml, /class="workbench-pagination-actions"[\s\S]*?上一页[\s\S]*?page-status[\s\S]*?下一页/)
  assert.match(wxml, /<view class="workbench-modal-actions">[\s\S]*?<view class="workbench-pagination-actions">[\s\S]*?<view class="save-button/)
  assert.match(scss, /\.workbench-modal-heading\s*\{[\s\S]*?min-width:\s*0[\s\S]*?flex:\s*1/)
  assert.match(scss, /\.recognition-actions\s*\{[\s\S]*?display:\s*flex/)
  assert.match(scss, /\.recognition-button\s*\{[\s\S]*?min-width:\s*0[\s\S]*?flex:\s*1/)
  assert.match(scss, /\.workbench-modal-title\s*\{[\s\S]*?text-overflow:\s*ellipsis[\s\S]*?white-space:\s*nowrap/)
  assert.match(scss, /\.workbench-modal-actions\s*\{[\s\S]*?flex-direction:\s*column/)
  assert.match(scss, /\.workbench-pagination-actions\s*\{[\s\S]*?display:\s*flex/)
  assert.match(wxml, /<view class="workbench-close"[\s\S]*?hover-class="workbench-close--pressed"/)
  assert.doesNotMatch(wxml, /<button class="workbench-close"/)
  assert.doesNotMatch(wxml, /<button class="page-button/)
  assert.doesNotMatch(wxml, /<button class="save-button/)
  assert.match(scss, /\.workbench-close\s*\{[\s\S]*?display:\s*flex[\s\S]*?border-radius:\s*50%/)
  assert.match(scss, /\.page-button\s*\{[\s\S]*?flex:\s*1/)
  assert.match(scss, /\.save-button\s*\{[\s\S]*?width:\s*100%/)
  assert.match(wxml, /现场照片[\s\S]*?<view class="photo-add-button site-photo-add-button"/)
  assert.doesNotMatch(wxml, /现场照片[\s\S]*?<button class="photo-add-button"/)
  assert.match(scss, /\.site-photo-add-button\s*\{[^}]*width:\s*136rpx;[^}]*min-width:\s*136rpx;[^}]*max-width:\s*136rpx;[^}]*height:\s*136rpx;[^}]*min-height:\s*136rpx;[^}]*max-height:\s*136rpx;/)
  assert.match(scss, /@media \(max-width:\s*360px\)[\s\S]*?\.recognition-actions[\s\S]*?flex-direction:\s*column/)
  assert.match(scss, /@media \(max-width:\s*360px\)[\s\S]*?\.measurement-grid[\s\S]*?grid-template-columns:\s*1fr/)
  assert.match(scss, /@media \(max-width:\s*360px\)[\s\S]*?\.workbench-photo-grid[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\)/)
})

test('closing or saving the workbench leaves list refresh to the pull-down gesture', () => {
  const indexTs = source('miniprogram/pages/index/index.ts')
  const closeMethod = indexTs.match(/closeWorkbenchModal\(\)\s*\{([\s\S]*?)\n    \},\n    onWorkbenchSaved/)?.[1] || ''
  const savedMethod = indexTs.match(/onWorkbenchSaved\(\)\s*\{([\s\S]*?)\n    \},/)?.[1] || ''

  assert.ok(closeMethod)
  assert.doesNotMatch(closeMethod, /loadTasks/)
  assert.doesNotMatch(savedMethod, /loadTasks/)
})

test('manual save from the drawer does not treat the tap event as a close-after-save request', () => {
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(ts, /const shouldClose = closeAfterSave === true/)
  assert.match(ts, /if \(shouldClose\) this\.finishClose\(\)/)
})

test('workbench drawer is mounted only when opened and initializes on attachment', () => {
  const indexWxml = source('miniprogram/pages/index/index.wxml')
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(indexWxml, /<inspection-workbench-modal[\s\S]*wx:if="\{\{workbenchModalVisible\}\}"/)
  assert.match(ts, /lifetimes:\s*\{[\s\S]*attached\(\)/)
  assert.match(ts, /void this\.loadWorkbench\(\)/)
})

test('workbench drawer discards stale item detail responses before they can overwrite a newer selection', () => {
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(ts, /const requestedTaskId = this\.data\.taskId/)
  assert.match(ts, /const requestedItemId = this\.data\.itemId/)
  assert.match(ts, /!this\.isActiveWorkbenchRequest\(requestedTaskId, requestedItemId\)/)
  assert.match(ts, /this\.data\.visible && !this\.data\.closing && this\.data\.taskId && this\.data\.itemId/)
})

test('pending workbench drawer uses a decision switch with on as OK and off as NG', () => {
  const wxml = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')
  const scss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')
  const handler = ts.match(/onDecisionChange\(event: SwitchEvent\) \{([\s\S]*?)\n    \},\n\n    onRowFieldInput/)?.[1] || ''

  assert.match(wxml, /<switch[^>]*checked="\{\{row\.decision === 'OK'\}\}"[^>]*bindchange="onDecisionChange"/)
  assert.doesNotMatch(wxml, /<input[^>]*data-field="decision"/)
  assert.match(handler, /event\.detail\.value \? 'OK' : 'NG'/)
  assert.match(handler, /updateWorkbenchRowField\(this\.data\.workbench\.rows, rowKey, 'decision', decision\)/)
  assert.match(scss, /\.decision-switch-control/)
  assert.match(scss, /\.decision-switch-label\.is-ng/)
})

test('workbench draft metadata keeps the purchase contract separate from the quality order number', () => {
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')

  assert.match(ts, /orderNumber:\s*text\(task\.contract_no\)/)
  assert.doesNotMatch(ts, /orderNumber:\s*text\(task\.contract_no \|\| task\.task_no\)/)
})


test('recognized quality sheets are uploaded before draft save instead of embedding base64 in the item remark', () => {
  const modal = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')
  const qualitySheetMethod = modal.match(/async recognizeQualitySheet\(imagePath: string\) \{([\s\S]*?)\n    \},\n\n    previewReportImage/)?.[1] || ''

  assert.match(qualitySheetMethod, /uploadInspectionDraftImage\(\s*requestedTaskId,\s*requestedItemId,\s*preparedPath,\s*\)/)
  assert.doesNotMatch(qualitySheetMethod, /inspectionImageToDataUrl\(preparedPath\)/)
  assert.match(qualitySheetMethod, /let reportImages = this\.data\.reportImages/)
  assert.match(qualitySheetMethod, /reportImages,/)
  assert.match(modal, /saveInspectionDraft\(this\.data\.taskId, this\.data\.itemId/)
})

test('workbench overview uploads inspection photos to the online AI workbench without running AI locally', () => {
  const wxml = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.wxml')
  const scss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')
  const photoMethods = ts.match(/chooseInspectionPhotos\(\) \{[\s\S]*?\n    \},\n\n    takeQualitySheetPhoto/)?.[0] || ''

  assert.match(wxml, /验货图片识别/)
  assert.match(wxml, /同步到线上验货图片识别区域/)
  assert.match(wxml, /bindtap="chooseInspectionPhotos"/)
  assert.match(wxml, /inspectionImages/)
  assert.match(wxml, /线上正在识别归类/)
  assert.match(wxml, /已关联 \{\{inspectionClassifiedCount\}\}/)
  assert.doesNotMatch(wxml, /inspectionImageGroups|unassignedInspectionImages/)
  assert.doesNotMatch(wxml, /inspection-upload-list|inspection-classification-list/)
  assert.doesNotMatch(wxml, /previewInspectionImage|deleteInspectionImage/)
  assert.match(wxml, /wx:for="\{\{row\.images\}\}"/)
  assert.match(wxml, /现场照片/)
  assert.doesNotMatch(wxml, /assignPendingPhoto|removePendingPhoto|candidateRow/)
  assert.match(ts, /photoUploading:\s*false/)
  assert.match(ts, /photoUploadError:\s*''/)
  assert.match(ts, /inspectionImages:\s*\[\]/)
  assert.match(ts, /buildInspectionImageClassificationState/)
  assert.match(ts, /mergeInspectionImageAssignmentsIntoRows/)
  assert.match(ts, /uploadInspectionWorkbenchImage/)
  assert.match(ts, /visual_recognition_request:\s*imageCount > 0/)
  assert.match(ts, /status:\s*'pending'[\s\S]*?source:\s*'miniprogram'/)
  assert.match(ts, /status:\s*'cleared'[\s\S]*?source:\s*'miniprogram'[\s\S]*?image_count:\s*0/)
  assert.match(ts, /await saveInspectionDraft\(requestedTaskId, requestedItemId/)
  assert.match(ts, /deleteInspectionImageAt\(index: number\)/)
  assert.match(ts, /this\.saveDraft\(false, \[photo\.remoteUrl\]\)/)
  assert.match(ts, /deletedRecordImages/)
  assert.match(ts, /inspectionRecognitionRequest\(inspectionImages\.length\)/)
  assert.match(ts, /inspectionImages,\s*\n\s*aiResult:\s*aiWorkbenchResult/)
  assert.doesNotMatch(ts, /recognizeInspectionPhotoAssignments|classifyInspectionPhotoAssignments/)
  assert.doesNotMatch(photoMethods, /recognizeInspection\s*\(/)
  assert.doesNotMatch(photoMethods, /\/ai-judge/)
  assert.doesNotMatch(photoMethods, /wx\.showModal|wx\.showActionSheet/)
  assert.doesNotMatch(scss, /\.inspection-upload-list/)
  assert.doesNotMatch(scss, /\.inspection-upload-preview/)
  assert.doesNotMatch(scss, /\.inspection-classification-group/)
  assert.match(scss, /\.inspection-classification-status\.is-pending/)
  assert.doesNotMatch(scss, /\.pending-photo-/)
})

test('row photo uploads and retries persist the shared backend draft without refreshing the workbench', () => {
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')
  const syncFlow = ts.slice(
    ts.indexOf('async syncUploadedRowPhotos'),
    ts.indexOf('async appendAndUploadPhotos'),
  )
  const uploadFlow = ts.slice(
    ts.indexOf('async appendAndUploadPhotos'),
    ts.indexOf('previewPhoto(event'),
  )
  const retryFlow = ts.slice(
    ts.indexOf('async retryPhotoUpload'),
    ts.indexOf('chooseInspectionPhotos()'),
  )

  assert.match(ts, /async syncUploadedRowPhotos/)
  assert.doesNotMatch(syncFlow, /loadWorkbench\(\)/)
  assert.match(uploadFlow, /await this\.syncUploadedRowPhotos\(requestedTaskId, requestedItemId, rows\)/)
  assert.match(retryFlow, /await this\.syncUploadedRowPhotos\(requestedTaskId, requestedItemId, rows\)/)
  assert.match(ts, /照片已上传并同步/)
})

test('workbench photo requests stop mutating the drawer after closing begins', () => {
  const ts = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.ts')
  const scss = source('miniprogram/components/inspection-workbench-modal/inspection-workbench-modal.scss')

  assert.match(ts, /isActiveWorkbenchRequest\(taskId: number, itemId: number\): boolean \{\s*return this\.data\.visible\s*&& !this\.data\.closing\s*&& taskId === this\.data\.taskId\s*&& itemId === this\.data\.itemId/)
  assert.match(ts, /async loadWorkbench\(\) \{[\s\S]*?!this\.isActiveWorkbenchRequest\(requestedTaskId, requestedItemId\)/)
  assert.match(ts, /async uploadInspectionPhotos\(localPaths: string\[\]\) \{[\s\S]*?if \(!this\.isActiveWorkbenchRequest\(requestedTaskId, requestedItemId\)\) return/)
  assert.match(ts, /async appendAndUploadPhotos\(rowKey: string, localPaths: string\[\]\) \{[\s\S]*?if \(!this\.isActiveWorkbenchRequest\(requestedTaskId, requestedItemId\)\) return/)
  assert.match(ts, /async saveDraft\(closeAfterSave = false, deletedRecordImages: string\[\] = \[\]\) \{[\s\S]*?!this\.isActiveWorkbenchRequest\(this\.data\.taskId, this\.data\.itemId\)/)
  assert.match(scss, /\.workbench-modal-mask\s*\{[\s\S]*?backdrop-filter:\s*blur\(12rpx\)/)
  assert.match(scss, /\.workbench-modal-layer\.is-closing \.workbench-modal-panel\s*\{[\s\S]*?modal-sheet-down/)
})
