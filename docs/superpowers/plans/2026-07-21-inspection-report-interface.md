# Inspection Report Interface Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a WeChat Mini Program interface that captures one inspection-report photo, simulates backend LLM OCR, lets the user edit the normalized table, and simulates submitting the confirmed record.

**Architecture:** Keep report normalization and immutable updates in a pure CommonJS domain module so Node 22 can test them without adding a framework. Keep OCR and submit operations behind a service module whose public methods match the future HTTPS backend contract. The index component owns only page state and delegates record mutations to the domain module.

**Tech Stack:** WeChat Mini Program, TypeScript page logic, WXML, Sass, CommonJS domain/service modules, Node 22 built-in test runner.

## Global Constraints

- One selected image produces one inspection record.
- Support camera and album sources through `wx.chooseMedia`.
- Support steel brush, velcro disc, resin wheel, flap disc, mesh abrasive, and diamond blade templates.
- Normalize every measurement row and sample judgement list to exactly 10 entries.
- Model gateway URLs and credentials remain server-side and never enter Mini Program source or documentation.
- Real integration must use `wx.uploadFile` to an HTTPS business backend; the business backend calls the visual LLM.
- This phase uses mock Promise-based OCR and submit responses while preserving the final service interface.
- Do not add a third-party test framework.
- The current workspace is not a Git repository, so implementation steps do not create commits.

---

### Task 1: Add Tested Inspection Record Domain

**Files:**
- Create: `miniprogram/domain/inspection-record.js`
- Create: `tests/inspection-record.test.js`
- Modify: `package.json`

**Interfaces:**
- Produces: `PRODUCT_OPTIONS`, `MEASUREMENT_COUNT`, `normalizeTenValues(values)`, `createMockRecord()`, `updateRecordField(record, field, value)`, `updateRowField(record, rowIndex, field, value)`, `updateMeasurement(record, rowIndex, measurementIndex, value)`, `updateSampleJudgement(record, sampleIndex, value)`, and `validateRecord(record)`.
- Consumes: No project-specific interfaces.

- [ ] **Step 1: Add the test command**

Change `package.json` scripts to:

```json
"scripts": {
  "test": "node --test tests/*.test.js"
}
```

- [ ] **Step 2: Write failing domain tests**

Create `tests/inspection-record.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const {
  createMockRecord,
  normalizeTenValues,
  updateMeasurement,
  updateSampleJudgement,
  validateRecord,
} = require('../miniprogram/domain/inspection-record')

test('normalizeTenValues pads and truncates values to ten entries', () => {
  assert.deepEqual(normalizeTenValues(['1', '2']), ['1', '2', '', '', '', '', '', '', '', ''])
  assert.deepEqual(
    normalizeTenValues(Array.from({ length: 12 }, (_, index) => String(index))),
    ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'],
  )
})

test('createMockRecord produces a table matching the ten-sample report layout', () => {
  const record = createMockRecord()

  assert.equal(record.productType, 'steel_brush')
  assert.equal(record.sampleJudgements.length, 10)
  assert.ok(record.rows.length > 0)
  assert.ok(record.rows.every((row) => row.measurements.length === 10))
})

test('updateMeasurement changes one cell without mutating the source record', () => {
  const record = createMockRecord()
  const updated = updateMeasurement(record, 0, 2, '0.26')

  assert.equal(record.rows[0].measurements[2], 'OK')
  assert.equal(updated.rows[0].measurements[2], '0.26')
  assert.notEqual(updated, record)
  assert.notEqual(updated.rows[0], record.rows[0])
})

test('updateSampleJudgement changes one sample result immutably', () => {
  const record = createMockRecord()
  const updated = updateSampleJudgement(record, 1, 'NG')

  assert.equal(record.sampleJudgements[1], 'OK')
  assert.equal(updated.sampleJudgements[1], 'NG')
})

test('validateRecord reports required fields and accepts a complete record', () => {
  const record = createMockRecord()
  assert.deepEqual(validateRecord(record), [])
  assert.deepEqual(validateRecord({ ...record, customer: '', model: '' }), ['客户', '型号/规格'])
})
```

- [ ] **Step 3: Run tests and verify RED**

Run: `npm test`

Expected: FAIL with `Cannot find module '../miniprogram/domain/inspection-record'`.

