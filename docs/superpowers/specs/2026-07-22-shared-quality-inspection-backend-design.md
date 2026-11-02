# 微信小程序共用 Smart Sales System 质检后端设计

日期：2026-07-22

## 1. 背景

微信小程序当前独立完成检验报告图片选择、图片压缩、大模型识别、十列数据校对、本地历史保存和 JSON 导出。它直接调用 `https://example.invalid/api/llm/v1/chat/completions`，但检验记录没有写入业务数据库。

`smart_sales_system` 已有 FastAPI、SQLAlchemy、用户 Session、MySQL 支持和完整质量检验模块。线上 HTTPS 入口为 `https://example.invalid`。该后端已有采购质检任务、明细、草稿、AI 判定、签字、PDF 报告和历史记录接口，适合由微信小程序直接复用。

本次设计同时支持两种业务来源：

1. 采购单下推的待检任务；
2. 小程序现场创建、没有采购单来源的独立检验报告。

小程序使用 `smart_sales_system` 的现有用户名和密码登录。

## 2. 目标

- 小程序只通过 HTTPS 调用 `smart_sales_system`，不直接连接 MySQL。
- MySQL 凭据和大模型密钥只保留在服务器环境变量中。
- 采购质检和独立报告共用一套质检任务、草稿、签字、PDF 和历史能力。
- 小程序断网时继续保存本地草稿，恢复网络后可重试同步。
- Web 端能够查看小程序创建或更新的质检记录。
- 保持现有采购质检接口兼容，不破坏 Web 质检工作台。

## 3. 非目标

- 本期不让微信小程序直接使用 MySQL TCP 协议。
- 本期不引入微信 OpenID 账号绑定；使用现有系统账号密码。
- 本期不重写 Web 端质量检验工作台。
- 本期不迁移已有采购质检记录到新的独立数据体系。
- 本期不把小程序改造成完整的采购订单管理客户端。

## 4. 现有系统结论

### 4.1 小程序

项目路径：`$HOME/WeChatProjects/miniprogram-2`

当前关键能力：

- `miniprogram/services/inspection-service.ts`：压缩图片、调用视觉模型、解析识别结果；
- `miniprogram/domain/inspection-record.ts`：检验报告领域模型和十列测量值；
- `miniprogram/services/history-service.ts`：本地历史记录；
- `miniprogram/pages/index/index.ts`：扫描、校对、历史记录主流程。

当前 `submitInspection()` 只返回本地生成的记录编号，没有服务端持久化。

### 4.2 Smart Sales System

项目路径：`$HOME/smart_sales_system`

后端技术栈：FastAPI + SQLAlchemy。数据库由 `database.py` 根据 `DB_BACKEND` 选择 SQLite、MySQL 或 SQL Server。生产部署应使用 `DB_BACKEND=mysql`。

质量检验模型位于 `models.py`：

- `QualityInspectionTask`
- `QualityInspectionItem`

质量检验接口位于 `routes/customer_orders.py`，注册前缀为 `/customer-orders`。

现有接口包括：

- `GET /customer-orders/api/purchase-orders/quality-inspections`
- `GET /customer-orders/api/purchase-orders/quality-inspections/history-records`
- `GET /customer-orders/api/purchase-orders/quality-inspections/{task_id}`
- `GET /customer-orders/api/purchase-orders/quality-inspections/{task_id}/items/{item_id}`
- `POST /customer-orders/api/purchase-orders/quality-inspections/{task_id}/items/{item_id}/draft`
- `POST /customer-orders/api/purchase-orders/quality-inspections/{task_id}/items/{item_id}/ai-judge`
- `POST /customer-orders/api/purchase-orders/quality-inspections/{task_id}/items/{item_id}/signature`
- `POST /customer-orders/api/purchase-orders/quality-inspections/{task_id}/items/{item_id}/report.pdf`

现有模型强制 `purchase_order_id` 和 `contract_no` 非空，所以尚不能表达独立报告。

## 5. 方案选择

### 5.1 采用方案

扩展现有 `QualityInspectionTask`，让同一模型支持采购质检和独立报告。

原因：

- 最大限度复用现有质检接口和 Web 工作台；
- 避免建立第二套草稿、签字、PDF 和历史逻辑；
- 小程序与 Web 端看到同一份业务数据；
- 迁移范围小于建立全新的通用报告中心。

