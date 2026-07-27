import {
  InspectionTemplateColumnDto,
  InspectionTemplateDto,
  InspectionTemplateRowDto,
  InspectionWorkbenchInputMode,
} from './inspection-workbench'
import {
  FormalReportVariant,
  FORMAL_REPORT_VARIANTS,
  GENERIC_INSPECTION_TEMPLATE,
  PRODUCT_INSPECTION_TEMPLATES,
  SUBCATEGORY_TEMPLATE_KEYS,
} from './online-product-report-definitions'

interface OnlinePairDto {
  label?: unknown
  value?: unknown
}

interface OnlineMasterProductDto {
  category?: unknown
  subcategory?: unknown
  name?: unknown
  master_code?: unknown
  spec_pairs?: OnlinePairDto[]
  attribute_pairs?: OnlinePairDto[]
  grade_pairs?: OnlinePairDto[]
}

interface OnlineCustomerProductDto {
  brand_type?: unknown
  product_trademark?: unknown
  trademark_method?: unknown
  packaging_method?: unknown
  extra_info_text?: unknown
  extra_info_attachments?: unknown[]
  spec_description?: unknown
}

interface OnlineInspectionItemDto {
  id: number
  material_code?: unknown
  material_name?: unknown
  spec_desc?: unknown
  packaging_method?: unknown
}

export interface OnlineInspectionDetailLike {
  task: { id: number; task_no?: unknown }
  item: OnlineInspectionItemDto
  master_product?: OnlineMasterProductDto | null
  customer_product?: OnlineCustomerProductDto | null
}

const ONLINE_COLUMNS: InspectionTemplateColumnDto[] = [
  { key: 'project', title: '检验项目', display_order: 0, visible: true, width: 130 },
  { key: 'standard', title: '标准要求', display_order: 1, visible: true, width: 180 },
  { key: 'method', title: '检测方法', display_order: 2, visible: true, width: 110 },
  ...Array.from({ length: 10 }, (_, index) => ({
    key: `sample_${index + 1}`,
    title: String(index + 1),
    display_order: index + 3,
    visible: true,
    width: 58,
  })),
  { key: 'images', title: '检验图片', display_order: 13, visible: true, width: 180 },
  { key: 'decision', title: '判定', display_order: 14, visible: true, width: 75 },
  { key: 'note', title: '备注', display_order: 15, visible: true, width: 130 },
]

function text(value: unknown): string {
  return value === null || value === undefined ? '' : String(value).trim()
}

interface OnlineProductInspectionTemplate {
  key: string
  title: string
  match: string[]
  docNo: string
  items: string[]
}

interface OnlineGeneratedRow {
  label: string
  method: string
  standard: string
  groupTitle: string
  sourceGroupTitle: string
  source: string
}

function isPriceSensitiveText(value: unknown): boolean {
  return /金额|单价|总价|总金额|价格|成本|报价|售价|销售价|利润|毛利|毛利率|amount|price|cost|quote|sale|profit|margin|revenue/i.test(text(value))
}

function safeInspectionText(value: unknown): string {
  const valueText = text(value)
  return valueText && !isPriceSensitiveText(valueText) ? valueText : ''
}

function pairValue(pairs: OnlinePairDto[] | undefined, keywords: string[]): string {
  const rows = Array.isArray(pairs) ? pairs : []
  const found = rows.find((row) => {
    const label = text(row?.label)
    const lowerLabel = label.toLowerCase()
    return label && keywords.some((keyword) => lowerLabel.includes(text(keyword).toLowerCase()))
  })
  return text(found?.value)
}

function joinRequirementParts(parts: unknown[]): string {
  return parts.map(safeInspectionText).filter(Boolean).join(' / ')
}

function parseRequirementPairs(value: unknown): Array<{ label: string; value: string }> {
  return text(value)
    .split(/[；;\n\r]+/)
    .map((part) => part.trim())
    .filter(Boolean)
    .flatMap((part) => {
      const match = part.match(/^(.+?)[：:](.*)$/)
      if (!match) return []
      const label = text(match[1])
      const pairValueText = safeInspectionText(match[2])
      return label && pairValueText && !isPriceSensitiveText(label)
        ? [{ label, value: pairValueText }]
        : []
    })
}

function requirementValue(pairs: Array<{ label: string; value: string }>, keywords: string[]): string {
  return joinRequirementParts(pairs
    .filter((pair) => keywords.some((keyword) => pair.label.includes(keyword)))
    .map((pair) => `${pair.label}：${pair.value}`))
}

