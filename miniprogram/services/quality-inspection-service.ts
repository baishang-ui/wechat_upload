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
import { parseProductSpecification, ProductSpecificationTag } from '../domain/product-specification'
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
export const TASK_PAGE_SIZE = 10
export const TASK_PREVIEW_IMAGE_LIMIT = 3

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

export type QualityInspectionRecordMergeMode = 'replace' | 'matched_only' | 'workbench' | 'workbench_patch'

export interface QualityInspectionDraftPayload {
  inspection_records?: QualityInspectionDraftRecord[]
  records?: QualityInspectionDraftRecord[]
  ai_workbench_result: Record<string, unknown>
  ai_workbench_images: string[]
  record_source_images?: string[]
  deleted_record_images?: string[]
  record_merge_mode: QualityInspectionRecordMergeMode
  draft_changes?: {
    ai_workbench_result?: Record<string, unknown>
    ai_workbench_images?: { add?: string[]; remove?: string[] }
    record_source_images?: { add?: string[]; remove?: string[] }
  }
  saved_at?: string
}

export interface QualityInspectionSummary {
  total: number
  filled: number
  ok: number
  ng: number
  has_data: boolean
}

export interface QualityInspectionItemDto {
  id: number
  purchase_order_item_id?: number | null
  material_code?: string | null
  material_name?: string | null
  spec_desc?: string | null
  spec_tags?: ProductSpecificationTag[]
  unit?: string | null
  quantity?: number | null
  packaging_method?: string | null
  inspection_draft?: QualityInspectionDraftPayload
  inspection_template?: InspectionTemplateDto | null
  preview_images?: string[]
  preview_thumbnails?: string[]
  preview_image_count?: number
  inspection_summary?: QualityInspectionSummary
  [key: string]: unknown
}

export interface QualityInspectionProductPairDto {
  label?: string | null
  value?: string | null
}

export interface QualityInspectionMasterProductDto {
  category?: string | null
  category_name?: string | null
  master_category_name?: string | null
  product_category?: string | null
  category_label?: string | null
  subcategory?: string | null
  subcategory_name?: string | null
  master_subcategory_name?: string | null
  product_subcategory?: string | null
  subcategory_label?: string | null
  name?: string | null
  master_code?: string | null
  spec_pairs?: QualityInspectionProductPairDto[]
  attribute_pairs?: QualityInspectionProductPairDto[]
  grade_pairs?: QualityInspectionProductPairDto[]
  image_paths?: string[]
  packaging_images?: string[]
  technical_spec_sheet_paths?: string[]
  tray_image_paths?: string[]
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
  customer_name?: string | null
  brand_type?: string | null
  product_trademark?: string | null
  trademark_method?: string | null
  packaging_method?: string | null
  extra_info_text?: string | null
  extra_info_attachments?: unknown[]
  spec_description?: string | null
  customer_images?: string[]
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
  compact?: boolean
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
  preview_images?: string[]
  preview_thumbnails?: string[]
  preview_image_count?: number
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
  imagePaths: string[]
  imageCount: number
  imageSummaryComplete: boolean
  productLabel: string
  customer: string
  supplier: string
  model: string
}

export interface HistoryImageCacheAdapter {
  userDataPath: string
  fileExists(filePath: string): Promise<boolean>
  writeBase64(filePath: string, data: string): Promise<void>
}

export type HistoryImageMaterializer = (
  imagePath: string,
  cacheKey: string,
) => Promise<string>

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
      + `?page=${page}&page_size=${pageSize}&source_type=all&compact=true`,
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

