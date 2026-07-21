# Inspection JSON Export Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Export one editable inspection report as a stable table-shaped UTF-8 JSON file without implementing network upload.

**Architecture:** A pure domain module builds and serializes the versioned JSON contract. A WeChat-facing service writes and shares the file with one automatic retry, while the page only supplies the current record and manages interaction state.

**Tech Stack:** TypeScript, WeChat Mini Program APIs, SCSS, Node test runner with `tsx`.

## Global Constraints

- Export schema is exactly `inspection-table/v1`.
- Export one inspection record per file.
- Keep ten sample columns and append the judgement row last.
- Do not include image data, local paths, raw model output, or upload logic.
- Future upload encodes the complete UTF-8 JSON text as Base64 outside this feature.

---

### Task 1: Table Export Contract

**Files:**
- Create: `miniprogram/domain/inspection-export.ts`
- Create: `tests/inspection-export.test.ts`

**Interfaces:**
- Consumes: `InspectionRecord` from `miniprogram/domain/inspection-record.ts`.
- Produces: `buildInspectionTableExport(record, options)` and `serializeInspectionTableExport(value)`.

- [ ] **Step 1: Write failing contract tests**

Test fixed columns, snake-case metadata, ordered rows, the final judgement row, nullable `record_id`, and exclusion of internal fields.

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx --test tests/inspection-export.test.ts`

Expected: FAIL because `miniprogram/domain/inspection-export.ts` does not exist.

- [ ] **Step 3: Implement the minimal contract builder**

Create versioned types, fixed column descriptors, row mapping for ten measurements, judgement-row mapping, and two-space JSON serialization.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npx tsx --test tests/inspection-export.test.ts`

Expected: all export contract tests pass.

### Task 2: WeChat File Export Service

**Files:**
- Create: `miniprogram/services/export-service.ts`
- Create: `tests/export-service.test.ts`

**Interfaces:**
- Consumes: serialized JSON and record identifier.
- Produces: `exportInspectionJson(input, adapter?, now?) -> Promise<{ fileName, filePath, delivery }>`.

- [ ] **Step 1: Write failing service tests**

Test deterministic filenames, UTF-8 writes, file sharing, one retry, and unsupported-version errors.

- [ ] **Step 2: Run the test and verify RED**

Run: `npx tsx --test tests/export-service.test.ts`

Expected: FAIL because `miniprogram/services/export-service.ts` does not exist.

- [ ] **Step 3: Implement the adapter-backed service**

Write the JSON to `wx.env.USER_DATA_PATH`, share it through `wx.shareFileMessage`, retry once after 150ms, and reject when file sharing is unsupported.

- [ ] **Step 4: Run the test and verify GREEN**

Run: `npx tsx --test tests/export-service.test.ts`

Expected: all export service tests pass.

### Task 3: Page Export Actions

**Files:**
- Modify: `miniprogram/pages/index/index.ts`
- Modify: `miniprogram/pages/index/index.wxml`
- Modify: `miniprogram/pages/index/index.scss`
- Modify: `README.md`

**Interfaces:**
- Consumes: `exportInspectionJson`, current editable record, saved record id, and history modal record.
- Produces: `exportCurrentRecord()` and `exportHistoryRecord()` page methods.

- [ ] **Step 1: Add page state and handlers**

Track current and history export progress, call the export service, and show success or failure feedback without altering record data.

- [ ] **Step 2: Add export buttons**

Add one full-width JSON export action below the review buttons, one on the success card, and one above the history modal save/cancel row.

- [ ] **Step 3: Add focused styles and documentation**

Keep the existing equal-width primary actions unchanged; style export as a lower-emphasis full-width action and document the schema and Base64 boundary.

- [ ] **Step 4: Run complete verification**

Run: `npm test`

Expected: all tests pass.

Run: `npm run typecheck`

Expected: TypeScript exits with code 0.

Run: `npx sass miniprogram/pages/index/index.scss /tmp/miniprogram-index.css --no-source-map`

Expected: SCSS exits with code 0.

Run: `git diff --check`

Expected: no whitespace errors.
