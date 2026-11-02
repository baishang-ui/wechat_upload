# 识别记录删除、列表骨架屏与识别进度 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 支持删除本地及服务器识别记录，为采购任务和识别记录列表增加动画骨架屏，并为每张识别队列卡片显示阶段式进度条。

**Architecture:** 后端新增按 `task_id + item_id` 删除检验记录的专用接口，采购质检仅清理该物料检验数据，独立报告删除单物料任务。小程序服务层负责远端删除和关联本地副本清理，页面层维护删除/加载状态；骨架屏和进度条复用当前卡片结构与动画语言。

**Tech Stack:** FastAPI、SQLAlchemy、pytest、微信小程序 TypeScript/WXML/SCSS、Node test runner、tsx。

## Global Constraints

- 保留 `$HOME/WeChatProjects/miniprogram-2` 和 `$HOME/smart_sales_system` 中用户已有未提交修改。
- 未经用户明确要求，不创建提交、不推送代码；每个任务用 `git diff --check` 和聚焦测试替代提交检查点。
- 服务器删除失败时不得删除本地副本。
- 采购质检删除不得删除采购任务、采购物料或同任务下其他物料。
- 骨架屏只在列表为空且正在加载时显示；加载更多不替换已有列表。
- 识别进度是状态映射的阶段进度，不声明为后端真实百分比。

---

### Task 1: 后端按物料删除服务器识别记录

**Files:**
- Create: `$HOME/smart_sales_system/tests/test_quality_inspection_delete_record.py`
- Modify: `$HOME/smart_sales_system/routes/customer_orders.py`

**Interfaces:**
- Produces: `DELETE /customer-orders/api/purchase-orders/quality-inspections/{task_id}/items/{item_id}/record`
- Produces response data: `{ "task_id": number, "item_id": number, "deleted_scope": "record" | "standalone_task" }`

- [ ] **Step 1: Write failing API tests**

Create authenticated TestClient coverage following `tests/test_quality_inspection_standalone_api.py` helpers:

```python
def test_delete_purchase_record_preserves_task_and_other_item(client):
    task, target, untouched = seed_purchase_task_with_two_recorded_items()
    response = client.delete(
        f"/customer-orders/api/purchase-orders/quality-inspections/{task.id}/items/{target.id}/record"
    )
    assert response.status_code == 200
    session = get_session("customer_orders")
    assert session.get(QualityInspectionTask, task.id) is not None
    assert _quality_inspection_item_meta(session.get(QualityInspectionItem, target.id))["historical_inspections"] == []
    assert _quality_inspection_item_meta(session.get(QualityInspectionItem, untouched.id))["historical_inspections"]


def test_delete_single_item_standalone_removes_task_and_item(client):
    task, item = seed_standalone_record()
    response = client.delete(
        f"/customer-orders/api/purchase-orders/quality-inspections/{task.id}/items/{item.id}/record"
    )
    assert response.status_code == 200
    session = get_session("customer_orders")
    assert session.get(QualityInspectionTask, task.id) is None
    assert session.get(QualityInspectionItem, item.id) is None


def test_delete_record_rejects_mismatched_item(client):
    first_task, _ = seed_standalone_record()
    _, second_item = seed_standalone_record()
    response = client.delete(
        f"/customer-orders/api/purchase-orders/quality-inspections/{first_task.id}/items/{second_item.id}/record"
    )
    assert response.status_code == 404
```

Also assert that the history-records endpoint no longer returns the deleted target and that purchase task `signed_date/status` are recalculated from remaining items.

- [ ] **Step 2: Run tests and verify RED**

Run:

```bash
cd $HOME/smart_sales_system
DB_BACKEND=sqlite SESSION_SECRET_KEY=inspection-delete-regression \
$HOME/.hermes/hermes-agent/venv/bin/python -m pytest \
  tests/test_quality_inspection_delete_record.py -q
```

Expected: FAIL because the DELETE route returns 405/404.

