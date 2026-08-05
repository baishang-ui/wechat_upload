# Quality Order Online Product Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 质检订单中的任一产品数据保存到共享后端后，异步合并读取该订单的线上紧凑数据，并在订单展开区显示最新统计与图片。

**Architecture:** 继续以 `taskId/itemId` 作为产品草稿的唯一网络边界；产品工作台通过明细接口读取完整线上数据，通过既有草稿接口保存。保存事件交给首页后，首页以 600ms 防抖合并连续事件，并在后台重新读取该 `taskId` 的 `compact=true` 任务快照；同一时间最多一个回读请求在途，请求期间的新事件只形成一次尾部回读。快照按任务 ID 替换列表项，不触发整页任务查询，也不改动其他订单。

**Tech Stack:** 微信小程序、TypeScript 严格模式、WXML、Node.js 内置测试运行器、tsx

## Global Constraints

- 每个产品草稿必须继续写入其原始 `taskId/itemId`，不得以列表索引或 `row_key` 推断产品。
- 列表回显继续使用 `compact=true`，不得将完整 `inspection_draft` 放入首页 `setData`。
- 保存失败不得伪造线上刷新；保存成功但快照回读失败时提示用户下拉刷新。
- 连续保存事件必须合并回读，同一时间最多一个紧凑订单请求在途。
- 不改动识别队列、Session Cookie、同步状态、十样本、正式 `rowKey` 或导出契约。
- 未经用户明确要求不创建提交。

---

### Task 1: 保存后按订单同步线上产品摘要

**Files:**
- Modify: `tests/inspection-workbench-modal.test.ts`
- Modify: `miniprogram/pages/index/index.ts`
- Modify: `README.md`

**Interfaces:**
- Consumes: 组件 `saved` 事件 `{ taskId: number; itemId: number }` 与 `getInspectionTask(taskId, true)`。
- Produces: `onWorkbenchSaved(event)` 将保存事件加入后台防抖队列；订单展开区异步更新 `inspection_summary`、`preview_images`、`preview_thumbnails` 和 `preview_image_count`。

- [x] **Step 1: 写入失败的页面流程测试**

将原“保存后只靠下拉刷新”的断言改为：关闭工作台不刷新；保存事件读取 `taskId/itemId` 后只加入 600ms 后台防抖队列，实际回读调用 `getInspectionTask(target.taskId, true)`，并且不调用整页 `loadTasks()`。

```ts
test('saving a workbench coalesces online compact refreshes in the background', () => {
  const indexTs = source('miniprogram/pages/index/index.ts')
  const savedMethod = indexTs.match(/onWorkbenchSaved\([\s\S]*?\n    \},\n    onHistoryEditorSaved/)?.[0] || ''

  assert.match(savedMethod, /event\.detail\.taskId/)
  assert.match(savedMethod, /event\.detail\.itemId/)
  assert.match(savedMethod, /this\.queueWorkbenchTaskRefresh/)
  assert.doesNotMatch(savedMethod, /getInspectionTask/)
  assert.match(indexTs, /WORKBENCH_REFRESH_DEBOUNCE_MS\s*=\s*600/)
  assert.doesNotMatch(savedMethod, /loadTasks\(/)
})
```

- [x] **Step 2: 运行定向测试并确认失败**

Run: `npx tsx --test tests/inspection-workbench-modal.test.ts`

Expected: FAIL，因为保存事件当前会立即调用线上紧凑任务接口，尚未进行后台防抖合并。

- [x] **Step 3: 实现目标订单的保存后回读**

在首页声明保存事件类型、600ms 防抖计时器、最新目标和在途状态。保存成功事件到达后只排队；防抖结束后异步请求目标订单紧凑快照，同一时间最多一个请求在途，请求期间的新事件只追加一次尾部回读。回读失败时保留现有列表并提示“数据已保存，列表同步失败，请下拉刷新”。

```ts
interface WorkbenchSavedPayload {
  taskId: number
  itemId: number
}

const workbenchRefreshTimers = new WeakMap<object, ReturnType<typeof setTimeout>>()
const workbenchRefreshTargets = new WeakMap<object, WorkbenchSavedPayload>()
const workbenchRefreshInFlight = new WeakSet<object>()
const WORKBENCH_REFRESH_DEBOUNCE_MS = 600

onWorkbenchSaved(
  event: WechatMiniprogram.CustomEvent<WorkbenchSavedPayload>,
) {
  const taskId = Number(event.detail.taskId)
  const itemId = Number(event.detail.itemId)
  if (!taskId || !itemId) return
  this.queueWorkbenchTaskRefresh({ taskId, itemId })
}
```

- [x] **Step 4: 运行定向测试并确认通过**

Run: `npx tsx --test tests/inspection-workbench-modal.test.ts tests/quality-inspection-service.test.ts`

Expected: PASS；紧凑任务接口、图片 URL 归一化、草稿明细读取和保存契约保持绿色。

- [x] **Step 5: 同步当前行为文档**

将 README 中“保存草稿不自动刷新”的描述改为：保存成功后在后台合并回读当前质检订单的紧凑快照，其他列表刷新仍由下拉手势触发；完整草稿仍只在打开具体产品时加载。

- [x] **Step 6: 完整验证与补丁检查**

Run:

```bash
npm test
npm run typecheck
git diff --check
git status --short
```

Expected: 测试与类型检查全部通过，diff 只包含本计划、首页保存后刷新、相应测试和 README 行为说明；微信开发者工具中的真实网络保存与图片回显仍需手工验证。
