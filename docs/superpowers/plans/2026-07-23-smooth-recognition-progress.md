# Accelerated Recognition Progress Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Change each WeChat Mini Program recognition card from a 15-second linear progress animation to a 6-second front-slow, middle/late-fast animation.

**Architecture:** Keep all deterministic timing math in `recognition-queue.ts` and leave the page-owned 300ms timer lifecycle unchanged. Replace the single linear interpolation with piecewise interpolation across five approved checkpoints so timer delays do not alter the six-second wall-clock duration.

**Tech Stack:** WeChat Mini Program, TypeScript, Node test runner through `tsx`.

## Global Constraints

- Default duration is exactly `6000ms`.
- Checkpoints are exactly `0/1500/3000/4500/6000ms → 8/15/32/62/92%`.
- Adjacent checkpoints use linear interpolation and the result is rounded to an integer.
- Real completion immediately reports `100%`; unfinished work remains capped at `92%` after six seconds.
- Do not change request serialization, recognition API calls, or the existing 300ms page timer lifecycle.
- Preserve all unrelated uncommitted changes and do not push.

---

### Task 1: Piecewise recognition progress curve

**Files:**
- Modify: `tests/recognition-queue.test.ts`
- Modify: `miniprogram/domain/recognition-queue.ts`

**Interfaces:**
- Consumes: `getTimedRecognitionProgress(elapsedMs: number, durationMs?: number): number`.
- Produces: `RECOGNITION_PROGRESS_DURATION_MS = 6000` and piecewise output from 8 through 92.

- [ ] **Step 1: Replace the linear checkpoint test with the approved accelerated checkpoints**

```ts
test('timed recognition progress starts slowly and accelerates within six seconds', () => {
  assert.equal(RECOGNITION_PROGRESS_DURATION_MS, 6_000)
  assert.equal(getTimedRecognitionProgress(-1), 8)
  assert.equal(getTimedRecognitionProgress(0), 8)
  assert.equal(getTimedRecognitionProgress(750), 12)
  assert.equal(getTimedRecognitionProgress(1_500), 15)
  assert.equal(getTimedRecognitionProgress(2_250), 24)
  assert.equal(getTimedRecognitionProgress(3_000), 32)
  assert.equal(getTimedRecognitionProgress(3_750), 47)
  assert.equal(getTimedRecognitionProgress(4_500), 62)
  assert.equal(getTimedRecognitionProgress(5_250), 77)
  assert.equal(getTimedRecognitionProgress(6_000), 92)
  assert.equal(getTimedRecognitionProgress(12_000), 92)
})

test('timed recognition progress scales checkpoints for a custom duration', () => {
  assert.equal(getTimedRecognitionProgress(3_000, 12_000), 15)
  assert.equal(getTimedRecognitionProgress(6_000, 12_000), 32)
  assert.equal(getTimedRecognitionProgress(9_000, 12_000), 62)
  assert.equal(getTimedRecognitionProgress(12_000, 12_000), 92)
})
```

- [ ] **Step 2: Run the focused queue test and confirm RED**

Run:

```bash
npx tsx --test tests/recognition-queue.test.ts
```

Expected: FAIL because the existing constant is `15000` and the existing function is linear.

- [ ] **Step 3: Implement the minimal piecewise interpolation**

Replace the duration constant and timed progress function with:

```ts
export const RECOGNITION_PROGRESS_DURATION_MS = 6_000
const RECOGNITION_PROGRESS_START = 8
const RECOGNITION_PROGRESS_CEILING = 92
const RECOGNITION_PROGRESS_CHECKPOINTS = [
  { ratio: 0, progress: RECOGNITION_PROGRESS_START },
  { ratio: 0.25, progress: 15 },
  { ratio: 0.5, progress: 32 },
  { ratio: 0.75, progress: 62 },
  { ratio: 1, progress: RECOGNITION_PROGRESS_CEILING },
] as const

export function getTimedRecognitionProgress(
  elapsedMs: number,
  durationMs = RECOGNITION_PROGRESS_DURATION_MS,
): number {
  const safeDuration = Math.max(1, durationMs)
  const ratio = Math.min(1, Math.max(0, elapsedMs) / safeDuration)

  for (let index = 1; index < RECOGNITION_PROGRESS_CHECKPOINTS.length; index += 1) {
    const previous = RECOGNITION_PROGRESS_CHECKPOINTS[index - 1]
    const next = RECOGNITION_PROGRESS_CHECKPOINTS[index]
    if (ratio > next.ratio) continue
    const segmentRatio = (ratio - previous.ratio) / (next.ratio - previous.ratio)
    return Math.round(
      previous.progress + (next.progress - previous.progress) * segmentRatio,
    )
  }

  return RECOGNITION_PROGRESS_CEILING
}
```

- [ ] **Step 4: Run the focused queue test and confirm GREEN**

Run:

```bash
npx tsx --test tests/recognition-queue.test.ts
```

Expected: all tests in `recognition-queue.test.ts` pass.

### Task 2: Regression verification

**Files:**
- Verify: `miniprogram/pages/index/index.ts`
- Verify: `tests/ui-consistency.test.ts`

**Interfaces:**
- Consumes: the unchanged 300ms timer calling `getTimedRecognitionProgress(Date.now() - recognitionProgressStartedAt)`.
- Produces: no additional interface; confirms timer lifecycle remains compatible with the new curve.

- [ ] **Step 1: Run UI consistency tests**

```bash
npx tsx --test tests/ui-consistency.test.ts
```

Expected: all UI consistency tests pass, including progress timer start/stop/detached cleanup assertions.

- [ ] **Step 2: Run the complete repository tests**

```bash
npm test
```

Expected: all tests pass with zero failures.

- [ ] **Step 3: Run TypeScript validation**

```bash
npm run typecheck
```

Expected: exit code 0.

- [ ] **Step 4: Check whitespace and inspect the final worktree**

```bash
git diff --check
git status --short
git diff -- miniprogram/domain/recognition-queue.ts tests/recognition-queue.test.ts
```

Expected: no whitespace errors; only the intended progress calculation/test changes are added on top of the pre-existing uncommitted work.