- [ ] **Step 3: Add record-state helpers**

Add helpers beside `_quality_inspection_item_signed`:

```python
def _quality_inspection_item_has_record(item: QualityInspectionItem) -> bool:
    meta = _quality_inspection_item_meta(item)
    draft = meta.get("inspection_draft") or {}
    return bool(
        draft.get("records")
        or meta.get("historical_inspections")
        or meta.get("reports")
        or meta.get("signatures")
    )


def _quality_inspection_record_dates(item: QualityInspectionItem) -> list[date]:
    meta = _quality_inspection_item_meta(item)
    values = []
    draft = meta.get("inspection_draft") or {}
    result = draft.get("ai_workbench_result") or {}
    values.append(result.get("inspection_date"))
    values.extend(
        record.get("inspection_date")
        for record in (meta.get("historical_inspections") or [])
        if isinstance(record, dict)
    )
    return [parsed for value in values if (parsed := _parse_date(value))]


def _quality_inspection_recalculate_task(session, task: QualityInspectionTask) -> None:
    items = session.query(QualityInspectionItem).filter(
        QualityInspectionItem.task_id == task.id
    ).all()
    dates = [value for item in items for value in _quality_inspection_record_dates(item)]
    task.signed_date = max(dates, default=None)
    if items and all(_quality_inspection_item_signed(item) for item in items):
        task.status = "passed"
    elif any(_quality_inspection_item_has_record(item) for item in items):
        task.status = "in_progress"
        task.result_summary = None
    else:
        task.status = "pending"
        task.result_summary = None
```

- [ ] **Step 4: Implement the DELETE route**

Add the route near draft save endpoints:

```python
@router.delete("/api/purchase-orders/quality-inspections/{task_id}/items/{item_id}/record")
async def api_delete_quality_inspection_record(request: Request, task_id: int, item_id: int):
    _require_quality_inspection_access(request)
    session = get_session("customer_orders")
    try:
        task = session.query(QualityInspectionTask).filter(
            QualityInspectionTask.id == task_id
        ).first()
        item = session.query(QualityInspectionItem).filter(
            QualityInspectionItem.id == item_id,
            QualityInspectionItem.task_id == task_id,
        ).first()
        if not task or not item:
            raise HTTPException(status_code=404, detail="质检记录不存在")

        item_count = session.query(QualityInspectionItem).filter(
            QualityInspectionItem.task_id == task_id
        ).count()
        if task.source_type == "standalone" and item_count == 1:
            session.delete(item)
            session.delete(task)
            deleted_scope = "standalone_task"
        else:
            meta = _quality_inspection_item_meta(item)
            meta.update({
                "signatures": {},
                "reports": [],
                "latest_report": None,
                "inspection_draft": {"records": []},
                "historical_inspections": [],
            })
            _quality_inspection_set_item_meta(item, meta)
            _quality_inspection_recalculate_task(session, task)
            deleted_scope = "record"
        session.commit()
        return {"success": True, "data": {
            "task_id": task_id,
            "item_id": item_id,
            "deleted_scope": deleted_scope,
        }}
    finally:
        session.close()
```

- [ ] **Step 5: Verify GREEN and regressions**

Run the focused test, then:

```bash
DB_BACKEND=sqlite SESSION_SECRET_KEY=inspection-delete-regression \
$HOME/.hermes/hermes-agent/venv/bin/python -m pytest \
  tests/test_quality_inspection_delete_record.py \
  tests/test_quality_inspection_matched_draft.py \
  tests/test_quality_inspection_standalone_api.py \
  tests/test_quality_inspection_sources_api.py -q
git diff --check
```

Expected: all selected tests pass, exit code 0.

---

### Task 2: 小程序删除服务与关联本地副本清理

