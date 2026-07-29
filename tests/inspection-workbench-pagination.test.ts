import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildInspectionWorkbenchFinalState,
  buildInspectionWorkbenchPages,
  findInspectionWorkbenchPageForRow,
} from '../miniprogram/domain/inspection-workbench-pagination'
import type { InspectionWorkbenchRow, UnmatchedRecognitionRow } from '../miniprogram/domain/inspection-workbench'

function row(
  rowKey: string,
  groupTitle: string,
  displayOrder: number,
  project = rowKey,
): InspectionWorkbenchRow {
  return {
    rowKey,
    groupTitle,
    displayOrder,
    project,
    method: '目测',
    standard: '合格',
    measurements: Array(10).fill(''),
    measurementStandards: {},
    decision: 'NG',
    note: '',
    photoRequired: false,
    inputMode: 'manual',
    images: [],
  }
}

test('buildInspectionWorkbenchPages always follows the six online formal report sections', () => {
  const pages = buildInspectionWorkbenchPages([
    row('appearance', '产品外观', 1, '产品本体（正面/反面）'),
    row('minimum-pack', '产品包装', 2, '最小包装'),
    row('outer-size', '尺寸检验', 3, '外径'),
    row('rotation', '产品安全', 4, '回转测试'),
    row('life', '产品性能', 5, '使用寿命'),
  ], [])

  assert.deepEqual(pages.map((page) => ({
    id: page.id,
    kind: page.kind,
    title: page.title,
    rows: page.rows.map((item) => item.rowKey),
  })), [
    { id: 'overview', kind: 'overview', title: '基本信息', rows: [] },
    {
      id: 'appearance-packaging',
      kind: 'inspection',
      title: '产品外观和包装',
      rows: ['appearance', 'minimum-pack'],
    },
    { id: 'dimension', kind: 'inspection', title: '产品尺寸', rows: ['outer-size'] },
    { id: 'safety', kind: 'inspection', title: '产品安全', rows: ['rotation'] },
    { id: 'performance', kind: 'inspection', title: '产品性能', rows: ['life'] },
    { id: 'final', kind: 'final', title: '最终判定', rows: [] },
  ])
})

test('legacy product test report rows are split between safety and performance by project meaning', () => {
  const pages = buildInspectionWorkbenchPages([
    row('rotation', '产品测试报告', 1, '回转/破裂测试'),
    row('strength', '产品测试报告', 2, '页片粘接强度'),
    row('efficiency', '产品测试报告', 3, '磨削效率'),
    row('life', '产品测试报告', 4, '磨削寿命'),
  ], [])

  assert.deepEqual(pages[3].rows.map((item) => item.rowKey), ['rotation', 'strength'])
  assert.deepEqual(pages[4].rows.map((item) => item.rowKey), ['efficiency', 'life'])
})

test('unmatched recognition content stays on basic information without adding a seventh page', () => {
  const unmatched: UnmatchedRecognitionRow[] = [{
    rowKey: 'ocr-unmatched',
    groupTitle: '安全性能',
    project: '空载转速',
    measurements: ['10200', ...Array(9).fill('')],
    reason: '线上表格中未找到匹配项目',
  }]
  const pages = buildInspectionWorkbenchPages([row('size-1', '尺寸检验', 1)], unmatched)

  assert.equal(pages.length, 6)
  assert.equal(pages[0].kind, 'overview')
  assert.equal(pages[0].unmatched[0]?.rowKey, 'ocr-unmatched')
  assert.ok(pages.slice(1).every((page) => page.unmatched.length === 0))
})

test('findInspectionWorkbenchPageForRow locates rows in the fixed formal report section', () => {
  const pages = buildInspectionWorkbenchPages([
    row('appearance-1', '外观检验', 1),
    row('size-1', '尺寸检验', 2),
  ], [])

  assert.equal(findInspectionWorkbenchPageForRow(pages, 'appearance-1'), 1)
  assert.equal(findInspectionWorkbenchPageForRow(pages, 'size-1'), 2)
  assert.equal(findInspectionWorkbenchPageForRow(pages, 'missing'), -1)
})

test('final state follows online decision priority and splits AI summary into conclusions', () => {
  const pendingRows = [
    row('appearance', '产品外观', 1),
    row('size', '产品尺寸', 2),
  ]
  assert.equal(buildInspectionWorkbenchFinalState(pendingRows, {}).decision, '待检验')

  const inspectedRows = pendingRows.map((item, index) => index === 0
    ? { ...item, decision: 'OK', measurements: ['合格', ...Array(9).fill('')] }
    : item)
  const passed = buildInspectionWorkbenchFinalState(inspectedRows, {
    decision: 'pass',
    summary: '外观符合要求；包装信息已核对\n建议留存照片',
  })
  assert.equal(passed.decision, 'OK')
  assert.equal(passed.inspectedCount, 1)
  assert.deepEqual(passed.conclusions, [
    '外观符合要求',
    '包装信息已核对',
    '建议留存照片',
  ])

  const failed = buildInspectionWorkbenchFinalState(inspectedRows, {
    decision: 'fail',
    summary: '',
  })
  assert.equal(failed.decision, 'NG')
  assert.deepEqual(failed.conclusions, ['当前无补充说明。'])
})

test('a completed NG row makes the final decision fail without treating untouched default NG rows as inspected', () => {
  const rows = [
    row('appearance', '产品外观', 1),
    {
      ...row('rotation', '产品安全', 2),
      note: '回转测试异常',
    },
  ]
  const finalState = buildInspectionWorkbenchFinalState(rows, {})

  assert.equal(finalState.decision, 'NG')
  assert.equal(finalState.inspectedCount, 1)
  assert.equal(finalState.ngCount, 1)
})