- [ ] **Step 4: Implement the domain module**

Create `miniprogram/domain/inspection-record.js`:

```js
const MEASUREMENT_COUNT = 10

const PRODUCT_OPTIONS = [
  { label: '钢丝刷', value: 'steel_brush' },
  { label: '拉绒片', value: 'velcro_disc' },
  { label: '树脂砂轮', value: 'resin_wheel' },
  { label: '百叶轮', value: 'flap_disc' },
  { label: '网格砂', value: 'mesh_abrasive' },
  { label: '金刚石锯片', value: 'diamond_blade' },
]

function normalizeTenValues(values) {
  return Array.from({ length: MEASUREMENT_COUNT }, (_, index) => String(values[index] ?? ''))
}

function createRow(id, item, requirement, specification, measurements) {
  return {
    id,
    item,
    requirement,
    specification,
    measurements: normalizeTenValues(measurements),
    lowConfidenceFields: [],
  }
}

function createMockRecord() {
  return {
    productType: 'steel_brush',
    customer: 'SAMPLE',
    supplier: '奉化金轮',
    trademark: '',
    orderNumber: 'B260602-3',
    model: '100 × 20 × 20',
    arrivalQuantity: '200',
    inspectionDate: '2026-06-27',
    rows: [
      createRow('material', '材质', '符合图纸要求', '镀锌钢丝', ['OK', 'OK', 'OK', 'OK', 'OK']),
      createRow('wire-diameter', '丝径(mm)', '按规格检验', '0.25', ['0.25', '0.25', '0.25', '0.24', '0.25']),
      createRow('diameter', '直径(mm)', '按规格检验', '100', ['100', '100', '100', '100', '100']),
      createRow('speed', '转速', '不低于标准值', '4500', ['', '', '', '', '']),
      createRow('runout', '精直径(mm)', '符合图纸要求', '无', ['OK', 'OK', 'OK', 'OK', 'OK']),
    ],
    sampleJudgements: normalizeTenValues(['OK', 'OK', 'OK', 'OK', 'OK']),
    notes: '模拟 OCR 结果，请逐项核对后提交。',
    reviewer: '张审核',
    inspector: '李检验',
    lowConfidenceFields: ['supplier', 'rows.1.measurements.3'],
  }
}

function updateRecordField(record, field, value) {
  return { ...record, [field]: value }
}

function updateRowField(record, rowIndex, field, value) {
  const rows = record.rows.map((row, index) => index === rowIndex ? { ...row, [field]: value } : row)
  return { ...record, rows }
}

function updateMeasurement(record, rowIndex, measurementIndex, value) {
  const row = record.rows[rowIndex]
  const measurements = normalizeTenValues(row.measurements)
  measurements[measurementIndex] = value
  const rows = record.rows.map((item, index) => index === rowIndex ? { ...item, measurements } : item)
  return { ...record, rows }
}

function updateSampleJudgement(record, sampleIndex, value) {
  const sampleJudgements = normalizeTenValues(record.sampleJudgements)
  sampleJudgements[sampleIndex] = value
  return { ...record, sampleJudgements }
}

function validateRecord(record) {
  const required = [
    ['customer', '客户'],
    ['supplier', '供应商'],
    ['model', '型号/规格'],
    ['inspectionDate', '检验日期'],
  ]
  const missing = required
    .filter(([field]) => !String(record[field] ?? '').trim())
    .map(([, label]) => label)

  if (!Array.isArray(record.rows) || record.rows.length === 0) {
    missing.push('检验项目')
  }
  return missing
}

module.exports = {
  PRODUCT_OPTIONS,
  MEASUREMENT_COUNT,
  normalizeTenValues,
  createMockRecord,
  updateRecordField,
  updateRowField,
  updateMeasurement,
  updateSampleJudgement,
  validateRecord,
}
```

- [ ] **Step 5: Run tests and verify GREEN**

Run: `npm test`

Expected: 5 tests pass, 0 fail.

### Task 2: Add Tested OCR Service Boundary

**Files:**
- Create: `miniprogram/services/inspection-service.js`
- Create: `tests/inspection-service.test.js`

**Interfaces:**
- Consumes: `createMockRecord()` and `validateRecord(record)` from Task 1.
- Produces: `recognizeInspection(imagePath, delayMs?) -> Promise<{ imageId, record }>` and `submitInspection(imageId, record, delayMs?) -> Promise<{ recordId }>`.

