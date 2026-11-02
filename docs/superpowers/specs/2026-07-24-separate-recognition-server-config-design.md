# 大模型识别与业务服务配置拆分设计

## 目标

将微信小程序当前共用的服务器配置拆分为两类可独立修改的配置：

1. 业务服务配置：用于登录、账号状态、待检任务、质检记录、草稿保存、历史同步及普通质检图片上传。
2. 大模型识别配置：用于当前阶段由小程序直接调用视觉大模型完成检验报告识别。

拆分后，开发者可以在一个配置文件中分别切换业务后端和大模型地址，无需修改页面或领域逻辑。

## 当前约束

截至 2026 年 7 月 24 日，线上业务服务器尚未提供以下识别代理接口：

```text
POST /api/miniprogram/quality-inspections/recognize
```

因此当前阶段恢复小程序直连大模型的识别方式。待线上识别代理发布后，再将识别实现切回图片上传代理，避免长期在小程序侧保存模型访问配置。

## 配置设计

在 `miniprogram/config/server.ts` 中集中提供：

```ts
export const BUSINESS_SERVER_BASE_URL = 'http://localhost:7875'
export const MODEL_API_URL = 'https://example.invalid/api/llm/v1/chat/completions'
export const MODEL_NAME = 'qwen35'
export const MODEL_TOKEN_STORAGE_KEY = 'llmApiToken'
```

- `BUSINESS_SERVER_BASE_URL`：控制登录、任务、质检记录及业务图片上传。
- `MODEL_API_URL`：当前大模型完整接口地址，包含 `/api/llm/v1/chat/completions` 路径。
- `MODEL_NAME`：发送给兼容 Chat Completions 接口的模型名称。
- `MODEL_TOKEN_STORAGE_KEY`：可选 Bearer Token 在微信本地存储中的键名。
- 请求超时、上传超时、Session Cookie 存储键和演示模式继续保留在同一配置文件中。

## 调用边界

### 业务服务

下列调用通过 `serverRequest` 或 `serverUpload` 访问 `BUSINESS_SERVER_BASE_URL`：

- 登录、读取当前用户和退出登录。
- 待检任务列表、任务详情和产品详情。
- 质检草稿保存、独立质检任务创建和历史同步。
- 质检行图片上传。

### 大模型识别

`recognizeInspection` 执行以下流程：

1. 检查并压缩图片，继续遵守 600 KB 上限。
2. 将图片读取为 Base64，并根据文件扩展名生成 MIME 类型。
3. 使用现有工业检验报告提示词构造多模态 Chat Completions 请求体。
4. 从 `MODEL_TOKEN_STORAGE_KEY` 读取可选令牌，存在时添加 `Authorization: Bearer ...`。
5. 请求完整的 `MODEL_API_URL`，模型字段使用 `MODEL_NAME`。
6. 提取模型返回文本，解析 JSON，归一化为现有 `InspectionRecord`。

识别不再调用当前尚不存在的 `/api/miniprogram/quality-inspections/recognize` 代理接口。

## 兼容性

- 不改变页面调用的 `recognizeInspection(imagePath)` 公共接口。
- 不改变图片压缩、识别结果归一化和页面状态流程。
- 保留当前识别结果需要的 `rawContent`、记录数据和置信度结构；直连模型没有独立置信度时使用现有归一化逻辑生成空置信度数据。
- 不影响质检行普通图片上传，该功能仍走业务服务。
- 业务请求继续携带业务 Session Cookie；模型请求只携带其可选 Bearer Token，不把业务 Session Cookie发送给模型服务。

## 手机预览限制

当前确认的模型地址是 HTTP：

```text
https://example.invalid/api/llm/v1/chat/completions
```

开发者工具关闭合法域名校验后可以用于临时调试，但微信真机预览、体验版和正式版通常要求合法 HTTPS 域名及有效证书。因此，本次配置拆分能够让地址便于独立修改，但如果服务器没有提供 HTTPS，仅靠小程序项目配置不能保证手机端请求成功。后续应为模型服务提供 HTTPS，或优先发布线上 HTTPS 识别代理。

## 后续迁移

线上服务器提供识别代理后：

1. 新增识别代理基础地址配置。
2. 将 `recognizeInspection` 切回 `wx.uploadFile` 调用 `/api/miniprogram/quality-inspections/recognize`。
3. 删除小程序中的模型名称和令牌配置。
4. 在微信公众平台配置识别代理的合法 `uploadFile` 域名并进行真机验收。

## 测试与验收

自动测试覆盖：

1. 普通业务请求和上传 URL 使用 `BUSINESS_SERVER_BASE_URL`。
2. 大模型请求使用 `MODEL_API_URL` 和 `MODEL_NAME`。
3. 模型令牌存在时添加 Bearer Token，不携带业务 Session Cookie。
4. 模型成功结果可以解析并归一化。
5. 非成功状态、空响应和无效 JSON 映射为可读错误。
6. 图片压缩行为保持不变。
7. 完整测试与 TypeScript 类型检查通过。
