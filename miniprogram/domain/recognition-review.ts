import { InspectionRecord } from './inspection-record'

export type ReviewRiskLevel = 'normal' | 'warning' | 'danger'

export interface RecognitionItemConfidence {
  name: number | null
  standard: number | null
  specification: number | null
  measurements: Array<number | null>
}

export interface RecognitionConfidencePayload {
  fields: Record<string, number | null>
  items: RecognitionItemConfidence[]
  sample_judgements: Array<number | null>
}

export interface FieldReviewHint {
  score: number | null
  level: ReviewRiskLevel
  reason: string
  reviewed: boolean
  cssClass: string
}

export interface RecognitionRowReviewHints {
  item: FieldReviewHint
  requirement: FieldReviewHint
  specification: FieldReviewHint
  measurements: FieldReviewHint[]
}

export interface RecognitionReviewHints {
  fields: Record<string, FieldReviewHint>
  rows: RecognitionRowReviewHints[]
  sampleJudgements: FieldReviewHint[]
  dangerCount: number
  warningCount: number
}

const CONFIDENCE_FIELD_NAMES = [
  'report_title',
  'customer',
  'supplier',
  'trademark',
  'order_number',
  'model_spec',
  'arrival_quantity',
  'inspection_date',
  'notes',
  'reviewer',
  'inspector',
] as const

function asObject(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

function normalizeScore(value: unknown): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  return Math.max(0, Math.min(1, value))
}

function normalizeTenScores(value: unknown): Array<number | null> {
  const source = asArray(value)
  return Array.from({ length: 10 }, (_, index) => normalizeScore(source[index]))
}

export function normalizeRecognitionConfidence(
  value: unknown,
  rowCount: number,
): RecognitionConfidencePayload {
  const source = asObject(value)
  const fieldSource = asObject(source.fields)
  const itemSource = asArray(source.items)
  return {
    fields: Object.fromEntries(
      CONFIDENCE_FIELD_NAMES.map((field) => [field, normalizeScore(fieldSource[field])]),
    ),
    items: Array.from({ length: Math.max(0, rowCount) }, (_, index) => {
      const item = asObject(itemSource[index])
      return {
        name: normalizeScore(item.name),
        standard: normalizeScore(item.standard),
        specification: normalizeScore(item.specification),
        measurements: normalizeTenScores(item.measurements),
      }
    }),
    sample_judgements: normalizeTenScores(source.sample_judgements),
  }
}

function isNonEmpty(value: string): boolean {
  return value.trim().length > 0
}

function isDate(value: string): boolean {
  return isNonEmpty(value) && !Number.isNaN(Date.parse(value))
}

function isQuantity(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return true
  return /^\d+(?:\.\d+)?(?:\s*[A-Za-z\u4e00-\u9fa5]+)?$/.test(normalized)
}

function isMeasurement(value: string): boolean {
  const normalized = value.trim()
  if (!normalized) return true
  if (/^(?:OK|NG|PASS|FAIL)$/i.test(normalized)) return true
  return /^[+-]?\d+(?:\.\d+)?(?:\s*(?:-|~|～|±)\s*[+-]?\d+(?:\.\d+)?)?(?:\s*[A-Za-z%℃°\u4e00-\u9fa5]+)?$/.test(normalized)
}

function hintCssClass(level: ReviewRiskLevel, reviewed: boolean): string {
  if (reviewed || level === 'normal') return ''
  return `is-confidence-${level}`
}

function createHint(
  score: number | null,
  formatError = '',
): FieldReviewHint {
  let level: ReviewRiskLevel = 'normal'
  let reason = ''
  if (formatError) {
    level = 'danger'
    reason = formatError
  } else if (score === null) {
    level = 'warning'
    reason = '模型未提供准确度，请人工核对'
  } else if (score < 0.6) {
    level = 'danger'
    reason = `识别准确度 ${Math.round(score * 100)}%，请重点核对`
  } else if (score < 0.8) {
    level = 'warning'
    reason = `识别准确度 ${Math.round(score * 100)}%，建议核对`
  }
  return {
    score,
    level,
    reason,
    reviewed: false,
    cssClass: hintCssClass(level, false),
  }
}

function countRisks(hints: RecognitionReviewHints): Pick<RecognitionReviewHints, 'dangerCount' | 'warningCount'> {
  const all = [
    ...Object.values(hints.fields),
    ...hints.rows.flatMap((row) => [
      row.item,
      row.requirement,
      row.specification,
      ...row.measurements,
    ]),
    ...hints.sampleJudgements,
  ]
  return {
    dangerCount: all.filter((hint) => !hint.reviewed && hint.level === 'danger').length,
    warningCount: all.filter((hint) => !hint.reviewed && hint.level === 'warning').length,
  }
}

