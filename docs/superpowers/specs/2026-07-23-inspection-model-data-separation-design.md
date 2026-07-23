# 质检识别模型与业务数据后端分离设计

日期：2026-07-23

## 目标

业务数据、认证和质检记录继续由小程序通过 `SERVER_BASE_URL` 访问共用后端；质检图片识别由共用后端使用独立模型网关配置调用，不再受全局 `LLM_BASE_URL` 或数据库连接配置影响。小程序不直接访问模型网关。

## 调用链

```text
微信小程序
  ├─ 登录/采购待检/历史/保存 → http://localhost:7875 或线上业务后端
  └─ 队列图片上传            → /api/miniprogram/quality-inspections/recognize
                                    └─ 独立模型网关 http://www.binictools.cn:8865/api/llm/v1
```

## 独立配置

后端质检识别服务使用：

```text
MINIPROGRAM_INSPECTION_LLM_BASE_URL=http://www.binictools.cn:8865/api/llm/v1
MINIPROGRAM_INSPECTION_LLM_MODEL=qwen35
MINIPROGRAM_INSPECTION_LLM_API_KEY=
```

默认值指向已验证返回 HTTP 200 的 8865 网关。全局 `LLM_BASE_URL` 保持不变，其他服务器 AI 功能继续使用自己的配置。

## LLM 客户端边界

在 `services/llm_client.py` 新增显式端点调用函数 `call_llm_at_endpoint()`：

- 必须传入 `base_url`。
- 可传独立 `api_key`。
- 复用现有超时、重试、OpenAI 兼容请求和响应解析逻辑。
- 不读取数据库模型配置。
- 不改变现有 `call_llm()` 行为。

质检识别服务改用该函数，避免全局模型配置覆盖专用地址。

## 安全边界

- 小程序源码中不增加模型地址、Token 或 Authorization。
- 图片仍先经过业务后端的 Session 权限、格式、大小和损坏校验。
- 后端继续规范化模型返回的记录和字段置信度。
- 专用 API Key 只允许通过服务器环境变量提供。

## 队列联调

使用两张本地生成的检验报告测试图片执行真实队列测试：

1. 登录本地业务后端。
2. 创建两个前端队列任务。
3. 严格单并发调用本地识别接口。
4. 本地后端分别调用 8865 模型网关。
5. 每个响应必须包含 `record`、`raw_content`、`confidence`。
6. 两个任务都进入 `ready`；记录最大并发数必须为 1。
7. 输出红色和黄色待审核字段数量。

## 验收标准

- 本地业务数据接口保持 HTTP 200。
- 全局 `LLM_BASE_URL` 即使不可用，也不影响质检识别专用模型调用。
- 8865 模型网关实际调用成功。
- 两张图片按顺序完成真实队列识别。
- 小程序测试、类型检查、SCSS 编译通过。
- 后端识别、认证和质检 API 聚焦测试通过。
- 不推送远端，不提交密钥。
