export const INSPECTION_IMAGE_SECTIONS = [
  '产品外观',
  '产品包装',
  '商标标签',
  '产品尺寸',
  '测试报告',
  '待复核',
] as const

export type InspectionImageSection = typeof INSPECTION_IMAGE_SECTIONS[number]

export interface ClassifiedInspectionImage {
  id: string
  imageIndex: number
  originalIndex: number
  url: string
  project: string
  reason: string
  status: string
  evidence: string
  difference: string
}

export interface InspectionImageGroup {
  section: InspectionImageSection
  items: ClassifiedInspectionImage[]
}

export interface UnassignedInspectionImage {
  id: string
  imageIndex: number
  originalIndex: number
  url: string
  name: string
}

export interface InspectionImageClassificationState {
  groups: InspectionImageGroup[]
  unassignedImages: UnassignedInspectionImage[]
  assignedCount: number
  pending: boolean
}

type InspectionResultItem = Record<string, unknown>

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {}
}

function text(value: unknown): string {
  if (value === null || value === undefined) return ''
  return String(value).trim()
}

function itemList(result: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = result[key]
  return Array.isArray(value) ? value.map(record) : []
}

function rowMatchesTexts(row: InspectionWorkbenchRow, values: unknown[]): boolean {
  const aliases = inspectionProjectAliases(row.project, row.measurementStandards)
  return values.some((value) => {
    const source = text(value)
    if (!source) return false
    if (workbenchRowMatchesProject(row, source)) return true
    const normalized = normalizeInspectionProjectName(source)
    return aliases.some((alias) => (
      alias.length >= 2
      && (normalized.includes(alias) || alias.includes(normalized))
    ))
  })
}

function rowAcceptsSection(row: InspectionWorkbenchRow, section: InspectionImageSection): boolean {
  const semantic = inspectionGroupSemantic(row.groupTitle)
  if (semantic === 'appearance') return section === '产品外观' || section === '商标标签'
  if (semantic === 'packaging') return section === '产品包装' || section === '商标标签'
  if (semantic === 'dimension') return section === '产品尺寸'
  if (semantic === 'safety' || semantic === 'performance') return section === '测试报告'
  return false
}

function assignmentTexts(assignment: InspectionResultItem): unknown[] {
  return [
    assignment.project,
    assignment.reason,
    assignment.evidence,
    assignment.difference,
  ]
}

function packagingLevelMatches(row: InspectionWorkbenchRow, assignment: InspectionResultItem): boolean {
  const source = [assignment.section, ...assignmentTexts(assignment)].map(text).join(' ')
  const project = text(row.project)
  if (project === '最小包装') return /最小包装|吸塑|单片包装|单件包装/.test(source)
  if (project === '内盒') return /内盒|中盒|白盒|盒装数量|每内盒/.test(source)
  if (project === '外箱') return /外箱|纸箱|正唛|侧唛|唛头|装箱数量|每箱/.test(source)
  return false
}

function measurementText(measurement: InspectionResultItem): string {
  const value = measurement.value
  const unit = text(measurement.unit)
  if (value !== null && value !== undefined && value !== '') {
    return `${String(value).trim()}${unit ? ` ${unit}` : ''}`
  }
  return text(measurement.raw_text)
}

function matchingMeasurementRows(
  rows: InspectionWorkbenchRow[],
  measurements: InspectionResultItem[],
): InspectionWorkbenchRow[] {
  return rows.filter((row) => measurements.some((measurement) => (
    rowMatchesTexts(row, [measurement.project])
  )))
}

function matchingAssignmentRows(
  rows: InspectionWorkbenchRow[],
  assignment: InspectionResultItem,
  allowSectionFallback: boolean,
): InspectionWorkbenchRow[] {
  const section = normalizeInspectionImageSection(assignment.section)
  const compatibleRows = rows.filter((row) => rowAcceptsSection(row, section))
  const directMatches = compatibleRows.filter((row) => (
    rowMatchesTexts(row, assignmentTexts(assignment))
    || packagingLevelMatches(row, assignment)
  ))
  if (directMatches.length > 0) return directMatches
  if (!allowSectionFallback) return []

  if (section === '产品外观') {
    const appearanceRows = compatibleRows.filter((row) => (
      inspectionGroupSemantic(row.groupTitle) === 'appearance'
    ))
    return appearanceRows.length === 1 ? appearanceRows : []
  }
  return compatibleRows.length === 1 ? compatibleRows : []
}