function remoteHistoryImageSummary(item: RemoteInspectionHistory): {
  imagePaths: string[]
  imageCount: number
  imageSummaryComplete: boolean
} {
  const originals = normalizeServerImageList(item.preview_images)
  const thumbnails = normalizeServerImageList(item.preview_thumbnails)
  const previews = originals.length > 0
    ? originals.map((image, index) => thumbnails[index] || inspectionImageThumbnailUrl(image))
    : thumbnails
  const legacyThumbnail = normalizeServerImageList([item.thumbnail_image])[0]
  const imagePaths = (previews.length > 0 ? previews : [legacyThumbnail].filter(Boolean))
    .slice(0, TASK_PREVIEW_IMAGE_LIMIT)
  const declaredCount = Math.max(0, Number(item.preview_image_count) || 0)
  const hasDeclaredCount = item.preview_image_count !== undefined
    && item.preview_image_count !== null
    && Number.isFinite(Number(item.preview_image_count))
  return {
    imagePaths,
    imageCount: Math.max(
      declaredCount,
      originals.length,
      thumbnails.length,
      legacyThumbnail ? 1 : 0,
    ),
    imageSummaryComplete: imagePaths.length >= TASK_PREVIEW_IMAGE_LIMIT
      || (hasDeclaredCount && imagePaths.length >= Math.min(TASK_PREVIEW_IMAGE_LIMIT, declaredCount)),
  }
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
      imagePaths: item.imagePath ? [item.imagePath] : [],
      imageCount: item.imagePath ? 1 : 0,
      imageSummaryComplete: true,
      productLabel: PRODUCT_OPTIONS.find(
        (option) => option.value === item.record.productType,
      )?.label ?? '检验报告',
      customer: item.record.customer,
      supplier: item.record.supplier,
      model: item.record.model,
    }))
  const remoteItems: HistoryViewItem[] = remote.map((item) => {
    const imageSummary = remoteHistoryImageSummary(item)
    return {
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
      imagePath: imageSummary.imagePaths[0] || '',
      imagePaths: imageSummary.imagePaths,
      imageCount: imageSummary.imageCount,
      imageSummaryComplete: imageSummary.imageSummaryComplete,
      productLabel: asString(item.material_name || item.material_code) || '检验报告',
      customer: asString(item.customer_name || item.contract_no || item.task_no),
      supplier: asString(item.supplier_name),
      model: asString(item.spec_desc),
    }
  })
  return [...localItems, ...remoteItems].sort((left, right) => {
    if (left.updatedAt !== right.updatedAt) return right.updatedAt - left.updatedAt
    if (left.origin !== right.origin) return left.origin === 'local' ? -1 : 1
    return left.id.localeCompare(right.id)
  })
}

function defaultHistoryImageCacheAdapter(): HistoryImageCacheAdapter {
  const fileSystem = wx.getFileSystemManager()
  return {
    userDataPath: wx.env.USER_DATA_PATH,
    fileExists: (filePath) => new Promise((resolve) => {
      fileSystem.access({
        path: filePath,
        success: () => resolve(true),
        fail: () => resolve(false),
      })
    }),
    writeBase64: (filePath, data) => new Promise((resolve, reject) => {
      fileSystem.writeFile({
        filePath,
        data,
        encoding: 'base64',
        success: () => resolve(),
        fail: () => reject(new Error('无法缓存记录图片')),
      })
    }),
  }
}

function historyImageSignature(value: string): string {
  const sample = `${value.length}:${value.slice(0, 128)}:${value.slice(-128)}`
  let hash = 2166136261
  for (let index = 0; index < sample.length; index += 1) {
    hash ^= sample.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16)
}

function historyImageExtension(mime: string): string {
  const subtype = mime.slice('image/'.length).toLowerCase()
  if (subtype === 'jpeg' || subtype === 'jpg') return 'jpg'
  if (subtype === 'png' || subtype === 'webp' || subtype === 'gif') return subtype
  return 'img'
}

export async function materializeHistoryCardImage(
  imagePath: string,
  cacheKey: string,
  adapter?: HistoryImageCacheAdapter,
): Promise<string> {
  const dataUrlHeader = /^data:(image\/[a-z0-9.+-]+);base64,/i.exec(imagePath)
  if (!dataUrlHeader) return imagePath
  const base64 = imagePath.slice(dataUrlHeader[0].length)
  if (!base64) return ''

  const cacheAdapter = adapter ?? defaultHistoryImageCacheAdapter()
  const safeCacheKey = cacheKey.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 80)
  const extension = historyImageExtension(dataUrlHeader[1])
  const signature = historyImageSignature(imagePath)
  const basePath = cacheAdapter.userDataPath.replace(/\/$/, '')
  const filePath = `${basePath}/history-card-${safeCacheKey}-${signature}.${extension}`
  try {
    if (!await cacheAdapter.fileExists(filePath)) {
      await cacheAdapter.writeBase64(filePath, base64)
    }
    return filePath
  } catch {
    // 缓存失败时不把大体积 Base64 传入 setData，保留卡片占位状态。
    return ''
  }
}

