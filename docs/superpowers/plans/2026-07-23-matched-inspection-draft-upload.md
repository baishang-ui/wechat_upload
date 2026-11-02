# Matched Inspection Draft Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make mini-program purchase-order inspection uploads update only recognized projects that match the selected material’s formal template, while preserving all unmatched database projects and rejecting zero-match uploads.

**Architecture:** Add an explicit `record_merge_mode` request contract. The backend owns product inference, canonical project matching, filtering, and record merging; the mini-program selects `matched_only` only for purchase-order records. Default `replace` keeps Web and standalone behavior unchanged.

**Tech Stack:** FastAPI, Pydantic, SQLAlchemy JSON metadata, pytest, TypeScript, Node test runner through `tsx --test`.

## Global Constraints

- Backend repository: `$HOME/smart_sales_system`, base branch `beta_version`.
- Mini-program repository: `$HOME/WeChatProjects/miniprogram-2`, base branch `main`.
- Purchase-order mini-program sync uses `matched_only`.
- Standalone mini-program sync and Web saves use `replace`.
- Zero matched projects returns HTTP 422 and performs no mutation.
- Preserve unmatched existing database records and formal record definitions.
- No database schema migration.
- Do not modify the React Web workbench.
- Preserve unrelated uncommitted mini-program files.

---

### Task 1: Backend Canonical Project Matching

**Repository:** `$HOME/smart_sales_system`

**Files:**
- Modify: `routes/customer_orders.py:2413-2443,4422-4451`
- Create: `tests/test_quality_inspection_matched_draft.py`

**Interfaces:**
- Produces:
  - `QUALITY_INSPECTION_MATCHED_PROJECTS`
  - `_quality_inspection_canonical_project_label(value) -> str`
  - `_quality_inspection_matched_product_type(item, ai_workbench_result) -> str`
  - `_quality_inspection_merge_matched_records(item, existing_records, incoming_records, ai_workbench_result) -> tuple[list[dict], dict]`

- [ ] **Step 1: Write failing pure helper tests**

Create parametrized tests for canonical labels:

```python
@pytest.mark.parametrize(
    ("source", "expected"),
    [
        ("外径(mm)", "直径"),
        ("外径(㎜)", "直径"),
        ("中孔径", "孔径"),
        ("内孔", "孔径"),
        ("粒度号（#）", "粒度"),
        ("回转测试", "检测转速"),
        ("安全转速", "检测转速"),
        ("砂面颜色", "颜色"),
        ("圆盘孔数", "孔数"),
        ("商标是否贴齐", "商标"),
        ("是否配置垫圈", "垫圈"),
        ("柄直径(㎜)", "柄直径"),
    ],
)
def test_canonical_inspection_project_aliases(source, expected):
    assert _quality_inspection_canonical_project_label(source) == expected
```

Add non-collision assertions:

```python
assert _quality_inspection_canonical_project_label("中孔径") != "孔数"
assert _quality_inspection_canonical_project_label("柄直径") != "直径"
```

Add product inference cases for the six product types, with item material text taking precedence over a conflicting OCR product type.

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
DB_BACKEND=sqlite SESSION_SECRET_KEY=matched-draft-test \
  $HOME/.hermes/hermes-agent/venv/bin/python -m pytest \
  tests/test_quality_inspection_matched_draft.py -q