export function mergeInspectionImageAssignmentsIntoRows(
  rows: InspectionWorkbenchRow[],
  rawResult: unknown,
  images: string[],
  thumbnailUrl?: (imageUrl: string) => string,
): InspectionWorkbenchRow[] {
  const result = record(rawResult)
  const assignments = itemList(result, 'image_assignments')
  const measurements = itemList(result, 'measurements')
  const cleanRows = rows.map((row) => ({
    ...row,
    images: row.images.filter((photo) => photo.origin !== 'ai_assignment'),
  }))
  const imageIndexesByRow = new Map<string, Set<number>>()
  const measurementsByRow = new Map<string, InspectionResultItem[]>()

  images.forEach((image, originalIndex) => {
    if (!text(image)) return
    const imageIndex = originalIndex + 1
    const imageMeasurements = measurements.filter((measurement) => (
      validImageIndex(measurement.image_index) === imageIndex
    ))
    const measurementRows = matchingMeasurementRows(cleanRows, imageMeasurements)
    const matchedRows = new Set(measurementRows)
    const appendMeasurements = (
      row: InspectionWorkbenchRow,
      additions: InspectionResultItem[],
    ) => {
      const current = measurementsByRow.get(row.rowKey) || []
      additions.forEach((measurement) => {
        if (!current.includes(measurement)) current.push(measurement)
      })
      if (current.length > 0) measurementsByRow.set(row.rowKey, current)
    }

    measurementRows.forEach((row) => {
      const matchedMeasurements = imageMeasurements.filter((measurement) => (
        rowMatchesTexts(row, [measurement.project])
      ))
      appendMeasurements(row, matchedMeasurements)
    })

    assignments
      .filter((assignment) => validImageIndex(assignment.image_index) === imageIndex)
      .forEach((assignment) => {
        const assignmentRows = matchingAssignmentRows(
          cleanRows,
          assignment,
          measurementRows.length === 0,
        )
        assignmentRows.forEach((row) => {
          matchedRows.add(row)
          if (imageMeasurements.length === 0) return
          const directMeasurements = imageMeasurements.filter((measurement) => (
            rowMatchesTexts(row, [measurement.project])
          ))
          if (directMeasurements.length > 0) appendMeasurements(row, directMeasurements)
          else if (assignmentRows.length === 1) appendMeasurements(row, imageMeasurements)
        })
      })

    matchedRows.forEach((row) => {
      const current = imageIndexesByRow.get(row.rowKey) || new Set<number>()
      current.add(originalIndex)
      imageIndexesByRow.set(row.rowKey, current)
    })
  })

  return cleanRows.map((row) => {
    const usedUrls = new Set(row.images.map((photo) => photo.remoteUrl).filter(Boolean))
    const additions = [...(imageIndexesByRow.get(row.rowKey) || [])].flatMap((sourceImageIndex) => {
      const remoteUrl = text(images[sourceImageIndex])
      if (!remoteUrl || usedUrls.has(remoteUrl)) return []
      usedUrls.add(remoteUrl)
      return [{
        id: `ai-assignment-${row.rowKey}-${sourceImageIndex + 1}`,
        localPath: '',
        remoteUrl,
        thumbnailUrl: thumbnailUrl?.(remoteUrl) || '',
        status: 'uploaded' as const,
        error: '',
        origin: 'ai_assignment' as const,
        sourceImageIndex,
      }]
    })
    const hasManualMeasurements = row.measurements.some((value) => value.trim().length > 0)
    const recognizedValues = (measurementsByRow.get(row.rowKey) || [])
      .map(measurementText)
      .filter(Boolean)
    return {
      ...row,
      measurements: hasManualMeasurements || recognizedValues.length === 0
        ? [...row.measurements]
        : normalizeTenValues(recognizedValues),
      images: [...row.images, ...additions],
    }
  })
}

function validImageIndex(value: unknown): number | null {
  const imageIndex = Number(value)
  return Number.isInteger(imageIndex) && imageIndex > 0 ? imageIndex : null
}

function removeAndReindexImageItems(value: unknown, removedImageIndex: number): unknown[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((candidate) => {
    if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
      return [candidate]
    }
    const item = candidate as Record<string, unknown>
    const imageIndex = validImageIndex(item.image_index)
    if (imageIndex === removedImageIndex) return []
    if (imageIndex === null || imageIndex < removedImageIndex) return [{ ...item }]
    return [{ ...item, image_index: imageIndex - 1 }]
  })
}

export function removeInspectionImageReferences(
  rawResult: unknown,
  removedOriginalIndex: number,
): Record<string, unknown> {
  const result = record(rawResult)
  if (!Number.isInteger(removedOriginalIndex) || removedOriginalIndex < 0) {
    return { ...result }
  }
  const removedImageIndex = removedOriginalIndex + 1
  return {
    ...result,
    image_assignments: removeAndReindexImageItems(
      result.image_assignments,
      removedImageIndex,
    ),
    measurements: removeAndReindexImageItems(
      result.measurements,
      removedImageIndex,
    ),
  }
}

