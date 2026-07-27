import test from 'node:test'
import assert from 'node:assert/strict'

import {
  addLocalPhotos,
  buildInspectionWorkbench,
  InspectionTemplateDto,
  mergeRecognitionRecord,
  workbenchToDraft,
  removeWorkbenchPhoto,
  updateWorkbenchMeasurement,
  updateWorkbenchPhoto,
  updateWorkbenchRowField,
} from '../miniprogram/domain/inspection-workbench'
import { buildOnlineInspectionTemplate } from '../miniprogram/domain/online-inspection-template'

function createTemplate(): InspectionTemplateDto {
  return {
    template_id: 'tpl-steel-brush',
    version: '3',
    columns: [
      { key: 'project', title: '检验项目', display_order: 1, visible: true },
      { key: 'standard', title: '标准要求', display_order: 2, visible: true },
    ],
    rows: [
      {
        row_key: 'size-outer',
        group_title: '产品尺寸',
        display_order: 20,
        project: '外径',
        method: '游标卡尺',
        standard: '100±1mm',
        measurement_standards: { unit: 'mm' },
        note: '',
        photo_required: false,
        input_mode: 'ocr_measurement',
      },
      {
        row_key: 'appearance',
        group_title: '产品外观',
        display_order: 10,
        project: '表面质量',
        method: '目测',
        standard: '无锈蚀、无变形',
        measurement_standards: {},
        note: '',
        input_mode: 'manual_photo',
      },
    ],
  }
}

test('buildInspectionWorkbench creates rows and visible columns in online order', () => {
  const template = createTemplate()
  template.columns.push({
    key: 'internal',
    title: '内部字段',
    display_order: 0,
    visible: false,
  })
  template.columns.reverse()
  const workbench = buildInspectionWorkbench({ template })

  assert.equal(workbench.source, 'template')
  assert.equal(workbench.templateId, 'tpl-steel-brush')
  assert.deepEqual(workbench.columns.map((column) => column.key), ['project', 'standard'])
  assert.deepEqual(workbench.rows.map((row) => row.rowKey), [
    'appearance',
    'size-outer',
  ])
  assert.equal(workbench.rows[0].photoRequired, true)
  assert.deepEqual(workbench.rows[0].measurements, Array(10).fill(''))
})


test('buildInspectionWorkbench restores draft values and uploaded photos over template defaults', () => {
  const workbench = buildInspectionWorkbench({
    template: createTemplate(),
    draft: {
      inspection_records: [{
        row_key: 'appearance',
        group_title: '产品外观',
        project: '表面质量',
        method: '人工目测',
        standard: '无锈蚀、无变形',
        decision: 'OK',
        sample_data: ['OK'],
        measurement_standards: {},
        note: '现场复核通过',
        ai_result: {},
        images: ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
      }],
      ai_workbench_result: {},
      ai_workbench_images: [],
      record_merge_mode: 'matched_only',
    },
  })

  const appearance = workbench.rows[0]
  assert.equal(workbench.source, 'draft')
  assert.equal(appearance.decision, 'OK')
  assert.equal(appearance.note, '现场复核通过')
  assert.deepEqual(appearance.measurements.slice(0, 2), ['OK', ''])
  assert.deepEqual(
    appearance.images.map((photo) => photo.remoteUrl),
    ['https://example.com/a.jpg', 'https://example.com/b.jpg'],
  )
  assert.ok(appearance.images.every((photo) => photo.status === 'uploaded'))
})


test('addLocalPhotos keeps every photo across repeated batches without a total limit', () => {
  const workbench = buildInspectionWorkbench({ template: createTemplate() })
  const firstBatch = Array.from({ length: 9 }, (_, index) => `/tmp/a-${index}.jpg`)
  const afterFirst = addLocalPhotos(workbench.rows, 'appearance', firstBatch)
  const afterSecond = addLocalPhotos(afterFirst, 'appearance', [
    '/tmp/b-1.jpg',
    '/tmp/b-2.jpg',
    '/tmp/b-3.jpg',
  ])

  assert.equal(afterSecond[0].images.length, 12)
  assert.deepEqual(
    afterSecond[0].images.map((photo) => photo.localPath),
    [...firstBatch, '/tmp/b-1.jpg', '/tmp/b-2.jpg', '/tmp/b-3.jpg'],
  )
  assert.ok(afterSecond[0].images.every((photo) => photo.status === 'local'))
})


