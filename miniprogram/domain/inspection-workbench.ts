import { InspectionRecord, normalizeTenValues } from './inspection-record'

export type InspectionWorkbenchInputMode =
  | 'manual'
  | 'manual_photo'
  | 'ocr_measurement'

export interface InspectionTemplateColumnDto {
  key: string
  title: string
  display_order: number
  visible: boolean
  width?: number | null
}

export interface InspectionTemplateRowDto {
  row_key: string
  group_title: string
  display_order: number
  project: string
  method: string
  standard: string
  measurement_standards: Record<string, string>
  note: string
  photo_required?: boolean | null
  input_mode?: InspectionWorkbenchInputMode | null
}

export interface InspectionTemplateDto {
  template_id: string
  version: string
  title?: string
  template_name?: string
  columns: InspectionTemplateColumnDto[]
  rows: InspectionTemplateRowDto[]
}

export interface InspectionPhoto {
  id: string
  localPath: string
  remoteUrl: string
  status: 'local' | 'compressing' | 'uploading' | 'uploaded' | 'failed'
  error: string
  origin?: 'ai_assignment'
  sourceImageIndex?: number
}

export interface InspectionWorkbenchRow {
  rowKey: string
  groupTitle: string
  displayOrder: number
  project: string
  method: string
  standard: string
  measurements: string[]
  measurementStandards: Record<string, string>
  decision: string
  note: string
  photoRequired: boolean
  inputMode: InspectionWorkbenchInputMode
  images: InspectionPhoto[]
}

export interface InspectionWorkbench {
  source: 'draft' | 'template'
  templateId: string
  templateVersion: string
  columns: InspectionTemplateColumnDto[]
  rows: InspectionWorkbenchRow[]
}

export interface InspectionDraftRecordLike {
  row_key: string
  group_title: string
  project: string
  method: string
  standard: string
  decision: string
  sample_data: string[]
  measurement_standards: Record<string, string>
  note: string
  ai_result: Record<string, unknown>
  images: string[]
}

export interface InspectionDraftLike {
  inspection_records?: InspectionDraftRecordLike[]
  records?: InspectionDraftRecordLike[]
  ai_workbench_result: Record<string, unknown>
  ai_workbench_images: string[]
  record_source_images?: string[]
  record_merge_mode?: string
}

function normalizedGroup(value: string): string {
  return value.trim().replace(/\s+/g, '')
}

function normalizeDecision(value: unknown): 'OK' | 'NG' {
  return String(value || '').trim().toUpperCase() === 'OK' ? 'OK' : 'NG'
}

function fallbackPhotoRequired(row: InspectionTemplateRowDto): boolean {
  if (typeof row.photo_required === 'boolean') return row.photo_required
  const group = normalizedGroup(row.group_title)
  return group.includes('外观') || group.includes('包装')
}


export function normalizeInspectionProjectName(value: string): string {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[（(].*?[）)]/g, '')
    .replace(/毫米|mm|㎜/gi, '')
    .replace(/叶片/g, '页片')
    .replace(/[\s，。；：、,.;:【】\[\]_/\-]+/g, '')
    .replace(/^产品/, '')
  if (/^(外径|直径)$/.test(normalized)) return '外径'
  if (/^(中孔|中孔径|孔径)$/.test(normalized)) return '孔径'
  if (/^(柄径|柄直径)$/.test(normalized)) return '柄直径'
  if (/^(页片长|页片长度|刷丝长度)$/.test(normalized)) return normalized === '刷丝长度' ? '出锋长度' : '页片长度'
  if (/^页片宽(?:度)?$/.test(normalized)) return '页片宽度'
  if (/^(页片数量|页片数)$/.test(normalized)) return '页片数量'
  if (/^(回转|回转测试|检测转速|空载转速|转速)$/.test(normalized)) return '回转测试'
  if (/^(磨料)?材质$/.test(normalized)) return '材质'
  if (/^粒度号?$/.test(normalized)) return '粒度'
  if (/^(砂面)?颜色$/.test(normalized)) return '颜色'
  if (/^(圆盘)?孔数$/.test(normalized)) return '孔数'
  return normalized
}

export function inspectionGroupSemantic(value: string): string {
  const group = normalizedGroup(value)
  if (group.includes('尺寸')) return 'dimension'
  if (group.includes('安全')) return 'safety'
  if (group.includes('性能') || group.includes('测试报告')) return 'performance'
  if (group.includes('外观')) return 'appearance'
  if (group.includes('包装') || group.includes('商标') || group.includes('标签')) return 'packaging'
  return group
}

export function inspectionProjectAliases(
  project: string,
  standards: Record<string, string>,
): string[] {
  const configured = standards['识别别名'] || standards.recognition_aliases || ''
  return [project, ...configured.split(/[|｜、,，;；]/)]
    .map(normalizeInspectionProjectName)
    .filter(Boolean)
}

