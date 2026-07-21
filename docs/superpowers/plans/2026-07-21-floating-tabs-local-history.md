# Floating Tabs and Local History Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a polished two-tab floating navigation bar and locally persisted editable OCR history to the existing WeChat Mini Program.

**Architecture:** Keep history ordering, limits, upserts, and deletion in a pure TypeScript domain module. Wrap WeChat storage and saved-file APIs in an injectable TypeScript service. The index component coordinates scan state and history state while reusing the existing editable review UI.

**Tech Stack:** WeChat Mini Program, TypeScript, WXML, SCSS, `wx` local storage/filesystem APIs, `tsx` with Node test runner.

## Global Constraints

- Preserve the existing real `qwen35` image OCR flow and 600 KB compression behavior.
- Use only local persistence; no server sync endpoint is available.
- Store history under `inspectionHistory:v1`.
- Persist temporary report images with `saveFile` before storing a new record.
- Keep at most 30 records ordered by descending `updatedAt`.
- Reopening a record must restore the same editable table and update the same record ID.
- Remove associated saved images when records are deleted or trimmed.
- Keep all new source modules in TypeScript and all styles in SCSS.
- Do not store the model token in source.
- The workspace is not a Git repository, so do not create commits.

---

### Task 1: Add Tested History Domain Rules

**Files:**
- Create: `miniprogram/domain/inspection-history.ts`
- Create: `tests/inspection-history.test.ts`

**Interfaces:**
- Consumes: `InspectionRecord` from `miniprogram/domain/inspection-record.ts`.
- Produces: `StoredInspectionRecord`, `HistoryRecordInput`, `parseHistory`, `upsertHistory`, and `removeHistoryRecord`.

- [ ] **Step 1: Write failing tests**

Test these behaviors with complete record fixtures:

```ts
test('parseHistory rejects malformed local storage', () => {
  assert.deepEqual(parseHistory('broken'), [])
  assert.deepEqual(parseHistory([{ id: 1 }]), [])
})

test('upsertHistory adds and sorts a new local record', () => {
  const result = upsertHistory([], input, 200)
  assert.equal(result.records[0].id, 'IR-200')
  assert.equal(result.records[0].createdAt, 200)
  assert.equal(result.records[0].updatedAt, 200)
})

test('upsertHistory updates an existing record without changing its id or image', () => {
  const result = upsertHistory([existing], changedInput, 300, existing.id)
  assert.equal(result.records[0].id, existing.id)
  assert.equal(result.records[0].imagePath, existing.imagePath)
  assert.equal(result.records[0].createdAt, existing.createdAt)
  assert.equal(result.records[0].updatedAt, 300)
})

test('upsertHistory trims beyond thirty and reports images to remove', () => {
  const result = upsertHistory(thirtyRecords, input, 500)
  assert.equal(result.records.length, 30)
  assert.deepEqual(result.removedImagePaths, ['/saved/oldest.jpg'])
})

test('removeHistoryRecord returns the deleted image path', () => {
  const result = removeHistoryRecord([existing], existing.id)
  assert.deepEqual(result.records, [])
  assert.deepEqual(result.removedImagePaths, [existing.imagePath])
})
```

- [ ] **Step 2: Run RED verification**

Run: `npm test`

Expected: FAIL because `miniprogram/domain/inspection-history.ts` does not exist.

- [ ] **Step 3: Implement pure history functions**

Create the following types and rules:

```ts
export const HISTORY_STORAGE_KEY = 'inspectionHistory:v1'
export const MAX_HISTORY_RECORDS = 30

export interface StoredInspectionRecord {
  id: string
  imagePath: string
  rawContent: string
  record: InspectionRecord
  createdAt: number
  updatedAt: number
  syncStatus: 'local'
}

export interface HistoryRecordInput {
  imagePath: string
  rawContent: string
  record: InspectionRecord
}

export interface HistoryMutation {
  records: StoredInspectionRecord[]
  removedImagePaths: string[]
}
```

`parseHistory` accepts only arrays whose entries have string `id`, string `imagePath`, object `record`, numeric timestamps, and `syncStatus === 'local'`. It sorts valid entries by `updatedAt` descending.