test('mergeRecognitionRecord only fills OCR measurement rows and keeps unmatched content for review', () => {
  const workbench = buildInspectionWorkbench({
    template: createTemplate(),
    draft: {
      inspection_records: [{
        row_key: 'appearance',
        group_title: '产品外观',
        project: '表面质量',
        method: '目测',
        standard: '无锈蚀、无变形',
        decision: 'OK',
        sample_data: ['人工确认'],
        measurement_standards: {},
        note: '不要覆盖',
        ai_result: {},
        images: ['https://example.com/manual.jpg'],
      }],
      ai_workbench_result: {},
      ai_workbench_images: [],
    },
  })

  const result = mergeRecognitionRecord(workbench.rows, {
    productType: 'steel_brush',
    customer: '',
    supplier: '',
    trademark: '',
    orderNumber: '',
    model: '',
    arrivalQuantity: '',
    inspectionDate: '',
    rows: [
      {
        id: 'size-outer',
        item: '外径',
        requirement: '识别标准不覆盖线上标准',
        specification: '100mm',
        measurements: ['100.1', '99.9'],
        lowConfidenceFields: [],
      },
      {
        id: 'appearance',
        item: '表面质量',
        requirement: '',
        specification: '',
        measurements: ['NG'],
        lowConfidenceFields: [],
      },
      {
        id: 'unknown-row',
        groupTitle: '安全性能补充',
        item: '未知尺寸',
        requirement: '',
        specification: '',
        measurements: ['12'],
        lowConfidenceFields: [],
      },
    ],
    sampleJudgements: Array(10).fill(''),
    notes: '',
    reviewer: '',
    inspector: '',
    lowConfidenceFields: [],
  })

  const appearance = result.rows.find((row) => row.rowKey === 'appearance')!
  const size = result.rows.find((row) => row.rowKey === 'size-outer')!
  assert.deepEqual(size.measurements.slice(0, 2), ['100.1', '99.9'])
  assert.equal(size.standard, '100±1mm')
  assert.deepEqual(appearance.measurements.slice(0, 1), ['人工确认'])
  assert.equal(appearance.note, '不要覆盖')
  assert.deepEqual(appearance.images.map((photo) => photo.remoteUrl), [
    'https://example.com/manual.jpg',
  ])
  assert.deepEqual(result.unmatched.map((row) => row.project), [
    '表面质量',
    '未知尺寸',
  ])
  assert.equal(result.unmatched[1].groupTitle, '安全性能补充')
})


test('workbenchToDraft preserves online rows and only serializes uploaded photo URLs', () => {
  const workbench = buildInspectionWorkbench({ template: createTemplate() })
  workbench.rows[0] = {
    ...workbench.rows[0],
    decision: 'OK',
    note: '包装和外观通过',
    images: [
      {
        id: 'uploaded',
        localPath: '/tmp/a.jpg',
        remoteUrl: 'https://example.com/a.jpg',
        status: 'uploaded',
        error: '',
      },
      {
        id: 'local',
        localPath: '/tmp/b.jpg',
        remoteUrl: '',
        status: 'local',
        error: '',
      },
    ],
  }
  const unmatched = [{
    rowKey: 'unknown',
    groupTitle: '',
    project: '未知尺寸',
    measurements: ['12', ...Array(9).fill('')],
    reason: '线上表格中没有可自动回填的匹配条目',
  }]

  const draft = workbenchToDraft(workbench, {
    metadata: {
      customer: '客户A',
      supplier: '供应商A',
      orderNumber: 'PO-1',
      model: '100×16mm',
      arrivalQuantity: '1000',
      inspectionDate: '2026-07-24',
    },
    rawContent: 'OCR RAW',
    unmatched,
    reportImages: ['data:image/jpeg;base64,YQ=='],
  })

  assert.equal(draft.record_merge_mode, 'workbench')
  assert.deepEqual(draft.inspection_records[0].images, [
    'https://example.com/a.jpg',
  ])
  assert.equal(draft.inspection_records[0].group_title, '产品外观')
  assert.equal(draft.inspection_records[0].decision, 'OK')
  assert.equal(draft.ai_workbench_result.template_id, 'tpl-steel-brush')
  assert.equal(draft.ai_workbench_result.template_version, '3')
  assert.deepEqual(draft.ai_workbench_result.unmatched_recognition_rows, unmatched)
  assert.deepEqual(draft.ai_workbench_images, ['data:image/jpeg;base64,YQ=='])
})


