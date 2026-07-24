# 线上检验模板与产品检验工作台设计

日期：2026-07-24  
状态：已确认，待实施

## 1. 背景

当前微信小程序的“采购待检任务”流程在用户选择产品明细后，会把采购信息或已有 `inspection_draft` 转换成通用检验记录，然后返回报告拍摄入口。这个流程无法保证首次检验时生成的条目与线上质检工作台完全一致，也没有针对外观、包装现场照片和尺寸、安全性能质检单识别做职责分离。

本次优化要求：

1. 点击待检产品后，根据线上数据库中的产品检验模板生成条目。
2. 有已有草稿时优先恢复草稿；没有草稿时加载线上模板。
3. 完整保留线上表格的分组、项目、顺序、方法、标准和测量字段。
4. 外观、包装项目可以直接填写并上传照片。
5. 外观、包装照片不限制总数量，可分批添加。
6. 产品尺寸和安全性能根据质检单识别结果自动回填。
7. 未匹配的 OCR 项目不能自动追加到正式线上表格。

## 2. 目标

- 小程序与线上质检工作台使用同一份产品检验模板数据。
- 选择待检产品后直接进入独立的产品检验工作台。
- 线上已有草稿能够无损恢复。
- 外观和包装支持现场填写、拍照、相册添加、多图预览和删除。
- OCR 只负责回填产品尺寸和安全性能，不覆盖人工填写内容。
- 保存后的草稿可以被线上工作台继续查看和编辑。

## 3. 非目标

- 不在小程序端维护第二套硬编码产品模板。
- 不从历史检验记录猜测首次检验产品的标准模板。
- 不允许 OCR 静默新增线上模板不存在的正式行。
- 不重构现有登录、历史记录、独立报告和普通识别队列的全部流程。
- 本期不提供删除或修改线上模板结构的能力。

## 4. 方案选择

采用“任务详情直接返回线上表格模板”的方案。

现有任务详情接口在每个产品明细中返回该产品对应的检验模板。这样用户打开待检任务时，只需一次详情请求，即可获得采购信息、已有草稿和产品模板，避免额外请求造成版本不一致。

未采用的方案：

- 独立模板接口：职责清晰，但多一次请求，并增加加载、失败和版本一致性处理。
- 从历史报告推断模板：无法支持首次检验，且历史数据可能缺项或过期。

## 5. 用户流程

### 5.1 进入工作台

1. 用户进入“采购待检任务”。
2. 用户展开任务并选择具体产品明细。
3. 小程序读取任务详情中的已有草稿和线上模板。
4. 小程序跳转到独立“产品检验”工作台。
5. 工作台展示采购信息和完整检验表格。

### 5.2 数据初始化优先级

```text
已有 inspection_draft
    ↓ 没有
线上 inspection_template
    ↓ 缺失或加载失败
显示明确错误和重新加载入口
```

不得在模板缺失时生成通用十样本假表格，否则会破坏“完整复刻线上表格”的要求。

### 5.3 现场外观和包装检查

1. 检验员展开外观或包装分组。
2. 直接填写判定、备注和可编辑实测值。
3. 对需要照片的项目拍照或从相册批量选择。
4. 微信单次媒体选择数量受平台限制时，可以重复添加。
5. 业务层不设置每行照片总数上限。
6. 检验员可以预览和删除任意单张照片。

### 5.4 质检单识别

1. 检验员点击“拍摄质检单并识别”或“从相册选择质检单”。
2. 复用现有裁切、压缩、上传和识别能力。
3. OCR 返回检验记录、原始文本和置信度。
4. 客户端只将匹配结果合并到产品尺寸和安全性能分组。
5. 外观、包装、人工备注和照片保持不变。
6. 未匹配的识别项目进入“待核对的识别内容”。

### 5.5 保存

1. 照片先上传并获得可持久化服务器地址。
2. 小程序组装完整 `inspection_records`。
3. 继续调用现有草稿保存接口。
4. 保存模板 ID、模板版本、OCR 原始内容和未匹配项。
5. 保存成功后更新本地历史和任务状态。

## 6. 页面设计

### 6.1 页面结构

新增独立产品检验工作台页面，建议路径：

```text
pages/inspection-workbench/inspection-workbench
```

页面从上到下包含：

1. 自定义导航栏和保存状态。
2. 产品信息卡：合同、客户、供应商、物料、规格、数量。
3. 表格来源提示：已有草稿或线上模板，显示模板版本。
4. OCR 操作区：拍摄质检单、相册选择、识别进度、失败重试。
5. 按线上顺序渲染的检验表格。
6. 待核对识别内容区域。
7. 底部固定操作栏：保存草稿、提交或返回。

### 6.2 表格渲染

