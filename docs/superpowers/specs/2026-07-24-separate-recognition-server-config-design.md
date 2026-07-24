# 识别服务与业务服务地址拆分设计

## 目标

将微信小程序当前共用的服务器地址拆分为两个可独立修改的配置：

1. 业务服务地址：用于登录、账号状态、待检任务、质检记录、草稿保存、历史同步及普通质检图片上传。
2. 识别服务地址：仅用于上传检验报告图片并调用大模型识别代理接口。

拆分后，开发者可以在一个配置文件中分别切换业务后端和识别后端，而无需修改服务实现代码。

## 已确认接口

识别服务器继续提供以下 multipart 图片上传接口：

```text
POST /api/miniprogram/quality-inspections/recognize
```

小程序不直接调用底层大模型网关，不保存模型 API Key、模型令牌或其他服务端凭据。

## 配置设计

在 `miniprogram/config/server.ts` 中提供两个明确命名的地址：

```ts
export const BUSINESS_SERVER_BASE_URL = 'http://localhost:7875'
export const RECOGNITION_SERVER_BASE_URL = 'https://www.binictools.cn:7876'
```

- `BUSINESS_SERVER_BASE_URL` 控制业务请求和普通业务图片上传；初始值沿用当前本地业务后端 `http://localhost:7875`。
- `RECOGNITION_SERVER_BASE_URL` 控制大模型识别图片上传；初始值使用可供手机访问的 HTTPS 识别代理 `https://www.binictools.cn:7876`。
- 超时、Session Cookie 存储键和演示模式配置继续保留在同一文件。
- 地址配置应为协议、域名和可选端口组成的基础地址，不包含接口路径，不以 `/` 结尾。

## 调用边界

### 业务服务

下列调用继续通过默认 `serverRequest` 或 `serverUpload` 访问 `BUSINESS_SERVER_BASE_URL`：

- 登录、读取当前用户和退出登录。
- 待检任务列表、任务详情和产品详情。
- 质检草稿保存、独立质检任务创建和历史同步。
- 质检行图片上传。

### 识别服务

`recognizeInspectionFile` 使用专用识别上传方法访问：

```text
RECOGNITION_SERVER_BASE_URL + /api/miniprogram/quality-inspections/recognize
```

专用方法复用现有 multipart 响应解析、错误转换、上传超时和 Session Cookie 行为，避免重复实现网络协议。保留 Session Cookie 是为了兼容当前识别代理的登录校验；识别地址应配置为可信的自有服务，不能指向不受信任的第三方域名。

## 实现方式

推荐在 `server-client.ts` 中增加明确的识别上传入口，而不是让每个调用者任意传入基础地址：

- `serverRequest`：固定使用业务服务地址。
- `serverUpload`：固定使用业务服务地址。
- `recognitionServerUpload`：固定使用识别服务地址。

内部抽取共用上传实现，统一处理 Cookie、超时、JSON envelope 和错误信息。这样可以防止其他业务接口误用识别地址，同时保持调用点清晰。

## 兼容性与安全

- 不改变现有接口路径和返回结构。
- 不改变图片压缩、识别结果归一化和页面状态流程。
- 不把模型名称、提示词或密钥重新放回小程序。
- 手机预览使用的识别地址必须是微信公众平台已配置的合法 HTTPS `uploadFile` 域名，并使用有效证书。
- 如果两个服务位于不同域名，两个域名都需要按实际调用类型加入微信小程序合法域名配置。

## 测试与验收

自动测试应覆盖：

1. 普通业务请求 URL 使用 `BUSINESS_SERVER_BASE_URL`。
2. 普通业务上传 URL 使用 `BUSINESS_SERVER_BASE_URL`。
3. 大模型识别上传 URL 使用 `RECOGNITION_SERVER_BASE_URL`。
4. 两类上传继续解析 JSON envelope、映射错误并遵守上传超时。
5. TypeScript 类型检查通过。

真机验收步骤：登录并加载待检任务，选择或拍摄检验报告，确认识别上传发往识别地址，同时任务读取和质检记录保存仍发往业务地址。