test('workbench row editing updates one field without mutating other rows', () => {
  const workbench = buildInspectionWorkbench({ template: createTemplate() })
  const withMeasurement = updateWorkbenchMeasurement(
    workbench.rows,
    'size-outer',
    2,
    '100.2',
  )
  const withNote = updateWorkbenchRowField(
    withMeasurement,
    'appearance',
    'note',
    '已现场确认',
  )

  assert.equal(withNote[1].measurements[2], '100.2')
  assert.equal(withNote[0].note, '已现场确认')
  assert.equal(workbench.rows[1].measurements[2], '')
})

test('photo lifecycle updates or removes only the selected photo', () => {
  const workbench = buildInspectionWorkbench({ template: createTemplate() })
  const rows = addLocalPhotos(workbench.rows, 'appearance', ['/tmp/a.jpg', '/tmp/b.jpg'])
  const uploading = updateWorkbenchPhoto(rows, 'appearance', rows[0].images[0].id, {
    status: 'uploaded',
    remoteUrl: 'https://example.com/a.jpg',
  })
  const removed = removeWorkbenchPhoto(uploading, 'appearance', rows[0].images[1].id)

  assert.equal(removed[0].images.length, 1)
  assert.equal(removed[0].images[0].status, 'uploaded')
  assert.equal(removed[0].images[0].remoteUrl, 'https://example.com/a.jpg')
})

test('OCR target detection tolerates whitespace in online safety group titles', () => {
  const template = createTemplate()
  template.rows.push({
    row_key: 'safety-speed',
    group_title: '安 全 性 能',
    display_order: 30,
    project: '空载转速',
    method: '转速仪',
    standard: '≥10000rpm',
    measurement_standards: { unit: 'rpm' },
    note: '',
  })
  const workbench = buildInspectionWorkbench({ template })
  const result = mergeRecognitionRecord(workbench.rows, {
    productType: 'steel_brush',
    customer: '',
    supplier: '',
    trademark: '',
    orderNumber: '',
    model: '',
    arrivalQuantity: '',
    inspectionDate: '',
    rows: [{
      id: 'ocr-safety-speed',
      groupTitle: '安全性能',
      item: '空载转速',
      requirement: '',
      specification: '',
      measurements: ['10200'],
      lowConfidenceFields: [],
    }],
    sampleJudgements: Array(10).fill(''),
    notes: '',
    reviewer: '',
    inspector: '',
    lowConfidenceFields: [],
  })

  assert.equal(
    result.rows.find((row) => row.rowKey === 'safety-speed')?.measurements[0],
    '10200',
  )
  assert.equal(result.unmatched.length, 0)
})

test('new photo ids stay unique after a previously added photo is removed', () => {
  const workbench = buildInspectionWorkbench({ template: createTemplate() })
  const added = addLocalPhotos(workbench.rows, 'appearance', [
    '/tmp/a.jpg',
    '/tmp/b.jpg',
    '/tmp/c.jpg',
  ])
  const afterRemoval = removeWorkbenchPhoto(added, 'appearance', added[0].images[1].id)
  const afterAddingAgain = addLocalPhotos(afterRemoval, 'appearance', ['/tmp/d.jpg'])
  const ids = afterAddingAgain[0].images.map((photo) => photo.id)

  assert.equal(new Set(ids).size, ids.length)
})