export async function materializeHistoryCardImages(
  items: HistoryViewItem[],
  materialize: HistoryImageMaterializer = (imagePath, cacheKey) => (
    materializeHistoryCardImage(imagePath, cacheKey)
  ),
): Promise<HistoryViewItem[]> {
  return Promise.all(items.map(async (item) => {
    const imagePaths = (await Promise.all(item.imagePaths.map((imagePath, index) => (
      materialize(imagePath, `${item.id}-${index}`).catch(() => '')
    )))).filter(Boolean)
    return {
      ...item,
      imagePath: imagePaths[0] || '',
      imagePaths,
    }
  }))
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
  if (query.compact) values.push(['compact', 'true'])
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


function normalizeServerImageList(images: unknown): string[] {
  if (!Array.isArray(images)) return []
  const normalized: string[] = []
  images.forEach((image) => {
    if (typeof image !== 'string') return
    const url = normalizeServerImageUrl(image)
    if (url && !normalized.includes(url)) normalized.push(url)
  })
  return normalized
}

function normalizeDraftRecordImages(
  records: QualityInspectionDraftRecord[] | undefined,
): QualityInspectionDraftRecord[] | undefined {
  return records?.map((record) => ({
    ...record,
    images: normalizeServerImageList(record.images),
  }))
}

function normalizeInspectionDraft(
  draft: QualityInspectionDraftPayload | undefined,
): QualityInspectionDraftPayload | undefined {
  if (!draft) return undefined
  return {
    ...draft,
    inspection_records: normalizeDraftRecordImages(draft.inspection_records),
    records: normalizeDraftRecordImages(draft.records),
    ai_workbench_images: normalizeServerImageList(draft.ai_workbench_images),
    record_source_images: normalizeServerImageList(draft.record_source_images),
  }
}

function inspectionDraftRecords(
  draft: QualityInspectionDraftPayload | undefined,
): QualityInspectionDraftRecord[] {
  if (!draft) return []
  if (draft.inspection_records?.length) return draft.inspection_records
  return draft.records || draft.inspection_records || []
}

function inspectionItemImages(
  draft: QualityInspectionDraftPayload | undefined,
): string[] {
  const records = inspectionDraftRecords(draft)
  return normalizeServerImageList([
    ...records.flatMap((record) => record.images || []),
    ...(draft?.ai_workbench_images || []),
    ...(draft?.record_source_images || []),
  ])
}

function normalizeInspectionSummary(
  summary: QualityInspectionSummary | undefined,
): QualityInspectionSummary {
  return {
    total: Math.max(0, Number(summary?.total) || 0),
    filled: Math.max(0, Number(summary?.filled) || 0),
    ok: Math.max(0, Number(summary?.ok) || 0),
    ng: Math.max(0, Number(summary?.ng) || 0),
    has_data: Boolean(summary?.has_data),
  }
}

export function summarizeQualityInspectionDraft(
  draft: QualityInspectionDraftPayload | undefined,
): QualityInspectionSummary {
  const records = inspectionDraftRecords(draft)
  let filled = 0
  let ok = 0
  let ng = 0

  records.forEach((record) => {
    const decision = String(record.decision || '').trim().toUpperCase()
    const hasSampleData = Array.isArray(record.sample_data)
      && record.sample_data.some((value) => String(value || '').trim())
    const hasData = Boolean(
      hasSampleData
      || decision
      || String(record.note || '').trim()
      || (Array.isArray(record.images) && record.images.length > 0),
    )
    if (hasData) filled += 1
    if (decision === 'OK') ok += 1
    if (decision === 'NG') ng += 1
  })

  return {
    total: records.length,
    filled,
    ok,
    ng,
    has_data: filled > 0,
  }
}

export function normalizeQualityInspectionItem(
  item: QualityInspectionItemDto,
  compact = false,
): QualityInspectionItemDto {
  const inspectionDraft = normalizeInspectionDraft(item.inspection_draft)
  const draftImages = inspectionItemImages(inspectionDraft)
  const serverPreviewImages = normalizeServerImageList(item.preview_images)
  const serverPreviewThumbnails = normalizeServerImageList(item.preview_thumbnails)
  const previewImages = (inspectionDraft ? draftImages : serverPreviewImages)
    .slice(0, TASK_PREVIEW_IMAGE_LIMIT)
  const previewThumbnails = previewImages.map((image, index) => (
    serverPreviewThumbnails[index] || inspectionImageThumbnailUrl(image)
  ))
  const serverImageCount = Math.max(0, Number(item.preview_image_count) || 0)
  const normalized: QualityInspectionItemDto = {
    ...item,
    spec_tags: parseProductSpecification(item.spec_desc),
    inspection_draft: inspectionDraft,
    preview_images: previewImages,
    preview_thumbnails: previewThumbnails,
    preview_image_count: inspectionDraft
      ? draftImages.length
      : Math.max(serverImageCount, serverPreviewImages.length),
    inspection_summary: inspectionDraft
      ? summarizeQualityInspectionDraft(inspectionDraft)
      : normalizeInspectionSummary(item.inspection_summary),
  }
  if (compact) delete normalized.inspection_draft
  return normalized
}

export function normalizeQualityInspectionTask(
  task: QualityInspectionTaskDto,
  compact = false,
): QualityInspectionTaskDto {
  return {
    ...task,
    items: task.items?.map((item) => normalizeQualityInspectionItem(item, compact)),
  }
}

export async function listInspectionTasks(
  query: TaskQuery,
  request: QualityRequest = serverRequest,
): Promise<TaskListData> {
  const encoded = encodeTaskQuery(query)
  const suffix = encoded ? `?${encoded}` : ''
  const data = await request<TaskListData>({
    method: 'GET',
    path: `/customer-orders/api/purchase-orders/quality-inspections${suffix}`,
  })
  return {
    ...data,
    items: data.items.map((task) => normalizeQualityInspectionTask(task, Boolean(query.compact))),
  }
}

export async function getInspectionTask(
  taskId: number,
  compact = false,
  request: QualityRequest = serverRequest,
): Promise<QualityInspectionTaskDto> {
  const task = await request<QualityInspectionTaskDto>({
    method: 'GET',
    path: `/customer-orders/api/purchase-orders/quality-inspections/${taskId}${compact ? '?compact=true' : ''}`,
  })
  return normalizeQualityInspectionTask(task, compact)
}

export interface QualityInspectionItemDetailDto {
  task: QualityInspectionTaskDto
  item: QualityInspectionItemDto
  purchase_order_item?: Record<string, unknown> | null
  master_product?: QualityInspectionMasterProductDto | null
  customer_product?: QualityInspectionCustomerProductDto | null
}

export async function getInspectionItemDetail(
  taskId: number,
  itemId: number,
  request: QualityRequest = serverRequest,
): Promise<QualityInspectionItemDetailDto> {
  const detail = await request<QualityInspectionItemDetailDto>({
    method: 'GET',
    path: `/customer-orders/api/purchase-orders/quality-inspections/${taskId}/items/${itemId}`,
  })
  return {
    ...detail,
    task: normalizeQualityInspectionTask(detail.task),
    item: normalizeQualityInspectionItem(detail.item),
    master_product: detail.master_product
      ? {
          ...detail.master_product,
          image_paths: normalizeServerImageList(detail.master_product.image_paths),
          packaging_images: normalizeServerImageList(detail.master_product.packaging_images),
          technical_spec_sheet_paths: normalizeServerImageList(detail.master_product.technical_spec_sheet_paths),
          tray_image_paths: normalizeServerImageList(detail.master_product.tray_image_paths),
        }
      : detail.master_product,
    customer_product: detail.customer_product
      ? {
          ...detail.customer_product,
          customer_images: normalizeServerImageList(detail.customer_product.customer_images),
        }
      : detail.customer_product,
  }
}

export type HistoryImageDetailLoader = (
  taskId: number,
  itemId: number,
) => Promise<QualityInspectionItemDetailDto>

export async function hydrateMissingHistoryImages(
  items: HistoryViewItem[],
  loadDetail: HistoryImageDetailLoader = getInspectionItemDetail,
  materialize: HistoryImageMaterializer = (imagePath, cacheKey) => (
    materializeHistoryCardImage(imagePath, cacheKey)
  ),
): Promise<HistoryViewItem[]> {
  const incomplete = items.filter((item) => (
    item.origin === 'remote'
    && !item.imageSummaryComplete
    && item.taskId !== null
    && item.itemId !== null
  ))
  if (incomplete.length === 0) return items

  const hydrated = new Map<string, Pick<HistoryViewItem, 'imagePath' | 'imagePaths' | 'imageCount' | 'imageSummaryComplete'>>()
  let nextIndex = 0
  const worker = async (): Promise<void> => {
    while (nextIndex < incomplete.length) {
      const item = incomplete[nextIndex]
      nextIndex += 1
      if (item.taskId === null || item.itemId === null) continue
      try {
        const detail = await loadDetail(item.taskId, item.itemId)
        const originals = normalizeServerImageList(detail.item.preview_images)
        const thumbnails = normalizeServerImageList(detail.item.preview_thumbnails)
        const detailCandidates = originals.map((image, index) => (
          thumbnails[index] || inspectionImageThumbnailUrl(image)
        ))
        const preservesCompleteLegacyThumbnails = thumbnails.length === 0
          && originals.length > 0
          && originals.length <= item.imagePaths.length
        const candidates = (
          preservesCompleteLegacyThumbnails
            ? item.imagePaths
            : detailCandidates.length > 0 ? detailCandidates : item.imagePaths
        )
          .slice(0, TASK_PREVIEW_IMAGE_LIMIT)
        const imagePaths = (await Promise.all(candidates.map((imagePath, index) => (
          materialize(imagePath, `${item.id}-detail-${index}`).catch(() => '')
        )))).filter(Boolean)
        hydrated.set(item.id, {
          imagePath: imagePaths[0] || '',
          imagePaths,
          imageCount: Math.max(
            item.imageCount,
            Math.max(0, Number(detail.item.preview_image_count) || 0),
            originals.length,
            thumbnails.length,
          ),
          imageSummaryComplete: true,
        })
      } catch {
        // 卡片图片是增强信息，单条详情加载失败不应影响历史列表。
      }
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(3, incomplete.length) }, () => worker()),
  )
  if (hydrated.size === 0) return items
  return items.map((item) => {
    const images = hydrated.get(item.id)
    return images ? { ...item, ...images } : item
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

export interface IncrementalInspectionDraftChanges {
  aiWorkbenchResultPatch?: Record<string, unknown>
  aiWorkbenchImageAdditions?: string[]
  aiWorkbenchImageDeletions?: string[]
  recordSourceImageAdditions?: string[]
  recordSourceImageDeletions?: string[]
}

export async function saveInspectionDraftIncremental(
  taskId: number,
  itemId: number,
  payload: QualityInspectionDraftPayload,
  changes: IncrementalInspectionDraftChanges = {},
  request: QualityRequest = serverRequest,
): Promise<unknown> {
  return saveInspectionDraft(taskId, itemId, {
    inspection_records: [...(payload.inspection_records || [])],
    ai_workbench_result: {},
    ai_workbench_images: [],
    deleted_record_images: [...(payload.deleted_record_images || [])],
    record_merge_mode: 'workbench_patch',
    draft_changes: {
      ai_workbench_result: { ...(changes.aiWorkbenchResultPatch || {}) },
      ai_workbench_images: {
        add: [...(changes.aiWorkbenchImageAdditions || [])],
        remove: [...(changes.aiWorkbenchImageDeletions || [])],
      },
      record_source_images: {
        add: [...(changes.recordSourceImageAdditions || [])],
        remove: [...(changes.recordSourceImageDeletions || [])],
      },
    },
  }, request)
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

export function normalizeServerImageUrl(value: string): string {
  const imageUrl = String(value || '').trim()
  if (!imageUrl || /^(?:https?:|data:|wxfile:)/i.test(imageUrl)) return imageUrl
  if (imageUrl.startsWith('//')) {
    const protocol = DATA_SERVER_BASE_URL.startsWith('http://') ? 'http:' : 'https:'
    return `${protocol}${imageUrl}`
  }
  return `${DATA_SERVER_BASE_URL.replace(/\/$/, '')}/${imageUrl.replace(/^\/+/, '')}`
}

const INSPECTION_IMAGE_THUMBNAIL_PATH =
  '/customer-orders/api/purchase-orders/quality-inspection-image-thumbnail'

export function inspectionImageThumbnailUrl(value: string): string {
  const imageUrl = normalizeServerImageUrl(value)
  if (!imageUrl || !/^https?:\/\//i.test(imageUrl)) return imageUrl
  if (imageUrl.includes(INSPECTION_IMAGE_THUMBNAIL_PATH)) return imageUrl

  const baseUrl = DATA_SERVER_BASE_URL.replace(/\/$/, '')
  const source = imageUrl.startsWith(`${baseUrl}/`)
    ? imageUrl.slice(baseUrl.length)
    : imageUrl
  return `${baseUrl}${INSPECTION_IMAGE_THUMBNAIL_PATH}?url=${encodeURIComponent(source)}`
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
  const url = normalizeServerImageUrl(uploaded.image_url || '')
  if (!url) throw new Error('服务器未返回质检单图片地址，请重试')
  return {
    id: String(uploaded.image_path || url),
    url,
  }
}

export async function uploadInspectionWorkbenchImage(
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
      row_key: 'ai-workbench',
    },
  })
  const url = normalizeServerImageUrl(uploaded.image_url || '')
  if (!url) throw new Error('服务器未返回验货图片地址，请重试')
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
  const url = normalizeServerImageUrl(uploaded.image_url || '')
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