function templateRowMatchesProject(row: InspectionTemplateRowDto, project: string): boolean {
  const normalized = normalizeInspectionProjectName(project)
  return Boolean(normalized) && inspectionProjectAliases(
    row.project,
    row.measurement_standards,
  ).includes(normalized)
}

export function workbenchRowMatchesProject(
  row: InspectionWorkbenchRow,
  project: string,
): boolean {
  const normalized = normalizeInspectionProjectName(project)
  return Boolean(normalized) && inspectionProjectAliases(
    row.project,
    row.measurementStandards,
  ).includes(normalized)
}

function matchDraftRecords(
  sourceRows: InspectionTemplateRowDto[],
  draftRecords: InspectionDraftRecordLike[],
): Map<InspectionTemplateRowDto, InspectionDraftRecordLike[]> {
  const result = new Map<InspectionTemplateRowDto, InspectionDraftRecordLike[]>()
  const used = new Set<InspectionDraftRecordLike>()
  sourceRows.forEach((row) => {
    const sameSemanticGroup = (draft: InspectionDraftRecordLike) => (
      inspectionGroupSemantic(draft.group_title) === inspectionGroupSemantic(row.group_title)
    )
    const exactMatches = draftRecords.filter((draft) => (
      !used.has(draft)
      && Boolean(row.row_key)
      && draft.row_key === row.row_key
      && templateRowMatchesProject(row, draft.project)
    ))
    const exactSameGroup = exactMatches.filter(sameSemanticGroup)
    const exact = exactSameGroup[0] || exactMatches[0]
    if (exact) {
      const matches = fallbackPhotoRequired(row)
        ? [
            exact,
            ...draftRecords.filter((draft) => (
              draft !== exact
              && !used.has(draft)
              && sameSemanticGroup(draft)
              && templateRowMatchesProject(row, draft.project)
            )),
          ]
        : [exact]
      result.set(row, matches)
      matches.forEach((draft) => used.add(draft))
      return
    }
    const available = draftRecords.filter((draft) => (
      !used.has(draft)
      && templateRowMatchesProject(row, draft.project)
    ))
    const sameGroup = available.filter(sameSemanticGroup)
    const matches = sameGroup.length > 0 ? sameGroup : available
    if (matches.length === 1 || (matches.length > 1 && fallbackPhotoRequired(row))) {
      result.set(row, matches)
      matches.forEach((draft) => used.add(draft))
    }
  })
  return result
}

function mergedDraftDecision(records: InspectionDraftRecordLike[]): 'OK' | 'NG' {
  const decisions = records.map((record) => String(record.decision || '').trim().toUpperCase())
  if (decisions.includes('NG')) return 'NG'
  if (decisions.includes('OK')) return 'OK'
  return 'NG'
}

function mergedDraftNote(records: InspectionDraftRecordLike[], fallback: string): string {
  const notes = records
    .map((record) => record.note.trim())
    .filter((note, index, all) => Boolean(note) && all.indexOf(note) === index)
  return notes.length > 0 ? notes.join('；') : fallback
}

function mergedDraftImages(records: InspectionDraftRecordLike[]): string[] {
  return records
    .flatMap((record) => record.images || [])
    .filter((image, index, all) => Boolean(image) && all.indexOf(image) === index)
}

function uniqueWorkbenchRowKeys(rows: InspectionTemplateRowDto[]): Map<InspectionTemplateRowDto, string> {
  const result = new Map<InspectionTemplateRowDto, string>()
  const used = new Set<string>()
  rows.forEach((row, index) => {
    const sourceKey = row.row_key.trim()
    const fallbackKey = `template-row:${row.display_order}:${inspectionGroupSemantic(row.group_title)}:${normalizeInspectionProjectName(row.project)}`
    const baseKey = sourceKey || fallbackKey || `template-row:${index}`
    let rowKey = baseKey
    let duplicateIndex = 2
    while (used.has(rowKey)) {
      rowKey = `${baseKey}:duplicate-${duplicateIndex}`
      duplicateIndex += 1
    }
    used.add(rowKey)
    result.set(row, rowKey)
  })
  return result
}