test('online item detail follows the Web report matcher instead of a separate database quality template', () => {
  const template = buildOnlineInspectionTemplate({
    task: { id: 12, task_no: 'QI-12' },
    item: {
      id: 34,
      material_name: '钢丝刷',
      spec_desc: '100x20mm',
      packaging_method: '彩盒',
    },
    master_product: {
      category: 'WB',
      subcategory: '曲丝钢丝刷',
      name: '钢丝刷',
      spec_pairs: [{ label: '丝径', value: '0.30 mm' }],
      attribute_pairs: [{ label: '最大转速', value: '8500 RPM' }],
    },
    customer_product: {
      packaging_method: '彩盒',
      extra_info_text: '外箱标签：按客户图稿',
      extra_info_attachments: [],
    },
  }, [{
    scope: 'WB::曲丝钢丝刷',
    scope_label: 'WB / 曲丝钢丝刷',
    category: 'WB',
    subcategory: '曲丝钢丝刷',
    updated_at: '2026-07-27T10:00:00',
    rows: [
      {
        id: 'wire-appearance',
        section: '外观项目',
        item: '丝形态',
        method: '目视',
        requirement: '与母库一致',
        standard: '符合为 OK，不符合为 NG',
      },
      {
        id: 'wire-diameter',
        section: '尺寸项目',
        item: '丝径',
        method: '千分尺',
        requirement: '0.30 mm',
        standard: '符合公差要求',
      },
      {
        id: 'wire-speed',
        section: '安全项目',
        item: '最大转速',
        method: '回转仪',
        requirement: '8500 RPM',
        standard: '不低于要求',
      },
    ],
  }])

  assert.equal(template.template_id, 'online-report:wire_brush')
  assert.equal(template.version, 'online-web/QualityInspectionWorkbench/formal-v1')
  assert.equal(template.rows.some((row) => row.project === '丝形态'), false)
  assert.deepEqual(template.rows
    .filter((row) => ['产品尺寸', '产品安全', '产品性能'].includes(row.group_title))
    .map((row) => row.project), [
    '外径', '丝径', '出锋长度', '柄直径', '孔径/螺纹',
    '回转测试', '刷丝拉脱强度', '除锈/去毛刺效果', '使用寿命',
  ])
  assert.equal(template.rows.find((row) => row.project === '丝径')?.standard, '0.30 mm')
  assert.equal(template.rows.find((row) => row.project === '回转测试')?.standard, 'EN 1083 / ANSI B165.1')
  assert.deepEqual(template.columns.map((column) => column.key), [
    'project',
    'standard',
    'method',
    'sample_1',
    'sample_2',
    'sample_3',
    'sample_4',
    'sample_5',
    'sample_6',
    'sample_7',
    'sample_8',
    'sample_9',
    'sample_10',
    'images',
    'decision',
    'note',
  ])
})

test('online item detail falls back to the same generic report used by the online Web workbench', () => {
  const template = buildOnlineInspectionTemplate({
    task: { id: 12, task_no: 'QI-12' },
    item: { id: 34, material_name: '未配置模板产品' },
    master_product: {
      category: 'NEW',
      subcategory: '全新品类',
      spec_pairs: [{ label: '外径', value: '100 mm' }],
      attribute_pairs: [{ label: '表面处理', value: '镀锌' }],
      grade_pairs: [{ label: '安全等级', value: 'A级' }],
    },
    customer_product: { packaging_method: '彩盒' },
  }, [])

  assert.equal(template.template_id, 'online-report:generic')
  assert.deepEqual(template.rows.map((row) => row.project), [
    '产品外观',
    '包装方式',
    '关键尺寸',
    '产品安全性',
    '产品性能',
  ])
  assert.equal(template.rows[0].input_mode, 'manual_photo')
  assert.equal(template.rows[2].input_mode, 'ocr_measurement')
})


test('online web report matcher selects the velcro sanding disc table from a standalone item name', () => {
  const template = buildOnlineInspectionTemplate({
    task: { id: 252, task_no: 'MATCH-UPLOAD-TEST-870d95c3f7' },
    item: {
      id: 221,
      material_code: 'ITEM-870d95c3f7',
      material_name: '拉绒片',
      spec_desc: '115x22.23mm',
    },
    master_product: {
      category: '',
      subcategory: '',
      name: '拉绒片',
      master_code: 'ITEM-870d95c3f7',
      spec_pairs: [],
      attribute_pairs: [],
      grade_pairs: [],
    },
    customer_product: {},
  }, [])

  assert.equal(template.template_id, 'online-report:velcro_sanding_disc')
  assert.equal(template.version, 'online-web/QualityInspectionWorkbench/formal-v1')
  assert.deepEqual(template.rows.map((row) => row.project), [
    '产品外观',
    '长度',
    '宽度',
    '直径',
    '孔径',
    '厚度',
    '孔数',
    '粘接/剥离强度',
    '回转测试（圆片）',
    '磨削效率',
    '砂痕一致性/寿命',
  ])
  assert.deepEqual(template.rows.map((row) => row.group_title), [
    '产品外观',
    '产品尺寸', '产品尺寸', '产品尺寸', '产品尺寸', '产品尺寸', '产品尺寸',
    '产品安全', '产品安全',
    '产品性能', '产品性能',
  ])
  assert.equal(template.rows[0].photo_required, true)
  assert.equal(template.rows[1].input_mode, 'ocr_measurement')
})