- [ ] **Step 1: Write failing service tests**

Create `tests/inspection-service.test.js`:

```js
const test = require('node:test')
const assert = require('node:assert/strict')

const { createMockRecord } = require('../miniprogram/domain/inspection-record')
const { recognizeInspection, submitInspection } = require('../miniprogram/services/inspection-service')

test('recognizeInspection requires an image path', async () => {
  await assert.rejects(() => recognizeInspection('', 0), /请选择检验报告图片/)
})

test('recognizeInspection returns a normalized backend-shaped result', async () => {
  const result = await recognizeInspection('/tmp/report.jpg', 0)

  assert.match(result.imageId, /^mock-image-/)
  assert.equal(result.record.rows[0].measurements.length, 10)
})

test('submitInspection rejects incomplete records', async () => {
  await assert.rejects(
    () => submitInspection('mock-image-1', { ...createMockRecord(), customer: '' }, 0),
    /请完善：客户/,
  )
})

test('submitInspection returns a record id for a confirmed record', async () => {
  const result = await submitInspection('mock-image-1', createMockRecord(), 0)
  assert.match(result.recordId, /^IR-/)
})
```

- [ ] **Step 2: Run the service test and verify RED**

Run: `node --test tests/inspection-service.test.js`

Expected: FAIL with `Cannot find module '../miniprogram/services/inspection-service'`.

- [ ] **Step 3: Implement the mock service**

Create `miniprogram/services/inspection-service.js`:

```js
const { createMockRecord, validateRecord } = require('../domain/inspection-record')

function wait(delayMs) {
  return new Promise((resolve) => setTimeout(resolve, delayMs))
}

async function recognizeInspection(imagePath, delayMs = 900) {
  if (!imagePath) {
    throw new Error('请选择检验报告图片')
  }
  await wait(delayMs)
  return {
    imageId: `mock-image-${Date.now()}`,
    record: createMockRecord(),
  }
}

async function submitInspection(imageId, record, delayMs = 600) {
  if (!imageId) {
    throw new Error('缺少图片记录')
  }
  const missing = validateRecord(record)
  if (missing.length > 0) {
    throw new Error(`请完善：${missing.join('、')}`)
  }
  await wait(delayMs)
  return { recordId: `IR-${Date.now()}` }
}

module.exports = { recognizeInspection, submitInspection }
```

- [ ] **Step 4: Run all tests and verify GREEN**

Run: `npm test`

Expected: 9 tests pass, 0 fail.

### Task 3: Build Capture, Review, and Submit Interface

**Files:**
- Replace: `miniprogram/pages/index/index.ts`
- Replace: `miniprogram/pages/index/index.wxml`
- Replace: `miniprogram/pages/index/index.scss`
- Modify: `miniprogram/pages/index/index.json`
- Replace: `miniprogram/app.scss`

**Interfaces:**
- Consumes: all domain update helpers from Task 1 and both service methods from Task 2.
- Produces: capture, recognizing, review, and success UI states on the index page.

- [ ] **Step 1: Replace page logic**

Implement `miniprogram/pages/index/index.ts` with these exact state transitions and handlers:

