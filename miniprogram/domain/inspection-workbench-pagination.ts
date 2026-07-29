import {
  inspectionGroupSemantic,
  InspectionWorkbenchRow,
  UnmatchedRecognitionRow,
} from './inspection-workbench'

export type InspectionWorkbenchPageKind = 'overview' | 'inspection' | 'final'

export interface InspectionWorkbenchPage {
  id: string
  kind: InspectionWorkbenchPageKind
  title: string
  groupTitle: string
  rows: InspectionWorkbenchRow[]
  unmatched: UnmatchedRecognitionRow[]
}

export interface InspectionWorkbenchFinalState {
  decision: 'OK' | 'NG' | '待检验'
  inspectedCount: number
  okCount: number
  ngCount: number
  pendingCount: number
  conclusions: string[]
}

interface InspectionWorkbenchAiResultLike {
  decision?: unknown
  summary?: unknown
  [key: string]: unknown
}

type FormalInspectionSection =
  | 'appearance-packaging'
  | 'dimension'
  | 'safety'
  | 'performance'

const SAFETY_PROJECT_PATTERN = /安全|回转|转速|破裂|爆破|耐压|绝缘|平衡|跑偏|跟踪|同轴|跳动|冲击|拉脱|拉伸|剥离|粘接|结合|焊缝|强度|飞片|脱片/
const PERFORMANCE_PROJECT_PATTERN = /性能|效率|寿命|耐用|切割|磨削|开孔|除锈|去毛刺|砂痕|去除量|质量/

function normalizedText(value: unknown): string {
  return value === null || value === undefined
    ? ''
    : String(value).trim().replace(/\s+/g, '')
}

function projectSection(row: InspectionWorkbenchRow): 'safety' | 'performance' | '' {
  const project = normalizedText(row.project)
  if (SAFETY_PROJECT_PATTERN.test(project)) return 'safety'
  if (PERFORMANCE_PROJECT_PATTERN.test(project)) return 'performance'
  return ''
}

function formalSection(row: InspectionWorkbenchRow): FormalInspectionSection {
  const group = normalizedText(row.groupTitle)
  const semantic = inspectionGroupSemantic(row.groupTitle)
  if (semantic === 'appearance' || semantic === 'packaging') return 'appearance-packaging'
  if (semantic === 'dimension') return 'dimension'
  if (group.includes('测试报告')) return projectSection(row) || 'performance'
  if (semantic === 'safety') return 'safety'
  if (semantic === 'performance') return 'performance'

  const project = normalizedText(row.project)
  if (/外观|包装|商标|标签|条码|唛头|印刷|正面|反面/.test(project)) return 'appearance-packaging'
  if (/尺寸|外径|直径|孔径|厚度|长度|宽度|高度|丝径|数量/.test(project)) return 'dimension'
  return projectSection(row) || 'performance'
}

export function buildInspectionWorkbenchPages(
  rows: InspectionWorkbenchRow[],
  unmatched: UnmatchedRecognitionRow[],
): InspectionWorkbenchPage[] {
  const sectionRows: Record<FormalInspectionSection, InspectionWorkbenchRow[]> = {
    'appearance-packaging': [],
    dimension: [],
    safety: [],
    performance: [],
  }
  ;[...rows]
    .sort((left, right) => left.displayOrder - right.displayOrder)
    .forEach((row) => sectionRows[formalSection(row)].push(row))

  return [
    {
      id: 'overview',
      kind: 'overview',
      title: '基本信息',
      groupTitle: '',
      rows: [],
      unmatched: [...unmatched],
    },
    {
      id: 'appearance-packaging',
      kind: 'inspection',
      title: '产品外观和包装',
      groupTitle: '产品外观和包装',
      rows: sectionRows['appearance-packaging'],
      unmatched: [],
    },
    {
      id: 'dimension',
      kind: 'inspection',
      title: '产品尺寸',
      groupTitle: '产品尺寸',
      rows: sectionRows.dimension,
      unmatched: [],
    },
    {
      id: 'safety',
      kind: 'inspection',
      title: '产品安全',
      groupTitle: '产品安全',
      rows: sectionRows.safety,
      unmatched: [],
    },
    {
      id: 'performance',
      kind: 'inspection',
      title: '产品性能',
      groupTitle: '产品性能',
      rows: sectionRows.performance,
      unmatched: [],
    },
    {
      id: 'final',
      kind: 'final',
      title: '最终判定',
      groupTitle: '',
      rows: [],
      unmatched: [],
    },
  ]
}

export function findInspectionWorkbenchPageForRow(
  pages: InspectionWorkbenchPage[],
  rowKey: string,
): number {
  return pages.findIndex((page) => page.rows.some((row) => row.rowKey === rowKey))
}

export function isInspectionWorkbenchRowComplete(row: InspectionWorkbenchRow): boolean {
  const hasMeasurement = row.measurements.some((value) => value.trim().length > 0)
  const hasExplicitOkDecision = row.decision.trim().toUpperCase() === 'OK'
  const hasPhotos = row.images.some((photo) => photo.status === 'uploaded' || Boolean(photo.localPath))
  if (row.photoRequired && !hasPhotos) return false
  return hasMeasurement || hasExplicitOkDecision || hasPhotos || row.note.trim().length > 0
}

export function buildInspectionWorkbenchFinalState(
  rows: InspectionWorkbenchRow[],
  aiResult: InspectionWorkbenchAiResultLike,
): InspectionWorkbenchFinalState {
  const completedRows = rows.filter(isInspectionWorkbenchRowComplete)
  const ngCount = completedRows.filter((row) => row.decision.trim().toUpperCase() === 'NG').length
  const okCount = completedRows.filter((row) => row.decision.trim().toUpperCase() === 'OK').length
  const aiDecision = normalizedText(aiResult.decision).toLowerCase()
  const decision = ngCount > 0 || aiDecision === 'fail'
    ? 'NG'
    : completedRows.length > 0 || aiDecision === 'pass'
      ? 'OK'
      : '待检验'
  const summary = aiResult.summary === null || aiResult.summary === undefined
    ? ''
    : String(aiResult.summary).trim()
  const conclusions = summary
    .split(/[；;\n\r]+/)
    .map((item) => item.trim().replace(/^[，,。；;\s]+/, ''))
    .filter(Boolean)

  return {
    decision,
    inspectedCount: completedRows.length,
    okCount,
    ngCount,
    pendingCount: Math.max(0, rows.length - completedRows.length),
    conclusions: conclusions.length ? conclusions : ['当前无补充说明。'],
  }
}
