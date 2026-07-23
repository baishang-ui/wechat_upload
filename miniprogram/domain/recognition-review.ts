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

function normalizeComparable(value: string): string {
  return value.toLocaleLowerCase().replace(/[^\p{L}\p{N}]+/gu, '')
}

function expectedComparison(actual: string, expected: string | undefined): 'none' | 'match' | 'mismatch' {
  if (!expected || !expected.trim()) return 'none'
  return normalizeComparable(actual) === normalizeComparable(expected) ? 'match' : 'mismatch'
}

function parseExplicitRange(specification: string): [number, number] | null {
  const plusMinus = specification.match(/([+-]?\d+(?:\.\d+)?)\s*±\s*([+-]?\d+(?:\.\d+)?)/)
  if (plusMinus) {
    const center = Number(plusMinus[1])
    const tolerance = Math.abs(Number(plusMinus[2]))
    return [center - tolerance, center + tolerance]
  }
  const range = specification.match(/([+-]?\d+(?:\.\d+)?)\s*(?:-|~|～)\s*([+-]?\d+(?:\.\d+)?)/)
  if (!range) return null
  const first = Number(range[1])
  const second = Number(range[2])
  return [Math.min(first, second), Math.max(first, second)]
}

function measurementRangeError(specification: string, measurement: string): string {
  const range = parseExplicitRange(specification)
  const normalized = measurement.trim()
  if (!range || !normalized || !/^[+-]?\d+(?:\.\d+)?(?:\s*[A-Za-z%℃°\u4e00-\u9fa5]+)?$/.test(normalized)) return ''
  const value = Number.parseFloat(normalized)
  if (value >= range[0] && value <= range[1]) return ''
  return `测量值 ${value} 超出规格范围 ${range[0]}–${range[1]}`
}

function isDegenerateConfidence(
  record: InspectionRecord,
  confidence: RecognitionConfidencePayload,
): boolean {
  const pairs: Array<[string, number | null]> = [
    [record.customer, confidence.fields.customer],
    [record.supplier, confidence.fields.supplier],
    [record.trademark, confidence.fields.trademark],
    [record.orderNumber, confidence.fields.order_number],
    [record.model, confidence.fields.model_spec],
    [record.arrivalQuantity, confidence.fields.arrival_quantity],
    [record.inspectionDate, confidence.fields.inspection_date],
    [record.notes, confidence.fields.notes],
    [record.reviewer, confidence.fields.reviewer],
    [record.inspector, confidence.fields.inspector],
  ]
  record.rows.forEach((row, index) => {
    const item = confidence.items[index]
    pairs.push([row.item, item?.name ?? null])
    pairs.push([row.requirement, item?.standard ?? null])
    pairs.push([row.specification, item?.specification ?? null])
    row.measurements.forEach((value, measurementIndex) => {
      pairs.push([value, item?.measurements[measurementIndex] ?? null])
    })
  })
  record.sampleJudgements.forEach((value, index) => {
    pairs.push([value, confidence.sample_judgements[index] ?? null])
  })
  const scores = pairs
    .filter(([value, score]) => isNonEmpty(value) && score !== null)
    .map(([, score]) => score as number)
  if (scores.length < 8) return false
  const counts = new Map<string, { count: number, score: number }>()
  scores.forEach((score) => {
    const key = score.toFixed(4)
    const existing = counts.get(key)
    counts.set(key, { count: (existing?.count ?? 0) + 1, score })
  })
  const dominant = [...counts.values()].sort((a, b) => b.count - a.count)[0]
  return dominant.score >= 0.95 && dominant.count / scores.length >= 0.9
}

function hintCssClass(level: ReviewRiskLevel, reviewed: boolean): string {
  if (reviewed || level === 'normal') return ''
  return `is-confidence-${level}`
}

interface CreateHintOptions {
  value?: string
  optional?: boolean
  formatError?: string
  logicDanger?: string
  logicWarning?: string
  degenerate?: boolean
  expected?: string
}

