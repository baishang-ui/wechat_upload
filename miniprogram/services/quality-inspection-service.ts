import {
  InspectionRecord,
  Judgement,
  normalizeTenValues,
  PRODUCT_OPTIONS,
  ProductType,
  RawApiRecord,
} from '../domain/inspection-record'
import {
  serverRequest,
  ServerRequestOptions,
  serverUpload,
  ServerUploadOptions,
} from './server-client'

const MAX_INSPECTION_IMAGE_BYTES = 600 * 1024

export type QualityRequest = <T>(options: ServerRequestOptions) => Promise<T>
export type QualityUpload = <T>(options: ServerUploadOptions) => Promise<T>

export interface QualityInspectionDraftRecord {
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

export interface QualityInspectionDraftPayload {
  inspection_records: QualityInspectionDraftRecord[]
  ai_workbench_result: Record<string, unknown>
  ai_workbench_images: string[]
}

export interface QualityInspectionItemDto {
  id: number
  purchase_order_item_id?: number | null
  material_code?: string | null
  material_name?: string | null
  spec_desc?: string | null
  unit?: string | null
  quantity?: number | null
  packaging_method?: string | null
  inspection_draft?: QualityInspectionDraftPayload
  [key: string]: unknown
}

export interface QualityInspectionTaskDto {
  id: number
  task_no?: string
  source_type?: 'purchase_order' | 'standalone'
  client_record_id?: string | null
  purchase_order_id?: number | null
  contract_no?: string | null
  customer_name?: string | null
  supplier_name?: string | null
  signed_date?: string | null
  status?: string
  items?: QualityInspectionItemDto[]
  [key: string]: unknown
}

export interface TaskQuery {
  page?: number
  pageSize?: number
  search?: string
  status?: string
  sourceType?: 'purchase_order' | 'standalone' | 'all'
}

export interface TaskListData {
  items: QualityInspectionTaskDto[]
  total: number
  page: number
  page_size: number
  stats: Record<string, number>
}

export interface StandaloneInspectionResult {
  task_id: number
  item_id: number
  task: QualityInspectionTaskDto
}

export interface RecognitionProxyResult {
  record: RawApiRecord
  raw_content: string
}

interface DraftTaskFallback {
  customer_name?: string | null
  supplier_name?: string | null
  signed_date?: string | null
}

interface DraftItemFallback {
  material_name?: string | null
  spec_desc?: string | null
}

export interface InspectionImageAdapter {
  getSize(filePath: string): Promise<number>
  read(filePath: string): Promise<ArrayBuffer>
}

function asString(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function asProductType(value: unknown): ProductType {
  const candidate = asString(value)
  return PRODUCT_OPTIONS.some((option) => option.value === candidate)
    ? candidate as ProductType
    : 'steel_brush'
}

function normalizeJudgements(value: unknown): Judgement[] {
  const values = Array.isArray(value) ? value : []
  return normalizeTenValues(values).map((item) => {
    const normalized = item.toUpperCase()
    return normalized === 'OK' || normalized === 'NG' ? normalized : ''
  })
}

function rowDecision(measurements: string[]): string {
  const values = measurements.map((value) => value.trim().toUpperCase()).filter(Boolean)
  if (values.includes('NG')) return 'NG'
  if (values.length > 0 && values.every((value) => value === 'OK')) return 'OK'
  return ''
}

function judgementsFromRows(records: QualityInspectionDraftRecord[]): Judgement[] {
  return Array.from({ length: 10 }, (_, index) => {
    const values = records
      .map((record) => asString(record.sample_data[index]).toUpperCase())
      .filter(Boolean)
    if (values.includes('NG')) return 'NG'
    if (values.length > 0 && values.every((value) => value === 'OK')) return 'OK'
    return ''
  })
}

export function inspectionRecordToDraft(
  record: InspectionRecord,
  imageDataUrls: string[] = [],
): QualityInspectionDraftPayload {
  return {
    inspection_records: record.rows.map((row) => ({
      row_key: row.id,
      group_title: record.productType,
      project: row.item,
      method: '',
      standard: row.requirement,
      decision: rowDecision(row.measurements),
      sample_data: normalizeTenValues(row.measurements),
      measurement_standards: { '规格': row.specification },
      note: '',
      ai_result: {},
      images: [],
    })),
    ai_workbench_result: {
      schema_version: 'miniprogram-inspection/v1',
      source: 'miniprogram',
      product_type: record.productType,
      customer: record.customer,
      supplier: record.supplier,
      trademark: record.trademark,
      order_number: record.orderNumber,
      model: record.model,
      arrival_quantity: record.arrivalQuantity,
      inspection_date: record.inspectionDate,
      sample_judgements: [...record.sampleJudgements],
      notes: record.notes,
      reviewer: record.reviewer,
      inspector: record.inspector,
    },
    ai_workbench_images: imageDataUrls.slice(0, 1),
  }
}

export function draftToInspectionRecord(
  draft: QualityInspectionDraftPayload,
  task: DraftTaskFallback = {},
  item: DraftItemFallback = {},
): InspectionRecord {
  const metadata = asRecord(draft.ai_workbench_result)
  const rows = (draft.inspection_records || []).map((row, index) => ({
    id: asString(row.row_key) || `draft-row-${index + 1}`,
    item: asString(row.project),
    requirement: asString(row.standard),
    specification: asString(row.measurement_standards?.['规格']),
    measurements: normalizeTenValues(row.sample_data),
    lowConfidenceFields: [],
  }))
  const metadataJudgements = metadata.sample_judgements
  return {
    productType: asProductType(
      metadata.product_type || draft.inspection_records?.[0]?.group_title,
    ),
    customer: asString(metadata.customer || task.customer_name),
    supplier: asString(metadata.supplier || task.supplier_name),
    trademark: asString(metadata.trademark),
    orderNumber: asString(metadata.order_number),
    model: asString(metadata.model || item.spec_desc || item.material_name),
    arrivalQuantity: asString(metadata.arrival_quantity),
    inspectionDate: asString(metadata.inspection_date || task.signed_date),
    rows,
    sampleJudgements: Array.isArray(metadataJudgements)
      ? normalizeJudgements(metadataJudgements)
      : judgementsFromRows(draft.inspection_records || []),
    notes: asString(metadata.notes),
    reviewer: asString(metadata.reviewer),
    inspector: asString(metadata.inspector),
    lowConfidenceFields: [],
  }
}

export function encodeTaskQuery(query: TaskQuery): string {
  const values: Array<[string, string]> = []
  if (query.page) values.push(['page', String(query.page)])
  if (query.pageSize) values.push(['page_size', String(query.pageSize)])
  if (query.search) values.push(['search', query.search])
  if (query.status) values.push(['status', query.status])
  if (query.sourceType) values.push(['source_type', query.sourceType])
  return values
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&')
}

export function taskItemToInspectionRecord(
  task: QualityInspectionTaskDto,
  item: QualityInspectionItemDto,
): InspectionRecord {
  if (item.inspection_draft) {
    return draftToInspectionRecord(item.inspection_draft, task, item)
  }
  return {
    productType: 'steel_brush',
    customer: asString(task.customer_name),
    supplier: asString(task.supplier_name),
    trademark: '',
    orderNumber: asString(task.contract_no),
    model: asString(item.spec_desc || item.material_name),
    arrivalQuantity: item.quantity === null || item.quantity === undefined
      ? ''
      : String(item.quantity),
    inspectionDate: asString(task.signed_date),
    rows: [],
    sampleJudgements: normalizeJudgements([]),
    notes: '',
    reviewer: '',
    inspector: '',
    lowConfidenceFields: [],
  }
}


export function listInspectionTasks(
  query: TaskQuery,
  request: QualityRequest = serverRequest,
): Promise<TaskListData> {
  const encoded = encodeTaskQuery(query)
  const suffix = encoded ? `?${encoded}` : ''
  return request<TaskListData>({
    method: 'GET',
    path: `/customer-orders/api/purchase-orders/quality-inspections${suffix}`,
  })
}

export function getInspectionTask(
  taskId: number,
  request: QualityRequest = serverRequest,
): Promise<QualityInspectionTaskDto> {
  return request<QualityInspectionTaskDto>({
    method: 'GET',
    path: `/customer-orders/api/purchase-orders/quality-inspections/${taskId}`,
  })
}

export function saveInspectionDraft(
  taskId: number,
  itemId: number,
  payload: QualityInspectionDraftPayload,
  request: QualityRequest = serverRequest,
): Promise<unknown> {
  return request<unknown>({
    method: 'POST',
    path: `/customer-orders/api/purchase-orders/quality-inspections/${taskId}/items/${itemId}/draft`,
    data: payload,
  })
}

export function createStandaloneInspection(
  clientRecordId: string,
  record: InspectionRecord,
  request: QualityRequest = serverRequest,
): Promise<StandaloneInspectionResult> {
  return request<StandaloneInspectionResult>({
    method: 'POST',
    path: '/customer-orders/api/quality-inspections/standalone',
    data: {
      client_record_id: clientRecordId,
      customer_name: record.customer,
      supplier_name: record.supplier,
      inspection_date: record.inspectionDate,
      material_code: '',
      material_name: record.model || record.rows[0]?.item || '检验报告',
      spec_desc: record.model,
      quantity: Number(record.arrivalQuantity) || 0,
      unit: 'Pcs',
      packaging_method: '',
      notes: record.notes,
    },
  })
}

export function recognizeInspectionFile(
  filePath: string,
  upload: QualityUpload = serverUpload,
): Promise<RecognitionProxyResult> {
  return upload<RecognitionProxyResult>({
    path: '/api/miniprogram/quality-inspections/recognize',
    filePath,
    name: 'file',
  })
}

function defaultImageAdapter(): InspectionImageAdapter {
  const fileSystem = wx.getFileSystemManager()
  return {
    getSize: (filePath) => new Promise((resolve, reject) => {
      wx.getFileInfo({
        filePath,
        success: (result) => resolve(result.size),
        fail: () => reject(new Error('无法读取图片大小')),
      })
    }),
    read: (filePath) => new Promise((resolve, reject) => {
      fileSystem.readFile({
        filePath,
        success: (result) => resolve(result.data as ArrayBuffer),
        fail: () => reject(new Error('无法读取报告图片')),
      })
    }),
  }
}

export async function inspectionImageToDataUrl(
  filePath: string,
  adapter: InspectionImageAdapter = defaultImageAdapter(),
): Promise<string> {
  const size = await adapter.getSize(filePath)
  if (size > MAX_INSPECTION_IMAGE_BYTES) throw new Error('图片不能超过 600 KB')
  const bytes = new Uint8Array(await adapter.read(filePath))
  const mime = filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${wx.arrayBufferToBase64(bytes.buffer)}`
}