- 使用横向滚动表格，保持线上列结构。
- 固定“检验项目”列，其他列横向滚动。
- 分组标题按线上 `group_title` 和顺序展示。
- 行顺序严格使用线上 `display_order`，不得按名称二次排序。
- 模板返回的列定义决定显示列、列标题和顺序。
- 照片列展示缩略图列表和添加按钮。
- 表格可以按分组折叠，但折叠不能改变数据顺序。

### 6.3 照片交互

- `photo_required=true` 的行显示醒目的照片入口。
- 模板没有 `photo_required` 字段时，外观、包装分组默认显示照片入口。
- 每次可拍摄一张或从相册批量选择。
- 可以多次添加，业务层不限制照片总数。
- 每张照片维护独立状态：本地、压缩中、上传中、已上传、失败。
- 上传失败只影响当前照片，不清空本行其他照片。
- 保存时如有照片仍在上传，提示等待；如有失败照片，允许重试或删除后保存。

## 7. 数据契约

### 7.1 模板数据

在 `QualityInspectionItemDto` 中增加：

```ts
interface QualityInspectionItemDto {
  // existing fields
  inspection_draft?: QualityInspectionDraftPayload
  inspection_template?: InspectionTemplateDto | null
}

interface InspectionTemplateDto {
  template_id: string
  version: string
  columns: InspectionTemplateColumnDto[]
  rows: InspectionTemplateRowDto[]
}

interface InspectionTemplateColumnDto {
  key: string
  title: string
  display_order: number
  visible: boolean
  width?: number | null
}

interface InspectionTemplateRowDto {
  row_key: string
  group_title: string
  display_order: number
  project: string
  method: string
  standard: string
  measurement_standards: Record<string, string>
  note: string
  photo_required?: boolean | null
  input_mode?: 'manual' | 'manual_photo' | 'ocr_measurement' | null
}
```

`row_key` 必须是线上稳定行标识，不能使用数组下标。

### 7.2 工作台行模型

客户端在模板或草稿上构造工作台模型：

```ts
interface InspectionWorkbenchRow {
  rowKey: string
  groupTitle: string
  displayOrder: number
  project: string
  method: string
  standard: string
  measurements: string[]
  measurementStandards: Record<string, string>
  decision: string
  note: string
  photoRequired: boolean
  inputMode: 'manual' | 'manual_photo' | 'ocr_measurement'
  images: InspectionPhoto[]
}

interface InspectionPhoto {
  id: string
  localPath: string
  remoteUrl: string
  status: 'local' | 'compressing' | 'uploading' | 'uploaded' | 'failed'
  error: string
}
```

### 7.3 草稿元数据

在 `ai_workbench_result` 中保存：

```ts
{
  template_id: string
  template_version: string
  recognition_raw_content: string
  unmatched_recognition_rows: UnmatchedRecognitionRow[]
  // existing inspection metadata
}
```

正式行继续使用现有 `QualityInspectionDraftRecord`，照片服务器地址保存到每行 `images`。

### 7.4 照片上传

照片不能无限堆积为 Base64 后随草稿整体提交。应使用 multipart 文件上传接口，返回服务器文件 ID 或 URL，再把 URL 写入行数据。

建议接口：

```text
POST /api/miniprogram/quality-inspections/images
```

上传字段至少包含：

- `task_id`
- `item_id`
- `row_key`
- `file`

响应至少包含：

```json
{
  "id": "image-id",
  "url": "https://.../inspection-image.jpg"
}
```

如果后端已有通用质检图片上传接口，应直接复用已有接口而不是重复新增。

## 8. 草稿与模板合并

### 8.1 已有草稿优先

存在 `inspection_draft` 时：

1. 用草稿恢复用户数据。
2. 用模板补充列定义、照片要求、输入模式和未保存于草稿的显示元数据。
3. 草稿中的测量值、判定、备注和图片优先。
4. 模板新增行可追加到正确线上位置，保持空值。
5. 模板已删除但草稿仍有的行不进入正式表格，可进入兼容提示区域，避免静默丢失。

### 8.2 新表格

没有草稿时：

1. 按模板创建所有行。
2. 保留线上 `row_key` 和 `display_order`。
3. 初始化空的测量值、判定、备注和图片。
4. 不使用产品类型对应的本地硬编码默认行。

## 9. OCR 合并规则

### 9.1 可回填范围

只允许自动回填以下目标分组：

- 产品尺寸
- 安全性能

分组判断优先使用线上 `input_mode=ocr_measurement`。线上没有输入模式时，再使用规范化后的分组名称白名单。

### 9.2 禁止覆盖范围

OCR 不得覆盖：

- 外观分组
- 包装分组
- 任意行的照片
- 人工备注
- 人工修改后被标记为已确认的字段

### 9.3 匹配优先级