export function buildInspectionWorkbench(options: {
  template?: InspectionTemplateDto | null
  draft?: InspectionDraftLike | null
}): InspectionWorkbench {
  const template = options.template
  const draftRecords = options.draft?.inspection_records || options.draft?.records || []
  if (!template && draftRecords.length === 0) {
    throw new Error('线上检验模板尚未配置')
  }
  const sourceRows: InspectionTemplateRowDto[] = template
    ? template.rows
    : draftRecords.map((row, index) => ({
      row_key: row.row_key,
      group_title: row.group_title,
      display_order: index,
      project: row.project,
      method: row.method,
      standard: row.standard,
      measurement_standards: row.measurement_standards,
      note: row.note,
    }))
  const orderedRows = [...sourceRows].sort((left, right) => left.display_order - right.display_order)
  const matchedDrafts = matchDraftRecords(orderedRows, draftRecords)
  const workbenchRowKeys = uniqueWorkbenchRowKeys(orderedRows)
  const rows = orderedRows
    .map((row) => {
      const savedRecords = matchedDrafts.get(row) || []
      const saved = savedRecords[0]
      const measurementRecord = savedRecords.find((record) => (
        record.sample_data.some((value) => Boolean(String(value || '').trim()))
      )) || saved
      const photoRequired = fallbackPhotoRequired(row)
      const rowKey = workbenchRowKeys.get(row) || row.row_key
      return {
        rowKey,
        groupTitle: row.group_title,
        displayOrder: row.display_order,
        project: row.project,
        method: row.method,
        standard: row.standard,
        measurements: normalizeTenValues(measurementRecord?.sample_data || []),
        measurementStandards: { ...row.measurement_standards },
        decision: savedRecords.length > 0 ? mergedDraftDecision(savedRecords) : normalizeDecision(undefined),
        note: mergedDraftNote(savedRecords, row.note),
        photoRequired,
        inputMode: row.input_mode || (photoRequired ? 'manual_photo' : 'manual'),
        images: mergedDraftImages(savedRecords).map((remoteUrl, index) => ({
          id: `remote-${rowKey}-${index}`,
          localPath: '',
          remoteUrl,
          status: 'uploaded' as const,
          error: '',
        })),
      }
    })
  return {
    source: draftRecords.length > 0 ? 'draft' : 'template',
    templateId: template?.template_id || '',
    templateVersion: template?.version || '',
    columns: [...(template?.columns || [])]
      .filter((column) => column.visible)
      .sort((left, right) => left.display_order - right.display_order),
    rows,
  }
}


export function addLocalPhotos(
  rows: InspectionWorkbenchRow[],
  rowKey: string,
  localPaths: string[],
): InspectionWorkbenchRow[] {
  return rows.map((row) => {
    if (row.rowKey !== rowKey || localPaths.length === 0) return row
    const idPrefix = `local-${rowKey}-`
    const nextIndex = row.images.reduce((maximum, photo) => {
      if (!photo.id.startsWith(idPrefix)) return maximum
      const value = Number(photo.id.slice(idPrefix.length))
      return Number.isInteger(value) ? Math.max(maximum, value) : maximum
    }, -1) + 1
    const additions: InspectionPhoto[] = localPaths.map((localPath, index) => ({
      id: `${idPrefix}${nextIndex + index}`,
      localPath,
      remoteUrl: '',
      status: 'local',
      error: '',
    }))
    return { ...row, images: [...row.images, ...additions] }
  })
}


export interface UnmatchedRecognitionRow {
  rowKey: string
  groupTitle: string
  project: string
  measurements: string[]
  reason: string
}

export interface RecognitionMergeResult {
  rows: InspectionWorkbenchRow[]
  unmatched: UnmatchedRecognitionRow[]
}

function isOcrTarget(row: InspectionWorkbenchRow): boolean {
  if (row.inputMode === 'ocr_measurement') return true
  const group = normalizedGroup(row.groupTitle)
  return group.includes('尺寸') || group.includes('安全性能') || group.includes('外观')
}

export function mergeRecognitionRecord(
  rows: InspectionWorkbenchRow[],
  record: InspectionRecord,
): RecognitionMergeResult {
  let nextRows = rows
  const unmatched: UnmatchedRecognitionRow[] = []
  const matchedKeys = new Set<string>()

  record.rows.forEach((recognized) => {
    const targets = nextRows.filter((row) => isOcrTarget(row) && !matchedKeys.has(row.rowKey))
    const generatedApiKey = /^api-row-\d+$/.test(recognized.id)
    let target = generatedApiKey ? undefined : targets.find((row) => (
      row.rowKey === recognized.id && workbenchRowMatchesProject(row, recognized.item)
    ))
    if (!target) {
      const projectMatches = targets.filter((row) => workbenchRowMatchesProject(row, recognized.item))
      const recognizedGroup = inspectionGroupSemantic(recognized.groupTitle || '')
      const sameGroupMatches = recognizedGroup
        ? projectMatches.filter((row) => inspectionGroupSemantic(row.groupTitle) === recognizedGroup)
        : []
      const matches = sameGroupMatches.length > 0 ? sameGroupMatches : projectMatches
      if (matches.length === 1) target = matches[0]
    }
    if (!target) {
      unmatched.push({
        rowKey: recognized.id,
        groupTitle: recognized.groupTitle || '',
        project: recognized.item,
        measurements: normalizeTenValues(recognized.measurements),
        reason: '线上表格中没有可自动回填的匹配条目',
      })
      return
    }
    matchedKeys.add(target.rowKey)
    nextRows = nextRows.map((row) => row.rowKey === target?.rowKey
      ? { ...row, measurements: normalizeTenValues(recognized.measurements) }
      : row)
  })

  return { rows: nextRows, unmatched }
}