`upsertHistory` preserves `id`, `imagePath`, and `createdAt` for updates. New records use `IR-${now}`. It sorts, keeps 30, and returns trimmed image paths.

`removeHistoryRecord` removes one ID and returns its image path for cleanup.

- [ ] **Step 4: Run GREEN verification**

Run: `npm test`

Expected: all history and existing OCR tests pass.

### Task 2: Add Tested WeChat History Service

**Files:**
- Create: `miniprogram/services/history-service.ts`
- Create: `tests/history-service.test.ts`

**Interfaces:**
- Consumes: history domain functions from Task 1.
- Produces: `loadInspectionHistory`, `saveInspectionHistory`, and `deleteInspectionHistory` with an injectable `HistoryStorageAdapter`.

- [ ] **Step 1: Write failing service tests**

Use an in-memory adapter to verify:

```ts
test('saveInspectionHistory persists a new image and record', async () => {
  const stored = await saveInspectionHistory(input, '', adapter, 100)
  assert.equal(stored.imagePath, '/saved/report.jpg')
  assert.equal(adapter.savedTemporaryPaths[0], '/tmp/report.jpg')
  assert.equal(loadInspectionHistory(adapter)[0].id, stored.id)
})

test('saveInspectionHistory updates without saving the image again', async () => {
  await saveInspectionHistory(input, existing.id, adapter, 200)
  assert.equal(adapter.savedTemporaryPaths.length, 0)
})

test('deleteInspectionHistory removes storage entry and saved image', async () => {
  await deleteInspectionHistory(existing.id, adapter)
  assert.deepEqual(loadInspectionHistory(adapter), [])
  assert.deepEqual(adapter.removedPaths, [existing.imagePath])
})
```

- [ ] **Step 2: Run RED verification**

Run: `npm test`

Expected: FAIL because `miniprogram/services/history-service.ts` does not exist.

- [ ] **Step 3: Implement the storage adapter**

The default adapter wraps:

```ts
wx.getStorageSync(HISTORY_STORAGE_KEY)
wx.setStorageSync(HISTORY_STORAGE_KEY, records)
wx.getFileSystemManager().saveFile({ tempFilePath, success, fail })
wx.getFileSystemManager().removeSavedFile({ filePath, success, fail })
```

`saveInspectionHistory` saves a new temporary image first, applies `upsertHistory`, writes storage, then best-effort removes trimmed images. On storage failure after a new image save, it removes that new saved file before rejecting.

Updates reuse the existing saved image. `deleteInspectionHistory` writes the reduced record list before best-effort file removal.

- [ ] **Step 4: Run GREEN verification**

Run: `npm test`

Expected: all tests pass.

### Task 3: Integrate History Into the Index Component

**Files:**
- Modify: `miniprogram/pages/index/index.ts`

**Interfaces:**
- Consumes: all history service functions from Task 2.
- Produces: `activeTab`, `historyRecords`, `editingRecordId`, tab switching, open/edit/update, and delete interactions.

- [ ] **Step 1: Add component state and lifecycle loading**

Add:

```ts
activeTab: 'scan',
historyRecords: [],
editingRecordId: '',
```

In `lifetimes.attached`, call a `refreshHistory` method that maps stored records to display values including `productLabel` and formatted `updatedLabel`.

- [ ] **Step 2: Add navigation and history handlers**

Implement:

```ts
switchTab(event)          // reads data-tab and refreshes history when opening history
openHistory(event)        // restores image, raw JSON, record, product index, edit ID, and review state
deleteHistory(event)      // confirms, deletes, refreshes, and shows a toast
goToScan()                // switches to scan and resets to capture when invoked from empty history
```

- [ ] **Step 3: Persist on confirmation**

After `submitInspection` validation succeeds, call:

```ts
saveInspectionHistory(
  { imagePath, rawContent, record },
  editingRecordId,
)
```

Use the returned stored ID in the success state. The primary action label is `editingRecordId ? '更新识别记录' : '保存识别结果'`.

`resetFlow` must clear `editingRecordId`. Starting a brand-new recognition must also clear it.

