import {
  StoredInspectionRecord,
  updateSyncState,
} from '../domain/inspection-history'
import {
  InspectionRecord,
  Judgement,
  normalizeInspectionDate,
  normalizeTenValues,
  PRODUCT_OPTIONS,
  ProductType,
  RawApiRecord,
} from '../domain/inspection-record'
import { RecognitionConfidencePayload } from '../domain/recognition-review'
import { DATA_SERVER_BASE_URL, RECOGNITION_API_URL } from '../config/server'
import { InspectionTemplateDto } from '../domain/inspection-workbench'
import {
  serverRequest,
  ServerRequestOptions,
  serverUpload,
  ServerUploadOptions,
} from './server-client'
import {
  ImageUploadPreparer,
  prepareImageForUpload,
} from './image-upload-service'

export const HISTORY_REFRESH_TTL_MS = 30_000
export const TASK_REFRESH_TTL_MS = 30_000

export function shouldRefreshInspectionTasks(
  lastLoadedAt: number,
  now = Date.now(),
  force = false,
): boolean {
  if (force || lastLoadedAt <= 0) return true
  return now - lastLoadedAt >= TASK_REFRESH_TTL_MS
}

export function shouldQueueInspectionTaskRefresh(
  taskLoading: boolean,
  resetList: boolean,
  forceRefresh: boolean,
  refreshQueued: boolean,
): boolean {
  return taskLoading && resetList && forceRefresh && !refreshQueued
}

export function shouldRefreshInspectionHistory(
  lastLoadedAt: number,
  now = Date.now(),
  force = false,
): boolean {
  if (force || lastLoadedAt <= 0) return true
  return now - lastLoadedAt >= HISTORY_REFRESH_TTL_MS
}

export function shouldQueueInspectionHistoryRefresh(
  historyLoading: boolean,
  forceRefresh: boolean,
  refreshQueued: boolean,
): boolean {
  return historyLoading && forceRefresh && !refreshQueued
}

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

export type QualityInspectionRecordMergeMode = 'replace' | 'matched_only' | 'workbench'

export interface QualityInspectionDraftPayload {
  inspection_records: QualityInspectionDraftRecord[]
  records?: QualityInspectionDraftRecord[]
  ai_workbench_result: Record<string, unknown>
  ai_workbench_images: string[]
  record_merge_mode: QualityInspectionRecordMergeMode
  saved_at?: string
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
  inspection_template?: InspectionTemplateDto | null
  [key: string]: unknown
}

export interface QualityInspectionProductPairDto {
  label?: string | null
  value?: string | null
}

export interface QualityInspectionMasterProductDto {
  category?: string | null
  subcategory?: string | null
  name?: string | null
  master_code?: string | null
  spec_pairs?: QualityInspectionProductPairDto[]
  attribute_pairs?: QualityInspectionProductPairDto[]
  grade_pairs?: QualityInspectionProductPairDto[]
  [key: string]: unknown
}

export interface ProductQualityTemplateRowDto {
  id?: string | null
  section?: string | null
  item?: string | null
  method?: string | null
  requirement?: string | null
  standard?: string | null
  cutting_material?: string | null
  cut_count?: number | null
}

export interface ProductQualityTemplateDto {
  scope?: string | null
  scope_label?: string | null
  category?: string | null
  subcategory?: string | null
  rows?: ProductQualityTemplateRowDto[]
  updated_at?: string | null
}

export interface ProductQualityTemplateListData {
  items: ProductQualityTemplateDto[]
}

export function listProductQualityTemplates(
  request: QualityRequest = serverRequest,
): Promise<ProductQualityTemplateListData> {
  return request<ProductQualityTemplateListData>({
    method: 'GET',
    path: '/products/api/quality-templates',
  })
}

export interface QualityInspectionCustomerProductDto {
  brand_type?: string | null
  product_trademark?: string | null
  trademark_method?: string | null
  packaging_method?: string | null
  extra_info_text?: string | null
  extra_info_attachments?: unknown[]
  [key: string]: unknown
}

