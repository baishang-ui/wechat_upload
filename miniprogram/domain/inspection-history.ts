import { InspectionRecord } from './inspection-record'

export const HISTORY_STORAGE_KEY = 'inspectionHistory:v1'
export const MAX_HISTORY_RECORDS = 30

export interface StoredInspectionRecord {
  id: string
  imagePath: string
  rawContent: string
  record: InspectionRecord
  createdAt: number
  updatedAt: number
  syncStatus: 'local'
}

export interface HistoryRecordInput {
  imagePath: string
  rawContent: string
  record: InspectionRecord
}

export interface HistoryMutation {
  records: StoredInspectionRecord[]
  removedImagePaths: string[]
}

function isStoredInspectionRecord(value: unknown): value is StoredInspectionRecord {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const candidate = value as Partial<StoredInspectionRecord>
  return typeof candidate.id === 'string'
    && typeof candidate.imagePath === 'string'
    && typeof candidate.rawContent === 'string'
    && typeof candidate.record === 'object'
    && candidate.record !== null
    && typeof candidate.createdAt === 'number'
    && typeof candidate.updatedAt === 'number'
    && candidate.syncStatus === 'local'
}

function sortByUpdatedAt(records: StoredInspectionRecord[]): StoredInspectionRecord[] {
  return [...records].sort((left, right) => right.updatedAt - left.updatedAt)
}

export function parseHistory(value: unknown): StoredInspectionRecord[] {
  if (!Array.isArray(value) || !value.every(isStoredInspectionRecord)) return []
  return sortByUpdatedAt(value)
}

export function upsertHistory(
  records: StoredInspectionRecord[],
  input: HistoryRecordInput,
  now: number,
  existingId = '',
): HistoryMutation {
  const existing = existingId ? records.find((item) => item.id === existingId) : undefined
  const nextRecord: StoredInspectionRecord = existing
    ? {
      ...existing,
      rawContent: input.rawContent,
      record: input.record,
      updatedAt: now,
      syncStatus: 'local',
    }
    : {
      id: `IR-${now}`,
      imagePath: input.imagePath,
      rawContent: input.rawContent,
      record: input.record,
      createdAt: now,
      updatedAt: now,
      syncStatus: 'local',
    }
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
