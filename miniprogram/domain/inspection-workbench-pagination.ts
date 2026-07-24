import type { InspectionWorkbenchRow, UnmatchedRecognitionRow } from './inspection-workbench'

export type InspectionWorkbenchPageKind = 'overview' | 'inspection' | 'unmatched'

export interface InspectionWorkbenchPage {
  id: string
  kind: InspectionWorkbenchPageKind
  title: string
  groupTitle: string
  rows: InspectionWorkbenchRow[]
  unmatched: UnmatchedRecognitionRow[]
}

function pageChunk<T>(items: T[], size: number): T[][] {
  const pages: T[][] = []
  for (let index = 0; index < items.length; index += size) {
    pages.push(items.slice(index, index + size))
  }
  return pages
}

export function buildInspectionWorkbenchPages(
  rows: InspectionWorkbenchRow[],
  unmatched: UnmatchedRecognitionRow[],
  rowsPerPage = 3,
): InspectionWorkbenchPage[] {
  const limit = Math.max(1, Math.floor(rowsPerPage))
  const pages: InspectionWorkbenchPage[] = [{
    id: 'overview',
    kind: 'overview',
    title: '产品与识别',
    groupTitle: '',
    rows: [],
    unmatched: [],
  }]
  const groups: Array<{ title: string; rows: InspectionWorkbenchRow[] }> = []
  rows.forEach((row) => {
    const title = row.groupTitle || '其他检验'
    const current = groups[groups.length - 1]
    if (!current || current.title !== title) {
      groups.push({ title, rows: [row] })
      return
    }
    current.rows.push(row)
  })
  groups.forEach((group, groupIndex) => {
    pageChunk(group.rows, limit).forEach((chunk, chunkIndex) => {
      pages.push({
        id: `inspection-${groupIndex + 1}-${chunkIndex + 1}`,
        kind: 'inspection',
        title: group.title,
        groupTitle: group.title,
        rows: chunk,
        unmatched: [],
      })
    })
  })
  if (unmatched.length > 0) {
    pages.push({
      id: 'unmatched',
      kind: 'unmatched',
      title: '待核对内容',
      groupTitle: '',
      rows: [],
      unmatched,
    })
  }
  return pages
}

export function findInspectionWorkbenchPageForRow(
  pages: InspectionWorkbenchPage[],
  rowKey: string,
): number {
  return pages.findIndex((page) => page.rows.some((row) => row.rowKey === rowKey))
}

export function isInspectionWorkbenchRowComplete(row: InspectionWorkbenchRow): boolean {
  const hasMeasurement = row.measurements.some((value) => value.trim().length > 0)
  const hasDecision = row.decision.trim().length > 0
  const hasPhotos = row.images.some((photo) => photo.status === 'uploaded' || photo.localPath)
  if (row.photoRequired && !hasPhotos) return false
  return hasMeasurement || hasDecision || hasPhotos || row.note.trim().length > 0
}