### 5.2 未采用方案

#### 独立小程序报告表

不会修改采购质检模型，但会重复实现草稿、签字、PDF 和历史逻辑，长期维护成本高。

#### 全新通用报告中心

长期结构更纯粹，但需要迁移现有采购质检工作台和数据，超出本期范围。

## 6. 总体架构

```text
微信小程序
  │ HTTPS + Session Cookie
  ▼
https://example.invalid
smart_sales_system / FastAPI
  ├── 小程序 JSON 认证
  ├── 采购质检任务
  ├── 独立质检任务
  ├── 草稿、签字、历史、PDF
  ├── SQLAlchemy → MySQL
  └── 识别代理 → 8865 大模型服务
```

小程序不保存 MySQL 用户名、MySQL 密码或大模型 API 密钥。

## 7. 后端数据模型

### 7.1 QualityInspectionTask 修改

新增字段：

```text
source_type       String, 非空, 默认 purchase_order, 建索引
client_record_id  String, 可空, 唯一, 建索引
```

字段语义：

- `source_type=purchase_order`：现有采购单下推任务；
- `source_type=standalone`：小程序或 Web 创建的独立报告；
- `client_record_id`：小程序生成的稳定 UUID，用于网络重试幂等；独立报告必填，采购任务为空。

应用层必须校验数据不变量：`purchase_order` 必须关联采购单，`standalone` 不得关联采购单且必须提供 `client_record_id`。

修改现有字段：

```text
purchase_order_id  nullable=False → nullable=True
contract_no        nullable=False → nullable=True
```

保留 `purchase_order_id` 的唯一约束。MySQL 和 SQLite 的唯一索引允许多个 `NULL`，因此多个独立报告不会互相冲突。

### 7.2 QualityInspectionItem

不新增必需字段。独立报告使用：

```text
purchase_order_item_id = NULL
```

其余产品名称、编码、规格、数量和包装字段继续复用。

### 7.3 数据库迁移

迁移必须同时支持 MySQL 和 SQLite：

1. 添加 `source_type`，历史记录回填为 `purchase_order`；
2. 添加 `client_record_id` 及唯一索引；
3. 将 `purchase_order_id` 改为可空；
4. 将 `contract_no` 改为可空；
5. 验证现有唯一索引、外键和历史数据；
6. 提供重复执行安全性，避免服务重启时重复迁移失败。

生产迁移前必须备份 `smart_sales_system` 数据库。

## 8. 认证设计

### 8.1 新增接口

```text
POST /api/miniprogram/auth/login
GET  /api/miniprogram/auth/me
POST /api/miniprogram/auth/logout
```

登录请求使用 JSON：

```json
{
  "username": "existing-user",
  "password": "user-password"
}
```

登录成功：

- 使用现有用户表和密码校验逻辑；
- 校验账号状态；
- 将 `user_id` 和必要的展示信息写入现有 Session；
- 每次访问受保护接口时，根据 `user_id` 重新校验当前账号状态和质量检验权限，避免权限变更后旧 Session 继续生效；
- 返回用户基本信息；
- 通过 HTTPS 返回签名 Session Cookie。

小程序读取 `wx.request` 响应中的 cookies，保存 Session Cookie，并在后续请求的 `Cookie` 请求头中携带。小程序不持久化明文密码。

### 8.2 未登录处理

后端 API 统一返回：

```json
{
  "success": false,
  "error": "未登录"
}
```

状态码为 `401`。小程序清除失效 Cookie 并进入登录页。

### 8.3 权限

小程序账号必须拥有质量检验权限。后端不能只检查“已登录”，还应检查对应权限或允许的角色。权限失败返回 `403`。

## 9. 后端 API

### 9.1 独立报告创建

新增：

```text
POST /customer-orders/api/quality-inspections/standalone
```

请求：

```json
{
  "client_record_id": "550e8400-e29b-41d4-a716-446655440000",
  "customer_name": "客户名称",
  "supplier_name": "供应商名称",
  "inspection_date": "2026-07-22",
  "material_code": "",
  "material_name": "钢丝刷",
  "spec_desc": "产品规格",
  "quantity": 1000,
  "unit": "Pcs",
  "packaging_method": "",
  "notes": ""
}
```

