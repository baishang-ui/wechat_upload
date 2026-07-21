import { InspectionRecord, normalizeTenValues } from './inspection-record'

export const INSPECTION_EXPORT_SCHEMA = 'inspection-table/v1' as const

type SampleIndex = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10
export type SampleKey = `sample_${SampleIndex}`

export interface InspectionTableColumn {
  key: 'item' | 'requirement' | 'specification' | SampleKey
  label: string
}

export type InspectionTableRow = {
  item: string
  requirement: string
  specification: string
} & Record<SampleKey, string>

export interface InspectionTableExport {
  schema: typeof INSPECTION_EXPORT_SCHEMA
  record_id: string | null
  exported_at: string
  meta: {
    product_type: InspectionRecord['productType']
    customer: string
    supplier: string
    trademark: string
    order_number: string
    model: string
    arrival_quantity: string
    inspection_date: string
    notes: string
    reviewer: string
    inspector: string
  }
  table: {
    columns: InspectionTableColumn[]
    rows: InspectionTableRow[]
  }
}

export interface InspectionTableExportOptions {
  recordId?: string
  exportedAt: string
}

const SAMPLE_INDICES: SampleIndex[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]

export const INSPECTION_TABLE_COLUMNS: InspectionTableColumn[] = [
  { key: 'item', label: '检验项目' },
  { key: 'requirement', label: '标准要求' },
  { key: 'specification', label: '规格' },
  ...SAMPLE_INDICES.map((index) => ({ key: `sample_${index}` as SampleKey, label: String(index) })),
]

function mapSamples(values: string[]): Record<SampleKey, string> {
  const normalized = normalizeTenValues(values)
  return SAMPLE_INDICES.reduce((samples, index) => {
    samples[`sample_${index}`] = normalized[index - 1]
    return samples
  }, {} as Record<SampleKey, string>)
}

export function buildInspectionTableExport(
  record: InspectionRecord,
  options: InspectionTableExportOptions,
): InspectionTableExport {
  const rows: InspectionTableRow[] = record.rows.map((row) => ({
    item: row.item,
    requirement: row.requirement,
    specification: row.specification,
    ...mapSamples(row.measurements),
  }))
  rows.push({
    item: '判定',
    requirement: '',
    specification: '',
    ...mapSamples(record.sampleJudgements),
  })

  return {
    schema: INSPECTION_EXPORT_SCHEMA,
    record_id: options.recordId?.trim() || null,
    exported_at: options.exportedAt,
    meta: {
      product_type: record.productType,
      customer: record.customer,
      supplier: record.supplier,
      trademark: record.trademark,
      order_number: record.orderNumber,
      model: record.model,
      arrival_quantity: record.arrivalQuantity,
      inspection_date: record.inspectionDate,
      notes: record.notes,
      reviewer: record.reviewer,
      inspector: record.inspector,
    },
    table: {
      columns: INSPECTION_TABLE_COLUMNS.map((column) => ({ ...column })),
      rows,
    },
  }
}

export function serializeInspectionTableExport(value: InspectionTableExport): string {
  return `${JSON.stringify(value, null, 2)}\n`
}
