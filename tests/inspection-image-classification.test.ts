import assert from 'node:assert/strict'
import test from 'node:test'

import {
  buildInspectionImageClassificationState,
  buildInspectionImageGroups,
  buildUnassignedInspectionImages,
  mergeInspectionImageAssignmentsIntoRows,
  normalizeInspectionImageSection,
} from '../miniprogram/domain/inspection-image-classification'
import { InspectionWorkbenchRow } from '../miniprogram/domain/inspection-workbench'

function workbenchRow(
  rowKey: string,
  groupTitle: string,
  project: string,
  aliases: string[],
): InspectionWorkbenchRow {
  return {
    rowKey,
    groupTitle,
    displayOrder: 0,
    project,
    method: '',
    standard: '',
    measurements: Array.from({ length: 10 }, () => ''),
    measurementStandards: { '识别别名': aliases.join('|') },
    decision: 'NG',
    note: '',
    photoRequired: groupTitle.includes('外观') || groupTitle.includes('包装'),
    inputMode: 'manual_photo',
    images: [],
  }
}

test('groups backend image assignments by the same canonical sections as the online workbench', () => {
  const groups = buildInspectionImageGroups({
    image_assignments: [
      { image_index: 2, section: '产品包装', project: '外箱标签', reason: '包装完整' },
      { image_index: 1, section: '产品外观', project: '产品正面' },
    ],
  }, ['https://img.test/1.jpg', 'https://img.test/2.jpg'])

  assert.deepEqual(groups.map((group) => ({
    section: group.section,
    indexes: group.items.map((item) => item.imageIndex),
    projects: group.items.map((item) => item.project),
  })), [
    { section: '产品外观', indexes: [1], projects: ['产品正面'] },
    { section: '产品包装', indexes: [2], projects: ['外箱标签'] },
  ])
  assert.equal(groups[0]?.items[0]?.originalIndex, 0)
  assert.equal(groups[1]?.items[0]?.url, 'https://img.test/2.jpg')
})

test('normalizes assignment aliases with the online workbench rules', () => {
  assert.equal(normalizeInspectionImageSection('产品变形检查'), '产品外观')
  assert.equal(normalizeInspectionImageSection('内盒装箱'), '产品包装')
  assert.equal(normalizeInspectionImageSection('条码贴标'), '商标标签')
  assert.equal(normalizeInspectionImageSection('卡尺测量'), '产品尺寸')
  assert.equal(normalizeInspectionImageSection('安全性能报告'), '测试报告')
  assert.equal(normalizeInspectionImageSection('其它资料'), '待复核')
})

test('measurement-only images count as assigned instead of appearing as unassigned evidence', () => {
  const unassigned = buildUnassignedInspectionImages({
    image_assignments: [{ image_index: 1, section: '产品外观' }],
    measurements: [{ image_index: 2, project: '外径' }],
  }, ['https://img.test/1.jpg', 'https://img.test/2.jpg', 'https://img.test/3.jpg'])

  assert.deepEqual(unassigned.map((image) => image.imageIndex), [3])
})

test('ignores invalid assignment indexes and keeps those images visible as unassigned', () => {
  const state = buildInspectionImageClassificationState({
    image_assignments: [
      { image_index: 9, section: '产品外观' },
      { image_index: 'bad', section: '产品包装' },
    ],
    visual_recognition_request: { status: 'completed' },
  }, ['https://img.test/1.jpg', 'https://img.test/2.jpg'])

  assert.deepEqual(state.groups, [])
  assert.deepEqual(state.unassignedImages.map((image) => image.imageIndex), [1, 2])
  assert.equal(state.assignedCount, 0)
  assert.equal(state.pending, false)
})

test('reports pending backend classification without making a local classification guess', () => {
  const state = buildInspectionImageClassificationState({
    visual_recognition_request: { status: 'pending' },
  }, ['https://img.test/1.jpg'])

  assert.equal(state.pending, true)
  assert.deepEqual(state.groups, [])
  assert.deepEqual(state.unassignedImages.map((image) => image.imageIndex), [1])
})

test('puts online classified images into their matching inspection rows instead of an overview gallery', () => {
  const rows = [
    workbenchRow('appearance', '产品外观', '产品本体（正面/反面）', ['产品外观', '正面', '反面']),
    workbenchRow('outer-box', '产品包装', '外箱', ['外箱', '纸箱', '正唛', '侧唛']),
    workbenchRow('diameter', '产品尺寸', '外径', ['直径', '外径']),
  ]
  const merged = mergeInspectionImageAssignmentsIntoRows(rows, {
    image_assignments: [
      { image_index: 1, section: '产品外观', project: '产品正面' },
      { image_index: 2, section: '产品包装', project: '纸箱正唛' },
      { image_index: 3, section: '产品外观', project: '卡尺实测' },
    ],
    measurements: [
      { image_index: 3, project: '外径', value: 115, unit: 'mm' },
    ],
  }, [
    'https://img.test/front.jpg',
    'https://img.test/carton.jpg',
    'https://img.test/diameter.jpg',
  ])

  assert.deepEqual(
    merged[0].images.map((photo) => photo.remoteUrl),
    ['https://img.test/front.jpg'],
  )
  assert.deepEqual(
    merged[1].images.map((photo) => photo.remoteUrl),
    ['https://img.test/carton.jpg'],
  )
  assert.deepEqual(
    merged[2].images.map((photo) => photo.remoteUrl),
    ['https://img.test/diameter.jpg'],
  )
  assert.equal(merged[2].measurements[0], '115 mm')
  assert.equal(merged[2].images[0].origin, 'ai_assignment')
  assert.equal(merged[2].images[0].sourceImageIndex, 2)
})

test('online assignment merge preserves manual values and does not duplicate an existing row image', () => {
  const row = workbenchRow('outer-box', '产品包装', '外箱', ['外箱', '纸箱'])
  row.measurements[0] = '人工值'
  row.images = [{
    id: 'manual-photo',
    localPath: '',
    remoteUrl: 'https://img.test/carton.jpg',
    status: 'uploaded',
    error: '',
  }]

  const [merged] = mergeInspectionImageAssignmentsIntoRows([row], {
    image_assignments: [{ image_index: 1, section: '产品包装', project: '外箱' }],
    measurements: [{ image_index: 1, project: '外箱', value: 'AI值' }],
  }, ['https://img.test/carton.jpg'])

  assert.equal(merged.measurements[0], '人工值')
  assert.equal(merged.images.length, 1)
  assert.equal(merged.images[0].id, 'manual-photo')
})

test('uses the image assignment project when a recognized measurement has no project label', () => {
  const diameter = workbenchRow('diameter', '产品尺寸', '外径', ['直径', '外径'])
  const [merged] = mergeInspectionImageAssignmentsIntoRows([diameter], {
    image_assignments: [{ image_index: 1, section: '产品尺寸', project: '外径测量' }],
    measurements: [{ image_index: 1, value: '114.8', unit: 'mm' }],
  }, ['https://img.test/diameter.jpg'])

  assert.equal(merged.measurements[0], '114.8 mm')
  assert.deepEqual(
    merged.images.map((photo) => photo.remoteUrl),
    ['https://img.test/diameter.jpg'],
  )
})