1. `row_key` 精确匹配。
2. 规范化后的 `group_title + project` 精确匹配。
3. 明确维护的项目别名匹配。
4. 其他结果视为未匹配。

规范化可以处理：

- 首尾空白
- 连续空格
- 中英文标点
- 常见单位括号差异
- 已确认的项目名称别名

不得使用低阈值模糊匹配直接写入正式表格。

### 9.4 待核对区域

未匹配项保存：

- OCR 项目名称
- OCR 分组
- 样本值或实测值
- 标准和判定
- 原始文本片段
- 置信度
- 未匹配原因

未匹配项只供检验员查看和后续校对，不自动新增到模板表格。

## 10. 保存策略

继续使用：

```text
POST /customer-orders/api/purchase-orders/quality-inspections/{taskId}/items/{itemId}/draft
```

保存时：

- 提交所有当前模板行及其稳定 `row_key`。
- 照片只提交持久化服务器地址。
- 使用 `record_merge_mode: matched_only`，防止误删线上未知行。
- 同时提交模板版本，后端检测版本冲突。
- 后端发现模板版本不一致时返回明确冲突错误，客户端重新加载并合并，不静默覆盖。

## 11. 状态与容错

### 11.1 页面状态

工作台至少区分：

- 加载任务和模板
- 模板加载失败
- 可编辑
- OCR 图片处理中
- OCR 识别中
- OCR 已完成
- 照片上传中
- 保存中
- 保存成功
- 保存失败

### 11.2 错误处理

- 模板加载失败：显示重试，不生成假表格。
- OCR 失败：保留所有人工数据和照片。
- 部分照片失败：其他照片不受影响，失败项可重试。
- 草稿保存失败：保留本地编辑状态并允许重试。
- 页面存在未保存修改时返回：弹出确认提示。
- Session 失效：沿用现有统一登录处理。

## 12. 客户端改动范围

预计新增：

- `miniprogram/pages/inspection-workbench/*`
- `miniprogram/domain/inspection-template.ts`
- `miniprogram/domain/inspection-workbench.ts`
- 模板恢复与 OCR 合并单元测试
- 照片队列和序列化测试

预计修改：

- `miniprogram/app.json`
- `miniprogram/pages/index/index.ts`
- `miniprogram/pages/index/index.wxml`
- `miniprogram/services/quality-inspection-service.ts`
- 相关类型声明和 UI 一致性测试

## 13. 后端依赖

完整功能依赖线上后端提供：

1. 任务详情中的 `inspection_template`。
2. 稳定 `row_key`、行顺序和列定义。
3. 模板版本。
4. 行级照片上传能力或可复用的现有上传接口。
5. 草稿保存时接受照片 URL 和模板元数据。
6. 可选的模板版本冲突校验。

如果后端暂未上线，客户端应对字段保持可选兼容，但不能假装已经获得线上模板。

## 14. 测试策略

### 14.1 领域测试

- 草稿优先于模板。
- 无草稿时按模板创建全部行。
- 行顺序和列顺序保持线上定义。
- 线上照片标记优先，缺失时外观和包装默认需要照片。
- 多批次照片添加不设置总数上限。
- 删除照片只影响目标照片。
- 序列化时只提交已上传 URL。

### 14.2 OCR 合并测试

- `row_key` 精确匹配优先。
- 分组加项目名称匹配。
- 别名匹配。
- 只回填尺寸和安全性能。
- 不覆盖外观、包装、照片和人工备注。
- 未匹配内容进入待核对区域。
- 重复 OCR 不重复生成正式行。

### 14.3 服务测试

- 正确解析任务详情中的模板。
- 正确调用照片上传接口。
- 正确保存模板 ID、版本、行照片和未匹配项。
- 模板缺失、上传失败和版本冲突返回可读错误。

### 14.4 页面与回归测试

- 点击待检产品进入工作台，而不是普通识别首页。
- 有草稿和无草稿两条路径均可使用。
- 现有独立识别、历史记录、登录和待检列表不回归。
- 微信开发者工具验证横向表格、固定列、照片预览和安全区。

## 15. 验收标准

1. 点击待检产品后可以看到与线上一致的分组、条目、方法、标准和顺序。
2. 有草稿时完整恢复；没有草稿时使用线上模板。
3. 外观和包装可以直接填写。
4. 外观和包装每个条目可以分批添加任意数量照片。
5. 每张照片可以预览、删除和失败重试。
6. 产品尺寸和安全性能可以由质检单识别结果回填。
7. OCR 不覆盖人工外观、包装、备注和照片。
8. 未匹配 OCR 项目不进入正式表格。
9. 保存后线上工作台可以查看相同表格和照片。
10. 再次打开同一产品时可以恢复全部草稿内容。