```ts
const inspectionDomain = require('../../domain/inspection-record')
const inspectionService = require('../../services/inspection-service')

const productLabels = inspectionDomain.PRODUCT_OPTIONS.map((option: { label: string }) => option.label)
const measurementHeaders = Array.from({ length: inspectionDomain.MEASUREMENT_COUNT }, (_, index) => index + 1)
const judgementOptions = ['', 'OK', 'NG']

Component({
  data: {
    screen: 'capture',
    imagePath: '',
    imageId: '',
    recognitionStage: '正在上传图片',
    recognitionRequestId: 0,
    productLabels,
    productIndex: 0,
    measurementHeaders,
    judgementOptions,
    illustrationCells: Array.from({ length: 9 }, (_, index) => index + 1),
    record: inspectionDomain.createMockRecord(),
    submitting: false,
    recordId: '',
  },
  methods: {
    takePhoto() {
      this.chooseImage(['camera'])
    },
    chooseFromAlbum() {
      this.chooseImage(['album'])
    },
    chooseImage(sourceType: Array<'album' | 'camera'>) {
      wx.chooseMedia({
        count: 1,
        mediaType: ['image'],
        sourceType,
        success: (result) => this.startRecognition(result.tempFiles[0].tempFilePath),
      })
    },
    startRecognition(imagePath: string) {
      const requestId = this.data.recognitionRequestId + 1
      this.setData({
        screen: 'recognizing',
        imagePath,
        recognitionStage: '正在上传图片',
        recognitionRequestId: requestId,
      })
      setTimeout(() => {
        if (this.data.recognitionRequestId === requestId) {
          this.setData({ recognitionStage: '正在解析表格内容' })
        }
      }, 350)
      inspectionService.recognizeInspection(imagePath)
        .then((result: { imageId: string, record: Record<string, unknown> }) => {
          if (this.data.recognitionRequestId !== requestId) return
          const productIndex = inspectionDomain.PRODUCT_OPTIONS.findIndex(
            (option: { value: string }) => option.value === result.record.productType,
          )
          this.setData({
            screen: 'review',
            imageId: result.imageId,
            record: result.record,
            productIndex: Math.max(productIndex, 0),
          })
        })
        .catch((error: Error) => {
          if (this.data.recognitionRequestId !== requestId) return
          wx.showModal({ title: '识别失败', content: error.message, showCancel: false })
          this.setData({ screen: 'capture' })
        })
    },
    cancelRecognition() {
      this.setData({ screen: 'capture', recognitionRequestId: this.data.recognitionRequestId + 1 })
    },
    previewImage() {
      if (!this.data.imagePath) return
      wx.previewImage({ current: this.data.imagePath, urls: [this.data.imagePath] })
    },
    onProductChange(event: any) {
      const productIndex = Number(event.detail.value)
      const productType = inspectionDomain.PRODUCT_OPTIONS[productIndex].value
      this.setData({ productIndex, record: inspectionDomain.updateRecordField(this.data.record, 'productType', productType) })
    },
    onRecordInput(event: any) {
      const field = event.currentTarget.dataset.field
      this.setData({ record: inspectionDomain.updateRecordField(this.data.record, field, event.detail.value) })
    },
    onRowInput(event: any) {
      const { rowIndex, field } = event.currentTarget.dataset
      this.setData({ record: inspectionDomain.updateRowField(this.data.record, Number(rowIndex), field, event.detail.value) })
    },
    onMeasurementInput(event: any) {
      const { rowIndex, measurementIndex } = event.currentTarget.dataset
      this.setData({
        record: inspectionDomain.updateMeasurement(
          this.data.record,
          Number(rowIndex),
          Number(measurementIndex),
          event.detail.value,
        ),
      })
    },
    onJudgementChange(event: any) {
      const sampleIndex = Number(event.currentTarget.dataset.sampleIndex)
      const judgement = judgementOptions[Number(event.detail.value)]
      this.setData({
        record: inspectionDomain.updateSampleJudgement(this.data.record, sampleIndex, judgement),
      })
    },
    submitRecord() {
      if (this.data.submitting) return
      const missing = inspectionDomain.validateRecord(this.data.record)
      if (missing.length > 0) {
        wx.showToast({ title: `请完善${missing[0]}`, icon: 'none' })
        return
      }
      this.setData({ submitting: true })
      inspectionService.submitInspection(this.data.imageId, this.data.record)
        .then((result: { recordId: string }) => this.setData({ screen: 'success', recordId: result.recordId }))
        .catch((error: Error) => wx.showModal({ title: '上传失败', content: error.message, showCancel: false }))
        .finally(() => this.setData({ submitting: false }))
    },
    resetFlow() {
      this.setData({
        screen: 'capture',
        imagePath: '',
        imageId: '',
        recordId: '',
        recognitionRequestId: this.data.recognitionRequestId + 1,
      })
    },
  },
})
```

- [ ] **Step 2: Replace page markup**

Implement `miniprogram/pages/index/index.wxml` with four mutually exclusive blocks:

