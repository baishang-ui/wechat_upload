# 检验报告识别队列与准确度审核 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在微信小程序中增加本次运行有效的单并发识别队列，并由共用后端返回字段级置信度，在审核表单中使用红色和黄色提示需要人工核对的数据。

**Architecture:** 共用后端继续使用现有同步单图识别接口，在响应中兼容性新增规范化 `confidence`；小程序使用纯领域模块生成审核提示和维护不可变队列，页面只负责串行 Worker、媒体选择和 UI 绑定。识别结果与风险提示保存在内存队列中，保存后沿用现有历史与服务器草稿同步流程。

**Tech Stack:** FastAPI、Python、pytest、微信小程序 TypeScript/WXML/SCSS、Node.js `node:test`、`tsx`

## Global Constraints

- 队列严格单并发，按加入顺序处理；不新增数据库任务表、后台 Worker 或轮询接口。
- 队列最多 10 个未完成任务，仅在本次小程序运行期间有效。
- 红色：分数 `< 0.60` 或确定性格式异常；黄色：`0.60 <= 分数 < 0.80` 或无分数但格式正常；正常：分数 `>= 0.80` 且格式正常。
- 审核某条结果时，队列继续处理后续图片。
- 用户修改风险字段后移除高亮，但保留该字段的原始分数。
- 未审核红色字段保存前二次确认，用户确认后允许保存。
- 保持 `/api/miniprogram/quality-inspections/recognize`、认证、JPEG/PNG 限制和 600 KB 限制不变。
- 不修改当前服务器地址策略，不推送远端。
- 小程序仓库已有未提交的 `miniprogram/config/server.ts`、`package.json`、`tests/server-client.test.ts` 必须保留且不得混入本功能提交。

---

## File Map

### 共用后端 `$HOME/smart_sales_system`

- Modify `services/miniprogram_inspection_recognition.py`: 新旧模型响应解析、置信度规范化和接口返回。
- Modify `tests/test_miniprogram_inspection_recognition.py`: 新格式、旧格式、分数限制和非法分数测试。

### 微信小程序 `$HOME/WeChatProjects/miniprogram-2`

- Create `miniprogram/domain/recognition-review.ts`: 置信度 DTO、格式校验、红黄提示和人工审核状态。
- Create `tests/recognition-review.test.ts`: 阈值、格式覆盖、缺失分数和人工审核测试。
- Create `miniprogram/domain/recognition-queue.ts`: 队列任务、状态转换、容量、统计、重试和删除。
- Create `tests/recognition-queue.test.ts`: FIFO、单活动项、失败不阻塞、重试和采购上下文测试。
- Modify `miniprogram/services/quality-inspection-service.ts`: 扩展识别代理响应的 `confidence` 类型。
- Modify `miniprogram/services/inspection-service.ts`: 将规范化置信度传给页面。
- Modify `tests/inspection-service.test.ts`: 验证新增置信度透传和旧响应兼容。
- Modify `miniprogram/pages/index/index.ts`: 媒体批量加入、串行 Worker、审核任务绑定、风险字段消除和保存确认。
- Modify `miniprogram/pages/index/index.wxml`: 队列控制台、任务卡片、风险摘要和字段红黄样式绑定。
- Modify `miniprogram/pages/index/index.scss`: 队列卡片、状态标签和风险字段样式。
- Modify `tests/ui-consistency.test.ts`: 增加队列与准确度 UI 静态契约。

## Task 1: 后端兼容性返回字段置信度

**Files:**
- Modify: `$HOME/smart_sales_system/tests/test_miniprogram_inspection_recognition.py`
- Modify: `$HOME/smart_sales_system/services/miniprogram_inspection_recognition.py`

**Interfaces:**
- Consumes: `call_llm()` 返回的 JSON 字符串。
- Produces: `recognize_inspection_image() -> {"record": dict, "raw_content": str, "confidence": dict}`。

- [ ] **Step 1: 添加失败测试**

新增测试覆盖：

```python
def test_recognize_returns_normalized_field_confidence(authenticated_client, monkeypatch):
    model_output = {
        "record": {
            "report_title": "钢丝刷检验记录单",
            "customer": "客户A",
            "supplier": "供应商A",
            "model_spec": "100x20",
            "inspection_date": "2026-07-22",
            "items": [{"name": "材质", "measurements": ["1.0"]}],
            "sample_judgements": ["OK"],
        },
        "confidence": {
            "fields": {"customer": 1.2, "supplier": 0.72, "model_spec": -0.2},
            "items": [{"name": 0.9, "measurements": [0.55, "bad"]}],
            "sample_judgements": [0.81],
        },
    }
    # POST 后断言 customer == 1.0、model_spec == 0.0、非法值为 None，数组补齐到 10。
```

并扩展旧格式测试，断言旧纯记录输出仍返回完整 `confidence` 结构，缺少分数为 `None`。

