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
  columns: InspectionTemplateColumnDto[]
  rows: InspectionTemplateRowDto[]
}

export interface InspectionPhoto {
  id: string
  localPath: string
  remoteUrl: string
  status: 'local' | 'compressing' | 'uploading' | 'uploaded' | 'failed'
  error: string
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
  record_merge_mode?: string
}

function normalizedGroup(value: string): string {
  return value.trim().replace(/\s+/g, '')
}

function fallbackPhotoRequired(row: InspectionTemplateRowDto): boolean {
  if (typeof row.photo_required === 'boolean') return row.photo_required
  const group = normalizedGroup(row.group_title)
  return group.includes('外观') || group.includes('包装')
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
  const draftByKey = new Map(draftRecords.map((row) => [row.row_key, row]))
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
  const rows = [...sourceRows]
    .sort((left, right) => left.display_order - right.display_order)
    .map((row) => {
      const saved = draftByKey.get(row.row_key)
      const photoRequired = fallbackPhotoRequired(row)
      return {
        rowKey: row.row_key,
        groupTitle: row.group_title,
        displayOrder: row.display_order,
        project: row.project,
        method: saved?.method || row.method,
        standard: saved?.standard || row.standard,
        measurements: normalizeTenValues(saved?.sample_data || []),
        measurementStandards: {
          ...row.measurement_standards,
          ...(saved?.measurement_standards || {}),
        },
        decision: saved?.decision || '',
        note: saved?.note || row.note,
        photoRequired,
        inputMode: row.input_mode || (photoRequired ? 'manual_photo' : 'manual'),
        images: (saved?.images || []).map((remoteUrl, index) => ({
          id: `remote-${row.row_key}-${index}`,
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

function normalizedProject(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[\s，。；：、,.;:()（）【】\[\]_-]+/g, '')
    .replace(/^产品/, '')
}

function isOcrTarget(row: InspectionWorkbenchRow): boolean {
  if (row.inputMode === 'ocr_measurement') return true
  const group = normalizedGroup(row.groupTitle)
  return group.includes('尺寸') || group.includes('安全性能')
}

export function mergeRecognitionRecord(
  rows: InspectionWorkbenchRow[],
  record: InspectionRecord,
): RecognitionMergeResult {
  let nextRows = rows
  const unmatched: UnmatchedRecognitionRow[] = []
  const matchedKeys = new Set<string>()

  record.rows.forEach((recognized) => {
    const targets = nextRows.filter(isOcrTarget)
    let target = targets.find((row) => (
      row.rowKey === recognized.id && !matchedKeys.has(row.rowKey)
    ))
    if (!target) {
      const project = normalizedProject(recognized.item)
      const projectMatches = targets.filter((row) => (
        normalizedProject(row.project) === project && !matchedKeys.has(row.rowKey)
      ))
      if (projectMatches.length === 1) target = projectMatches[0]
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
  record_merge_mode: 'matched_only'
}

export function workbenchToDraft(
  workbench: InspectionWorkbench,
  options: {
    metadata: WorkbenchDraftMetadata
    rawContent: string
    unmatched: UnmatchedRecognitionRow[]
    reportImages: string[]
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
        .filter((photo) => photo.status === 'uploaded' && photo.remoteUrl)
        .map((photo) => photo.remoteUrl),
    })),
    ai_workbench_result: {
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
    ai_workbench_images: [...options.reportImages],
    record_merge_mode: 'matched_only',
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