function trademarkArtworkMatchStandard(): string {
  return '以客户商标图稿为唯一基准，核对实物图片上的文字、拼写、图案、颜色、位置、方向、比例、版面和清晰度是否完全一致；任一文字、图案或排版差异均不合格'
}

function buildCustomerRequirementRows(customer: OnlineCustomerProductDto): OnlineGeneratedRow[] {
  const rows: OnlineGeneratedRow[] = []
  const seen = new Set<string>()
  const pairs = parseRequirementPairs(customer.extra_info_text)
  const add = (label: string, standard: string, groupTitle: string, judgeMethod = '核对客户资料') => {
    const safeLabel = text(label)
    const safeStandard = safeInspectionText(standard)
    const key = `${groupTitle}-${safeLabel}`
    if (!safeLabel || !safeStandard || seen.has(key)) return
    seen.add(key)
    rows.push({
      label: safeLabel,
      method: judgeMethod,
      standard: safeStandard,
      groupTitle,
      sourceGroupTitle: groupTitle,
      source: '客户资料',
    })
  }

  add('商标要求', joinRequirementParts([
    text(customer.brand_type) ? `品牌类型：${text(customer.brand_type)}` : '',
    text(customer.product_trademark) ? `商标：${text(customer.product_trademark)}` : '',
    text(customer.trademark_method) ? `商标方式：${text(customer.trademark_method)}` : '',
    requirementValue(pairs, ['品牌', '商标', '确认状态']),
    trademarkArtworkMatchStandard(),
  ]), '商标要求')
  add('商标差异核对', trademarkArtworkMatchStandard(), '商标要求')
  add('最小销售单位包装', joinRequirementParts([
    customer.packaging_method,
    requirementValue(pairs, ['包装层级', '包装形式', '最小包装', '单品包装']),
  ]), '包装检验')
  add('吸塑包装确认', requirementValue(pairs, ['吸塑']), '包装检验')
  add('吸塑标签确认', requirementValue(pairs, ['吸塑条码', '吸塑标签', '吸塑贴标']), '包装检验')
  add('内盒样式确认', requirementValue(pairs, ['内盒', '中盒', '每内盒']), '包装检验')
  add('内盒印刷/标签确认', requirementValue(pairs, ['内盒条码', '内盒标签', '内盒指定标签']), '包装检验')
  add('外箱样式确认', requirementValue(pairs, ['外箱', '外包装', '每箱']), '包装检验')
  add('外箱印刷/标签确认', requirementValue(pairs, ['外箱条码', '外箱标签', '外包装唛头', '唛头']), '包装检验')
  add('印刷刻字确认', requirementValue(pairs, ['印刷', '刻字', '工艺', '印刷面', '孔环', '打样']), '包装检验')
  add('托盘包装状态', requirementValue(pairs, ['托盘', '每托', '缠绕膜', '打包带']), '托盘包装')
  return rows
}

function findOnlineProductTemplate(detail: OnlineInspectionDetailLike): OnlineProductInspectionTemplate {
  const master = detail.master_product || {}
  const exactKey = SUBCATEGORY_TEMPLATE_KEYS[text(master.subcategory)]
  const exact = PRODUCT_INSPECTION_TEMPLATES.find((template) => template.key === exactKey)
  if (exact) return exact
  const haystack = [
    master.category,
    master.subcategory,
    master.name,
    detail.item.material_name,
    detail.item.spec_desc,
  ].map(text).join(' ')
  const matches = PRODUCT_INSPECTION_TEMPLATES.flatMap((template) => template.match
    .filter((keyword) => haystack.includes(keyword))
    .map((keyword) => ({ template, keyword })))
  matches.sort((left, right) => right.keyword.length - left.keyword.length)
  return matches[0]?.template || GENERIC_INSPECTION_TEMPLATE
}

function parseFirstNumber(value: unknown): number | null {
  const match = text(value).match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const number = Number(match[0])
  return Number.isFinite(number) ? number : null
}

function formatAxialRunoutLimit(diameterValue: unknown): string {
  const diameter = parseFirstNumber(diameterValue)
  if (!diameter) return ''
  if (diameter >= 100 && diameter <= 150) return '≤0.6mm'
  if (diameter > 150 && diameter <= 200) return '≤0.8mm'
  if (diameter > 200 && diameter <= 305) return '≤1mm'
  if (diameter > 305 && diameter <= 400) return '≤1.2mm'
  return ''
}