test('formal online template keeps its structure and only merges compatible values from a stale draft', () => {
  const template = buildOnlineInspectionTemplate({
    task: { id: 252, task_no: 'MATCH-UPLOAD-TEST-870d95c3f7' },
    item: {
      id: 221,
      material_code: 'ITEM-870d95c3f7',
      material_name: '拉绒片',
      spec_desc: '115x22.23mm',
    },
    master_product: { name: '拉绒片' },
    customer_product: {},
  }, [])
  const workbench = buildInspectionWorkbench({
    template,
    draft: {
      records: [
        {
          row_key: 'legacy-diameter',
          group_title: '产品尺寸',
          project: '直径(㎜)',
          method: '',
          standard: '',
          decision: '',
          sample_data: ['115.2'],
          measurement_standards: {},
          note: '',
          ai_result: {},
          images: [],
        },
        {
          row_key: 'formal-strength',
          group_title: '金刚石锯片正式项目',
          project: '粘扣强度',
          method: '',
          standard: '',
          decision: 'OK',
          sample_data: ['合格'],
          measurement_standards: {},
          note: '',
          ai_result: {},
          images: [],
        },
      ],
      ai_workbench_result: {},
      ai_workbench_images: [],
    },
  })

  assert.equal(workbench.rows.some((row) => row.groupTitle.includes('金刚石锯片')), false)
  assert.equal(workbench.rows.some((row) => row.project === '粘扣强度'), false)
  const diameter = workbench.rows.find((row) => row.project === '直径')
  assert.ok(diameter)
  assert.equal(diameter.groupTitle, '产品尺寸')
  assert.equal(diameter.measurements[0], '115.2')
})


test('online Web resin report adds master QC rows before deduplicating template items', () => {
  const template = buildOnlineInspectionTemplate({
    task: { id: 300, task_no: 'QI-AW-300' },
    item: {
      id: 301,
      material_code: 'AW-115',
      material_name: '树脂切割片',
      spec_desc: '115x1.2x22.23mm',
    },
    master_product: {
      category: 'AW',
      subcategory: '树脂切割片',
      name: '树脂切割片',
      spec_pairs: [
        { label: '外径', value: '115 mm' },
        { label: '厚度', value: '1.2 mm' },
        { label: '孔径', value: '22.23 mm' },
      ],
      attribute_pairs: [
        { label: '安全速度', value: '80 m/s' },
        { label: '强化层', value: '双网' },
        { label: '切割材料', value: '不锈钢' },
        { label: '切割性能', value: '≥50刀' },
      ],
    },
    customer_product: {},
  }, [])

  assert.equal(template.template_id, 'online-report:resin_cutting_disc')
  assert.deepEqual(template.rows
    .filter((row) => row.group_title === '产品外观')
    .map((row) => row.project), ['产品外观'])
  assert.equal(template.rows.filter((row) => row.project === '外径').length, 1)
  assert.equal(template.rows.find((row) => row.project === '外径')?.standard, '115 mm')
  assert.equal(template.rows.find((row) => row.project === '孔径')?.standard, '22.23 mm')
  assert.equal(template.rows.find((row) => row.project === '回转/破裂测试')?.standard, 'EN 12413')
  assert.equal(template.rows.find((row) => row.project === '切割/磨削性能')?.standard, '按母库性能标准')
})

function createRecognitionRows(items: Array<{ id: string; groupTitle?: string; item: string; value: string }>) {
  return {
    productType: 'steel_brush' as const,
    customer: '',
    supplier: '',
    trademark: '',
    orderNumber: '',
    model: '',
    arrivalQuantity: '',
    inspectionDate: '',
    rows: items.map((item) => ({
      id: item.id,
      groupTitle: item.groupTitle || '',
      item: item.item,
      requirement: '',
      specification: '',
      measurements: [item.value],
      lowConfidenceFields: [],
    })),
    sampleJudgements: Array(10).fill('') as Array<''>,
    notes: '',
    reviewer: '',
    inspector: '',
    lowConfidenceFields: [],
  }
}