**Files:**
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/services/quality-inspection-service.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/services/history-service.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/tests/quality-inspection-service.test.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/tests/history-service.test.ts`

**Interfaces:**
- Produces: `deleteRemoteInspectionRecord(taskId: number, itemId: number, request?: QualityRequest): Promise<DeleteInspectionRecordResult>`
- Produces: `deleteInspectionHistoriesByServerRecord(taskId: number, itemId: number, adapter?: HistoryStorageAdapter): Promise<StoredInspectionRecord[]>`

- [ ] **Step 1: Add failing service tests**

```ts
test('deleteRemoteInspectionRecord uses the item record DELETE endpoint', async () => {
  let options: ServerRequestOptions | undefined
  await deleteRemoteInspectionRecord(12, 34, async (input) => {
    options = input
    return { task_id: 12, item_id: 34, deleted_scope: 'record' }
  })
  assert.deepEqual(options, {
    method: 'DELETE',
    path: '/customer-orders/api/purchase-orders/quality-inspections/12/items/34/record',
  })
})
```

```ts
test('deleteInspectionHistoriesByServerRecord removes all matching local copies and images', async () => {
  const matchingA = { ...createStoredRecord(), id: 'IR-A', taskId: 12, itemId: 34, imagePath: '/a.jpg' }
  const matchingB = { ...createStoredRecord(), id: 'IR-B', taskId: 12, itemId: 34, imagePath: '/b.jpg' }
  const untouched = { ...createStoredRecord(), id: 'IR-C', taskId: 12, itemId: 35 }
  const adapter = createAdapter([matchingA, matchingB, untouched])
  const records = await deleteInspectionHistoriesByServerRecord(12, 34, adapter)
  assert.deepEqual(records.map((item) => item.id), ['IR-C'])
  assert.deepEqual(adapter.removedPaths.sort(), ['/a.jpg', '/b.jpg'])
})
```

- [ ] **Step 2: Run focused tests and verify RED**

```bash
cd $HOME/WeChatProjects/miniprogram-2
npx tsx --test --test-name-pattern='deleteRemoteInspectionRecord|deleteInspectionHistoriesByServerRecord' \
  tests/quality-inspection-service.test.ts tests/history-service.test.ts
```

Expected: FAIL because both functions are missing.

- [ ] **Step 3: Implement remote delete request**

```ts
export interface DeleteInspectionRecordResult {
  task_id: number
  item_id: number
  deleted_scope: 'record' | 'standalone_task'
}

export function deleteRemoteInspectionRecord(
  taskId: number,
  itemId: number,
  request: QualityRequest = serverRequest,
): Promise<DeleteInspectionRecordResult> {
  return request<DeleteInspectionRecordResult>({
    method: 'DELETE',
    path: `/customer-orders/api/purchase-orders/quality-inspections/${taskId}/items/${itemId}/record`,
  })
}
```

- [ ] **Step 4: Implement local deletion by server key**

Load records, partition by exact numeric `taskId/itemId`, persist survivors first, then remove unique non-empty image paths best-effort. Throw `无法删除识别记录，请重试` if storage persistence fails.

- [ ] **Step 5: Verify GREEN**

Run the focused command again and `npm run typecheck`; expected exit code 0.

---

### Task 3: 记录卡片统一删除按钮和页面交互

**Files:**
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.wxml`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.scss`
- Modify: `$HOME/WeChatProjects/miniprogram-2/tests/ui-consistency.test.ts`

**Interfaces:**
- Consumes: Task 2 delete functions.
- Adds page state: `historyDeletingId: string`.
- Adds method: `deleteHistory(event: WechatMiniprogram.TouchEvent): void` handling local and remote cards.

- [ ] **Step 1: Add failing UI structure assertions**

Assert the WXML no longer restricts deletion to `item.origin === 'local'`, includes `loading="{{historyDeletingId === item.id}}"`, uses `catchtap="deleteHistory"`, and includes `.history-delete-button` styles.

- [ ] **Step 2: Run UI test and verify RED**

```bash
npx tsx --test --test-name-pattern='record cards expose server-aware delete controls' tests/ui-consistency.test.ts
```

Expected: FAIL on missing server-aware delete button/loading state.

- [ ] **Step 3: Implement page deletion flow**

In `deleteHistory`:

1. Resolve the selected `HistoryViewItem` and reject duplicate deletion.
2. Show source-aware confirmation text.
3. Set `historyDeletingId`.
4. For local origin, call `deleteInspectionHistory(selected.id)`.
5. For remote origin, require `taskId/itemId`, call `deleteRemoteInspectionRecord`, then `deleteInspectionHistoriesByServerRecord`.
6. Refresh history; for purchase-order remote records also call `loadTasks(true)`.
7. If the open editor points at the deleted local ID or server key, close/reset it.
8. Show success toast; on error show modal; in `finally`, clear `historyDeletingId`.

- [ ] **Step 4: Replace the existing × control**

Render a compact red outlined button for every card:

```xml
<button
  class="history-delete-button"
  data-id="{{item.id}}"
  loading="{{historyDeletingId === item.id}}"
  disabled="{{!!historyDeletingId}}"
  catchtap="deleteHistory"