```xml
<navigation-bar title="检验报告识别" back="{{false}}" color="#17233d" background="#f6f8fc"></navigation-bar>

<scroll-view class="page-scroll" scroll-y enhanced show-scrollbar="{{false}}">
  <view class="page-shell">
    <block wx:if="{{screen === 'capture'}}">
      <view class="hero-card">
        <view class="eyebrow">AI INSPECTION</view>
        <view class="hero-title">拍照识别检验报告</view>
        <view class="hero-desc">一次拍摄一张报告，系统将自动提取表格并供你逐项确认。</view>
        <view class="document-illustration">
          <view class="document-sheet">
            <view class="sheet-line sheet-line--wide"></view>
            <view class="sheet-line"></view>
            <view class="sheet-grid">
              <view wx:for="{{illustrationCells}}" wx:key="*this" class="sheet-cell"></view>
            </view>
          </view>
          <view class="scan-line"></view>
        </view>
        <button class="primary-button" bindtap="takePhoto">拍摄检验报告</button>
        <button class="secondary-button" bindtap="chooseFromAlbum">从相册选择</button>
      </view>
      <view class="tips-card">
        <view class="section-title">拍摄建议</view>
        <view class="tip"><text class="tip-index">1</text><text>完整拍入表格四角，避免裁切</text></view>
        <view class="tip"><text class="tip-index">2</text><text>保持光线均匀，避免阴影和反光</text></view>
        <view class="tip"><text class="tip-index">3</text><text>横向表格可直接拍摄，服务器会处理方向</text></view>
      </view>
    </block>

    <block wx:elif="{{screen === 'recognizing'}}">
      <view class="status-card">
        <image class="status-image" src="{{imagePath}}" mode="aspectFill"></image>
        <view class="spinner"></view>
        <view class="status-title">正在识别检验报告</view>
        <view class="status-desc">{{recognitionStage}}</view>
        <view class="progress"><view class="progress-bar"></view></view>
        <button class="text-button" bindtap="cancelRecognition">取消识别</button>
      </view>
    </block>

    <block wx:elif="{{screen === 'review'}}">
      <view class="review-head card">
        <image class="report-thumb" src="{{imagePath}}" mode="aspectFill" bindtap="previewImage"></image>
        <view class="review-summary">
          <view class="status-pill">识别完成</view>
          <view class="review-title">请核对识别结果</view>
          <view class="review-desc">黄色字段置信度较低，建议重点检查。</view>
        </view>
        <button class="mini-button" bindtap="resetFlow">重拍</button>
      </view>

      <view class="card form-card">
        <view class="section-heading"><text>报告信息</text><text class="required-note">* 必填</text></view>
        <view class="field full-field">
          <text class="field-label">产品类型</text>
          <picker mode="selector" range="{{productLabels}}" value="{{productIndex}}" bindchange="onProductChange">
            <view class="picker-value">{{productLabels[productIndex]}}<text>⌄</text></view>
          </picker>
        </view>
        <view class="field-grid">
          <view class="field"><text class="field-label">客户 *</text><input value="{{record.customer}}" data-field="customer" bindinput="onRecordInput" /></view>
          <view class="field field--warning"><text class="field-label">供应商 *</text><input value="{{record.supplier}}" data-field="supplier" bindinput="onRecordInput" /></view>
          <view class="field"><text class="field-label">商标</text><input value="{{record.trademark}}" data-field="trademark" bindinput="onRecordInput" /></view>
          <view class="field"><text class="field-label">订单编号</text><input value="{{record.orderNumber}}" data-field="orderNumber" bindinput="onRecordInput" /></view>
          <view class="field"><text class="field-label">型号/规格 *</text><input value="{{record.model}}" data-field="model" bindinput="onRecordInput" /></view>
          <view class="field"><text class="field-label">到货数量</text><input value="{{record.arrivalQuantity}}" data-field="arrivalQuantity" bindinput="onRecordInput" /></view>
          <view class="field full-field"><text class="field-label">检验日期 *</text><input value="{{record.inspectionDate}}" data-field="inspectionDate" bindinput="onRecordInput" /></view>
        </view>
      </view>

      <view class="card table-card">
        <view class="section-heading"><text>检验数据</text><text class="scroll-hint">左右滑动查看 1–10</text></view>
        <scroll-view class="table-scroll" scroll-x enhanced show-scrollbar="{{false}}">
          <view class="inspection-table">
            <view class="table-row table-head">
              <view class="table-cell cell-item">检验项目</view>
              <view class="table-cell cell-requirement">标准要求</view>
              <view class="table-cell cell-spec">规格</view>
              <view wx:for="{{measurementHeaders}}" wx:key="*this" class="table-cell cell-value">{{item}}</view>
            </view>
            <view wx:for="{{record.rows}}" wx:key="id" wx:for-item="row" wx:for-index="rowIndex" class="table-row">
              <view class="table-cell cell-item"><input value="{{row.item}}" data-row-index="{{rowIndex}}" data-field="item" bindinput="onRowInput" /></view>
              <view class="table-cell cell-requirement"><input value="{{row.requirement}}" data-row-index="{{rowIndex}}" data-field="requirement" bindinput="onRowInput" /></view>
              <view class="table-cell cell-spec"><input value="{{row.specification}}" data-row-index="{{rowIndex}}" data-field="specification" bindinput="onRowInput" /></view>
              <view wx:for="{{row.measurements}}" wx:key="index" wx:for-item="measurement" wx:for-index="measurementIndex" class="table-cell cell-value {{rowIndex === 1 && measurementIndex === 3 ? 'cell-warning' : ''}}">
                <input value="{{measurement}}" data-row-index="{{rowIndex}}" data-measurement-index="{{measurementIndex}}" bindinput="onMeasurementInput" />
              </view>
            </view>
            <view class="table-row judgement-row">
              <view class="table-cell cell-item">判定</view>
              <view class="table-cell cell-requirement"></view>
              <view class="table-cell cell-spec"></view>
              <view wx:for="{{record.sampleJudgements}}" wx:key="index" wx:for-item="judgement" wx:for-index="sampleIndex" class="table-cell cell-value judgement-cell">
                <picker mode="selector" range="{{judgementOptions}}" value="{{judgement === 'OK' ? 1 : judgement === 'NG' ? 2 : 0}}" data-sample-index="{{sampleIndex}}" bindchange="onJudgementChange">
                  <view class="judgement {{judgement === 'NG' ? 'judgement--ng' : ''}}">{{judgement || '—'}}</view>
                </picker>
              </view>
            </view>
          </view>
        </scroll-view>
      </view>

      <view class="card form-card">
        <view class="section-heading">补充信息</view>
        <view class="field full-field"><text class="field-label">备注</text><textarea value="{{record.notes}}" data-field="notes" bindinput="onRecordInput"></textarea></view>
        <view class="field-grid">
          <view class="field"><text class="field-label">审核人</text><input value="{{record.reviewer}}" data-field="reviewer" bindinput="onRecordInput" /></view>
          <view class="field"><text class="field-label">检验员</text><input value="{{record.inspector}}" data-field="inspector" bindinput="onRecordInput" /></view>
        </view>
      </view>

      <view class="bottom-actions">
        <button class="secondary-button" bindtap="resetFlow">重新识别</button>
        <button class="primary-button" loading="{{submitting}}" disabled="{{submitting}}" bindtap="submitRecord">确认并上传</button>
      </view>
    </block>

    <block wx:else>
      <view class="success-card">
        <view class="success-icon">✓</view>
        <view class="success-title">检验记录已确认</view>
        <view class="success-desc">模拟记录编号</view>
        <view class="record-id">{{recordId}}</view>
        <button class="primary-button" bindtap="resetFlow">继续识别下一张</button>
      </view>
    </block>
  </view>
</scroll-view>
```