行为：

1. 先按 `client_record_id` 查找已有任务；
2. 已存在且规范化后的创建字段一致时，返回已有任务和明细，不重复创建；
3. 已存在但创建字段不一致时返回 `409`，不覆盖原记录；
4. 不存在时生成 `task_no`；
5. 创建 `source_type=standalone` 的任务；
6. 创建一个不绑定采购明细的质检项目；
7. 返回 `task_id`、`item_id` 和完整任务数据。

### 9.2 列表过滤

扩展现有列表接口：

```text
GET /customer-orders/api/purchase-orders/quality-inspections?source_type=all
GET /customer-orders/api/purchase-orders/quality-inspections?source_type=purchase_order
GET /customer-orders/api/purchase-orders/quality-inspections?source_type=standalone
```

默认 `purchase_order`，保持现有 Web 调用只展示采购质检任务；小程序历史页需要合并两种来源时显式传 `source_type=all`。

### 9.3 图片识别代理

新增：

```text
POST /api/miniprogram/quality-inspections/recognize
```

小程序通过 `wx.uploadFile` 上传压缩图片。后端执行：

1. 校验用户和质量检验权限；
2. 校验 MIME 类型和文件大小；
3. 调用现有大模型客户端访问 8865 模型服务；
4. 校验模型结果是有效 JSON；
5. 返回兼容小程序 `RawApiRecord` 的结构；
6. 记录调用用户、耗时和失败原因，不记录明文密钥。

### 9.4 草稿、签字和 PDF

采购任务和独立报告继续复用现有接口，不新增第二套实现。复用接口中的任务详情、明细、PDF 和产品信息组装逻辑必须允许 `purchase_order_id`、`purchase_order_item_id` 和 `contract_no` 为空，不得无条件解引用采购单数据。

## 10. 小程序数据映射

小程序 `InspectionRecord.rows` 每一行映射到后端 `inspection_records`：

```json
{
  "row_key": "api-row-1",
  "group_title": "产品类型",
  "project": "检验项目",
  "method": "",
  "standard": "检验要求",
  "decision": "OK",
  "sample_data": ["值1", "值2", "值3"],
  "measurement_standards": {
    "规格": "规格或标准值"
  },
  "note": "",
  "ai_result": {},
  "images": []
}
```

完整小程序报告元数据写入现有 `ai_workbench_result`：

```json
{
  "schema_version": "miniprogram-inspection/v1",
  "source": "miniprogram",
  "product_type": "steel_brush",
  "customer": "客户名称",
  "supplier": "供应商名称",
  "trademark": "商标",
  "order_number": "订单号",
  "model": "型号规格",
  "arrival_quantity": "到货数量",
  "inspection_date": "2026-07-22",
  "sample_judgements": ["OK", "OK", "NG"],
  "notes": "备注",
  "reviewer": "审核人",
  "inspector": "检验员"
}
```

这样既能供现有 Web 工作台和 PDF 使用，也能无损恢复小程序特有字段。

## 11. 小程序功能设计

### 11.1 页面状态

主工作区扩展为三个栏目：

```text
扫描识别 | 待检任务 | 历史记录
```

### 11.2 扫描识别

用于独立报告：

1. 拍照或选择图片；
2. 上传到 7876 识别代理；
3. 校对十列数据；
4. 调用独立报告创建接口；
5. 调用现有草稿接口保存检验数据；
6. 本地记录更新为已同步状态。

### 11.3 待检任务

1. 获取 `source_type=purchase_order` 的任务；
2. 支持分页、搜索和状态过滤；
3. 打开任务并选择质检明细；
4. 用后端产品信息预填报告字段；
5. 拍照识别、校对并保存到对应任务明细。

### 11.4 历史记录

历史页合并展示：

- 采购质检记录；
- 独立检验报告；
- 尚未同步的本地报告；
- 同步失败、可重试的报告。

本地同步状态扩展为：

```text
local
syncing
synced
failed
```

服务端标识至少包含：

```text
task_id
item_id
client_record_id
source_type
```

## 12. 请求客户端

小程序新增统一请求层：

```text
miniprogram/config/server.ts
miniprogram/services/server-client.ts
miniprogram/services/auth-service.ts
miniprogram/services/quality-inspection-service.ts
```