export function normalizeInspectionImageSection(value: unknown): InspectionImageSection {
  const normalized = text(value)
  if ((INSPECTION_IMAGE_SECTIONS as readonly string[]).includes(normalized)) {
    return normalized as InspectionImageSection
  }
  if (/外观|缺角|变形|破损|气泡|孔环|网片/.test(normalized)) return '产品外观'
  if (/包装|吸塑|内盒|外箱|托盘|装箱/.test(normalized)) return '产品包装'
  if (/商标|标签|贴标|条码|唛头|印刷/.test(normalized)) return '商标标签'
  if (/尺寸|直径|厚度|孔径|卡尺|尺|测量/.test(normalized)) return '产品尺寸'
  if (/测试|报告|转速|回转|性能|安全/.test(normalized)) return '测试报告'
  return '待复核'
}

export function buildInspectionImageGroups(
  rawResult: unknown,
  images: string[],
): InspectionImageGroup[] {
  const result = record(rawResult)
  const groups = INSPECTION_IMAGE_SECTIONS.map((section) => ({
    section,
    items: [] as ClassifiedInspectionImage[],
  }))

  itemList(result, 'image_assignments').forEach((assignment, assignmentIndex) => {
    const imageIndex = validImageIndex(assignment.image_index || assignmentIndex + 1)
    if (!imageIndex) return
    const url = text(images[imageIndex - 1])
    if (!url) return
    const section = normalizeInspectionImageSection(assignment.section)
    const group = groups.find((candidate) => candidate.section === section)
      || groups[groups.length - 1]
    group.items.push({
      id: `inspection-assignment-${assignmentIndex + 1}-${imageIndex}`,
      imageIndex,
      originalIndex: imageIndex - 1,
      url,
      project: text(assignment.project) || section,
      reason: text(assignment.reason),
      status: text(assignment.status),
      evidence: text(assignment.evidence),
      difference: text(assignment.difference),
    })
  })

  return groups.filter((group) => group.items.length > 0)
}

export function buildUnassignedInspectionImages(
  rawResult: unknown,
  images: string[],
): UnassignedInspectionImage[] {
  const result = record(rawResult)
  const assignedIndexes = new Set<number>()

  itemList(result, 'image_assignments').forEach((assignment) => {
    const imageIndex = validImageIndex(assignment.image_index)
    if (imageIndex) assignedIndexes.add(imageIndex)
  })
  itemList(result, 'measurements').forEach((measurement) => {
    const imageIndex = validImageIndex(measurement.image_index)
    if (imageIndex) assignedIndexes.add(imageIndex)
  })

  return images.flatMap((image, originalIndex) => {
    const imageIndex = originalIndex + 1
    const url = text(image)
    if (!url || assignedIndexes.has(imageIndex)) return []
    return [{
      id: `inspection-unassigned-${imageIndex}`,
      imageIndex,
      originalIndex,
      url,
      name: `质检现场照片${imageIndex}`,
    }]
  })
}

export function isInspectionImageClassificationPending(rawResult: unknown): boolean {
  const result = record(rawResult)
  return text(record(result.visual_recognition_request).status).toLowerCase() === 'pending'
}

export function buildInspectionImageClassificationState(
  rawResult: unknown,
  images: string[],
): InspectionImageClassificationState {
  const result = record(rawResult)
  const groups = buildInspectionImageGroups(result, images)
  const unassignedImages = buildUnassignedInspectionImages(result, images)
  const assignedIndexes = new Set<number>()
  itemList(result, 'image_assignments').forEach((assignment) => {
    const imageIndex = validImageIndex(assignment.image_index)
    if (imageIndex && images[imageIndex - 1]) assignedIndexes.add(imageIndex)
  })
  itemList(result, 'measurements').forEach((measurement) => {
    const imageIndex = validImageIndex(measurement.image_index)
    if (imageIndex && images[imageIndex - 1]) assignedIndexes.add(imageIndex)
  })

  return {
    groups,
    unassignedImages,
    assignedCount: assignedIndexes.size,
    pending: isInspectionImageClassificationPending(result),
  }
}
import { normalizeTenValues } from './inspection-record'
import {
  inspectionGroupSemantic,
  inspectionProjectAliases,
  InspectionWorkbenchRow,
  normalizeInspectionProjectName,
  workbenchRowMatchesProject,
} from './inspection-workbench'