test('wire brush detail uses the same formal dimension, safety and performance entries as online', () => {
  const template = buildOnlineInspectionTemplate({
    task: { id: 270, task_no: 'QI-270' },
    item: { id: 271, material_name: '钢丝刷', spec_desc: '100mm' },
    master_product: { category: 'WB', subcategory: '曲丝钢丝刷', name: '钢丝刷' },
    customer_product: {},
  })

  assert.deepEqual(
    template.rows
      .filter((row) => ['产品尺寸', '产品安全', '产品性能'].includes(row.group_title))
      .map((row) => `${row.group_title}:${row.project}`),
    [
      '产品尺寸:外径',
      '产品尺寸:丝径',
      '产品尺寸:出锋长度',
      '产品尺寸:柄直径',
      '产品尺寸:孔径/螺纹',
      '产品安全:回转测试',
      '产品安全:刷丝拉脱强度',
      '产品性能:除锈/去毛刺效果',
      '产品性能:使用寿命',
    ],
  )
})

test('flap disc detail uses the same formal dimension, safety and performance entries as online', () => {
  const template = buildOnlineInspectionTemplate({
    task: { id: 6, task_no: 'QI-6' },
    item: { id: 7, material_name: '煅烧蓝氧化铝百叶轮', spec_desc: '115x22mm' },
    master_product: { category: 'CA', subcategory: '百页轮叶片式', name: '煅烧蓝氧化铝百叶轮' },
    customer_product: {},
  })

  assert.deepEqual(
    template.rows
      .filter((row) => ['产品尺寸', '产品安全', '产品性能'].includes(row.group_title))
      .map((row) => `${row.group_title}:${row.project}`),
    [
      '产品尺寸:外径',
      '产品尺寸:孔径/柄径',
      '产品尺寸:页片长度',
      '产品尺寸:页片宽度',
      '产品尺寸:页片数量',
      '产品安全:回转测试',
      '产品安全:页片粘接强度',
      '产品性能:磨削效率',
      '产品性能:磨削寿命',
    ],
  )
})

test('recognition aliases fill the intended formal rows and ignore a semantically incompatible row key', () => {
  const template = buildOnlineInspectionTemplate({
    task: { id: 6, task_no: 'QI-6' },
    item: { id: 7, material_name: '煅烧蓝氧化铝百叶轮', spec_desc: '115x22mm' },
    master_product: { category: 'CA', subcategory: '百页轮叶片式', name: '煅烧蓝氧化铝百叶轮' },
    customer_product: {},
  })
  const workbench = buildInspectionWorkbench({ template })
  const outer = workbench.rows.find((row) => row.project === '外径')!
  const result = mergeRecognitionRecord(workbench.rows, createRecognitionRows([
    { id: outer.rowKey, groupTitle: '产品尺寸', item: '中孔径(㎜)', value: '22.2' },
    { id: 'api-row-2', groupTitle: '产品尺寸', item: '直径(㎜)', value: '115.1' },
    { id: 'api-row-3', groupTitle: '产品尺寸', item: '叶片长度(㎜)', value: '18.0' },
    { id: 'api-row-4', groupTitle: '产品尺寸', item: '叶片宽度(㎜)', value: '16.0' },
    { id: 'api-row-5', groupTitle: '安全性能', item: '回转', value: 'OK' },
  ]))

  assert.equal(result.rows.find((row) => row.project === '孔径/柄径')?.measurements[0], '22.2')
  assert.equal(result.rows.find((row) => row.project === '外径')?.measurements[0], '115.1')
  assert.equal(result.rows.find((row) => row.project === '页片长度')?.measurements[0], '18.0')
  assert.equal(result.rows.find((row) => row.project === '页片宽度')?.measurements[0], '16.0')
  assert.equal(result.rows.find((row) => row.project === '回转测试')?.measurements[0], 'OK')
  assert.equal(result.unmatched.length, 0)
})

test('formal dimension rows keep master values when online labels use page-blade aliases', () => {
  const template = buildOnlineInspectionTemplate({
    task: { id: 6, task_no: 'QI-6' },
    item: { id: 7, material_name: '百叶轮', spec_desc: '115x22mm' },
    master_product: {
      subcategory: '百页轮叶片式',
      name: '百叶轮',
      spec_pairs: [
        { label: '外径', value: '115 mm' },
        { label: '孔径', value: '22.23 mm' },
        { label: '叶片长度', value: '18 mm' },
        { label: '叶片宽度', value: '16 mm' },
      ],
      attribute_pairs: [{ label: '叶片数量', value: '72' }],
    },
    customer_product: {},
  })

  assert.equal(template.rows.find((row) => row.project === '页片长度')?.standard, '18 mm')
  assert.equal(template.rows.find((row) => row.project === '页片宽度')?.standard, '16 mm')
  assert.equal(template.rows.find((row) => row.project === '页片数量')?.standard, '72')
})
