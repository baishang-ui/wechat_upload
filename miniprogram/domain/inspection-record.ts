export const MEASUREMENT_COUNT = 10

export const PRODUCT_OPTIONS = [
  { label: '钢丝刷', value: 'steel_brush' },
  { label: '拉绒片', value: 'velcro_disc' },
  { label: '树脂砂轮', value: 'resin_wheel' },
  { label: '百叶轮', value: 'flap_disc' },
  { label: '网格砂', value: 'mesh_abrasive' },
  { label: '金刚石锯片', value: 'diamond_blade' },
] as const

export type ProductType = typeof PRODUCT_OPTIONS[number]['value']
export type Judgement = 'OK' | 'NG' | ''
export type InspectionRowField = 'item' | 'requirement' | 'specification'

export interface InspectionRow {
  id: string
  groupTitle?: string
  item: string
  requirement: string
  specification: string
  measurements: string[]
  lowConfidenceFields: string[]
}

export interface InspectionRecord {
  productType: ProductType
  customer: string
  supplier: string
  trademark: string
  orderNumber: string
  model: string
  arrivalQuantity: string
  inspectionDate: string
  rows: InspectionRow[]
  sampleJudgements: Judgement[]
  notes: string
  reviewer: string
  inspector: string
  lowConfidenceFields: string[]
}

export interface RawApiRecord {
  report_title?: unknown
  customer?: unknown
  supplier?: unknown
  trademark?: unknown
  order_number?: unknown
  model_spec?: unknown
  arrival_quantity?: unknown
  inspection_date?: unknown
  items?: unknown
  sample_judgements?: unknown
  notes?: unknown
  reviewer?: unknown
  inspector?: unknown
  [key: string]: unknown
}

interface NormalizedRawItem {
  rowKey: string
  groupTitle: string
  name: string
  standard: string
  specification: string
  measurements: string[]
}

function asString(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}


export function normalizeInspectionDate(value: string): string {
  const text = asString(value)
  const separated = text.match(/^(\d{4})([-./])(\d{1,2})\2(\d{1,2})$/)
  const chinese = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/)
  const year = Number(separated?.[1] ?? chinese?.[1])
  const month = Number(separated?.[3] ?? chinese?.[2])
  const day = Number(separated?.[4] ?? chinese?.[3])
  if (!year || !month || !day || month > 12) return ''
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (day > daysInMonth[month - 1]) return ''
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

export function normalizeTenValues(values: unknown[] = []): string[] {
  return Array.from({ length: MEASUREMENT_COUNT }, (_, index) => asString(values[index]))
}

function normalizeJudgements(values: unknown[] = []): Judgement[] {
  return normalizeTenValues(values).map((value) => {
    const normalized = value.toUpperCase()
    return normalized === 'OK' || normalized === 'NG' ? normalized : ''
  })
}

function createRow(
  id: string,
  groupTitle: string,
  item: string,
  requirement: string,
  specification: string,
  measurements: unknown[],
): InspectionRow {
  return {
    id,
    groupTitle,
    item,
    requirement,
    specification,
    measurements: normalizeTenValues(measurements),
    lowConfidenceFields: [],
  }
}

export function parseModelContent(content: string): RawApiRecord {
  const withoutFence = content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  const objectStart = withoutFence.indexOf('{')
  const objectEnd = withoutFence.lastIndexOf('}')
  const jsonText = objectStart >= 0 && objectEnd >= objectStart
    ? withoutFence.slice(objectStart, objectEnd + 1)
    : withoutFence
  const parsed: unknown = JSON.parse(jsonText)
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('模型未返回有效的检验报告对象')
  }
  return parsed as RawApiRecord
}

function detectProductType(reportTitle: string): ProductType {
  const match = PRODUCT_OPTIONS.find((option) => reportTitle.includes(option.label))
  return match?.value ?? 'steel_brush'
}