- [ ] **Step 2: 运行后端测试确认失败**

Run:

```bash
cd $HOME/smart_sales_system
SESSION_SECRET_KEY='local-test-session-secret-not-for-production' DB_BACKEND=sqlite \
  $HOME/.hermes/hermes-agent/venv/bin/python -m pytest -q \
  tests/test_miniprogram_inspection_recognition.py
```

Expected: 新增置信度断言失败，既有图片、权限和错误映射测试仍执行。

- [ ] **Step 3: 拆分模型 Schema**

在服务中定义：

```python
_RECORD_SCHEMA = { ...现有记录字段... }
_CONFIDENCE_SCHEMA = {
    "fields": {field: None for field in (...字段名...)},
    "items": [{
        "name": None,
        "standard": None,
        "specification": None,
        "measurements": [None] * 10,
    }],
    "sample_judgements": [None] * 10,
}
_MODEL_RESPONSE_SCHEMA = {
    "record": _RECORD_SCHEMA,
    "confidence": _CONFIDENCE_SCHEMA,
}
```

提示词要求只返回 `{record, confidence}`，每个分数为 `0–1`；无法判断时返回 `null`。

- [ ] **Step 4: 实现兼容解析和规范化**

实现：

```python
def _normalize_score(value):
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    if not math.isfinite(float(value)):
        return None
    return max(0.0, min(1.0, float(value)))


def _parse_model_output(raw_content: str) -> tuple[dict, dict]:
    payload = _parse_json_object(raw_content)
    if isinstance(payload.get("record"), dict):
        record = payload["record"]
        confidence = payload.get("confidence")
    else:
        record = payload
        confidence = None
    _validate_record(record)
    return record, _normalize_confidence(confidence, record)
```

`_normalize_confidence()` 返回固定字段集合；`items` 与记录行数一致；每行测量值和样本判定都补齐为 10 个 `float | None`。

- [ ] **Step 5: 运行后端聚焦测试**

使用 Step 2 命令。

Expected: 全部通过。

- [ ] **Step 6: 提交后端修改**

```bash
git -C $HOME/smart_sales_system add \
  services/miniprogram_inspection_recognition.py \
  tests/test_miniprogram_inspection_recognition.py
git -C $HOME/smart_sales_system commit -m "feat: return inspection field confidence"
```

## Task 2: 小程序字段审核提示领域模块

**Files:**
- Create: `tests/recognition-review.test.ts`
- Create: `miniprogram/domain/recognition-review.ts`

**Interfaces:**
- Consumes: `InspectionRecord` 和后端 `RecognitionConfidencePayload`。
- Produces: `buildRecognitionReviewHints()`、`markReviewHintReviewed()`、`hasUnreviewedDanger()`。

- [ ] **Step 1: 添加失败测试**

测试必须覆盖：

```ts
buildRecognitionReviewHints(record, confidence)
```

- `0.59` 为 `danger`。
- `0.60` 和 `0.79` 为 `warning`。
- `0.80` 为 `normal`。
- 空客户、空供应商、空型号、无效日期和无效数量即使高分也为 `danger`。
- 缺少分数但格式正常为 `warning`。
- 行项目名称为空和非法测量值为 `danger`。
- `markReviewHintReviewed(hints, 'record.customer')` 保留分数并设置 `reviewed=true`。
- 已审核风险不计入 `dangerCount`、`warningCount`，但原始 `level` 不变。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test tests/recognition-review.test.ts`

Expected: 模块不存在或导出不存在。

- [ ] **Step 3: 实现类型和判定函数**

定义：

```ts
export type ReviewRiskLevel = 'normal' | 'warning' | 'danger'
export interface FieldReviewHint {
  score: number | null
  level: ReviewRiskLevel
  reason: string
  reviewed: boolean
  cssClass: string
}
export interface RecognitionReviewHints {
  fields: Record<string, FieldReviewHint>
  rows: Array<{
    item: FieldReviewHint
    requirement: FieldReviewHint
    specification: FieldReviewHint
    measurements: FieldReviewHint[]
  }>
  sampleJudgements: FieldReviewHint[]
  dangerCount: number
  warningCount: number
}
```

格式函数只接受明确规则：日期可由 `Date.parse()` 识别；数量允许数字及常见单位；测量值允许数字、数字范围、`OK`、`NG`、`PASS`、`FAIL` 和空字符串。关键字段和行项目名称不能为空。

- [ ] **Step 4: 运行领域测试**

Run: `npx tsx --test tests/recognition-review.test.ts`

Expected: 全部通过。

- [ ] **Step 5: 提交审核提示模块**

```bash
git add miniprogram/domain/recognition-review.ts tests/recognition-review.test.ts
git commit -m "feat: classify inspection review confidence"
```

## Task 3: 小程序识别队列领域模块

**Files:**
- Create: `tests/recognition-queue.test.ts`
- Create: `miniprogram/domain/recognition-queue.ts`

**Interfaces:**
- Consumes: 图片路径、来源上下文、识别结果和审核提示。
- Produces: 不可变队列函数和 `RecognitionQueueItem`。

- [ ] **Step 1: 添加失败测试**

覆盖：

- `appendRecognitionQueue()` 按顺序追加并最多保留 10 个未完成任务。
- `getNextQueuedItem()` 始终返回首个 `queued`。
- `markQueueItemActive()` 不允许同时产生第二个活动任务。
- 成功、失败和跳过状态转换。
- 失败项不会阻止下一项被选择。
- `retryQueueItem()` 复用原 ID 并清空错误和结果。
- 采购任务的 `taskId`、`itemId` 和 `taskPrefill` 在创建时复制，不受外部对象后续修改影响。
- `getQueueStats()` 正确统计 active、queued、ready、failed。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test tests/recognition-queue.test.ts`