- [ ] **Step 3: Add page styling**

Replace `miniprogram/pages/index/index.scss` with styles that implement these exact visual constraints:

```scss
page { height: 100vh; background: #f6f8fc; color: #17233d; }
.page-scroll { height: calc(100vh - 88rpx - env(safe-area-inset-top)); }
.page-shell { min-height: 100%; padding: 32rpx 28rpx calc(48rpx + env(safe-area-inset-bottom)); box-sizing: border-box; }
.card, .hero-card, .tips-card, .status-card, .success-card { background: #fff; border: 1rpx solid #e8edf5; border-radius: 28rpx; box-shadow: 0 14rpx 40rpx rgba(38, 67, 111, .08); }
.hero-card, .status-card, .success-card { padding: 48rpx 36rpx; text-align: center; }
.eyebrow { color: #2f6bff; font-size: 22rpx; font-weight: 700; letter-spacing: 4rpx; }
.hero-title, .status-title, .success-title { margin-top: 18rpx; font-size: 42rpx; line-height: 1.25; font-weight: 700; }
.hero-desc, .status-desc, .success-desc, .review-desc { margin-top: 16rpx; color: #77839a; font-size: 27rpx; line-height: 1.65; }
.document-illustration { position: relative; height: 300rpx; margin: 42rpx 0; display: flex; align-items: center; justify-content: center; }
.document-sheet { width: 360rpx; height: 238rpx; padding: 30rpx; box-sizing: border-box; background: #fff; border: 2rpx solid #dbe4f2; border-radius: 16rpx; transform: rotate(-4deg); box-shadow: 0 18rpx 40rpx rgba(47, 107, 255, .12); }
.sheet-line { width: 54%; height: 10rpx; margin-bottom: 18rpx; border-radius: 8rpx; background: #dfe7f4; }
.sheet-line--wide { width: 82%; background: #b9cdfb; }
.sheet-grid { display: grid; grid-template-columns: repeat(3, 1fr); border-top: 2rpx solid #dfe7f4; border-left: 2rpx solid #dfe7f4; }
.sheet-cell { height: 34rpx; border-right: 2rpx solid #dfe7f4; border-bottom: 2rpx solid #dfe7f4; }
.scan-line { position: absolute; left: 16%; right: 16%; height: 4rpx; border-radius: 4rpx; background: #2f6bff; box-shadow: 0 0 24rpx rgba(47, 107, 255, .8); animation: scan 2.2s ease-in-out infinite; }
@keyframes scan { 0%, 100% { transform: translateY(-95rpx); opacity: .35; } 50% { transform: translateY(95rpx); opacity: 1; } }
.primary-button, .secondary-button { height: 92rpx; border-radius: 20rpx; font-size: 30rpx; font-weight: 600; line-height: 92rpx; }
.primary-button { color: #fff; background: linear-gradient(135deg, #2f6bff, #5a8cff); box-shadow: 0 12rpx 26rpx rgba(47, 107, 255, .24); }
.secondary-button { margin-top: 20rpx; color: #2f6bff; background: #edf3ff; }
.tips-card { margin-top: 24rpx; padding: 32rpx; }
.section-title, .section-heading { font-size: 30rpx; font-weight: 700; }
.tip { display: flex; align-items: center; gap: 20rpx; margin-top: 26rpx; color: #59667b; font-size: 27rpx; }
.tip-index { width: 44rpx; height: 44rpx; border-radius: 50%; color: #2f6bff; background: #edf3ff; line-height: 44rpx; text-align: center; font-weight: 700; }
.status-image { width: 100%; height: 330rpx; border-radius: 20rpx; }
.spinner { width: 58rpx; height: 58rpx; margin: 42rpx auto 0; border: 7rpx solid #dce6fa; border-top-color: #2f6bff; border-radius: 50%; animation: spin .8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.progress { height: 10rpx; margin: 32rpx 0; overflow: hidden; border-radius: 10rpx; background: #edf1f7; }
.progress-bar { width: 62%; height: 100%; border-radius: inherit; background: #2f6bff; animation: progress 1.4s ease-in-out infinite alternate; }
@keyframes progress { from { width: 28%; } to { width: 82%; } }
.text-button, .mini-button { color: #2f6bff; background: transparent; font-size: 27rpx; }
.review-head { display: flex; align-items: center; padding: 24rpx; }
.report-thumb { width: 138rpx; height: 108rpx; border-radius: 16rpx; background: #eef2f8; }
.review-summary { min-width: 0; flex: 1; margin-left: 22rpx; }
.status-pill { display: inline-block; padding: 8rpx 16rpx; border-radius: 18rpx; color: #16865f; background: #e8f8f2; font-size: 22rpx; }
.review-title { margin-top: 10rpx; font-size: 30rpx; font-weight: 700; }
.review-desc { margin-top: 6rpx; font-size: 23rpx; }
.mini-button { width: auto; padding: 0 12rpx; }
.form-card, .table-card { margin-top: 24rpx; padding: 30rpx; }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 26rpx; }
.required-note, .scroll-hint { color: #99a4b6; font-size: 22rpx; font-weight: 400; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20rpx; }
.field { padding: 18rpx 20rpx; border: 2rpx solid #e6ebf3; border-radius: 16rpx; background: #fafbfe; box-sizing: border-box; }
.full-field { grid-column: 1 / -1; margin-bottom: 20rpx; }
.field--warning { border-color: #f3c968; background: #fff9e9; }
.field-label { display: block; margin-bottom: 10rpx; color: #7b879b; font-size: 23rpx; }
.field input, .field textarea { width: 100%; color: #17233d; font-size: 27rpx; }
.field textarea { height: 128rpx; }
.picker-value { display: flex; justify-content: space-between; font-size: 28rpx; }
.table-card { padding-left: 0; padding-right: 0; overflow: hidden; }
.table-card .section-heading { padding: 0 30rpx; }
.table-scroll { width: 100%; }
.inspection-table { width: 1900rpx; margin: 0 30rpx 10rpx; border-top: 1rpx solid #dfe5ee; border-left: 1rpx solid #dfe5ee; }
.table-row { display: flex; }
.table-cell { flex: none; min-height: 78rpx; padding: 12rpx; border-right: 1rpx solid #dfe5ee; border-bottom: 1rpx solid #dfe5ee; box-sizing: border-box; display: flex; align-items: center; }
.table-cell input { width: 100%; text-align: center; font-size: 24rpx; }
.table-head { color: #5f6d82; background: #f2f5fa; font-size: 23rpx; font-weight: 700; text-align: center; }
.cell-item { width: 190rpx; }
.cell-requirement { width: 220rpx; }
.cell-spec { width: 190rpx; }
.cell-value { width: 126rpx; justify-content: center; }
.cell-warning { background: #fff5d8; }
.judgement-row { background: #fafbfe; font-weight: 700; }
.judgement { color: #16865f; }
.judgement--ng { color: #dc3e4f; }
.bottom-actions { display: grid; grid-template-columns: 1fr 1.5fr; gap: 20rpx; margin-top: 28rpx; }
.bottom-actions .secondary-button { margin-top: 0; }
.success-card { margin-top: 80rpx; }
.success-icon { width: 112rpx; height: 112rpx; margin: 0 auto; border-radius: 50%; color: #fff; background: #25b785; font-size: 64rpx; line-height: 112rpx; }
.record-id { margin: 18rpx 0 38rpx; color: #2f6bff; font-size: 32rpx; font-weight: 700; }
```