export interface QualityInspectionTaskDto {
  id: number
  task_no?: string
  source_type?: 'purchase_order' | 'standalone'
  client_record_id?: string | null
  purchase_order_id?: number | null
  contract_no?: string | null
  source_review_no?: string | null
  customer_name?: string | null
  supplier_name?: string | null
  signed_date?: string | null
  status?: string
  items?: QualityInspectionItemDto[]
  [key: string]: unknown
}

export function applyInspectionDateToTaskItems(
  tasks: QualityInspectionTaskDto[],
  taskId: number,
  itemId: number,
  inspectionDate: string,
): QualityInspectionTaskDto[] {
  const normalizedDate = normalizeInspectionDate(inspectionDate)
  if (!normalizedDate) return tasks
  return tasks.map((task) => {
    if (task.id !== taskId) return task
    return {
      ...task,
      signed_date: normalizedDate,
      items: task.items?.map((item) => {
        if (item.id !== itemId || !item.inspection_draft) return item
        return {
          ...item,
          inspection_draft: {
            ...item.inspection_draft,
            ai_workbench_result: {
              ...item.inspection_draft.ai_workbench_result,
              inspection_date: normalizedDate,
            },
          },
        }
      }),
    }
  })
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

export type RecognizedInspectionMatchStatus =
  | 'matched'
  | 'missing_order_number'
  | 'order_not_found'
  | 'order_ambiguous'
  | 'item_not_found'
  | 'item_ambiguous'

export interface RecognizedInspectionMatchResult {
  status: RecognizedInspectionMatchStatus
  task?: QualityInspectionTaskDto
  item?: QualityInspectionItemDto
}

export interface AutoWriteRecognizedInspectionDeps {
  listTasks(query: TaskQuery): Promise<TaskListData>
  imageToDataUrl(filePath: string): Promise<string>
  saveDraft(
    taskId: number,
    itemId: number,
    payload: QualityInspectionDraftPayload,
  ): Promise<unknown>
}

function normalizeOrderIdentity(value: unknown): string {
  return asString(value)
    .toUpperCase()
    .replace(/(?:采购订单号|订单号|合同号|ORDER\s*(?:NUMBER|NO)|CONTRACT\s*(?:NUMBER|NO))[:：]?/g, '')
    .replace(/[^A-Z0-9]/g, '')
}

function normalizeProductIdentity(value: unknown): string {
  return asString(value)
    .toLowerCase()
    .replace(/[×＊*]/g, 'x')
    .replace(/毫米/g, 'mm')
    .replace(/[^a-z0-9\u4e00-\u9fff]/g, '')
}

function canonicalSpecificationToken(token: string): string {
  const grit = token.match(/^p(\d+(?:\.\d+)?)$/)
  if (grit) return `p${Number(grit[1])}`
  return /^\d+(?:\.\d+)?$/.test(token) ? String(Number(token)) : token
}

function specificationTokens(value: unknown): string[] {
  const tokens = asString(value)
    .toLowerCase()
    .replace(/(?:粒度|目数|砂号|grit|mesh)\s*[:：#-]?\s*(?:p\s*)?(\d+(?:\.\d+)?)/g, ' p$1 ')
    .replace(/#\s*(\d+(?:\.\d+)?)/g, ' p$1 ')
    .replace(/(\d+(?:\.\d+)?)\s*[#目]/g, ' p$1 ')
    .replace(/\bp\s+(\d+(?:\.\d+)?)/g, 'p$1')
    .replace(/[×＊*x]/g, ' ')
    .replace(/(\d+(?:\.\d+)?)\s*(?:毫米|mm)\b/g, '$1')
    .match(/[a-z]*\d+(?:\.\d+)?[a-z]*(?:-[a-z0-9.]+)*/g) || []
  return [...new Set(tokens.map(canonicalSpecificationToken))]
}

function recognizedSpecificationEvidence(record: InspectionRecord): string {
  const evidence = [record.model]
  for (const row of record.rows) {
    const rowContext = [row.groupTitle, row.item, row.requirement, row.specification]
      .filter(Boolean)
      .join(' ')
    evidence.push(rowContext, ...row.measurements)
    if (/(?:粒度|目数|砂号|grit|mesh)/i.test(rowContext)) {
      for (const measurement of row.measurements) {
        const plainGrit = asString(measurement).match(/^(?:p\s*)?(\d+(?:\.\d+)?)\s*(?:[#目])?$/i)
        if (plainGrit) evidence.push(`P${Number(plainGrit[1])}`)
      }
    }
  }
  return evidence.filter(Boolean).join(' ')
}

function specificationMatchScore(recognizedModel: unknown, specification: unknown): number {
  const recognizedTokens = specificationTokens(recognizedModel)
  const specificationTokenSet = new Set(specificationTokens(specification))
  if (recognizedTokens.length === 0 || specificationTokenSet.size === 0) return 0

  const matchedTokens = recognizedTokens.filter((token) => specificationTokenSet.has(token))
  if (matchedTokens.length === 0) return 0
  const tokenScore = matchedTokens.reduce((score, token) => (
    score + (/^[a-z]/.test(token) ? 40 : 20)
  ), 0)
  return tokenScore + (
    matchedTokens.length === recognizedTokens.length
      ? 100
      : Math.round((matchedTokens.length / recognizedTokens.length) * 20)
  )
}

function recognizedProductMatchScore(
  record: InspectionRecord,
  item: QualityInspectionItemDto,
): number {
  const recognized = normalizeProductIdentity(record.model)
  const recognizedSpecification = recognizedSpecificationEvidence(record)
  const productLabel = PRODUCT_OPTIONS.find((option) => option.value === record.productType)?.label || ''
  const recognizedLabel = normalizeProductIdentity(productLabel)
  const fields = [item.material_code, item.material_name, item.spec_desc]
    .map(normalizeProductIdentity)
    .filter(Boolean)

  let score = 0
  for (const field of fields) {
    if (recognized && (recognized.includes(field) || field.includes(recognized))) {
      score += 100 + Math.min(field.length, recognized.length)
    }
    if (recognizedLabel && (field.includes(recognizedLabel) || recognizedLabel.includes(field))) {
      score += 30
    }
  }
  score += specificationMatchScore(recognizedSpecification, item.spec_desc)
  return score
}

export function matchRecognizedInspectionToPendingItem(
  record: InspectionRecord,
  tasks: QualityInspectionTaskDto[],
): RecognizedInspectionMatchResult {
  const orderIdentity = normalizeOrderIdentity(record.orderNumber)
  if (!orderIdentity) return { status: 'missing_order_number' }

  const matchedTasks = tasks.filter((task) => {
    if (task.status && task.status !== 'pending' && task.status !== 'processing') return false
    if (task.source_type && task.source_type !== 'purchase_order') return false
    return normalizeOrderIdentity(task.contract_no) === orderIdentity
  })
  if (matchedTasks.length === 0) return { status: 'order_not_found' }
  if (matchedTasks.length > 1) {
    const scored = matchedTasks
      .flatMap((task) => (task.items || []).map((item) => ({
        task,
        item,
        score: recognizedProductMatchScore(record, item),
      })))
      .sort((left, right) => right.score - left.score)
    if (
      scored.length === 0
      || scored[0].score <= 0
      || (scored[1] && scored[0].score === scored[1].score)
    ) {
      return { status: 'order_ambiguous' }
    }
    return { status: 'matched', task: scored[0].task, item: scored[0].item }
  }

  const task = matchedTasks[0]
  const items = task.items || []
  if (items.length === 0) return { status: 'item_not_found', task }
  if (items.length === 1) return { status: 'matched', task, item: items[0] }

  const scored = items.map((item) => ({
    item,
    score: recognizedProductMatchScore(record, item),
  })).sort((left, right) => right.score - left.score)
  if (scored[0].score <= 0 || scored[0].score === scored[1].score) {
    return { status: 'item_ambiguous', task }
  }
  return { status: 'matched', task, item: scored[0].item }
}

function safeServerImageReferences(images: unknown): string[] {
  if (!Array.isArray(images)) return []
  return images
    .filter((image): image is string => (
      typeof image === 'string'
      && /^https?:\/\//i.test(image)
      && image.length <= 4096
    ))
    .slice(0, 1)
}

export async function autoWriteRecognizedInspectionToPendingItem(
  record: InspectionRecord,
  _imagePath: string,
  deps: AutoWriteRecognizedInspectionDeps = {
    listTasks: listInspectionTasks,
    imageToDataUrl: inspectionImageToDataUrl,
    saveDraft: saveInspectionDraft,
  },
): Promise<RecognizedInspectionMatchResult> {
  const orderNumber = asString(record.orderNumber)
  if (!normalizeOrderIdentity(orderNumber)) return { status: 'missing_order_number' }
  const data = await deps.listTasks({
    page: 1,
    pageSize: 200,
    search: orderNumber,
    sourceType: 'purchase_order',
  })
  const matched = matchRecognizedInspectionToPendingItem(record, data.items)
  if (matched.status !== 'matched' || !matched.task || !matched.item) return matched

  const existingImages = safeServerImageReferences(
    matched.item.inspection_draft?.ai_workbench_images,
  )
  await deps.saveDraft(
    matched.task.id,
    matched.item.id,
    inspectionRecordToDraft(record, existingImages, 'matched_only'),
  )
  return matched
}

export interface StandaloneInspectionResult {
  task_id: number
  item_id: number
  task: QualityInspectionTaskDto
}

export interface InspectionRowImageUploadResult {
  id: string
  url: string
}

interface GenericImageUploadResult {
  image_url?: string
  image_path?: string
}

export interface RecognitionProxyResult {
  record: RawApiRecord
  raw_content: string
  confidence?: RecognitionConfidencePayload
}

export interface RemoteInspectionHistory {
  task_id: number
  item_id: number
  source_type: 'purchase_order' | 'standalone'
  client_record_id?: string | null
  task_no?: string | null
  contract_no?: string | null
  customer_name?: string | null
  supplier_name?: string | null
  material_code?: string | null
  material_name?: string | null
  spec_desc?: string | null
  latest_inspection_date?: string | null
  updated_at?: string | null
  latest_result?: string | null
  thumbnail_image?: string | null
  [key: string]: unknown
}

export interface HistoryListData {
  items: RemoteInspectionHistory[]
  total: number
  total_records?: number
  page: number
  page_size: number
}

export interface DeleteInspectionRecordResult {
  task_id: number
  item_id: number
  deleted_scope: 'record' | 'standalone_task'
}

export interface HistoryViewItem {
  id: string
  origin: 'local' | 'remote'
  taskId: number | null
  itemId: number | null
  clientRecordId: string
  sourceType: 'purchase_order' | 'standalone'
  sourceLabel: string
  syncStatus: StoredInspectionRecord['syncStatus']
  syncError: string
  updatedAt: number
  updatedLabel: string
  inspectionDate: string
  imagePath: string
  productLabel: string
  customer: string
  supplier: string
  model: string
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

export function listInspectionHistory(
  page = 1,
  pageSize = 100,
  request: QualityRequest = serverRequest,
): Promise<HistoryListData> {
  return request<HistoryListData>({
    method: 'GET',
    path: '/customer-orders/api/purchase-orders/quality-inspections/history-records'
      + `?page=${page}&page_size=${pageSize}&source_type=all`,
  })
}

export function deleteRemoteInspectionRecord(
  taskId: number,
  itemId: number,
  request: QualityRequest = serverRequest,
): Promise<DeleteInspectionRecordResult> {
  return request<DeleteInspectionRecordResult>({
    method: 'DELETE',
    path: `/customer-orders/api/purchase-orders/quality-inspections/${taskId}/items/${itemId}/record`,
  })
}


function remoteTimestamp(item: RemoteInspectionHistory): number {
  const value = item.updated_at || item.latest_inspection_date || ''
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : 0
}

function formatHistoryTime(timestamp: number): string {
  if (!timestamp) return '无日期'
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${month}/${day} ${hour}:${minute}`
}


export function mergeInspectionHistory(
  local: StoredInspectionRecord[],
  remote: RemoteInspectionHistory[],
): HistoryViewItem[] {
  const remoteKeys = new Set(
    remote.map((item) => `${item.task_id}:${item.item_id}`),
  )
  const localItems: HistoryViewItem[] = local
    .filter((item) => !(
      item.syncStatus === 'synced'
      && item.taskId !== null
      && item.itemId !== null
      && remoteKeys.has(`${item.taskId}:${item.itemId}`)
    ))
    .map((item) => ({
      id: item.id,
      origin: 'local',
      taskId: item.taskId,
      itemId: item.itemId,
      clientRecordId: item.clientRecordId,
      sourceType: item.sourceType,
      sourceLabel: item.sourceType === 'purchase_order' ? '采购质检' : '独立报告',
      syncStatus: item.syncStatus,
      syncError: item.syncError,
      updatedAt: item.updatedAt,
      updatedLabel: formatHistoryTime(item.updatedAt),
      inspectionDate: item.record.inspectionDate,
      imagePath: item.imagePath,
      productLabel: PRODUCT_OPTIONS.find(
        (option) => option.value === item.record.productType,
      )?.label ?? '检验报告',
      customer: item.record.customer,
      supplier: item.record.supplier,
      model: item.record.model,
    }))
  const remoteItems: HistoryViewItem[] = remote.map((item) => ({
    id: `remote:${item.task_id}:${item.item_id}`,
    origin: 'remote',
    taskId: item.task_id,
    itemId: item.item_id,
    clientRecordId: asString(item.client_record_id),
    sourceType: item.source_type,
    sourceLabel: item.source_type === 'purchase_order' ? '采购质检' : '独立报告',
    syncStatus: 'synced',
    syncError: '',
    updatedAt: remoteTimestamp(item),
    updatedLabel: formatHistoryTime(remoteTimestamp(item)),
    inspectionDate: asString(item.latest_inspection_date),
    imagePath: asString(item.thumbnail_image),
    productLabel: asString(item.material_name || item.material_code) || '检验报告',
    customer: asString(item.customer_name || item.contract_no || item.task_no),
    supplier: asString(item.supplier_name),
    model: asString(item.spec_desc),
  }))
  return [...localItems, ...remoteItems].sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
    if (left.origin !== right.origin) return left.origin === 'local' ? -1 : 1
    return left.id.localeCompare(right.id)
  })
}


export interface SyncStoredInspectionDeps {
  listTasks?(query: TaskQuery): Promise<TaskListData>
  createStandalone(
    clientRecordId: string,
    record: InspectionRecord,
  ): Promise<StandaloneInspectionResult>
  saveDraft(
    taskId: number,
    itemId: number,
    payload: QualityInspectionDraftPayload,
  ): Promise<unknown>
  updateState(
    record: StoredInspectionRecord,
  ): Promise<StoredInspectionRecord> | StoredInspectionRecord
  imageToDataUrl(filePath: string): Promise<string>
  loadExistingImages?(taskId: number, itemId: number): Promise<string[]>
  onUnauthorized?(error: unknown): void
}


export interface InspectionImageAdapter {
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

function requireInspectionDate(value: string): string {
  const normalized = normalizeInspectionDate(value)
  if (!normalized) throw new Error('检验日期格式应为 YYYY-MM-DD')
  return normalized
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
  recordMergeMode: QualityInspectionRecordMergeMode = 'replace',
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
      inspection_date: requireInspectionDate(record.inspectionDate),
      sample_judgements: [...record.sampleJudgements],
      notes: record.notes,
      reviewer: record.reviewer,
      inspector: record.inspector,
    },
    ai_workbench_images: imageDataUrls.slice(0, 1),
    record_merge_mode: recordMergeMode,
  }
}

export function draftToInspectionRecord(
  draft: QualityInspectionDraftPayload,
  task: DraftTaskFallback = {},
  item: DraftItemFallback = {},
): InspectionRecord {
  const metadata = asRecord(draft.ai_workbench_result)
  const draftRecords = draft.inspection_records || draft.records || []
  const rows = draftRecords.map((row, index) => ({
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
      metadata.product_type || draftRecords[0]?.group_title,
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
      : judgementsFromRows(draftRecords),
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


function unmatchedInspectionSyncReason(
  status: Exclude<RecognizedInspectionMatchStatus, 'matched'>,
  orderNumber: string,
): string {
  switch (status) {
    case 'missing_order_number':
      return '未识别到合同号，质检记录未同步'
    case 'order_not_found':
      return `未查到采购合同号 ${orderNumber || '对应合同号'} 的待检质检订单`
    case 'order_ambiguous':
      return `采购合同号 ${orderNumber || ''} 对应多个质检订单，无法唯一匹配`.replace(/\s+对应/, ' 对应')
    case 'item_not_found':
      return '质检订单中没有待检产品，质检记录未同步'
    case 'item_ambiguous':
      return '质检订单内产品无法唯一匹配，质检记录未同步'
  }
}

export async function syncStoredInspection(
  record: StoredInspectionRecord,
  deps: SyncStoredInspectionDeps,
): Promise<StoredInspectionRecord> {
  let current = updateSyncState(
    record,
    { syncStatus: 'syncing', syncError: '' },
    Date.now(),
  )
  try {
    current = await deps.updateState(current)
    let taskId = current.taskId
    let itemId = current.itemId
    if (current.sourceType === 'standalone' && (!taskId || !itemId)) {
      const orderNumber = asString(current.record.orderNumber)
      let matched: RecognizedInspectionMatchResult
      if (!normalizeOrderIdentity(orderNumber)) {
        matched = { status: 'missing_order_number' }
      } else {
        const data = await (deps.listTasks || listInspectionTasks)({
          page: 1,
          pageSize: 200,
          search: orderNumber,
          sourceType: 'purchase_order',
        })
        matched = matchRecognizedInspectionToPendingItem(current.record, data.items)
      }
      if (matched.status !== 'matched') {
        const local = updateSyncState(current, {
          syncStatus: 'local',
          syncError: unmatchedInspectionSyncReason(matched.status, orderNumber),
          taskId: null,
          itemId: null,
        }, Date.now())
        return await deps.updateState(local)
      }
      if (!matched.task || !matched.item) {
        throw new Error('订单匹配结果缺少待检产品')
      }
      taskId = matched.task.id
      itemId = matched.item.id
      current = {
        ...updateSyncState(current, {
          syncStatus: 'syncing',
          syncError: '',
          taskId,
          itemId,
        }, Date.now()),
        sourceType: 'purchase_order',
      }
      current = await deps.updateState(current)
    }
    if (!taskId || !itemId) {
      throw new Error('缺少服务端质检任务信息')
    }
    const imageDataUrls = safeServerImageReferences(
      await deps.loadExistingImages?.(taskId, itemId) ?? [],
    )
    await deps.saveDraft(
      taskId,
      itemId,
      inspectionRecordToDraft(
        current.record,
        imageDataUrls,
        current.sourceType === 'purchase_order' ? 'matched_only' : 'replace',
      ),
    )
    const synced = updateSyncState(current, {
      syncStatus: 'synced',
      syncError: '',
      taskId,
      itemId,
    }, Date.now())
    return await deps.updateState(synced)
  } catch (error) {
    const message = error instanceof Error ? error.message : '同步失败，请重试'
    const failed = updateSyncState(current, {
      syncStatus: 'failed',
      syncError: message,
    }, Date.now())
    let persisted = failed
    try {
      persisted = await deps.updateState(failed)
    } catch {
      persisted = failed
    }
    if (
      error instanceof Error
      && 'statusCode' in error
      && (error as Error & { statusCode?: number }).statusCode === 401
    ) {
      deps.onUnauthorized?.(error)
    }
    return persisted
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

export interface QualityInspectionItemDetailDto {
  task: QualityInspectionTaskDto
  item: QualityInspectionItemDto
  purchase_order_item?: Record<string, unknown> | null
  master_product?: QualityInspectionMasterProductDto | null
  customer_product?: QualityInspectionCustomerProductDto | null
}

export function getInspectionItemDetail(
  taskId: number,
  itemId: number,
  request: QualityRequest = serverRequest,
): Promise<QualityInspectionItemDetailDto> {
  return request<QualityInspectionItemDetailDto>({
    method: 'GET',
    path: `/customer-orders/api/purchase-orders/quality-inspections/${taskId}/items/${itemId}`,
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
      inspection_date: requireInspectionDate(record.inspectionDate),
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

function normalizeUploadedImageUrl(value: string): string {
  const imageUrl = String(value || '').trim()
  if (!imageUrl || /^(?:https?:|data:|wxfile:)/i.test(imageUrl)) return imageUrl
  if (imageUrl.startsWith('//')) {
    const protocol = DATA_SERVER_BASE_URL.startsWith('http://') ? 'http:' : 'https:'
    return `${protocol}${imageUrl}`
  }
  return `${DATA_SERVER_BASE_URL.replace(/\/$/, '')}/${imageUrl.replace(/^\/+/, '')}`
}

export async function uploadInspectionDraftImage(
  taskId: number,
  itemId: number,
  preparedFilePath: string,
  upload: QualityUpload = serverUpload,
): Promise<InspectionRowImageUploadResult> {
  const uploaded = await upload<GenericImageUploadResult>({
    path: '/inquiries/api/upload-image',
    filePath: preparedFilePath,
    name: 'file',
    formData: {
      task_id: String(taskId),
      item_id: String(itemId),
      row_key: 'quality-sheet',
    },
  })
  const url = normalizeUploadedImageUrl(uploaded.image_url || '')
  if (!url) throw new Error('服务器未返回质检单图片地址，请重试')
  return {
    id: String(uploaded.image_path || url),
    url,
  }
}

export async function uploadInspectionRowImage(
  taskId: number,
  itemId: number,
  rowKey: string,
  filePath: string,
  upload: QualityUpload = serverUpload,
  prepare: ImageUploadPreparer = prepareImageForUpload,
): Promise<InspectionRowImageUploadResult> {
  const preparedPath = await prepare(filePath)
  const uploaded = await upload<GenericImageUploadResult>({
    path: '/inquiries/api/upload-image',
    filePath: preparedPath,
    name: 'file',
    formData: {
      task_id: String(taskId),
      item_id: String(itemId),
      row_key: rowKey,
    },
  })
  const url = normalizeUploadedImageUrl(uploaded.image_url || '')
  if (!url) throw new Error('服务器未返回照片地址，请重试')
  return {
    id: String(uploaded.image_path || url),
    url,
  }
}

export function recognizeInspectionFile(
  filePath: string,
  upload: QualityUpload = serverUpload,
): Promise<RecognitionProxyResult> {
  return upload<RecognitionProxyResult>({
    url: RECOGNITION_API_URL,
    path: '/api/miniprogram/quality-inspections/recognize',
    filePath,
    name: 'file',
    sessionMode: 'read-only',
  })
}

function defaultImageAdapter(): InspectionImageAdapter {
  const fileSystem = wx.getFileSystemManager()
  return {
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
  const bytes = new Uint8Array(await adapter.read(filePath))
  const mime = filePath.toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg'
  return `data:${mime};base64,${wx.arrayBufferToBase64(bytes.buffer)}`
}
