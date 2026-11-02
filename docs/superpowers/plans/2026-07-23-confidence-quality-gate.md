# 质检识别置信度质量门控 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax.

**Goal:** 让失真的模型高分、采购字段不一致和表格逻辑异常正确显示红黄审核提示。

**Architecture:** 扩展小程序纯领域审核模块，接受可选采购预填记录并按优先级生成提示；页面 Worker 传入队列任务的预填数据；后端只收紧模型提示词，不修改响应协议。

**Tech Stack:** TypeScript、node:test、Python、pytest

### Task 1: 前端失败测试
- Modify `tests/recognition-review.test.ts`。
- 覆盖全 1.0 降黄、采购匹配正常、采购不匹配标红、范围外标红、判定存在但测量缺失标黄、可选空字段正常。
- Run: `npx tsx --test tests/recognition-review.test.ts`，Expected: FAIL。

### Task 2: 审核质量门控
- Modify `miniprogram/domain/recognition-review.ts`。
- `buildRecognitionReviewHints(record, confidence, expectedRecord?)`。
- 增加失真分布检测、规范化比较、显式范围解析和缺失测量逻辑。
- Run: `npx tsx --test tests/recognition-review.test.ts && npm run typecheck`。

### Task 3: 页面传入采购预填
- Modify `miniprogram/pages/index/index.ts`。
- Worker 调用 `buildRecognitionReviewHints(recognizedRecord, result.confidence, taskPrefill)`。
- Run: `npm test && npm run typecheck`。

### Task 4: 收紧后端提示词
- Modify `$HOME/smart_sales_system/tests/test_miniprogram_inspection_recognition.py`。
- Modify `$HOME/smart_sales_system/services/miniprogram_inspection_recognition.py`。
- 捕获 prompt 并断言空值 null、禁止统一分数、高于 0.9 条件。
- Run backend focused pytest。

### Task 5: 真实与回归验证
- 清晰图片应触发置信度失真降级。
- 模糊图片应由格式/缺失规则产生风险。
- 小程序全量测试、类型检查、SCSS 编译通过。
- 后端聚焦测试通过，两个仓库 diff 检查通过。