export interface WorkbenchDraftMetadata {
  customer: string
  supplier: string
  orderNumber: string
  model: string
  arrivalQuantity: string
  inspectionDate: string
}

export interface WorkbenchDraftRecord {
  row_key: string
  group_title: string
  project: string
  method: string
  standard: string
  decision: string
  sample_data: string[]
  measurement_standards: Record<string, string>
  note: string
  ai_result: Record<string, unknown>
  images: string[]
}

export interface WorkbenchDraftPayload {
  inspection_records: WorkbenchDraftRecord[]
  ai_workbench_result: Record<string, unknown>
  ai_workbench_images: string[]
  record_source_images: string[]
  deleted_record_images: string[]
  record_merge_mode: 'workbench'
}

export function workbenchToDraft(
  workbench: InspectionWorkbench,
  options: {
    metadata: WorkbenchDraftMetadata
    rawContent: string
    unmatched: UnmatchedRecognitionRow[]
    qualitySheetImages: string[]
    inspectionImages: string[]
    deletedRecordImages?: string[]
    aiResult?: Record<string, unknown>
  },
): WorkbenchDraftPayload {
  return {
    inspection_records: workbench.rows.map((row) => ({
      row_key: row.rowKey,
      group_title: row.groupTitle,
      project: row.project,
      method: row.method,
      standard: row.standard,
      decision: row.decision,
      sample_data: normalizeTenValues(row.measurements),
      measurement_standards: { ...row.measurementStandards },
      note: row.note,
      ai_result: {},
      images: row.images
        .filter((photo) => (
          photo.status === 'uploaded'
          && photo.remoteUrl
          && photo.origin !== 'ai_assignment'
        ))
        .map((photo) => photo.remoteUrl),
    })),
    ai_workbench_result: {
      ...(options.aiResult || {}),
      schema_version: 'miniprogram-inspection-workbench/v1',
      source: 'miniprogram',
      template_id: workbench.templateId,
      template_version: workbench.templateVersion,
      customer: options.metadata.customer,
      supplier: options.metadata.supplier,
      order_number: options.metadata.orderNumber,
      model: options.metadata.model,
      arrival_quantity: options.metadata.arrivalQuantity,
      inspection_date: options.metadata.inspectionDate,
      recognition_raw_content: options.rawContent,
      unmatched_recognition_rows: options.unmatched,
    },
    ai_workbench_images: [...options.inspectionImages],
    record_source_images: [...options.qualitySheetImages],
    deleted_record_images: [...(options.deletedRecordImages || [])],
    record_merge_mode: 'workbench',
  }
}


export function updateWorkbenchMeasurement(
  rows: InspectionWorkbenchRow[],
  rowKey: string,
  measurementIndex: number,
  value: string,
): InspectionWorkbenchRow[] {
  return rows.map((row) => {
    if (row.rowKey !== rowKey) return row
    const measurements = normalizeTenValues(row.measurements)
    if (measurementIndex < 0 || measurementIndex >= measurements.length) return row
    measurements[measurementIndex] = value
    return { ...row, measurements }
  })
}

export function updateWorkbenchRowField(
  rows: InspectionWorkbenchRow[],
  rowKey: string,
  field: 'decision' | 'note',
  value: string,
): InspectionWorkbenchRow[] {
  return rows.map((row) => row.rowKey === rowKey
    ? { ...row, [field]: value }
    : row)
}

export function updateWorkbenchPhoto(
  rows: InspectionWorkbenchRow[],
  rowKey: string,
  photoId: string,
  patch: Partial<InspectionPhoto>,
): InspectionWorkbenchRow[] {
  return rows.map((row) => row.rowKey === rowKey
    ? {
      ...row,
      images: row.images.map((photo) => photo.id === photoId
        ? { ...photo, ...patch }
        : photo),
    }
    : row)
}

export function removeWorkbenchPhoto(
  rows: InspectionWorkbenchRow[],
  rowKey: string,
  photoId: string,
): InspectionWorkbenchRow[] {
  return rows.map((row) => row.rowKey === rowKey
    ? { ...row, images: row.images.filter((photo) => photo.id !== photoId) }
    : row)
}