```

Expected: helper imports fail.

- [ ] **Step 3: Add request mode and matching constants**

Extend `QualityInspectionDraftPayload`:

```python
record_merge_mode: Literal["replace", "matched_only"] = "replace"
```

Add product project sets exactly as approved in the design:

```python
QUALITY_INSPECTION_MATCHED_PROJECTS = {
    "steel_brush": {"材质", "丝径", "直径", "检测转速", "柄直径"},
    "velcro_disc": {"材质", "粒度", "直径", "颜色", "孔数"},
    "resin_wheel": {"直径", "孔径", "厚度", "芯环字样", "端跳", "检测转速", "单重", "切割材料", "切割刀数"},
    "flap_disc": {"材质", "粒度", "直径", "孔径", "叶片宽度", "叶片长度", "检测转速", "商标"},
    "mesh_abrasive": {"材质", "粒度", "直径", "孔径", "颜色"},
    "diamond_blade": {"直径", "孔径", "刀头厚度", "刀头高度", "刀头长度", "垫圈"},
}
```

- [ ] **Step 4: Implement strict canonicalization and product inference**

Canonicalization order must check specific hole-count, handle-diameter, blade-dimension, and hole-diameter aliases before generic diameter aliases. Strip parenthesized units and punctuation, but do not use unrestricted substring matching for final equality.

Product inference uses `material_name + material_code + spec_desc`, covering Chinese and common English terms. Item inference wins; OCR `product_type` is fallback only.

- [ ] **Step 5: Implement the pure matched merge helper**

The helper must:

1. return zero-match stats when product type cannot be resolved or no incoming canonical project is allowed;
2. deduplicate allowed incoming rows by canonical project with last-row-wins;
3. preserve existing record order;
4. replace matching existing records in place;
5. preserve existing formal definition fields;
6. preserve existing row images when incoming images are empty;
7. append allowed projects not already stored;
8. preserve every unmatched existing row;
9. return `mode`, `product_type`, `matched_count`, `ignored_count`, `ignored_projects`, and `preserved_count`.

- [ ] **Step 6: Run helper tests and verify GREEN**

Expected: all pure helper tests pass.

---

### Task 2: Backend Draft Endpoint Integration and Transaction Safety

**Repository:** `$HOME/smart_sales_system`

**Files:**
- Modify: `routes/customer_orders.py:6987-7033`
- Modify: `tests/test_quality_inspection_matched_draft.py`

**Interfaces:**
- Consumes: Task 1 matching helpers.
- Produces: `record_merge_mode=matched_only` endpoint behavior and merge statistics.

- [ ] **Step 1: Write failing endpoint tests**

Create an authenticated test harness that seeds a purchase-order task and a `QualityInspectionItem` with `material_name="金刚石锯片"` and existing metadata records:

- formal `外径(㎜)` with row key/method/standard/images;
- formal `中孔径(㎜)`;
- formal `刀头高度(㎜)`.

Test matched-only payload containing:

- first `外径(mm)` row;
- later duplicate `外径(㎜)` row with different sample values;
- unmatched `客户投诉原因` row.

Assert:

- response 200;
- `matched_count == 1`;
- `ignored_count == 1`;
- ignored project list contains `客户投诉原因`;
- `preserved_count == 2`;
- saved order remains 外径、中孔径、刀头高度;
- saved formal definition fields for 外径 are unchanged;
- sample/decision/note use the later duplicate row;
- existing row images survive when incoming images are empty.

- [ ] **Step 2: Add zero-match rollback test**

Post only unmatched projects with `matched_only`. Assert HTTP 422 with exact Chinese detail and byte-for-byte unchanged item `remark` after the request.

- [ ] **Step 3: Add empty-existing and replace compatibility tests**

- Matched-only with no existing records stores allowed projects and ignores disallowed projects.
- Omitted `record_merge_mode` still replaces all existing records, including arbitrary project names, proving Web compatibility.
- Draft-level images are preserved in matched-only mode when the request sends none.

- [ ] **Step 4: Run endpoint tests and verify RED**

Expected: endpoint currently replaces records and does not return match stats.

- [ ] **Step 5: Integrate matching into the endpoint**

For `matched_only`:

```python
existing_draft = meta.get("inspection_draft") if isinstance(meta.get("inspection_draft"), dict) else {}
existing_records = existing_draft.get("records") if isinstance(existing_draft.get("records"), list) else []
records, merge = _quality_inspection_merge_matched_records(
    item,
    existing_records,
    incoming_records,
    body.ai_workbench_result,
)
if merge["matched_count"] == 0:
    raise HTTPException(
        status_code=422,
        detail="识别结果中没有与所选物料质检项目匹配的数据",
    )
```

Only call `_quality_inspection_set_item_meta()` after this gate.

Preserve existing draft-level images when the request supplies no valid images. For `replace`, retain current behavior.

Return:

```python
"data": {
    "item": _quality_inspection_item_dict(item),
    "merge": merge,
}
```

- [ ] **Step 6: Run backend verification**

Create ignored runtime directories in an isolated worktree if required:

```bash
mkdir -p outputs uploads static/app
```

Run:

```bash
DB_BACKEND=sqlite SESSION_SECRET_KEY=matched-draft-test \
  $HOME/.hermes/hermes-agent/venv/bin/python -m pytest \
  tests/test_quality_inspection_matched_draft.py \
  tests/test_quality_inspection_standalone_api.py \
  tests/test_quality_inspection_sources_api.py -q