基础地址：

```text
https://example.invalid
```

职责：

- 自动携带 Session Cookie；
- JSON 和文件上传统一错误格式；
- 401 清除会话并触发重新登录；
- 业务错误转换为用户可读信息；
- 普通请求和识别请求采用不同超时；
- 不在日志中输出密码、Cookie 或敏感响应。

## 13. 离线与幂等

- 识别完成后先保存本地草稿，再同步服务器；
- 创建独立报告使用稳定的 `client_record_id`；
- 网络失败标记为 `failed`，保留本地图片和数据；
- 用户可手动重试；
- 服务端按 `client_record_id` 返回已有记录，避免重复任务；
- 采购任务草稿保存为覆盖式更新，不重复生成任务。

## 14. 安全整改

上线小程序接口前必须完成：

1. 将 `SessionMiddleware` 密钥移入环境变量；
2. 删除源码中的通用登录密码；
3. 登录接口增加失败次数限制和审计记录；
4. 校验账号状态和质量检验权限；
5. MySQL 凭据仅保存在服务器 `.env`；
6. 大模型密钥仅保存在服务器；
7. 限制图片 MIME 类型、大小和数量；
8. 小程序后台配置 `https://example.invalid` 为 request/uploadFile 合法域名；
9. 生产数据库迁移前备份；
10. 响应和日志中不返回数据库异常细节或敏感配置。

## 15. 错误处理

- `400`：参数或图片格式错误；
- `401`：Session 不存在或失效；
- `403`：账号无质量检验权限；
- `404`：任务或明细不存在；
- `409`：幂等编号冲突且请求内容不一致；
- `413`：图片过大；
- `422`：请求结构校验失败；
- `502`：大模型服务不可用或返回无效数据；
- `500`：内部错误，客户端显示通用提示，服务端记录详细日志。

## 16. 测试策略

### 16.1 后端

- JSON 登录成功、失败、禁用账号和权限不足；
- Session Cookie 可访问现有质检接口；
- MySQL 与 SQLite 模型迁移；
- 采购任务历史数据兼容；
- 独立任务创建与 `client_record_id` 幂等；
- 两种来源的列表过滤；
- 草稿字段映射和完整恢复；
- 图片类型、大小和模型失败处理；
- 硬编码密钥和通用密码移除验证。

### 16.2 小程序

- Cookie 保存、携带、清除和 401 处理；
- 登录表单错误状态；
- 任务列表和详情适配；
- 小程序记录与后端草稿双向转换；
- 独立报告创建幂等；
- 断网保存、失败状态和重试；
- 本地历史数据向新同步状态兼容升级；
- 识别上传超时与错误提示。

### 16.3 集成验证

1. 本地 FastAPI + SQLite 完成自动化集成测试；
2. 本地 FastAPI 切换到测试 MySQL 完成连接和迁移测试；
3. 微信开发者工具连接测试后端；
4. 真机通过 HTTPS 登录、读取任务、识别和保存；
5. Web 质检工作台确认能看到小程序保存的数据；
6. 生产发布前执行只读接口和专用测试记录的冒烟验证。

## 17. 实施边界和仓库保护

实施涉及两个仓库：

- `$HOME/smart_sales_system`
- `$HOME/WeChatProjects/miniprogram-2`

实施开始前必须重新检查两个仓库的工作区状态；如果存在用户未提交修改，应使用隔离工作树或其他不覆盖现有工作区的方式。任何情况下都不得提交、还原或改写用户已有修改。

两个仓库分别测试、分别提交。只有在两侧契约测试通过后才进行联调。

## 18. 验收标准

- 用户能用现有 Smart Sales System 账号登录小程序；
- 小程序不包含 MySQL 密码或模型密钥；
- 用户能查看采购质检任务并保存识别结果；
- 用户能创建没有采购单的独立检验报告；
- 两种报告均能在 Smart Sales System 中查询；
- 网络重试不会创建重复独立任务；
- 本地离线记录不会因同步失败丢失；
- 现有 Web 质检流程和历史采购质检数据不受破坏；
- 后端自动化测试、小程序单元测试和类型检查通过；
- 真机能通过 `https://example.invalid` 完成登录、读取、识别和保存闭环。