function inspectionStandardValue(
  label: string,
  master: OnlineMasterProductDto,
  customer: OnlineCustomerProductDto,
  item: OnlineInspectionItemDto,
): string {
  const specPairs = master.spec_pairs || []
  const attrPairs = master.attribute_pairs || []
  const labelText = text(label)
  const sourceText = [item.spec_desc, item.material_name, master.name].map(text).filter(Boolean).join(' ')
  const sizeMatch = sourceText.match(/(?:^|\b|[^a-z])D\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*(?:mm|毫米)?/i)
    || sourceText.match(/(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*(?:mm|毫米)/i)
  const threadMatch = sourceText.match(/\b(M\s*\d+(?:\.\d+)?(?:\s*[xX×*]\s*\d+(?:\.\d+)?)?)/i)
  const outerDiameter = sizeMatch?.[1] ? `${sizeMatch[1]} mm` : ''
  const workingLength = sizeMatch?.[2] ? `${sizeMatch[2]} mm` : ''
  const connectionThread = threadMatch?.[1]?.replace(/\s+/g, '').toUpperCase() || ''
  if (/端跳|端径跳|径跳/.test(labelText)) return formatAxialRunoutLimit(pairValue(specPairs, ['直径', '外径']))
  if (/有效工作长度|筒体长度/.test(labelText)) return pairValue(specPairs, ['有效工作长度', '筒体长度', '基体长度', '长度']) || workingLength
  if (/刀头高度/.test(labelText)) return pairValue(specPairs, ['刀头高度', '高度'])
  if (/刀头厚度|刀头宽度|齿宽/.test(labelText)) return pairValue(specPairs, ['刀头厚度', '刀头宽度', '齿宽', '厚度'])
  if (/外径|直径/.test(labelText) && !/中孔|孔径|柄直径|圆盘孔直径/.test(labelText)) return pairValue(specPairs, ['直径', '外径']) || outerDiameter
  if (/中孔|孔径|中孔直径/.test(labelText)) return pairValue(specPairs, ['孔径', '中孔'])
  if (/基体厚度/.test(labelText)) {
    const bodyThickness = pairValue(specPairs, ['基体厚度', '本体厚度', '钢板厚度'])
    if (bodyThickness) return bodyThickness
    if (pairValue(specPairs, ['刀头厚度', '刀头宽度', '齿宽'])) return ''
    return pairValue(specPairs, ['厚度'])
  }
  if (/厚度/.test(labelText)) return pairValue(specPairs, ['厚度'])
  if (/刀头长度|叶片长度|基体长度/.test(labelText)) return pairValue(specPairs, ['刀头长度', '叶片长度', '基体长度', '长度'])
  if (/基体宽度|磨块宽度/.test(labelText)) return pairValue(specPairs, ['基体宽度', '磨块宽度', '宽度'])
  if (/叶片宽度/.test(labelText)) return pairValue(specPairs, ['叶片宽度', '宽度'])
  if (/长度|周长/.test(labelText)) return pairValue(specPairs, ['长度', '周长'])
  if (/宽度/.test(labelText)) return pairValue(specPairs, ['宽度'])
  if (/丝径/.test(labelText)) return pairValue(specPairs, ['丝径']) || pairValue(attrPairs, ['丝径'])
  if (/出锋长度|刷丝长度/.test(labelText)) return pairValue(specPairs, ['出锋长度', '刷丝长度', '长度'])
  if (/柄直径/.test(labelText)) return pairValue(specPairs, ['柄直径'])
  if (/刀头数量|磨块数量|页片数量|叶片数量/.test(labelText)) {
    return pairValue(attrPairs, ['刀头数量', '磨块数量', '页片数量', '叶片数量', '数量'])
      || pairValue(specPairs, ['页片数量', '叶片数量', '数量'])
  }
  if (/材质|磨削材料|测试材料/.test(labelText)) return pairValue(attrPairs, ['磨料', '材质', '应用'])
  if (/粒度/.test(labelText)) return pairValue(attrPairs, ['粒度'])
  if (/颜色|色号|砂面颜色/.test(labelText)) return pairValue(attrPairs, ['颜色'])
  if (/回转|转速/.test(labelText)) return pairValue(attrPairs, ['转速'])
  if (/商标|品牌/.test(labelText)) return joinRequirementParts([customer.brand_type, customer.product_trademark, customer.trademark_method])
  if (/印刷|刻字/.test(labelText)) return parseRequirementPairs(customer.extra_info_text)
    .filter((pair) => /印刷|刻字|工艺|印刷面|孔环|打样/.test(pair.label))
    .map((pair) => `${pair.label}：${pair.value}`).join('；')
  if (/包装/.test(labelText)) return [customer.packaging_method, ...parseRequirementPairs(customer.extra_info_text)
    .filter((pair) => /包装|吸塑|内盒|外箱|条码|标签|唛头|每箱|每内盒/.test(pair.label))
    .map((pair) => `${pair.label}：${pair.value}`)].map(text).filter(Boolean).join('；')
  if (/托盘/.test(labelText)) return parseRequirementPairs(customer.extra_info_text)
    .filter((pair) => /托盘|每托|缠绕膜|打包带/.test(pair.label))
    .map((pair) => `${pair.label}：${pair.value}`).join('；')
  if (/芯环/.test(labelText)) return pairValue(attrPairs, ['芯环字样', '孔环字样', '金属环']) || text(customer.product_trademark)
  if (/螺纹/.test(labelText)) return pairValue(attrPairs, ['螺纹']) || pairValue(specPairs, ['螺纹']) || connectionThread
  if (/圆盘孔数|孔数/.test(labelText)) return pairValue(attrPairs, ['孔数']) || pairValue(specPairs, ['孔数'])
  if (/规格描述|规格/.test(labelText)) return text(item.spec_desc) || text(customer.spec_description)
  return ''
}


function formatDiameterWithTolerance(value: unknown): string {
  const valueText = text(value)
  const diameter = parseFirstNumber(valueText)
  if (!valueText || !diameter) return valueText
  if (diameter >= 50 && diameter <= 125) {
    return `${valueText}｜${Number((diameter - 0.5).toFixed(2))}-${Number((diameter + 0.5).toFixed(2))}mm`
  }
  if (diameter >= 150 && diameter <= 400) {
    return `${valueText}｜${Number((diameter - 1).toFixed(2))}-${Number((diameter + 1).toFixed(2))}mm`
  }
  return valueText
}

function formatPositiveTolerance(value: unknown, toleranceText: string): string {
  const valueText = text(value)
  const standardValue = parseFirstNumber(valueText)
  const tolerance = parseFirstNumber(toleranceText)
  if (!valueText || !standardValue || !tolerance) return valueText
  return `${valueText}｜${Number(standardValue.toFixed(2))}-${Number((standardValue + tolerance).toFixed(2))}mm`
}

function formatThicknessWithTolerance(value: unknown): string {
  const valueText = text(value)
  const thickness = parseFirstNumber(valueText)
  if (!valueText || !thickness) return valueText
  if (Math.abs(thickness - 0.8) < 0.001) return `${valueText}｜0.9-1.2mm`
  if (Math.abs(thickness - 1.0) < 0.001 || Math.abs(thickness - 1.2) < 0.001) return `${valueText}｜${valueText}-1.35mm`
  if (thickness >= 1.3 && thickness <= 2.0) return `${valueText}｜${valueText}-${Number((thickness + 0.2).toFixed(2))}mm`
  if (thickness >= 2.1 && thickness <= 4.5) return `${valueText}｜${valueText}-${Number((thickness + 0.3).toFixed(2))}mm`
  if (thickness >= 5.0 && thickness <= 8.0) return `${valueText}｜${valueText}-${Number((thickness + 0.5).toFixed(2))}mm`
  return valueText
}

function includesMetersPerSecond(value: unknown): boolean {
  return /m\s*\/?\s*s|米\s*\/?\s*秒/i.test(text(value))
}

function standardWheelRpm(diameterValue: unknown): number | null {
  const diameter = parseFirstNumber(diameterValue)
  if (!diameter) return null
  const rpmByDiameter: Array<[number[], number]> = [
    [[100, 105], 15300], [[115], 13300], [[125], 12250], [[150], 10200],
    [[180], 8500], [[230], 6650], [[250], 6150], [[300, 305], 5100],
    [[350, 355], 4400], [[400, 406], 3900],
  ]
  return rpmByDiameter.find(([diameters]) => diameters.some((item) => Math.abs(item - diameter) < 0.001))?.[1] || null
}

function inspectionRpmMultiplier(diameterValue: unknown): number | null {
  const diameter = parseFirstNumber(diameterValue)
  if (!diameter) return null
  if (diameter >= 100 && diameter <= 125) return 1.73
  if (diameter >= 150 && diameter <= 406) return 1.87
  return null
}

function formatInspectionRpm(diameterValue: unknown, safetySpeedValue: unknown, rpmValue: unknown): string {
  const rawRpm = text(rpmValue)
  const standardRpm = standardWheelRpm(diameterValue)
  const multiplier = inspectionRpmMultiplier(diameterValue)
  if (standardRpm && multiplier) return `${Math.round(standardRpm * multiplier)} RPM`
  if (rawRpm && /rpm|转\s*\/?\s*分|r\s*\/?\s*min/i.test(rawRpm)) {
    const rpm = parseFirstNumber(rawRpm)
    return rpm && multiplier ? `${Math.round(rpm * multiplier)} RPM` : rawRpm
  }
  const speedSource = includesMetersPerSecond(safetySpeedValue)
    ? safetySpeedValue
    : includesMetersPerSecond(rawRpm) ? rawRpm : ''
  const speed = parseFirstNumber(speedSource)
  const diameter = parseFirstNumber(diameterValue)
  if (!speed || !diameter) return ''
  const rpm = (speed * 60000) / (Math.PI * diameter)
  return `${Math.round(multiplier ? rpm * multiplier : rpm)} RPM`
}

function isResinWheelProduct(master: OnlineMasterProductDto, item: OnlineInspectionItemDto): boolean {
  const category = text(master.category).toUpperCase()
  const productText = [
    master.category,
    master.subcategory,
    master.name,
    master.master_code,
    item.material_code,
    item.material_name,
    item.spec_desc,
  ].map(text).join(' ')
  if (category && category !== 'AW' && !/砂轮|树脂|切割片|打磨片|磨片/.test(productText)) return false
  if (/金刚石|涂附|钢丝刷|孔锯|钻头|锯片/.test(productText)) return false
  return /砂轮|树脂切割片|树脂切片|树脂打磨片|树脂磨片|切割片|打磨片|磨片/.test(productText)
}

function buildMasterQualityRows(master: OnlineMasterProductDto, item: OnlineInspectionItemDto): OnlineGeneratedRow[] {
  if (!isResinWheelProduct(master, item)) return []
  const specPairs = master.spec_pairs || []
  const attrPairs = master.attribute_pairs || []
  const diameter = pairValue(specPairs, ['直径', '外径', 'diameter'])
  const thickness = pairValue(specPairs, ['厚度', 'thickness'])
  const bore = pairValue(specPairs, ['孔径', '中孔', 'bore'])
  const axialRunout = pairValue(specPairs, ['端跳', '端面跳动', '轴向跳动', 'axial_runout'])
    || pairValue(attrPairs, ['端跳', '端面跳动', '轴向跳动', 'axial_runout'])
  const radialRunout = pairValue(specPairs, ['径跳', '径向跳动', 'radial_runout'])
    || pairValue(attrPairs, ['径跳', '径向跳动', 'radial_runout'])
  const rpmValue = pairValue(attrPairs, ['转速', '最大转速', 'rpm', 'max_rpm'])
  const speedValue = pairValue(attrPairs, ['线速度', '安全速度', 'speed', 'safety_speed'])
    || (includesMetersPerSecond(rpmValue) ? rpmValue : '')
  const safetyStandard = pairValue(attrPairs, ['安全标准', '执行标准', '认证标准', 'standard', 'safety_standard'])
    || pairValue(specPairs, ['安全标准', '执行标准', '认证标准', 'standard', 'safety_standard'])
  const reinforcement = pairValue(attrPairs, ['强化层', '网层数', '网层', 'reinforcement', 'layer'])
  const balanceMethod = pairValue(attrPairs, ['平衡测试', '平衡检测', 'balance'])
    || pairValue(specPairs, ['平衡测试', '平衡检测', 'balance'])
  const cuttingMaterial = pairValue(attrPairs, ['切割材料', '磨削材料', '适用材质', '应用', 'material'])
    || pairValue(specPairs, ['切割材料', '磨削材料', '适用材质', '应用', 'material'])
  const performanceStandard = pairValue(attrPairs, ['性能标准', '切割性能', '切割要求', '磨削比', 'performance'])
    || pairValue(specPairs, ['性能标准', '切割性能', '切割要求', '磨削比', 'performance'])
  const groups: Array<{ title: string; items: Array<[string, string]> }> = [
    {
      title: '外观项目',
      items: [
        ['边缘缺角', '目视检查'], ['产品变形', '目视检查'], ['商标起泡', '目视检查'],
        ['孔环缺失移位', '目视检查'], ['网片缺失', '目视检查'],
      ],
    },
    {
      title: '物理尺寸性能',
      items: [
        ['直径', formatDiameterWithTolerance(diameter)],
        ['厚度', formatThicknessWithTolerance(thickness)],
        ['孔径', formatPositiveTolerance(bore, '0.16mm')],
        ['端跳', axialRunout || formatAxialRunoutLimit(diameter)],
        ['径跳', radialRunout || formatAxialRunoutLimit(diameter)],
      ],
    },
    {
      title: '安全性能',
      items: [
        ['检测转速', formatInspectionRpm(diameter, speedValue, rpmValue)],
        ['安全速度', speedValue], ['平衡测试', balanceMethod], ['强化结构', reinforcement],
        ['执行标准', safetyStandard || 'EN12413'],
      ],
    },
    {
      title: '产品切割性能',
      items: [['切割材料', cuttingMaterial], ['切割刀数', performanceStandard]],
    },
  ]
  return groups.flatMap((group) => group.items.map(([label, standard]) => ({
    label,
    method: '',
    standard,
    groupTitle: group.title,
    sourceGroupTitle: group.title,
    source: '母库 QC',
  })))
}

function canonicalInspectionLabel(label: string): string {
  const labelText = text(label).replace(/[（(].*?[）)]/g, '')
  if (/磨料材质|^材质$/.test(labelText)) return '材质'
  if (/外径|直径/.test(labelText) && !/中孔|孔径|柄/.test(labelText)) return '直径'
  if (/中孔|孔径/.test(labelText)) return '孔径'
  if (/厚度/.test(labelText)) return '厚度'
  if (/端跳|端径跳/.test(labelText)) return '端跳'
  if (/径跳/.test(labelText)) return '径跳'
  if (/回转|转速/.test(labelText)) return '检测转速'
  if (/测试材料|切割材料|磨削材料/.test(labelText)) return '切割材料'
  if (/刀数|磨削比/.test(labelText)) return '切割刀数'
  return labelText.replace(/[\s，。；：、,.;:_\-/]+/g, '')
}

function resolveInspectionSection(row: OnlineGeneratedRow): 'appearance' | 'packaging' | 'dimension' | 'test_report' {
  const rowText = [row.groupTitle, row.sourceGroupTitle, row.label, row.method, row.source].map(text).join(' ')
  if (/边缘缺角|产品变形|商标起泡|孔环缺失|孔环移位|网片缺失|外观缺陷|目视检查|外观项目/.test(rowText)) return 'appearance'
  if (/商标|品牌|包装|吸塑|标签|条码|内盒|中盒|外箱|外包装|唛头|印刷|刻字|托盘|缠绕膜|打包带|芯环字样|商标是否贴齐/.test(rowText)) return 'packaging'
  if (/尺寸|外径|直径|中孔|孔径|厚度|端跳|端径跳|径跳|单重|长度|高度|宽度|丝径|柄直径|刀头/.test(rowText)) return 'dimension'
  return 'test_report'
}

const ONLINE_SECTION_TITLES = {
  appearance: '产品外观',
  packaging: '产品包装',
  dimension: '产品尺寸',
  test_report: '产品测试报告',
} as const

function buildOnlineWebRows(detail: OnlineInspectionDetailLike): { template: OnlineProductInspectionTemplate; rows: InspectionTemplateRowDto[] } {
  const template = findOnlineProductTemplate(detail)
  const master = detail.master_product || {}
  const customer = detail.customer_product || {}
  const customerRequirementRows = buildCustomerRequirementRows(customer)
  const generated: OnlineGeneratedRow[] = []
  const seen = new Set<string>()
  const push = (row: Partial<OnlineGeneratedRow> & { label: string }) => {
    const label = text(row.label)
    const standard = safeInspectionText(row.standard)
    if (!label || isPriceSensitiveText(label) || isPriceSensitiveText(standard)) return
    const key = canonicalInspectionLabel(label)
    if (seen.has(key)) return
    seen.add(key)
    const visual = standard === '目视检查'
    generated.push({
      label,
      method: text(row.method) || (visual ? '目视检查' : label === '检测转速' ? '回转仪' : ''),
      standard: visual ? '无算合格' : standard,
      groupTitle: text(row.groupTitle) || template.title,
      sourceGroupTitle: text(row.sourceGroupTitle) || text(row.groupTitle) || template.title,
      source: text(row.source) || '检验单模板',
    })
  }
  buildMasterQualityRows(master, detail.item).forEach(push)
  customerRequirementRows.forEach(push)
  template.items.forEach((label) => {
    if (customerRequirementRows.length && /商标|品牌|印刷|刻字|包装|托盘/.test(text(label))) return
    push({
      label,
      standard: inspectionStandardValue(label, master, customer, detail.item),
      groupTitle: template.title,
      source: '检验单模板',
    })
  })

  const grouped = new Map<keyof typeof ONLINE_SECTION_TITLES, OnlineGeneratedRow[]>([
    ['appearance', []], ['packaging', []], ['dimension', []], ['test_report', []],
  ])
  generated.forEach((row) => grouped.get(resolveInspectionSection(row))?.push(row))
  const rows: InspectionTemplateRowDto[] = []
  ;([...grouped.entries()] as Array<[keyof typeof ONLINE_SECTION_TITLES, OnlineGeneratedRow[]]>).forEach(([section, sectionRows]) => {
    sectionRows.forEach((row, rowIndex) => {
      const groupTitle = ONLINE_SECTION_TITLES[section]
      const inputMode: InspectionWorkbenchInputMode = section === 'appearance' || section === 'packaging'
        ? 'manual_photo'
        : 'ocr_measurement'
      rows.push({
        row_key: `${template.key}-${groupTitle}-${row.label}-${rowIndex}`,
        group_title: groupTitle,
        display_order: rows.length,
        project: row.label,
        method: row.method,
        standard: row.standard,
        measurement_standards: row.standard ? { 判定标准: row.standard } : {},
        note: '',
        photo_required: inputMode === 'manual_photo',
        input_mode: inputMode,
      })
    })
  })
  return { template, rows }
}

function formalReportVariant(template: OnlineProductInspectionTemplate): FormalReportVariant {
  if (['resin_cutting_disc', 'resin_grinding_disc'].includes(template.key)) return FORMAL_REPORT_VARIANTS.abrasive_wheel
  if (template.key === 'diamond_blade') return FORMAL_REPORT_VARIANTS.diamond_blade
  if (template.key === 'diamond_core_bit') return FORMAL_REPORT_VARIANTS.diamond_core_bit
  if (['diamond_cup_wheel', 'diamond_grinding_block'].includes(template.key)) return FORMAL_REPORT_VARIANTS.diamond_grinding
  if (template.key === 'diamond_segment') return { ...FORMAL_REPORT_VARIANTS.diamond_grinding, title: '金刚石刀头产品检验报告' }
  if (template.key === 'diamond_adapter') return { ...FORMAL_REPORT_VARIANTS.generic, title: '金刚石工具接杆检验报告' }
  if (template.key === 'diamond_polishing_pad') return { ...FORMAL_REPORT_VARIANTS.coated_sheet_disc, title: '金刚石软磨片产品检验报告' }
  if (template.key === 'carbide_saw_blade') return FORMAL_REPORT_VARIANTS.carbide_saw_blade
  if (['standard_drill', 'chisel'].includes(template.key)) return FORMAL_REPORT_VARIANTS.drill_chisel
  if (template.key === 'hole_saw') return FORMAL_REPORT_VARIANTS.hole_saw
  if (template.key === 'tool_accessory') return { ...FORMAL_REPORT_VARIANTS.generic, title: '工具配件检验报告' }
  if (template.key === 'wire_brush') return FORMAL_REPORT_VARIANTS.wire_brush
  if (template.key === 'flap_disc') return FORMAL_REPORT_VARIANTS.coated_flap
  if (template.key === 'coated_belt_roll') return FORMAL_REPORT_VARIANTS.coated_belt_roll
  if (['coated_sheet_disc', 'coated_generic', 'velcro_sanding_disc', 'mesh_sanding_roll', 'backing_pad'].includes(template.key)) {
    return FORMAL_REPORT_VARIANTS.coated_sheet_disc
  }
  return FORMAL_REPORT_VARIANTS.generic
}

const FORMAL_APPEARANCE_STANDARD = '正反面无裂纹、破损、变形；商标无褶皱，孔环无偏移；网片无缺失；商标印刷颜色正确，无偏色、漏印刷'
const FORMAL_PACKAGING_PATTERN = /包装|吸塑|内盒|中盒|外箱|装箱|装盒|条码|标签|标贴|唛头|托盘|缠绕膜|打包带|每盒|每箱/

function formalRowKey(templateKey: string, section: string, label: string): string {
  return `online-formal:${templateKey}:${section}:${canonicalInspectionLabel(label)}`
}

function buildFormalPackagingRows(customer: OnlineCustomerProductDto): Array<{ label: string; standard: string; method: string; aliases: string[] }> {
  const rows: Array<{ label: string; standard: string; method: string; aliases: string[] }> = []
  const seen = new Set<string>()
  const push = (label: string, standard: unknown, method = '核对客户产品资料') => {
    const safeLabel = text(label)
    const safeStandard = safeInspectionText(standard)
    const key = `${safeLabel}-${safeStandard}`
    if (!safeLabel || !safeStandard || seen.has(key)) return
    seen.add(key)
    rows.push({ label: safeLabel, standard: safeStandard, method, aliases: [safeLabel] })
  }
  if (text(customer.packaging_method)) {
    push('包装方式', `客户产品资料库：包装方式：${text(customer.packaging_method)}`)
  }
  parseRequirementPairs(customer.extra_info_text)
    .filter((pair) => FORMAL_PACKAGING_PATTERN.test(pair.label))
    .forEach((pair) => push(
      pair.label,
      `客户产品资料库：${pair.label}：${pair.value}`,
      /数量|每盒|每箱|装箱|装盒/.test(pair.label) ? '计数' : '核对客户产品资料',
    ))
  return rows
}

function formalMeasurementStandards(standard: string, aliases: string[]): Record<string, string> {
  return {
    ...(standard ? { 判定标准: standard } : {}),
    识别别名: aliases.join('|'),
  }
}

function buildOnlineFormalRows(
  detail: OnlineInspectionDetailLike,
  template: OnlineProductInspectionTemplate,
): InspectionTemplateRowDto[] {
  const variant = formalReportVariant(template)
  const master = detail.master_product || {}
  const customer = detail.customer_product || {}
  const rows: InspectionTemplateRowDto[] = []
  const push = (options: {
    section: string
    label: string
    standard: string
    method: string
    aliases: string[]
    inputMode: InspectionWorkbenchInputMode
  }) => {
    rows.push({
      row_key: formalRowKey(template.key, options.section, options.label),
      group_title: options.section,
      display_order: rows.length,
      project: options.label,
      method: options.method,
      standard: options.standard,
      measurement_standards: formalMeasurementStandards(options.standard, options.aliases),
      note: '',
      photo_required: options.inputMode === 'manual_photo',
      input_mode: options.inputMode,
    })
  }

  push({
    section: '产品外观',
    label: '产品外观',
    standard: FORMAL_APPEARANCE_STANDARD,
    method: '目视',
    aliases: ['产品外观', ...variant.appearance.flatMap((row) => [row[0], ...row[2]])],
    inputMode: 'manual_photo',
  })
  buildFormalPackagingRows(customer).forEach((row) => push({
    section: '产品包装',
    label: row.label,
    standard: row.standard,
    method: row.method,
    aliases: row.aliases,
    inputMode: 'manual_photo',
  }))
  variant.dimensions.forEach(([label, aliases, method]) => push({
    section: '产品尺寸',
    label,
    standard: inspectionStandardValue(label, master, customer, detail.item),
    method,
    aliases: [label, ...aliases],
    inputMode: 'ocr_measurement',
  }))
  variant.safety.forEach(([label, standard, method, aliases]) => push({
    section: '产品安全',
    label,
    standard,
    method,
    aliases: [label, ...aliases],
    inputMode: 'ocr_measurement',
  }))
  variant.performance.forEach(([label, standard, method, aliases]) => push({
    section: '产品性能',
    label,
    standard,
    method,
    aliases: [label, ...aliases],
    inputMode: 'ocr_measurement',
  }))
  return rows
}

export function buildOnlineInspectionTemplate(
  detail: OnlineInspectionDetailLike,
  _databaseTemplates: readonly unknown[] = [],
): InspectionTemplateDto {
  const online = buildOnlineWebRows(detail)
  return {
    template_id: `online-report:${online.template.key}`,
    version: 'online-web/QualityInspectionWorkbench/formal-v1',
    columns: ONLINE_COLUMNS.map((column) => ({ ...column })),
    rows: buildOnlineFormalRows(detail, online.template),
  }
}
