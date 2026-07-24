import test from 'node:test'
import assert from 'node:assert/strict'

import {
  buildInspectionWorkbenchPages,
  findInspectionWorkbenchPageForRow,
} from '../miniprogram/domain/inspection-workbench-pagination'
import type { InspectionWorkbenchRow, UnmatchedRecognitionRow } from '../miniprogram/domain/inspection-workbench'

function row(rowKey: string, groupTitle: string, displayOrder: number): InspectionWorkbenchRow {
  return {
    rowKey,
    groupTitle,
    displayOrder,
    project: rowKey,
    method: '目测',
    standard: '合格',
    measurements: Array(10).fill(''),
    measurementStandards: {},
    decision: '',
    note: '',
    photoRequired: false,
    inputMode: 'manual',
    images: [],
  }
}

test('buildInspectionWorkbenchPages keeps group and row order while limiting each inspection page to three rows', () => {
  const pages = buildInspectionWorkbenchPages([
    row('appearance-1', '外观检验', 1),
    row('appearance-2', '外观检验', 2),
    row('appearance-3', '外观检验', 3),
    row('appearance-4', '外观检验', 4),
    row('size-1', '尺寸检验', 5),
  ], [])

  assert.deepEqual(pages.map((page) => ({
    kind: page.kind,
    title: page.title,
    rows: page.rows.map((item) => item.rowKey),
  })), [
    { kind: 'overview', title: '产品与识别', rows: [] },
    { kind: 'inspection', title: '外观检验', rows: ['appearance-1', 'appearance-2', 'appearance-3'] },
    { kind: 'inspection', title: '外观检验', rows: ['appearance-4'] },
    { kind: 'inspection', title: '尺寸检验', rows: ['size-1'] },
  ])
})

test('buildInspectionWorkbenchPages adds an unmatched review page only when recognition rows need review', () => {
  const unmatched: UnmatchedRecognitionRow[] = [{
    rowKey: 'ocr-unmatched',
    groupTitle: '安全性能',
    project: '空载转速',
    measurements: ['10200', ...Array(9).fill('')],
    reason: '线上表格中未找到匹配项目',
  }]
  const pages = buildInspectionWorkbenchPages([row('size-1', '尺寸检验', 1)], unmatched)

  assert.equal(pages.at(-1)?.kind, 'unmatched')
  assert.equal(pages.at(-1)?.unmatched[0]?.rowKey, 'ocr-unmatched')
})

test('findInspectionWorkbenchPageForRow locates the first paged group containing a recognized row', () => {
  const pages = buildInspectionWorkbenchPages([
    row('appearance-1', '外观检验', 1),
    row('size-1', '尺寸检验', 2),
  ], [])

  assert.equal(findInspectionWorkbenchPageForRow(pages, 'size-1'), 2)
  assert.equal(findInspectionWorkbenchPageForRow(pages, 'missing'), -1)
})