>删除</button>
```

Keep it outside `.history-main`, preserve the left thumbnail layout, and reserve right padding so card text cannot overlap the button.

- [ ] **Step 5: Verify GREEN**

Run the focused UI test and `npm run typecheck`; expected exit code 0.

---

### Task 4: 采购任务与识别记录动画骨架屏

**Files:**
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.wxml`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.scss`
- Modify: `$HOME/WeChatProjects/miniprogram-2/tests/ui-consistency.test.ts`

**Interfaces:**
- Adds page state: `historyLoading: boolean`.
- Task skeleton condition: `taskLoading && taskItems.length === 0`.
- History skeleton condition: `historyLoading && historyRecords.length === 0`.

- [ ] **Step 1: Add failing skeleton assertions**

Assert WXML contains `task-skeleton-list`, `history-skeleton-list`, three repeated placeholder cards for each, correct loading conditions, and that empty history uses `!historyLoading && historyRecords.length === 0`. Assert SCSS contains `skeleton-card-in` and `skeleton-shimmer` keyframes plus staggered delays.

- [ ] **Step 2: Run UI test and verify RED**

```bash
npx tsx --test --test-name-pattern='task and history lists expose animated skeleton placeholders' tests/ui-consistency.test.ts
```

Expected: FAIL because skeleton structures and history loading state are missing.

- [ ] **Step 3: Maintain history loading state**

Set `historyLoading: true` when `refreshHistory()` starts and set it to false only for the current `historyRequestId` in both success and failure paths. Preserve merged local records; therefore skeleton appears only when there are no local records to show.

- [ ] **Step 4: Add WXML skeleton structures**

Use three task skeleton cards with heading/meta/status blocks and three history skeleton cards with a left thumbnail block and right text/status blocks. Keep the existing task list and history list unchanged when data exists.

- [ ] **Step 5: Add entrance and shimmer styles**

```scss
.skeleton-card {
  opacity: 0;
  animation: skeleton-card-in .36s ease-out both;
}
.skeleton-card:nth-child(2) { animation-delay: .05s; }
.skeleton-card:nth-child(3) { animation-delay: .10s; }
.skeleton-block {
  background: linear-gradient(90deg, #e9eef4 25%, #f7f9fb 50%, #e9eef4 75%);
  background-size: 220% 100%;
  animation: skeleton-shimmer 1.35s .2s ease-in-out infinite;
}
@keyframes skeleton-card-in {
  from { opacity: 0; transform: translateY(18rpx); }
  to { opacity: 1; transform: translateY(0); }
}
@keyframes skeleton-shimmer {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}
```

- [ ] **Step 6: Verify GREEN**

Run the focused UI test and `npm run typecheck`; expected exit code 0.

---

### Task 5: 每张识别队列卡片的阶段式进度条

**Files:**
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/domain/recognition-queue.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.wxml`
- Modify: `$HOME/WeChatProjects/miniprogram-2/miniprogram/pages/index/index.scss`
- Modify: `$HOME/WeChatProjects/miniprogram-2/tests/recognition-queue.test.ts`
- Modify: `$HOME/WeChatProjects/miniprogram-2/tests/ui-consistency.test.ts`

**Interfaces:**
- Produces: `getRecognitionProgress(status: RecognitionQueueStatus): number`.
- Mapping: queued 10, preparing 35, recognizing 70, ready 100, failed 70, skipped 0.

- [ ] **Step 1: Add failing progress mapping test**

```ts
test('recognition progress maps every queue status to a stable stage percentage', () => {
  assert.equal(getRecognitionProgress('queued'), 10)
  assert.equal(getRecognitionProgress('preparing'), 35)
  assert.equal(getRecognitionProgress('recognizing'), 70)
  assert.equal(getRecognitionProgress('ready'), 100)
  assert.equal(getRecognitionProgress('failed'), 70)
  assert.equal(getRecognitionProgress('skipped'), 0)
})
```

Add UI assertions for `queue-progress`, `queue-progress-fill--{{queueItem.status}}`, inline width based on the helper-derived `queueItem.progress`, and percentage text.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npx tsx --test --test-name-pattern='recognition progress|queue progress' \
  tests/recognition-queue.test.ts tests/ui-consistency.test.ts
```

Expected: FAIL because progress mapping and markup do not exist.

- [ ] **Step 3: Add progress to the queue view model**

Add `progress: number` to `RecognitionQueueItem`, initialize it with `getRecognitionProgress('queued')`, and update `updateQueueItem` so a supplied status also refreshes progress:

```ts
export function getRecognitionProgress(status: RecognitionQueueStatus): number {
  return ({ queued: 10, preparing: 35, recognizing: 70, ready: 100, failed: 70, skipped: 0 })[status]
}

export function updateQueueItem(queue, id, update) {
  return queue.map((item) => {
    if (item.id !== id) return item
    const next = { ...item, ...update }
    return { ...next, progress: getRecognitionProgress(next.status) }
  })
}
```

- [ ] **Step 4: Render progress for every queue card**

Below `.queue-item-stage`, render the progress label, percentage, track, and fill. Use `style="width: {{queueItem.progress}}%;"`; failed uses danger color, ready uses success color, recognizing uses a moving highlight and a pseudo-element visually extending activity toward 90% without changing the stated 70% label.

- [ ] **Step 5: Verify GREEN**

Run focused recognition/UI tests and `npm run typecheck`; expected exit code 0.

---

### Task 6: Full verification and protected-diff review

**Files:**
- Verify both repositories only; no new production changes unless a failing check identifies a defect.

- [ ] **Step 1: Run all small-program checks**

```bash
cd $HOME/WeChatProjects/miniprogram-2
npm test
npm run typecheck
git diff --check
```

Expected: all tests pass, TypeScript exits 0, diff check exits 0.

- [ ] **Step 2: Run related backend regression suite**

```bash
cd $HOME/smart_sales_system
DB_BACKEND=sqlite SESSION_SECRET_KEY=inspection-delete-regression \
$HOME/.hermes/hermes-agent/venv/bin/python -m pytest \
  tests/test_quality_inspection_delete_record.py \
  tests/test_quality_inspection_matched_draft.py \
  tests/test_quality_inspection_standalone_api.py \
  tests/test_quality_inspection_sources_api.py -q
git diff --check
```

Expected: all selected tests pass and diff check exits 0.

- [ ] **Step 3: Review changed-file boundaries**

```bash
git -C $HOME/WeChatProjects/miniprogram-2 status --short
git -C $HOME/smart_sales_system status --short
```

Confirm the task did not overwrite the user's existing changes in `miniprogram/config/server.ts`, package files, `project.config.json`, `tests/server-client.test.ts`, or backend `.env.example`.