Expected: 模块不存在或导出不存在。

- [ ] **Step 3: 实现队列纯函数**

至少导出：

```ts
createRecognitionQueueItem()
appendRecognitionQueue()
getNextQueuedItem()
updateQueueItem()
markQueueItemActive()
completeQueueItem()
failQueueItem()
requestQueueItemSkip()
retryQueueItem()
removeQueueItem()
getQueueStats()
```

队列函数不得访问 `wx`、网络或定时器。

- [ ] **Step 4: 运行队列测试**

Run: `npx tsx --test tests/recognition-queue.test.ts`

Expected: 全部通过。

- [ ] **Step 5: 提交队列模块**

```bash
git add miniprogram/domain/recognition-queue.ts tests/recognition-queue.test.ts
git commit -m "feat: add inspection recognition queue domain"
```

## Task 4: 扩展小程序识别服务返回置信度

**Files:**
- Modify: `miniprogram/services/quality-inspection-service.ts`
- Modify: `miniprogram/services/inspection-service.ts`
- Modify: `tests/inspection-service.test.ts`

**Interfaces:**
- Consumes: 后端新增的 `confidence` JSON。
- Produces: `RecognizeInspectionResult.confidence`。

- [ ] **Step 1: 扩展失败测试**

将模拟上传响应加入 `confidence`，断言：

```ts
assert.equal(result.confidence.fields.customer, 0.95)
assert.equal(result.confidence.items[0].measurements[0], 0.55)
```

另加旧响应测试，断言缺少 `confidence` 时返回空但结构稳定的 payload，不抛错。

- [ ] **Step 2: 运行测试确认失败**

Run: `npx tsx --test tests/inspection-service.test.ts`

Expected: `RecognizeInspectionResult` 没有 `confidence`。

- [ ] **Step 3: 扩展代理和服务类型**

在 `RecognitionProxyResult` 增加可选 `confidence?: RecognitionConfidencePayload`，在 `RecognizeInspectionResult` 增加必选 `confidence`，通过 `normalizeRecognitionConfidence()` 生成稳定结构。

- [ ] **Step 4: 运行服务测试和类型检查**

Run: `npx tsx --test tests/inspection-service.test.ts && npm run typecheck`

Expected: 全部通过。

- [ ] **Step 5: 提交服务修改**

```bash
git add miniprogram/services/quality-inspection-service.ts \
  miniprogram/services/inspection-service.ts tests/inspection-service.test.ts
git commit -m "feat: consume inspection confidence response"
```

## Task 5: 集成页面串行 Worker 与队列控制台