function createHint(
  score: number | null,
  options: CreateHintOptions = {},
): FieldReviewHint {
  const value = options.value ?? ''
  const comparison = expectedComparison(value, options.expected)
  let level: ReviewRiskLevel = 'normal'
  let reason = ''
  if (options.formatError) {
    level = 'danger'
    reason = options.formatError
  } else if (options.logicDanger) {
    level = 'danger'
    reason = options.logicDanger
  } else if (comparison === 'mismatch') {
    level = 'danger'
    reason = '识别结果与采购任务数据不一致，请重点核对'
  } else if (options.logicWarning) {
    level = 'warning'
    reason = options.logicWarning
  } else if (options.optional && !isNonEmpty(value)) {
    level = 'normal'
  } else if (comparison === 'match') {
    level = 'normal'
    reason = '已与采购任务数据核对'
  } else if (options.degenerate && isNonEmpty(value)) {
    level = 'warning'
    reason = '模型置信度分布失真，建议人工核对'
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
  expectedRecord?: InspectionRecord | null,
): RecognitionReviewHints {
  const degenerate = isDegenerateConfidence(record, confidence)
  const fields: Record<string, FieldReviewHint> = {
    customer: createHint(confidence.fields.customer, {
      value: record.customer,
      formatError: isNonEmpty(record.customer) ? '' : '客户为空，请重点核对',
      degenerate,
      expected: expectedRecord?.customer,
    }),
    supplier: createHint(confidence.fields.supplier, {
      value: record.supplier,
      formatError: isNonEmpty(record.supplier) ? '' : '供应商为空，请重点核对',
      degenerate,
      expected: expectedRecord?.supplier,
    }),
    trademark: createHint(confidence.fields.trademark, {
      value: record.trademark,
      optional: true,
      degenerate,
    }),
    orderNumber: createHint(confidence.fields.order_number, {
      value: record.orderNumber,
      optional: true,
      degenerate,
      expected: expectedRecord?.orderNumber,
    }),
    model: createHint(confidence.fields.model_spec, {
      value: record.model,
      formatError: isNonEmpty(record.model) ? '' : '型号/规格为空，请重点核对',
      degenerate,
      expected: expectedRecord?.model,
    }),
    arrivalQuantity: createHint(confidence.fields.arrival_quantity, {
      value: record.arrivalQuantity,
      optional: true,
      formatError: isQuantity(record.arrivalQuantity) ? '' : '到货数量格式异常，请重点核对',
      degenerate,
      expected: expectedRecord?.arrivalQuantity,
    }),
    inspectionDate: createHint(confidence.fields.inspection_date, {
      value: record.inspectionDate,
      formatError: isDate(record.inspectionDate) ? '' : '检验日期为空或格式异常，请重点核对',
      degenerate,
    }),
    notes: createHint(confidence.fields.notes, {
      value: record.notes,
      optional: true,
      degenerate,
    }),
    reviewer: createHint(confidence.fields.reviewer, {
      value: record.reviewer,
      optional: true,
      degenerate,
    }),
    inspector: createHint(confidence.fields.inspector, {
      value: record.inspector,
      optional: true,
      degenerate,
    }),
  }
  const rows = record.rows.map((row, index) => {
    const scores = confidence.items[index] ?? {
      name: null,
      standard: null,
      specification: null,
      measurements: Array.from({ length: 10 }, () => null),
    }
    return {
      item: createHint(scores.name, {
        value: row.item,
        formatError: isNonEmpty(row.item) ? '' : '检验项目为空，请重点核对',
        degenerate,
      }),
      requirement: createHint(scores.standard, {
        value: row.requirement,
        optional: true,
        degenerate,
      }),
      specification: createHint(scores.specification, {
        value: row.specification,
        optional: true,
        degenerate,
      }),
      measurements: row.measurements.map((value, measurementIndex) => createHint(
        scores.measurements[measurementIndex] ?? null,
        {
          value,
          optional: true,
          formatError: isMeasurement(value) ? '' : '测量值格式异常，请重点核对',
          logicDanger: measurementRangeError(row.specification, value),
          logicWarning: !isNonEmpty(value) && isNonEmpty(record.sampleJudgements[measurementIndex] ?? '')
            ? '样本判定存在但测量值为空，建议核对'
            : '',
          degenerate,
        },
      )),
    }
  })
  const sampleJudgements = record.sampleJudgements.map((value, index) => createHint(
    confidence.sample_judgements[index] ?? null,
    {
      value,
      optional: true,
      degenerate,
    },
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