function normalizeItems(value: unknown): NormalizedRawItem[] {
  if (!Array.isArray(value)) return []
  return value.map((item) => {
    const source = asObject(item)
    return {
      rowKey: asString(source.row_key),
      groupTitle: asString(source.group_title),
      name: asString(source.name || source.project),
      standard: asString(source.standard),
      specification: asString(source.specification),
      measurements: normalizeTenValues(Array.isArray(source.measurements) ? source.measurements : []),
    }
  })
}

export function normalizeApiRecord(raw: RawApiRecord): InspectionRecord {
  const items = normalizeItems(raw.items)
  const judgementItem = items.find((item) => item.name.includes('判定'))
  const apiJudgements = normalizeJudgements(Array.isArray(raw.sample_judgements) ? raw.sample_judgements : [])
  const sampleJudgements = apiJudgements.some(Boolean)
    ? apiJudgements
    : normalizeJudgements(judgementItem?.measurements ?? [])
  const rows = items
    .filter((item) => item.name && !item.name.includes('判定'))
    .map((item, index) => createRow(
      item.rowKey || `api-row-${index + 1}`,
      item.groupTitle,
      item.name,
      item.standard,
      item.specification,
      item.measurements,
    ))

  return {
    productType: detectProductType(asString(raw.report_title)),
    customer: asString(raw.customer),
    supplier: asString(raw.supplier),
    trademark: asString(raw.trademark),
    orderNumber: asString(raw.order_number),
    model: asString(raw.model_spec),
    arrivalQuantity: asString(raw.arrival_quantity),
    inspectionDate: asString(raw.inspection_date),
    rows,
    sampleJudgements,
    notes: asString(raw.notes),
    reviewer: asString(raw.reviewer),
    inspector: asString(raw.inspector),
    lowConfidenceFields: [],
  }
}

export function createMockRecord(): InspectionRecord {
  return {
    productType: 'steel_brush',
    customer: '',
    supplier: '',
    trademark: '',
    orderNumber: '',
    model: '',
    arrivalQuantity: '',
    inspectionDate: '',
    rows: [],
    sampleJudgements: normalizeJudgements([]),
    notes: '',
    reviewer: '',
    inspector: '',
    lowConfidenceFields: [],
  }
}

export function updateRecordField(
  record: InspectionRecord,
  field: keyof InspectionRecord,
  value: string | ProductType,
): InspectionRecord {
  return { ...record, [field]: value }
}

export function updateRowField(
  record: InspectionRecord,
  rowIndex: number,
  field: InspectionRowField,
  value: string,
): InspectionRecord {
  const rows = record.rows.map((row, index) => index === rowIndex ? { ...row, [field]: value } : row)
  return { ...record, rows }
}

export function updateMeasurement(
  record: InspectionRecord,
  rowIndex: number,
  measurementIndex: number,
  value: string,
): InspectionRecord {
  const row = record.rows[rowIndex]
  if (!row) return record
  const measurements = normalizeTenValues(row.measurements)
  measurements[measurementIndex] = value
  const rows = record.rows.map((item, index) => index === rowIndex ? { ...item, measurements } : item)
  return { ...record, rows }
}

export function updateSampleJudgement(
  record: InspectionRecord,
  sampleIndex: number,
  value: Judgement,
): InspectionRecord {
  const sampleJudgements = normalizeJudgements(record.sampleJudgements)
  sampleJudgements[sampleIndex] = value
  return { ...record, sampleJudgements }
}

export function validateRecord(record: InspectionRecord): string[] {
  const required: Array<[keyof InspectionRecord, string]> = [
    ['customer', '客户'],
    ['supplier', '供应商'],
    ['model', '型号/规格'],
    ['inspectionDate', '检验日期'],
  ]
  const missing = required
    .filter(([field]) => !String(record[field]).trim())
    .map(([, label]) => label)

  if (record.inspectionDate.trim() && !normalizeInspectionDate(record.inspectionDate)) {
    missing.push('检验日期格式（YYYY-MM-DD）')
  }
  if (record.rows.length === 0) {
    missing.push('检验项目')
  }
  return missing
}