```

Expected: all selected tests pass.

- [ ] **Step 7: Commit backend changes**

```bash
git add routes/customer_orders.py tests/test_quality_inspection_matched_draft.py
git commit -m "feat: merge matched inspection draft projects"
```

---

### Task 3: Mini-program Purchase-only Match Mode

**Repository:** `$HOME/WeChatProjects/miniprogram-2`

**Files:**
- Modify: `miniprogram/services/quality-inspection-service.ts:27-47,334-370,476-487`
- Modify: `tests/quality-inspection-service.test.ts:38-60,218-282`

**Interfaces:**
- Produces: `QualityInspectionRecordMergeMode`, `record_merge_mode`, and source-dependent draft serialization.

- [ ] **Step 1: Write failing serialization and sync tests**

Add assertions:

```ts
assert.equal(inspectionRecordToDraft(record).record_merge_mode, 'replace')
assert.equal(
  inspectionRecordToDraft(record, [], 'matched_only').record_merge_mode,
  'matched_only',
)
```

Capture payloads in sync tests:

```ts
let purchasePayload: QualityInspectionDraftPayload | null = null
// purchase_order saveDraft assigns payload
assert.equal(purchasePayload?.record_merge_mode, 'matched_only')

let standalonePayload: QualityInspectionDraftPayload | null = null
// standalone saveDraft assigns payload
assert.equal(standalonePayload?.record_merge_mode, 'replace')
```

Add a purchase-order sync test where `saveDraft` throws a status-422 error with message `识别结果中没有与所选物料质检项目匹配的数据`; assert the returned local state is `failed` and preserves the exact message, task ID, item ID, image, and record.

- [ ] **Step 2: Run focused tests and verify RED**

```bash
npx tsx --test tests/quality-inspection-service.test.ts
```

Expected: merge mode fields are absent.

- [ ] **Step 3: Implement merge mode types and serialization**

Add:

```ts
export type QualityInspectionRecordMergeMode = 'replace' | 'matched_only'
```

Extend payload:

```ts
record_merge_mode: QualityInspectionRecordMergeMode
```

Extend serializer:

```ts
export function inspectionRecordToDraft(
  record: InspectionRecord,
  imageDataUrls: string[] = [],
  recordMergeMode: QualityInspectionRecordMergeMode = 'replace',
): QualityInspectionDraftPayload
```

Set `record_merge_mode: recordMergeMode` in the returned object.

- [ ] **Step 4: Select mode in synchronization**

In `syncStoredInspection`, call:

```ts
inspectionRecordToDraft(
  current.record,
  imageDataUrls,
  current.sourceType === 'purchase_order' ? 'matched_only' : 'replace',
)
```

- [ ] **Step 5: Run mini-program verification**

```bash
npx tsx --test tests/quality-inspection-service.test.ts
npm test
npm run typecheck
git diff --check
```

Expected: all tests pass.

- [ ] **Step 6: Commit mini-program changes**

Stage only the service and its test, preserving current unrelated local modifications:

```bash
git add miniprogram/services/quality-inspection-service.ts tests/quality-inspection-service.test.ts
git commit -m "feat: upload only matched inspection projects"
```

---

### Task 4: Integrate Both Repositories and Verify Local API

**Repositories:** both.

- [ ] **Step 1: Merge backend implementation into `beta_version`**

Run backend focused tests after merge. Do not run API tests from the live checkout when they would create unrelated persistent fixtures; use the isolated worktree for destructive test fixtures and pure/helper tests in the integrated checkout.

- [ ] **Step 2: Merge mini-program implementation into `main`**

Run full mini-program tests and typecheck while preserving unrelated local configuration edits.

- [ ] **Step 3: Read-only inspect a demo purchase item**

Use one `LOCAL-QI-DEMO-` item to confirm material-based product inference will resolve correctly. Do not mutate the demo dataset for this inspection.

- [ ] **Step 4: Local API integration with disposable prefixed fixture**

Create a temporary purchase inspection task/item using a unique `MATCH-UPLOAD-TEST-` prefix inside a transaction or test client. Save existing formal records, POST matched-only OCR rows, verify merge stats and persisted records, test zero-match rollback, then delete only the disposable prefix records.

- [ ] **Step 5: Verify mini-program request shape**

Use the service unit test or a captured local request to confirm purchase-order sync includes:

```json
{"record_merge_mode":"matched_only"}
```

and standalone sync includes `replace`.

- [ ] **Step 6: Final status and evidence**

Report backend and mini-program commits, test commands/results, merge statistics from integration, and confirm no disposable test rows remain.
