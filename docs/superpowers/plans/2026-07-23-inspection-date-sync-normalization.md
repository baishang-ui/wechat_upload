# Inspection Date Sync Normalization Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Allow existing and future locally recognized inspection records with dotted, slashed, or Chinese dates to synchronize using canonical `YYYY-MM-DD` backend values.

**Architecture:** Add one pure calendar-date normalizer to the inspection-record domain and reuse it in validation and both outbound serialization boundaries. Keep local stored/displayed values unchanged so existing failed records can retry without a storage migration.

**Tech Stack:** TypeScript 5.5, Node test runner through `tsx --test`, WeChat Mini Program APIs.

## Global Constraints

- Support `YYYY-MM-DD`, `YYYY.M.D`, `YYYY/M/D`, and `YYYY年M月D日` inputs.
- Convert supported dates to zero-padded `YYYY-MM-DD`.
- Reject invalid calendar dates locally.
- Do not change the backend schema.
- Do not migrate or rewrite saved local history records.
- Do not modify existing unrelated changes in `miniprogram/config/server.ts`, `package.json`, or `tests/server-client.test.ts`.

---

### Task 1: Pure Inspection Date Normalization and Validation

**Files:**
- Modify: `miniprogram/domain/inspection-record.ts:66-86,236-250`
- Test: `tests/inspection-record.test.ts:6-13,59-63`

**Interfaces:**
- Consumes: raw inspection date strings from OCR and user edits.
- Produces: `normalizeInspectionDate(value: string): string`, returning canonical `YYYY-MM-DD` or `''` when unsupported/invalid.

- [ ] **Step 1: Write failing normalizer and validation tests**

Add `normalizeInspectionDate` to the import list and append:

```ts
test('normalizeInspectionDate canonicalizes supported OCR date forms', () => {
  assert.equal(normalizeInspectionDate('2016-6-24'), '2016-06-24')
  assert.equal(normalizeInspectionDate('2016.6.24'), '2016-06-24')
  assert.equal(normalizeInspectionDate('2016/6/24'), '2016-06-24')
  assert.equal(normalizeInspectionDate('2016年6月24日'), '2016-06-24')
})

test('normalizeInspectionDate rejects unsupported and impossible dates', () => {
  assert.equal(normalizeInspectionDate('2026-02-30'), '')
  assert.equal(normalizeInspectionDate('2016-6/24'), '')
  assert.equal(normalizeInspectionDate('not-a-date'), '')
})

test('validateRecord reports a non-empty invalid inspection date', () => {
  const record = createCompleteRecord()
  assert.deepEqual(
    validateRecord({ ...record, inspectionDate: '2026-02-30' }),
    ['检验日期格式（YYYY-MM-DD）'],
  )
})
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx tsx --test tests/inspection-record.test.ts
```

Expected: compilation/test failure because `normalizeInspectionDate` is not exported and invalid non-empty dates are currently accepted.

- [ ] **Step 3: Implement the pure normalizer and validation rule**

Add after `asString`:

```ts
export function normalizeInspectionDate(value: string): string {
  const text = asString(value)
  const separated = text.match(/^(\d{4})([-./])(\d{1,2})\2(\d{1,2})$/)
  const chinese = text.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日?$/)
  const year = Number(separated?.[1] ?? chinese?.[1])
  const month = Number(separated?.[3] ?? chinese?.[2])
  const day = Number(separated?.[4] ?? chinese?.[3])
  if (!year || !month || !day || month > 12) return ''
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const daysInMonth = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (day > daysInMonth[month - 1]) return ''
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}
```

Extend `validateRecord` after missing required fields are collected:

```ts
if (record.inspectionDate.trim() && !normalizeInspectionDate(record.inspectionDate)) {
  missing.push('检验日期格式（YYYY-MM-DD）')
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx tsx --test tests/inspection-record.test.ts
```

Expected: all inspection-record tests pass.

- [ ] **Step 5: Commit the domain behavior**

```bash
git add miniprogram/domain/inspection-record.ts tests/inspection-record.test.ts
git commit -m "fix: validate inspection dates before sync"
```

---

### Task 2: Normalize Both Database-Bound Date Values

**Files:**
- Modify: `miniprogram/services/quality-inspection-service.ts:3-10,326-361,547-569`
- Test: `tests/quality-inspection-service.test.ts:38-56,96-119`

**Interfaces:**
- Consumes: `normalizeInspectionDate(value: string): string` from Task 1.
- Produces: canonical `inspection_date` values in `inspectionRecordToDraft()` and `createStandaloneInspection()`.

- [ ] **Step 1: Write failing outbound serialization tests**

In the draft serialization test, create a dotted-date record and assert the metadata value:

```ts
const record = {
  ...createCompleteRecord(),
  inspectionDate: '2016.6.24',
}
const draft = inspectionRecordToDraft(record)
assert.equal(draft.ai_workbench_result.inspection_date, '2016-06-24')
```

In the standalone creation test, pass the same dotted date and assert:

```ts
const record = {
  ...createCompleteRecord(),
  inspectionDate: '2016.6.24',
}
await createStandaloneInspection(
  '550e8400-e29b-41d4-a716-446655440000',
  record,
  request,
)
assert.equal(
  (calls[0].data as Record<string, unknown>).inspection_date,
  '2016-06-24',
)
```

- [ ] **Step 2: Run focused tests and verify RED**

Run:

```bash
npx tsx --test tests/quality-inspection-service.test.ts
```

Expected: both new assertions fail because the service currently sends `2016.6.24` unchanged.

- [ ] **Step 3: Normalize at both outbound boundaries**

Import the helper:

```ts
import {
  InspectionRecord,
  Judgement,
  normalizeInspectionDate,
  normalizeTenValues,
  PRODUCT_OPTIONS,
  ProductType,
  RawApiRecord,
} from '../domain/inspection-record'
```

Change draft metadata:

```ts
inspection_date: normalizeInspectionDate(record.inspectionDate),
```

Change standalone creation payload:

```ts
inspection_date: normalizeInspectionDate(record.inspectionDate),
```

Validation already prevents empty normalized values from normal UI submission; existing valid dotted local records now serialize canonically on retry.

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx tsx --test tests/inspection-record.test.ts tests/quality-inspection-service.test.ts
```

Expected: all focused tests pass.

- [ ] **Step 5: Commit the API-boundary fix**

```bash
git add miniprogram/services/quality-inspection-service.ts tests/quality-inspection-service.test.ts
git commit -m "fix: normalize inspection dates for backend sync"
```

---

### Task 3: Full Verification

**Files:**
- Verify only; no planned production changes.

**Interfaces:**
- Consumes: completed Tasks 1 and 2.
- Produces: test and typecheck evidence that the fix does not regress unrelated mini-program behavior.

- [ ] **Step 1: Run the complete test suite**

Run:

```bash
npm test
```

Expected: every test passes with zero failures.

- [ ] **Step 2: Run TypeScript type checking**

Run:

```bash
npm run typecheck
```

Expected: exit code 0 with no TypeScript errors.

- [ ] **Step 3: Confirm only intended files changed**

Run:

```bash
git status --short
git diff HEAD~2 -- miniprogram/domain/inspection-record.ts miniprogram/services/quality-inspection-service.ts tests/inspection-record.test.ts tests/quality-inspection-service.test.ts
```

Expected: the implementation touches only the two domain/service files and their two tests; pre-existing unrelated working-tree changes remain unstaged.
