import { StoredInspectionRecord } from '../../domain/inspection-history'
import {
  createMockRecord,
  InspectionRecord,
  InspectionRowField,
  Judgement,
  MEASUREMENT_COUNT,
  PRODUCT_OPTIONS,
  updateMeasurement,
  updateRecordField,
  updateRowField,
  updateSampleJudgement,
  validateRecord,
} from '../../domain/inspection-record'
import {
  deleteInspectionHistory,
  loadInspectionHistory,
  saveInspectionHistory,
} from '../../services/history-service'
import {
  recognizeInspection,
  RecognizeInspectionResult,
  submitInspection,
} from '../../services/inspection-service'

interface HistoryViewItem extends StoredInspectionRecord {
  productLabel: string
  updatedLabel: string
}

type WorkspaceTab = 'scan' | 'history'

const productLabels = PRODUCT_OPTIONS.map((option) => option.label)
const measurementHeaders = Array.from({ length: MEASUREMENT_COUNT }, (_, index) => index + 1)
const judgementOptions: Judgement[] = ['', 'OK', 'NG']

function formatHistoryTime(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hour}:${minute}`
}

function toHistoryViewItems(records: StoredInspectionRecord[]): HistoryViewItem[] {
  return records.map((item) => ({
    ...item,
    productLabel: PRODUCT_OPTIONS.find((option) => option.value === item.record.productType)?.label ?? '检验报告',
    updatedLabel: formatHistoryTime(item.updatedAt),
  }))
}

Component({
  data: {
    activeTab: 'scan' as WorkspaceTab,
    screen: 'capture',
    imagePath: '',
    imageId: '',
    rawContent: '',
    recognitionStage: '正在读取图片',
    recognitionRequestId: 0,
    productLabels,
    productIndex: 0,
    measurementHeaders,
    judgementOptions,
    illustrationCells: Array.from({ length: 9 }, (_, index) => index + 1),
    record: createMockRecord(),
    submitting: false,
    recordId: '',
    editingRecordId: '',
    historyRecords: [] as HistoryViewItem[],
    historyModalVisible: false,
    historyModalClosing: false,
    historyEditId: '',
    historyEditImagePath: '',
    historyEditRawContent: '',
    historyEditProductIndex: 0,
    historyEditRecord: createMockRecord(),
    historySaving: false,
    pressedTab: '' as WorkspaceTab | '',
  },
  lifetimes: {
    attached() {
      this.setData({ historyRecords: toHistoryViewItems(loadInspectionHistory()) })
    },
  },
  methods: {
    refreshHistory() {
      this.setData({ historyRecords: toHistoryViewItems(loadInspectionHistory()) })
    },
    activateTab(activeTab: WorkspaceTab) {
      this.setData({ activeTab })
      if (activeTab === 'history') this.refreshHistory()
    },
    switchTab(event: WechatMiniprogram.TouchEvent) {
      this.activateTab(event.currentTarget.dataset.tab as WorkspaceTab)
    },
    onTabPressStart(event: WechatMiniprogram.TouchEvent) {
      const touchedTab = event.currentTarget.dataset.tab as WorkspaceTab
      this.setData({ pressedTab: touchedTab === this.data.activeTab ? touchedTab : '' })
    },
    onTabPressEnd() {
      this.setData({ pressedTab: '' })
    },
    goToScan() {
      this.setData({ activeTab: 'scan' })
    },
    showHistory() {
      this.setData({
        activeTab: 'history',
        historyRecords: toHistoryViewItems(loadInspectionHistory()),
      })
    },
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
        sizeType: ['compressed'],
        success: (result) => this.startRecognition(result.tempFiles[0].tempFilePath),
      })
    },
    startRecognition(imagePath: string) {
      const requestId = this.data.recognitionRequestId + 1
      this.setData({
        screen: 'recognizing',
        imagePath,
        imageId: '',
        rawContent: '',
        recordId: '',
        editingRecordId: '',
        recognitionStage: '正在读取图片',
        recognitionRequestId: requestId,
      })
      setTimeout(() => {
        if (this.data.recognitionRequestId === requestId) {
          this.setData({ recognitionStage: '正在调用视觉大模型' })
        }
      }, 350)
      recognizeInspection(imagePath)
        .then((result: RecognizeInspectionResult) => {
          if (this.data.recognitionRequestId !== requestId) return
          const productIndex = PRODUCT_OPTIONS.findIndex(
            (option) => option.value === result.record.productType,
          )
          this.setData({
            screen: 'review',
            imageId: result.imageId,
            rawContent: result.rawContent,
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
      wx.previewImage({
        current: this.data.imagePath,
        urls: [this.data.imagePath],
        fail: () => wx.showToast({ title: '本地图片已失效', icon: 'none' }),
      })
    },
    openHistory(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      const stored = this.data.historyRecords.find((item) => item.id === id)
      if (!stored) return
      const productIndex = PRODUCT_OPTIONS.findIndex(
        (option) => option.value === stored.record.productType,
      )
      this.setData({
        historyModalVisible: true,
        historyModalClosing: false,
        historyEditId: stored.id,
        historyEditImagePath: stored.imagePath,
        historyEditRawContent: stored.rawContent,
        historyEditRecord: stored.record,
        historyEditProductIndex: Math.max(productIndex, 0),
      })
    },
    noop() {},
    closeHistoryModal() {
      if (this.data.historySaving) return
      this.hideHistoryModal()
    },
    hideHistoryModal() {
      if (!this.data.historyModalVisible || this.data.historyModalClosing) return
      this.setData({ historyModalClosing: true })
      setTimeout(() => {
        this.setData({
          historyModalVisible: false,
          historyModalClosing: false,
          historyEditId: '',
          historyEditImagePath: '',
          historyEditRawContent: '',
          historyEditProductIndex: 0,
          historyEditRecord: createMockRecord(),
        })
      }, 300)
    },
    previewHistoryImage() {
      const imagePath = this.data.historyEditImagePath
      if (!imagePath) return
      wx.previewImage({
        current: imagePath,
        urls: [imagePath],
        fail: () => wx.showToast({ title: '本地图片已失效', icon: 'none' }),
      })
    },
    onHistoryProductChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const productIndex = Number(event.detail.value)
      const productType = PRODUCT_OPTIONS[productIndex].value
      this.setData({
        historyEditProductIndex: productIndex,
        historyEditRecord: updateRecordField(this.data.historyEditRecord, 'productType', productType),
      })
    },
    onHistoryRecordInput(event: WechatMiniprogram.Input) {
      const field = event.currentTarget.dataset.field as keyof InspectionRecord
      this.setData({
        historyEditRecord: updateRecordField(this.data.historyEditRecord, field, event.detail.value),
      })
    },
    onHistoryRowInput(event: WechatMiniprogram.Input) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const field = event.currentTarget.dataset.field as InspectionRowField
      this.setData({
        historyEditRecord: updateRowField(this.data.historyEditRecord, rowIndex, field, event.detail.value),
      })
    },
    onHistoryMeasurementInput(event: WechatMiniprogram.Input) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const measurementIndex = Number(event.currentTarget.dataset.measurementIndex)
      this.setData({
        historyEditRecord: updateMeasurement(
          this.data.historyEditRecord,
          rowIndex,
          measurementIndex,
          event.detail.value,
        ),
      })
    },
    onHistoryJudgementChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const sampleIndex = Number(event.currentTarget.dataset.sampleIndex)
      const judgement = judgementOptions[Number(event.detail.value)]
      this.setData({
        historyEditRecord: updateSampleJudgement(this.data.historyEditRecord, sampleIndex, judgement),
      })
    },
    saveHistoryEdit() {
      if (this.data.historySaving) return
      const missing = validateRecord(this.data.historyEditRecord)
      if (missing.length > 0) {
        wx.showToast({ title: `请完善${missing[0]}`, icon: 'none' })
        return
      }
      this.setData({ historySaving: true })
      submitInspection(this.data.historyEditId, this.data.historyEditRecord)
        .then(() => saveInspectionHistory({
          imagePath: this.data.historyEditImagePath,
          rawContent: this.data.historyEditRawContent,
          record: this.data.historyEditRecord,
        }, this.data.historyEditId))
        .then(() => {
          this.setData({
            historyRecords: toHistoryViewItems(loadInspectionHistory()),
          })
          this.hideHistoryModal()
          wx.showToast({ title: '记录已更新', icon: 'success' })
        })
        .catch((error: Error) => {
          wx.showModal({ title: '更新失败', content: error.message, showCancel: false })
        })
        .finally(() => this.setData({ historySaving: false }))
    },
    deleteHistory(event: WechatMiniprogram.TouchEvent) {
      const id = String(event.currentTarget.dataset.id || '')
      if (!id) return
      wx.showModal({
        title: '删除识别记录',
        content: '删除后将同时清理本地报告图片。',
        confirmText: '删除',
        confirmColor: '#c93f4a',
        success: (result) => {
          if (!result.confirm) return
          deleteInspectionHistory(id)
            .then((records) => {
              this.setData({ historyRecords: toHistoryViewItems(records) })
              if (this.data.historyEditId === id) this.closeHistoryModal()
              wx.showToast({ title: '已删除', icon: 'success' })
            })
            .catch((error: Error) => {
              wx.showModal({ title: '删除失败', content: error.message, showCancel: false })
            })
        },
      })
    },
    onProductChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const productIndex = Number(event.detail.value)
      const productType = PRODUCT_OPTIONS[productIndex].value
      this.setData({
        productIndex,
        record: updateRecordField(this.data.record, 'productType', productType),
      })
    },
    onRecordInput(event: WechatMiniprogram.Input) {
      const field = event.currentTarget.dataset.field as keyof InspectionRecord
      this.setData({
        record: updateRecordField(this.data.record, field, event.detail.value),
      })
    },
    onRowInput(event: WechatMiniprogram.Input) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const field = event.currentTarget.dataset.field as InspectionRowField
      this.setData({
        record: updateRowField(this.data.record, rowIndex, field, event.detail.value),
      })
    },
    onMeasurementInput(event: WechatMiniprogram.Input) {
      const rowIndex = Number(event.currentTarget.dataset.rowIndex)
      const measurementIndex = Number(event.currentTarget.dataset.measurementIndex)
      this.setData({
        record: updateMeasurement(this.data.record, rowIndex, measurementIndex, event.detail.value),
      })
    },
    onJudgementChange(event: WechatMiniprogram.CustomEvent<{ value: string }>) {
      const sampleIndex = Number(event.currentTarget.dataset.sampleIndex)
      const judgement = judgementOptions[Number(event.detail.value)]
      this.setData({
        record: updateSampleJudgement(this.data.record, sampleIndex, judgement),
      })
    },
    submitRecord() {
      if (this.data.submitting) return
      const missing = validateRecord(this.data.record)
      if (missing.length > 0) {
        wx.showToast({ title: `请完善${missing[0]}`, icon: 'none' })
        return
      }
      this.setData({ submitting: true })
      submitInspection(this.data.imageId, this.data.record)
        .then(() => saveInspectionHistory({
          imagePath: this.data.imagePath,
          rawContent: this.data.rawContent,
          record: this.data.record,
        }, this.data.editingRecordId))
        .then((stored) => {
          this.setData({
            screen: 'success',
            recordId: stored.id,
            editingRecordId: stored.id,
            historyRecords: toHistoryViewItems(loadInspectionHistory()),
          })
        })
        .catch((error: Error) => {
          wx.showModal({ title: '保存失败', content: error.message, showCancel: false })
        })
        .finally(() => this.setData({ submitting: false }))
    },
    resetFlow() {
      this.setData({
        screen: 'capture',
        imagePath: '',
        imageId: '',
        rawContent: '',
        recordId: '',
        editingRecordId: '',
        productIndex: 0,
        record: createMockRecord(),
        recognitionRequestId: this.data.recognitionRequestId + 1,
      })
    },
  },
})