**Files:**
- Modify: `tests/ui-consistency.test.ts`
- Modify: `miniprogram/pages/index/index.ts`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.scss`

**Interfaces:**
- Consumes: Tasks 2–4 的队列、提示和服务结果。
- Produces: 可添加多图、后台连续处理、待审核结果列表和风险表单。

- [ ] **Step 1: 添加 UI 静态契约测试**

断言 WXML 包含：

```text
recognition-queue-summary
recognition-queue-list
recognition-queue-item
queue-add-camera
queue-add-album
review-risk-summary
is-confidence-danger
is-confidence-warning
```

断言旧的独占式 `screen === 'recognizing'` 块被移除。

- [ ] **Step 2: 运行 UI 契约确认失败**

Run: `npx tsx --test tests/ui-consistency.test.ts`

Expected: 新队列类名和风险类名缺失。

- [ ] **Step 3: 替换页面状态**

在 `data` 中增加：

```ts
recognitionQueue: [] as RecognitionQueueItem[],
recognitionQueueStats: emptyQueueStats(),
activeRecognitionQueueId: '',
reviewQueueItemId: '',
reviewHints: createEmptyReviewHints(),
```

保留 `screen: 'capture' | 'review' | 'success'`，移除单任务 `recognitionRequestId` 和独占 `recognizing` 状态。

- [ ] **Step 4: 实现媒体加入和串行 Worker**

- 相机 `count: 1`。
- 相册 `count: Math.min(9, 10 - unfinishedCount)`。
- `enqueueRecognitionFiles()` 为每张图片复制当前采购来源上下文。
- `runRecognitionQueue()` 在有活动任务时直接返回；否则选首个 `queued`，调用 `recognizeInspection()`；无论成功失败都在 `finally` 中清除活动 ID 并调度下一项。
- 结果预填只使用该队列项保存的 `taskPrefill`。
- 失败任务保留并显示重试；不会停止后续调度。

- [ ] **Step 5: 实现审核任务绑定**

`openQueueReview(event)` 从 `ready` 项载入图片、记录、原始文本和审核提示。现有字段修改方法同步调用 `markReviewHintReviewed()`：

```text
record.<field>
rows.<rowIndex>.<field>
rows.<rowIndex>.measurements.<measurementIndex>
sampleJudgements.<sampleIndex>
```

返回队列时把当前记录和提示写回对应队列项。

- [ ] **Step 6: 实现保存前红色提示确认**

`submitRecord()` 在校验必填字段前后保持现有逻辑；若 `hasUnreviewedDanger(reviewHints)`，先调用 `wx.showModal()`，只有用户确认才继续原保存 Promise。保存成功后按 `reviewQueueItemId` 移除队列项，并继续使用现有历史同步。

- [ ] **Step 7: 实现队列与风险 UI**

Capture 区域保留拍照入口并增加队列摘要和列表。Review 区域增加风险摘要；固定字段、表格字段和判定单元格绑定 `cssClass`。SCSS 定义：

```scss
.is-confidence-danger { background: #fff0f1; border-color: #e35b67; }
.is-confidence-warning { background: #fff8df; border-color: #e2b63f; }
```

风险已审核后不再绑定这些类。

- [ ] **Step 8: 运行小程序完整测试**

Run:

```bash
npm test
npm run typecheck
npx --yes sass@1.77.8 miniprogram/pages/index/index.scss /tmp/miniprogram-index-queue.css --no-source-map
git diff --check
```

Expected: 全部测试通过、TypeScript 无错误、SCSS 编译成功、diff 检查无输出。

- [ ] **Step 9: 提交页面集成**

```bash
git add miniprogram/pages/index/index.ts miniprogram/pages/index/index.wxml \
  miniprogram/pages/index/index.scss tests/ui-consistency.test.ts
git commit -m "feat: run inspection recognition queue in background"
```

## Task 6: 本地两端联调与完成检查

**Files:**
- Verify only unless测试发现明确缺陷。

- [ ] **Step 1: 运行后端聚焦测试**

```bash
cd $HOME/smart_sales_system
SESSION_SECRET_KEY='local-test-session-secret-not-for-production' DB_BACKEND=sqlite \
  $HOME/.hermes/hermes-agent/venv/bin/python -m pytest -q \
  tests/test_miniprogram_inspection_recognition.py \
  tests/test_miniprogram_auth_api.py \
  tests/test_quality_inspection_standalone_api.py
```

Expected: 全部通过。

- [ ] **Step 2: 运行小程序最终验证**

```bash
cd $HOME/WeChatProjects/miniprogram-2
npm test
npm run typecheck
npx --yes sass@1.77.8 miniprogram/pages/login/login.scss /tmp/miniprogram-login-queue-final.css --no-source-map
npx --yes sass@1.77.8 miniprogram/pages/index/index.scss /tmp/miniprogram-index-queue-final.css --no-source-map
git diff --check
```

Expected: 全部通过。

- [ ] **Step 3: 启动或复用本地后端并验证响应**

POST 一张有效 JPEG 到本地 `/api/miniprogram/quality-inspections/recognize`，确认 HTTP 200 且响应同时包含 `record`、`raw_content`、`confidence`。模型服务不可用时使用后端测试中的 monkeypatch 作为确定性证据，不把外部模型故障误判为队列代码故障。

- [ ] **Step 4: 微信开发者工具手工验收**

检查：

1. 第一张识别时可继续添加第二张。
2. 队列按顺序自动处理。
3. 审核第一张时第二张继续识别。
4. 失败项可重试且不阻塞后续项。
5. 红色、黄色、正常字段样式正确。
6. 修改风险字段后高亮消失。
7. 未审核红色字段保存前出现确认弹窗。
8. 采购待检来源没有串单。

- [ ] **Step 5: 检查 Git 边界**

```bash
git -C $HOME/WeChatProjects/miniprogram-2 status --short
git -C $HOME/smart_sales_system status --short
```

Expected: 小程序仅保留计划开始前已有的三个未提交修改；后端工作树干净。不推送远端。