- [ ] **Step 4: Run TypeScript verification**

Run: `npm run typecheck`

Expected: exit 0.

### Task 4: Build Floating Tabs and History UI

**Files:**
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.scss`

**Interfaces:**
- Consumes: page state and handlers from Task 3.
- Produces: polished scan workspace, history list/empty state, and fixed two-item floating navigation.

- [ ] **Step 1: Split scan and history workspaces**

Wrap the existing scan states in:

```xml
<block wx:if="{{activeTab === 'scan'}}">...</block>
```

Add the history workspace:

```xml
<block wx:else>
  <view class="history-header">
    <view><view class="history-title">识别记录</view><view class="history-subtitle">共 {{historyRecords.length}} 份本地记录</view></view>
  </view>
  <view wx:if="{{historyRecords.length === 0}}" class="history-empty">
    <view class="empty-icon"><view class="empty-line"></view><view class="empty-line"></view></view>
    <view class="empty-title">还没有识别记录</view>
    <view class="empty-desc">完成并保存一次检验报告后，会显示在这里。</view>
    <button class="primary-button" bindtap="goToScan">去识别</button>
  </view>
  <view wx:else class="history-list">
    <view wx:for="{{historyRecords}}" wx:key="id" class="history-item" data-id="{{item.id}}" bindtap="openHistory">
      <image wx:if="{{item.imagePath}}" class="history-thumb" src="{{item.imagePath}}" mode="aspectFill"></image>
      <view class="history-main">
        <view class="history-row"><text class="history-product">{{item.productLabel}}</text><text class="history-date">{{item.updatedLabel}}</text></view>
        <view class="history-customer">{{item.record.customer || '未识别客户'}}</view>
        <view class="history-meta">{{item.record.model || '未识别型号'}} · {{item.record.inspectionDate || '无日期'}}</view>
        <view class="history-id">{{item.id}}</view>
      </view>
      <button class="delete-button" data-id="{{item.id}}" catchtap="deleteHistory">删除</button>
    </view>
  </view>
</block>
```

- [ ] **Step 2: Add floating navigation**

Place outside the scroll view:

```xml
<view class="floating-tabs">
  <view class="floating-tab {{activeTab === 'scan' ? 'is-active' : ''}}" data-tab="scan" bindtap="switchTab">
    <view class="scan-tab-icon"></view><text>识别</text>
  </view>
  <view class="floating-tab {{activeTab === 'history' ? 'is-active' : ''}}" data-tab="history" bindtap="switchTab">
    <view class="history-tab-icon"><view></view><view></view><view></view></view><text>记录</text>
  </view>
</view>
```

- [ ] **Step 3: Polish layout and stable dimensions**

Use a restrained white, navy, blue, and green palette. Set cards to `16rpx` radius, increase page bottom padding to at least `190rpx + env(safe-area-inset-bottom)`, and give the floating bar fixed dimensions so active states do not shift layout.

The floating bar uses `position: fixed`, `left/right: 28rpx`, `bottom: calc(20rpx + env(safe-area-inset-bottom))`, a translucent white background, border, and shadow. History list items use one un-nested card per record and preserve text wrapping on narrow screens.

- [ ] **Step 4: Run complete verification**

Run: `npm test`

Expected: all tests pass.

Run: `npm run typecheck`

Expected: exit 0.

Run: `rg -n "inspectionHistory:v1|saveFile|removeSavedFile|floating-tabs|openHistory|deleteHistory" miniprogram tests`

Expected: every required history and navigation integration has matches.

Run: `rg -n "app-8ZuWtMDwohXAF7Yw8fjZDWef" miniprogram package.json project.private.config.json`

Expected: no matches.

## Self-Review

- Coverage: local create/update/delete, persistent images, 30-record cleanup, editable reopen, empty state, and floating navigation are assigned to tasks.
- Placeholder scan: every code step names exact interfaces and behavior.
- Type consistency: `StoredInspectionRecord`, `HistoryRecordInput`, `editingRecordId`, and `activeTab` retain the same names across domain, service, page, and WXML.
