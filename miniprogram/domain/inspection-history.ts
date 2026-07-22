import { InspectionRecord } from './inspection-record'

export const HISTORY_STORAGE_KEY = 'inspectionHistory:v2'
export const LEGACY_HISTORY_STORAGE_KEY = 'inspectionHistory:v1'
export const MAX_HISTORY_RECORDS = 30

export type SyncStatus = 'local' | 'syncing' | 'synced' | 'failed'
export type InspectionSourceType = 'purchase_order' | 'standalone'

export interface StoredInspectionRecord {
  id: string
  clientRecordId: string
  sourceType: InspectionSourceType
  taskId: number | null
  itemId: number | null
  imagePath: string
  rawContent: string
  record: InspectionRecord
  createdAt: number
  updatedAt: number
  syncStatus: SyncStatus
  syncError: string
}

export type StoredInspectionRecordV2 = StoredInspectionRecord

export interface HistoryRecordInput {
  imagePath: string
  rawContent: string
  record: InspectionRecord
}

export interface HistoryMutation {
  records: StoredInspectionRecord[]
  removedImagePaths: string[]
}

export interface SyncStatePatch {
  syncStatus: SyncStatus
  syncError?: string
  taskId?: number | null
  itemId?: number | null
}

interface LegacyStoredInspectionRecord {
  id: string
  imagePath: string
  rawContent: string
  record: InspectionRecord
  createdAt: number
  updatedAt: number
  syncStatus?: SyncStatus
  clientRecordId?: string
  sourceType?: InspectionSourceType
  taskId?: number | null
  itemId?: number | null
  syncError?: string
}

function isLegacyStoredRecord(value: unknown): value is LegacyStoredInspectionRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Partial<LegacyStoredInspectionRecord>
  return typeof candidate.id === 'string'
    && typeof candidate.imagePath === 'string'
    && typeof candidate.rawContent === 'string'
    && typeof candidate.record === 'object'
    && candidate.record !== null
    && typeof candidate.createdAt === 'number'
    && typeof candidate.updatedAt === 'number'
}

function normalizeRecord(
  record: LegacyStoredInspectionRecord,
  createUuid: () => string,
): StoredInspectionRecord {
  const interrupted = record.syncStatus === 'syncing'
  const clientRecordId = String(record.clientRecordId || createUuid()).trim()
  if (!clientRecordId) throw new Error('无法生成本地质检编号')
  const status: SyncStatus = interrupted
    ? 'failed'
    : ['local', 'syncing', 'synced', 'failed'].includes(record.syncStatus || '')
      ? record.syncStatus as SyncStatus
      : 'local'
  return {
    id: record.id,
    clientRecordId,
    sourceType: record.sourceType === 'purchase_order' ? 'purchase_order' : 'standalone',
    taskId: typeof record.taskId === 'number' ? record.taskId : null,
    itemId: typeof record.itemId === 'number' ? record.itemId : null,
    imagePath: record.imagePath,
    rawContent: record.rawContent,
    record: record.record,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    syncStatus: status,
    syncError: interrupted
      ? '上次同步未完成，请重试'
      : String(record.syncError || ''),
  }
}

function sortByUpdatedAt(records: StoredInspectionRecord[]): StoredInspectionRecord[] {
  return [...records].sort((left, right) => right.updatedAt - left.updatedAt)
}

export function parseHistory(
  value: unknown,
  createUuid: () => string = () => '',
): StoredInspectionRecord[] {
  if (!Array.isArray(value) || !value.every(isLegacyStoredRecord)) return []
  try {
    return sortByUpdatedAt(value.map((record) => normalizeRecord(record, createUuid)))
  } catch {
    return []
  }
}

export function updateSyncState(
  record: StoredInspectionRecord,
  patch: SyncStatePatch,
  now: number,
): StoredInspectionRecord {
  return {
    ...record,
    ...patch,
    syncError: patch.syncError ?? record.syncError,
    taskId: patch.taskId === undefined ? record.taskId : patch.taskId,
    itemId: patch.itemId === undefined ? record.itemId : patch.itemId,
    updatedAt: now,
  }
}

export function upsertHistory(
  records: StoredInspectionRecord[],
  input: HistoryRecordInput,
  now: number,
  existingId = '',
  createUuid: () => string = () => '',
): HistoryMutation {
  const existing = existingId ? records.find((item) => item.id === existingId) : undefined
  const nextRecord: StoredInspectionRecord = existing
    ? {
      ...existing,
      rawContent: input.rawContent,
      record: input.record,
      updatedAt: now,
      syncStatus: 'local',
      syncError: '',
    }
    : {
      id: `IR-${now}`,
      clientRecordId: createUuid(),
      sourceType: 'standalone',
      taskId: null,
      itemId: null,
      imagePath: input.imagePath,
      rawContent: input.rawContent,
      record: input.record,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
      syncError: '',
    }
  if (!nextRecord.clientRecordId) throw new Error('无法生成本地质检编号')
  const withoutCurrent = records.filter((item) => item.id !== nextRecord.id)
  const sorted = sortByUpdatedAt([nextRecord, ...withoutCurrent])
  const removed = sorted.slice(MAX_HISTORY_RECORDS)
  return {
    records: sorted.slice(0, MAX_HISTORY_RECORDS),
    removedImagePaths: removed.map((item) => item.imagePath).filter(Boolean),
  }
}

export function removeHistoryRecord(
  records: StoredInspectionRecord[],
  id: string,
): HistoryMutation {
  const removed = records.find((item) => item.id === id)
  return {
    records: records.filter((item) => item.id !== id),
    removedImagePaths: removed?.imagePath ? [removed.imagePath] : [],
  }
}