function withCounts(hints: RecognitionReviewHints): RecognitionReviewHints {
  return { ...hints, ...countRisks(hints) }
}

export function createEmptyReviewHints(): RecognitionReviewHints {
  return {
    fields: {},
    rows: [],
    sampleJudgements: [],
    dangerCount: 0,
    warningCount: 0,
  }
}

export function buildRecognitionReviewHints(
  record: InspectionRecord,
  confidence: RecognitionConfidencePayload,
): RecognitionReviewHints {
  const fields: Record<string, FieldReviewHint> = {
    customer: createHint(
      confidence.fields.customer,
      isNonEmpty(record.customer) ? '' : '客户为空，请重点核对',
    ),
    supplier: createHint(
      confidence.fields.supplier,
      isNonEmpty(record.supplier) ? '' : '供应商为空，请重点核对',
    ),
    trademark: createHint(confidence.fields.trademark),
    orderNumber: createHint(confidence.fields.order_number),
    model: createHint(
      confidence.fields.model_spec,
      isNonEmpty(record.model) ? '' : '型号/规格为空，请重点核对',
    ),
    arrivalQuantity: createHint(
      confidence.fields.arrival_quantity,
      isQuantity(record.arrivalQuantity) ? '' : '到货数量格式异常，请重点核对',
    ),
    inspectionDate: createHint(
      confidence.fields.inspection_date,
      isDate(record.inspectionDate) ? '' : '检验日期为空或格式异常，请重点核对',
    ),
    notes: createHint(confidence.fields.notes),
    reviewer: createHint(confidence.fields.reviewer),
    inspector: createHint(confidence.fields.inspector),
  }
  const rows = record.rows.map((row, index) => {
    const scores = confidence.items[index] ?? {
      name: null,
      standard: null,
      specification: null,
      measurements: Array.from({ length: 10 }, () => null),
    }
    return {
      item: createHint(
        scores.name,
        isNonEmpty(row.item) ? '' : '检验项目为空，请重点核对',
      ),
      requirement: createHint(scores.standard),
      specification: createHint(scores.specification),
      measurements: row.measurements.map((value, measurementIndex) => createHint(
        scores.measurements[measurementIndex] ?? null,
        isMeasurement(value) ? '' : '测量值格式异常，请重点核对',
      )),
    }
  })
  const sampleJudgements = record.sampleJudgements.map((_, index) => createHint(
    confidence.sample_judgements[index] ?? null,
  ))
  return withCounts({
    fields,
    rows,
    sampleJudgements,
    dangerCount: 0,
    warningCount: 0,
  })
}

function reviewedHint(hint: FieldReviewHint): FieldReviewHint {
  return {
    ...hint,
    reviewed: true,
    cssClass: hintCssClass(hint.level, true),
  }
}

export function markReviewHintReviewed(
  hints: RecognitionReviewHints,
  path: string,
): RecognitionReviewHints {
  const parts = path.split('.')
  if (parts[0] === 'record' && parts[1] && hints.fields[parts[1]]) {
    return withCounts({
      ...hints,
      fields: {
        ...hints.fields,
        [parts[1]]: reviewedHint(hints.fields[parts[1]]),
      },
    })
  }
  if (parts[0] === 'rows') {
    const rowIndex = Number(parts[1])
    const row = hints.rows[rowIndex]
    if (!row) return hints
    const rows = [...hints.rows]
    if (parts[2] === 'measurements') {
      const measurementIndex = Number(parts[3])
      const hint = row.measurements[measurementIndex]
      if (!hint) return hints
      const measurements = [...row.measurements]
      measurements[measurementIndex] = reviewedHint(hint)
      rows[rowIndex] = { ...row, measurements }
    } else if (parts[2] === 'item' || parts[2] === 'requirement' || parts[2] === 'specification') {
      rows[rowIndex] = { ...row, [parts[2]]: reviewedHint(row[parts[2]]) }
    } else {
      return hints
    }
    return withCounts({ ...hints, rows })
  }
  if (parts[0] === 'sampleJudgements') {
    const sampleIndex = Number(parts[1])
    const hint = hints.sampleJudgements[sampleIndex]
    if (!hint) return hints
    const sampleJudgements = [...hints.sampleJudgements]
    sampleJudgements[sampleIndex] = reviewedHint(hint)
    return withCounts({ ...hints, sampleJudgements })
  }
  return hints
}

export function hasUnreviewedDanger(hints: RecognitionReviewHints): boolean {
  return hints.dangerCount > 0
}