Replace `miniprogram/app.scss` with:

```scss
page {
  font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Microsoft YaHei", sans-serif;
}

button::after {
  border: none;
}
```

- [ ] **Step 4: Update page configuration**

Set `miniprogram/pages/index/index.json` to:

```json
{
  "usingComponents": {
    "navigation-bar": "/components/navigation-bar/navigation-bar"
  },
  "disableScroll": true
}
```

- [ ] **Step 5: Run automated verification**

Run: `npm test`

Expected: 9 tests pass, 0 fail.

- [ ] **Step 6: Run source safety checks**

Run: `rg -n "LLM_API_TOKEN|VLLM_API_KEY|app-[A-Za-z0-9]" miniprogram docs package.json`

Expected: no matches.

Run: `rg -n "wx\.chooseMedia|recognizeInspection|submitInspection|sampleJudgements" miniprogram/pages/index/index.ts miniprogram/pages/index/index.wxml`

Expected: all four interface features have matches.

- [ ] **Step 7: Verify in WeChat Developer Tools**

Open `/Users/landcloud/WeChatProjects/miniprogram-2` and confirm:

- The capture screen renders without template errors.
- Camera and album buttons each select one image.
- Recognition state changes from upload to table parsing and then opens review.
- The original image preview opens.
- Every basic field, row field, measurement cell, and sample judgement is editable.
- The 10 sample columns scroll horizontally on a narrow simulator.
- Missing required fields block submission.
- Confirmed records show a generated `IR-` record number.
- Reset returns to the capture screen without retaining the previous image.

## Self-Review

- Spec coverage: capture, mock backend-shaped OCR, six product types, editable ten-sample table, low-confidence highlighting, validation, simulated submit, and secure backend boundary are covered.
- Placeholder scan: no `TBD`, `TODO`, or deferred implementation steps are present.
- Type consistency: `productType`, `rows`, `measurements`, and `sampleJudgements` use the same names in the domain, service, page, and WXML layers.
