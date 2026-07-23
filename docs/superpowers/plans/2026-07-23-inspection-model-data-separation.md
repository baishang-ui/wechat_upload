# 质检识别模型与业务数据后端分离 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让质检队列识别使用独立 8865 模型网关，同时业务数据继续连接本地或线上共用后端。

**Architecture:** 保持小程序只访问业务后端；后端新增显式端点 LLM 调用函数和质检专用环境变量。通过真实两图串行队列脚本验证模型调用与字段置信度。

**Tech Stack:** Python、FastAPI、httpx、pytest、TypeScript、Node.js

## Global Constraints

- 不在小程序中写入模型地址或密钥。
- 不修改现有 `call_llm()` 行为。
- 不修改数据库连接和业务数据 API。
- 专用默认地址为 `http://www.binictools.cn:8865/api/llm/v1`。
- 不提交 API Key，不推送远端。

### Task 1: 添加显式模型端点调用

**Files:**
- Modify: `/Users/landcloud/smart_sales_system/services/llm_client.py`
- Modify: `/Users/landcloud/smart_sales_system/tests/test_miniprogram_inspection_recognition.py`

- [ ] 在后端测试中 monkeypatch `call_llm_at_endpoint`，断言收到专用 `base_url`、模型和超时。
- [ ] 运行测试并确认当前实现失败。
- [ ] 新增 `call_llm_at_endpoint(messages, *, base_url, api_key="", model, ...)`，复用 `_call_chat_completions()`。
- [ ] 运行测试确认通过。

### Task 2: 质检服务使用专用配置

**Files:**
- Modify: `/Users/landcloud/smart_sales_system/services/miniprogram_inspection_recognition.py`
- Modify: `/Users/landcloud/smart_sales_system/.env.example`

- [ ] 定义 `INSPECTION_LLM_BASE_URL`、`INSPECTION_LLM_MODEL`、`INSPECTION_LLM_API_KEY`。
- [ ] 将质检识别改为 `call_llm_at_endpoint()`。
- [ ] 在 `.env.example` 记录三个专用变量，不写入密钥。
- [ ] 运行后端聚焦测试并提交。

### Task 3: 真实两图队列联调

**Files:**
- Create temporary: `/tmp/inspection_queue_live_test.py`

- [ ] 重启本地后端，不依赖全局 `LLM_BASE_URL`。
- [ ] 生成两张小于 600 KB 的检验报告 JPEG。
- [ ] 登录本地后端并获取 Session Cookie。
- [ ] 串行上传两图，记录最大并发数。
- [ ] 断言两次 HTTP 200，响应包含 `record`、`raw_content`、`confidence`。
- [ ] 使用小程序审核提示模块或等价阈值输出红黄字段数量。
- [ ] 运行小程序 72 项以上测试、类型检查和 SCSS 编译。
- [ ] 检查两个仓库 Git 状态，不推送远端。
