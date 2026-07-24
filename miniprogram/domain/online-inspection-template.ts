import {
  InspectionTemplateColumnDto,
  InspectionTemplateDto,
  InspectionTemplateRowDto,
  InspectionWorkbenchInputMode,
} from './inspection-workbench'

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
}

interface OnlineCustomerProductDto {
  brand_type?: unknown
  product_trademark?: unknown
  trademark_method?: unknown
  packaging_method?: unknown
  extra_info_text?: unknown
  extra_info_attachments?: unknown[]
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

interface ProductTemplateDefinition {
  key: string
  title: string
  match: string[]
  docNo: string
  items: string[]
}

const PRODUCT_INSPECTION_TEMPLATES: ProductTemplateDefinition[] = [
  { key: 'resin_cutting_disc', title: '树脂切片检验记录单', match: ['树脂切割片', '树脂切片', '切割片'], docNo: 'BSP-QR-ZJ-A07', items: ['外径(㎜)', '中孔径(㎜)', '厚度(㎜)', '芯环字样', '端径跳', '回转', '单重（G）', '测试材料', '刀数'] },
  { key: 'resin_grinding_disc', title: '树脂磨片检验记录单', match: ['树脂磨片', '打磨片', '磨片'], docNo: 'BSP-QR-ZJ-A022', items: ['外径(㎜)', '中孔径(㎜)', '厚度(㎜)', '芯环字样', '端径跳', '回转', '单重(g)', '测试材料', '磨削比'] },
  { key: 'diamond_core_bit', title: '金刚石钻头检验记录单', match: ['金刚石钻头', '金刚石薄壁钻', '薄壁钻', '钎焊钻头', '烧结钻头', '电镀钻头', '激光焊钻', '取芯钻', '空心钻', '内干钻', '干钻', '湿钻', '水钻', '钻筒', '钻头'], docNo: 'BSP-QR-ZJ-A06', items: ['钻头外径(㎜)', '有效工作长度(㎜)', '刀头厚度(㎜)', '刀头高度(㎜)', '刀头数量', '连接螺纹', '颜色/色号'] },
  { key: 'diamond_blade', title: '金刚石锯片检验记录单', match: ['金刚石锯片', '锯片'], docNo: 'BSP-QR-ZJ-A05', items: ['外径(㎜)', '中孔径(㎜)', '刀头厚度(㎜)', '刀头高度(㎜)', '刀头长度(㎜)', '是否配置垫圈'] },
  { key: 'diamond_cup_wheel', title: '金刚石磨轮检验记录单', match: ['金刚石磨轮', '金刚石石雕轮', '磨轮'], docNo: 'BSP-QR-ZJ-A10', items: ['外径(㎜)', '中孔径(㎜)', '厚度(㎜)', '单重(g)', '回转', '磨削材料', '磨削比'] },
  { key: 'diamond_grinding_block', title: '金刚石磨块检验记录单', match: ['金刚石磨块', '磨轮磨块刀头', '磨块'], docNo: 'BSP-QR-ZJ-A10B', items: ['基体长度(㎜)', '基体宽度(㎜)', '刀头长度(㎜)', '刀头厚度(㎜)', '刀头高度(㎜)', '刀头数量', '磨削材料', '磨削比'] },
  { key: 'diamond_segment', title: '金刚石刀头检验记录单', match: ['薄壁钻刀头', '锯片刀头', '磨轮磨块刀头', '金刚石刀头'], docNo: 'BSP-QR-ZJ-A05S', items: ['刀头长度(㎜)', '刀头厚度(㎜)', '刀头高度(㎜)', '弧度/形状', '数量', '结合层', '硬度与切削性能'] },
  { key: 'diamond_adapter', title: '金刚石工具接杆检验记录单', match: ['转换接杆', '加长接杆', '连接接杆', '接杆'], docNo: 'BSP-QR-ZJ-A06A', items: ['总长度(㎜)', '柄径(㎜)', '连接螺纹', '同轴度', '表面处理', '装配适配性'] },
  { key: 'diamond_polishing_pad', title: '金刚石软磨片检验记录单', match: ['金刚石软磨片', '软磨片', '水磨片'], docNo: 'BSP-QR-ZJ-A10S', items: ['外径(㎜)', '厚度(㎜)', '粒度', '背扣', '颜色', '磨削效果', '使用寿命'] },
  { key: 'carbide_saw_blade', title: '硬质合金锯片检验记录单', match: ['硬质合金锯片', 'TCT锯片', '合金锯片'], docNo: 'BSP-QR-ZJ-A11', items: ['外径(㎜)', '孔径(㎜)', '基体厚度(㎜)', '齿宽(㎜)', '齿数', '端跳/径跳', '焊齿强度', '切割性能'] },
  { key: 'standard_drill', title: '钻头检验记录单', match: ['金属钻', '木工钻', '石工钻', '麻花钻', '木钻', '建工钻'], docNo: 'BSP-QR-ZJ-A12', items: ['钻头直径(㎜)', '总长度(㎜)', '工作长度(㎜)', '柄部规格', '刃口/合金头', '同轴度', '钻孔性能'] },
  { key: 'chisel', title: '凿子检验记录单', match: ['石工凿', '尖凿', '扁凿', '凿子'], docNo: 'BSP-QR-ZJ-A13', items: ['总长度(㎜)', '刃宽(㎜)', '柄部规格', '刃口外观', '硬度', '冲击性能'] },
  { key: 'hole_saw', title: '孔锯检验记录单', match: ['双金属孔锯', '高速钢孔锯', 'TCT孔锯', '孔锯'], docNo: 'BSP-QR-ZJ-A14', items: ['外径(㎜)', '有效深度(㎜)', '齿数/齿型', '连接螺纹', '同轴度', '开孔效率', '使用寿命'] },
  { key: 'tool_accessory', title: '工具配件检验记录单', match: ['孔锯配件', '工具配件缓冲垫保护垫', '工具配件手擦板', '工具配件百页轮盖', '工具配件胶带', '包装辅料'], docNo: 'BSP-QR-ZJ-A25', items: ['材质', '关键尺寸', '连接规格', '外观', '装配适配性', '包装标识'] },
  { key: 'flap_disc', title: '百叶轮检验记录单', match: ['百叶轮', '百页轮叶片式', '百页轮层压式', '带柄页轮', '千页轮', '百页轮'], docNo: 'BSP-QR-ZJ-A09', items: ['材质', '粒度号(＃)', '直径(㎜)', '中孔径(㎜)', '叶片宽度(㎜)', '叶片长度(㎜)', '回转测试', '商标是否贴齐'] },
  { key: 'coated_sheet_disc', title: '涂附圆片/张页检验记录单', match: ['张页砂纸', '张页砂布', '纸基涂附产品', '薄膜涂附产品', '布基圆片', '钢纸磨片', '快换碟', '无纺布', '海绵砂', '精抛系列'], docNo: 'BSP-QR-ZJ-A23', items: ['磨料材质', '粒度', '背基材质', '长度', '宽度', '直径', '孔型/孔数', '涂层与粘接', '磨削性能'] },
  { key: 'coated_belt_roll', title: '涂附砂带/大卷检验记录单', match: ['布基砂带', '尼龙砂带', '砂布卷', '涂附大卷系列', '涂附大卷', '砂带'], docNo: 'BSP-QR-ZJ-A24', items: ['磨料材质', '粒度', '背基材质', '宽度', '长度/周长', '接头方式', '边缘质量', '粘接强度', '磨削性能'] },
  { key: 'velcro_sanding_disc', title: '拉绒片检验记录单', match: ['拉绒片', '背绒', '圆片'], docNo: 'BSP-QR-ZJ-A08', items: ['材质', '粒度号（＃）', '直径(㎜)', '砂面颜色', '圆盘孔数'] },
  { key: 'mesh_sanding_roll', title: '网格砂检验记录单', match: ['网格砂'], docNo: 'BSP-QR-ZJ-A20', items: ['材质', '粒度号（＃）', '直径(㎜)', '中孔直径(㎜)', '颜色'] },
  { key: 'wire_brush', title: '钢丝刷检验记录单', match: ['钢丝刷'], docNo: 'BSP-QR-ZJ-A21', items: ['材质', '丝径(㎜)', '直径(㎜)', '转速', '柄直径(㎜)'] },
  { key: 'backing_pad', title: '背盘检验记录单', match: ['背盘'], docNo: 'BSP-QR-ZJ-A22', items: ['材质', '粒度号(＃)', '直径(㎜)', '中孔径(㎜)', '厚度(㎜)', '回转测试', '商标是否贴齐'] },
  { key: 'coated_generic', title: '涂附类通用检验记录单', match: ['涂附磨具', '涂附'], docNo: 'BSP-QR-ZJ-A23G', items: ['磨料材质', '粒度', '背基材质', '关键尺寸', '孔型', '涂层与粘接', '磨削性能'] },
]

const GENERIC_INSPECTION_TEMPLATE: ProductTemplateDefinition = {
  key: 'generic',
  title: '通用来料检验记录单',
  match: [],
  docNo: 'BSP-QR-ZJ',
  items: ['产品外观', '产品尺寸', '产品安全性', '产品性能', '商标和品牌', '印刷壳子要求', '包装要求', '托盘要求'],
}

const SUBCATEGORY_TEMPLATE_KEYS: Record<string, string> = {
  树脂切割片: 'resin_cutting_disc', 树脂切磨片: 'resin_cutting_disc', 树脂砂轮套装: 'resin_cutting_disc',
  树脂打磨片: 'resin_grinding_disc', 磨轮: 'resin_grinding_disc',
  金刚石薄壁钻: 'diamond_core_bit', 金刚石钎焊钻头: 'diamond_core_bit', 金刚石烧结钻头: 'diamond_core_bit', 金刚石电镀钻头: 'diamond_core_bit',
  冷压金刚石锯片: 'diamond_blade', 热压金刚石锯片: 'diamond_blade', 激光焊接金刚石锯片: 'diamond_blade', 电镀金刚石锯片: 'diamond_blade', 高频焊接金刚石锯片: 'diamond_blade', 钎焊金刚石锯片: 'diamond_blade',
  金刚石磨轮: 'diamond_cup_wheel', 金刚石磨块: 'diamond_grinding_block', 金刚石软磨片: 'diamond_polishing_pad', 薄壁钻刀头: 'diamond_segment', 锯片刀头: 'diamond_segment', 磨轮磨块刀头: 'diamond_segment',
  转换接杆: 'diamond_adapter', 加长接杆: 'diamond_adapter', 硬质合金锯片: 'carbide_saw_blade',
  金属钻: 'standard_drill', 木工钻: 'standard_drill', 石工钻: 'standard_drill', 石工凿: 'chisel', 双金属孔锯: 'hole_saw', TCT孔锯: 'hole_saw', 高速钢孔锯: 'hole_saw', 孔锯配件: 'tool_accessory',
  曲丝钢丝刷: 'wire_brush', 扭丝钢丝刷: 'wire_brush', 手柄刷: 'wire_brush', 尼龙丝钢丝刷: 'wire_brush',
  百页轮叶片式: 'flap_disc', 百页轮层压式: 'flap_disc', 带柄页轮: 'flap_disc', 千页轮: 'flap_disc',
  布基砂带: 'coated_belt_roll', 尼龙砂带: 'coated_belt_roll', 砂布卷: 'coated_belt_roll', 涂附大卷系列: 'coated_belt_roll',
  纸基涂附产品: 'coated_sheet_disc', 薄膜涂附产品: 'coated_sheet_disc', 张页砂纸: 'coated_sheet_disc', 张页砂布: 'coated_sheet_disc', 布基圆片: 'coated_sheet_disc', 钢纸磨片: 'coated_sheet_disc', 快换碟: 'coated_sheet_disc', 无纺布: 'coated_sheet_disc', 海绵砂: 'coated_sheet_disc', 精抛系列: 'coated_sheet_disc', 尼龙: 'coated_sheet_disc', 金刚: 'coated_sheet_disc',
  网格砂: 'mesh_sanding_roll', 工具配件背盘: 'backing_pad', 工具配件缓冲垫保护垫: 'tool_accessory', 工具配件手擦板: 'tool_accessory', 工具配件百页轮盖: 'tool_accessory', 工具配件胶带: 'tool_accessory', 包装辅料: 'tool_accessory',
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

function pairValue(pairs: OnlinePairDto[] | undefined, keywords: string[]): string {
  const rows = Array.isArray(pairs) ? pairs : []
  const found = rows.find((row) => {
    const label = text(row.label).toLowerCase()
    return label && keywords.some((keyword) => label.includes(keyword.toLowerCase()))
  })
  return text(found?.value)
}

function findTemplate(master: OnlineMasterProductDto, item: OnlineInspectionItemDto): ProductTemplateDefinition {
  const exactKey = SUBCATEGORY_TEMPLATE_KEYS[text(master.subcategory)]
  const exact = PRODUCT_INSPECTION_TEMPLATES.find((template) => template.key === exactKey)
  if (exact) return exact
  const haystack = [master.category, master.subcategory, master.name, item.material_name, item.spec_desc]
    .map(text)
    .join(' ')
  const matches = PRODUCT_INSPECTION_TEMPLATES.flatMap((template) => template.match
    .filter((keyword) => haystack.includes(keyword))
    .map((keyword) => ({ template, length: keyword.length })))
  matches.sort((left, right) => right.length - left.length)
  return matches[0]?.template || GENERIC_INSPECTION_TEMPLATE
}

function sourceText(master: OnlineMasterProductDto, item: OnlineInspectionItemDto): string {
  return [item.spec_desc, item.material_name, master.name].map(text).filter(Boolean).join(' ')
}

function standardFor(
  label: string,
  master: OnlineMasterProductDto,
  customer: OnlineCustomerProductDto,
  item: OnlineInspectionItemDto,
): string {
  const specPairs = master.spec_pairs || []
  const attrPairs = master.attribute_pairs || []
  const source = sourceText(master, item)
  const drillSize = source.match(/(?:^|\b|[^a-z])D\s*(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*(?:mm|毫米)?/i)
    || source.match(/(\d+(?:\.\d+)?)\s*[xX×*]\s*(\d+(?:\.\d+)?)\s*(?:mm|毫米)/i)
  const thread = source.match(/\b(M\s*\d+(?:\.\d+)?(?:\s*[xX×*]\s*\d+(?:\.\d+)?)?)/i)
  if (/有效工作长度|工作长度|筒体长度/.test(label)) return pairValue(specPairs, ['有效工作长度', '工作长度', '筒体长度', '基体长度', '长度']) || (drillSize?.[2] ? `${drillSize[2]} mm` : '')
  if (/刀头高度/.test(label)) return pairValue(specPairs, ['刀头高度', '高度'])
  if (/刀头厚度|刀头宽度|齿宽/.test(label)) return pairValue(specPairs, ['刀头厚度', '刀头宽度', '齿宽', '厚度'])
  if (/外径|直径/.test(label) && !/中孔|孔径|柄直径|圆盘孔直径/.test(label)) return pairValue(specPairs, ['直径', '外径']) || (drillSize?.[1] ? `${drillSize[1]} mm` : '')
  if (/中孔|孔径/.test(label)) return pairValue(specPairs, ['孔径', '中孔'])
  if (/基体厚度/.test(label)) return pairValue(specPairs, ['基体厚度', '本体厚度', '钢板厚度'])
  if (/厚度/.test(label)) return pairValue(specPairs, ['厚度'])
  if (/刀头长度|叶片长度|基体长度/.test(label)) return pairValue(specPairs, ['刀头长度', '叶片长度', '基体长度', '长度'])
  if (/基体宽度|磨块宽度/.test(label)) return pairValue(specPairs, ['基体宽度', '磨块宽度', '宽度'])
  if (/叶片宽度|刃宽|宽度/.test(label)) return pairValue(specPairs, ['叶片宽度', '刃宽', '宽度'])
  if (/长度|周长|深度/.test(label)) return pairValue(specPairs, ['长度', '周长', '深度'])
  if (/丝径/.test(label)) return pairValue(specPairs, ['丝径']) || pairValue(attrPairs, ['丝径'])
  if (/柄直径|柄径/.test(label)) return pairValue(specPairs, ['柄直径', '柄径'])
  if (/数量|齿数/.test(label)) return pairValue(attrPairs, ['刀头数量', '磨块数量', '齿数', '数量'])
  if (/材质|磨削材料|测试材料/.test(label)) return pairValue(attrPairs, ['磨料', '材质', '应用'])
  if (/粒度/.test(label)) return pairValue(attrPairs, ['粒度'])
  if (/颜色|色号|砂面颜色/.test(label)) return pairValue(attrPairs, ['颜色'])
  if (/回转|转速|安全速度/.test(label)) return pairValue(attrPairs, ['最大转速', '转速', '安全速度', '线速度'])
  if (/商标|品牌|芯环/.test(label)) return [customer.brand_type, customer.product_trademark, customer.trademark_method].map(text).filter(Boolean).join(' / ')
  if (/包装|标签|唛头|托盘/.test(label)) return [customer.packaging_method, customer.extra_info_text].map(text).filter(Boolean).join('；')
  if (/螺纹|连接规格/.test(label)) return pairValue(attrPairs, ['螺纹', '连接规格']) || pairValue(specPairs, ['螺纹', '连接规格']) || text(thread?.[1]).replace(/\s+/g, '').toUpperCase()
  if (/孔数/.test(label)) return pairValue(attrPairs, ['孔数']) || pairValue(specPairs, ['孔数'])
  if (/规格/.test(label)) return text(item.spec_desc)
  return ''
}

function groupFor(label: string): string {
  if (/外观|边缘|变形|起泡|缺失|移位|锈蚀|表面/.test(label)) return '产品外观'
  if (/商标|品牌|包装|吸塑|标签|条码|内盒|外箱|唛头|印刷|刻字|托盘|芯环字样/.test(label)) return '产品包装'
  if (/尺寸|外径|直径|中孔|孔径|厚度|端跳|径跳|长度|高度|宽度|丝径|柄径|柄直径|刀头|深度|周长/.test(label)) return '产品尺寸'
  if (/回转|转速|安全|速度|强化|执行标准|认证|平衡/.test(label)) return '安全性能'
  return '产品性能'
}

function inputModeFor(groupTitle: string): InspectionWorkbenchInputMode {
  if (groupTitle === '产品外观' || groupTitle === '产品包装') return 'manual_photo'
  if (groupTitle === '产品尺寸' || groupTitle === '安全性能') return 'ocr_measurement'
  return 'manual'
}

function methodFor(groupTitle: string, project: string): string {
  if (groupTitle === '产品外观') return '目视检查'
  if (groupTitle === '产品包装') return '核对客户资料'
  if (groupTitle === '产品尺寸') return /厚度|丝径/.test(project) ? '千分尺' : '游标卡尺'
  if (groupTitle === '安全性能') return /转速|回转/.test(project) ? '回转仪' : '按标准测试'
  return '人工 / 性能测试'
}

function defaultRows(customer: OnlineCustomerProductDto, item: OnlineInspectionItemDto): Array<{ project: string; group: string; standard: string }> {
  const packaging = text(customer.packaging_method) || text(item.packaging_method)
  const trademark = [customer.brand_type, customer.product_trademark, customer.trademark_method]
    .map(text)
    .filter(Boolean)
    .join(' / ')
  const packagingDetail = [packaging, customer.extra_info_text].map(text).filter(Boolean).join('；')
  return [
    { project: '产品外观', group: '产品外观', standard: '表面完整、无破损、无锈蚀、无明显变形及其他目视缺陷' },
    { project: '商标和品牌', group: '产品包装', standard: trademark || '与客户确认资料、图稿及样品一致' },
    { project: '包装要求', group: '产品包装', standard: packagingDetail || '包装方式、标签及唛头与客户资料一致' },
  ]
}

function canonicalProject(value: string): string {
  return value.trim().replace(/[（(].*?[）)]/g, '').replace(/\s+/g, '')
}

export function buildOnlineInspectionTemplate(detail: OnlineInspectionDetailLike): InspectionTemplateDto {
  const master = detail.master_product || {}
  const customer = detail.customer_product || {}
  const item = detail.item
  const definition = findTemplate(master, item)
  const sourceRows = [
    ...defaultRows(customer, item),
    ...definition.items.map((project) => ({
      project,
      group: groupFor(project),
      standard: standardFor(project, master, customer, item),
    })),
  ]
  const seen = new Set<string>()
  const groupIndexes = new Map<string, number>()
  const rows: InspectionTemplateRowDto[] = []
  sourceRows.forEach((source) => {
    const identity = `${source.group}:${canonicalProject(source.project)}`
    if (!source.project || seen.has(identity)) return
    seen.add(identity)
    const groupIndex = groupIndexes.get(source.group) || 0
    groupIndexes.set(source.group, groupIndex + 1)
    const inputMode = inputModeFor(source.group)
    rows.push({
      row_key: `${definition.key}-${source.group}-${source.project}-${groupIndex}`,
      group_title: source.group,
      display_order: rows.length,
      project: source.project,
      method: methodFor(source.group, source.project),
      standard: source.standard,
      measurement_standards: source.standard ? { [source.project]: source.standard } : {},
      note: '',
      photo_required: inputMode === 'manual_photo',
      input_mode: inputMode,
    })
  })
  return {
    template_id: definition.docNo,
    version: `online-web/${definition.key}`,
    columns: ONLINE_COLUMNS.map((column) => ({ ...column })),
    rows,
  }
}
