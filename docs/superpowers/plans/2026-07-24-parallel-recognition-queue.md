# Parallel Recognition Queue Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reduce the total completion time for multiple Mini Program inspection images by running at most two recognition requests concurrently.

**Architecture:** Move the concurrency limit and queue-slot claiming into pure functions in `recognition-queue.ts`, so queue behavior is deterministically testable. Refactor `pages/index/index.ts` from one global active task/timer to a slot-filling dispatcher and per-card timer maps; each request only cleans up its own progress state and then fills the newly released slot.

**Tech Stack:** WeChat Mini Program, TypeScript, Node test runner through `tsx`.

## Global Constraints

- The maximum recognition concurrency is exactly `2`.
- Continue calling the existing single-image endpoint `POST /api/miniprogram/quality-inspections/recognize`; do not add a batch endpoint or change request payloads.
- Keep `SERVER_UPLOAD_TIMEOUT_MS` at `120000ms`.
- Keep the existing 6-second, front-slow/middle-and-late-fast progress curve and its 92% unfinished ceiling.
- A task in `preparing` or `recognizing` counts as active; no more than two may be active at once.
- Completion, failure, retry, or skip of one item must not stop progress for any other active item.
- Preserve existing recognition result normalization, purchase-order prefill merging, review, saving, deleting, and skip semantics.
- Do not stage or overwrite pre-existing unrelated modifications in `miniprogram/app.json`, navigation-bar files, type declarations, style tokens, or their tests.

---

### Task 1: Add deterministic two-slot queue claiming

**Files:**
- Modify: `tests/recognition-queue.test.ts`
- Modify: `miniprogram/domain/recognition-queue.ts`

**Interfaces:**
- Produces: `MAX_CONCURRENT_RECOGNITIONS: number` with the value `2`.
- Produces: `claimQueuedRecognitionItems(queue: RecognitionQueueItem[], maxConcurrent?: number): { queue: RecognitionQueueItem[]; claimed: RecognitionQueueItem[] }`.
- Changes: `markQueueItemActive(queue, id, maxConcurrent?)` so it rejects a claim only after the active-item count reaches `maxConcurrent`, rather than after the first active item.
- Consumed by Task 2: the page dispatcher receives the atomically claimed queue and the IDs that must start network work.

- [ ] **Step 1: Replace the single-active test with an explicit two-slot failing test**

In `tests/recognition-queue.test.ts`, import `MAX_CONCURRENT_RECOGNITIONS` and `claimQueuedRecognitionItems`, then replace the test named `queue selects the first queued item and allows only one active item` with:

```ts
test('queue claims the first two queued items and leaves later items waiting', () => {
  const queue = [item('first', 1), item('second', 2), item('third', 3)]
  const claimed = claimQueuedRecognitionItems(queue)

  assert.equal(MAX_CONCURRENT_RECOGNITIONS, 2)
  assert.deepEqual(claimed.claimed.map((entry) => entry.id), ['first', 'second'])
  assert.deepEqual(
    claimed.queue.map((entry) => entry.status),
    ['preparing', 'preparing', 'queued'],
  )
  assert.equal(getQueueStats(claimed.queue).active, 2)
})

test('queue fills exactly one released recognition slot', () => {
  const initial = claimQueuedRecognitionItems([
    item('first', 1),
    item('second', 2),
    item('third', 3),
  ])
  const released = failQueueItem(initial.queue, 'first', 'network')
  const replenished = claimQueuedRecognitionItems(released)

  assert.deepEqual(replenished.claimed.map((entry) => entry.id), ['third'])
  assert.deepEqual(
    replenished.queue.map((entry) => entry.status),
    ['failed', 'preparing', 'preparing'],
  )
})

test('markQueueItemActive respects a configurable concurrency cap', () => {
  const queue = [item('first', 1), item('second', 2)]
  const first = markQueueItemActive(queue, 'first', 1)
  const blocked = markQueueItemActive(first, 'second', 1)

  assert.deepEqual(blocked.map((entry) => entry.status), ['preparing', 'queued'])
})
```

- [ ] **Step 2: Run the focused domain tests and verify RED**

Run:

```bash
npx tsx --test tests/recognition-queue.test.ts
```

Expected: FAIL because `MAX_CONCURRENT_RECOGNITIONS` and `claimQueuedRecognitionItems` do not exist, and the existing `markQueueItemActive` rejects the second active item.

- [ ] **Step 3: Implement the queue concurrency API**

In `miniprogram/domain/recognition-queue.ts`, add the constant immediately after `MAX_RECOGNITION_QUEUE_SIZE`:

```ts
export const MAX_RECOGNITION_QUEUE_SIZE = 10
export const MAX_CONCURRENT_RECOGNITIONS = 2
```

Replace `hasActiveItem()` and `markQueueItemActive()` with the following functions. Do not change the `preparing` stage text or progress initialization:

```ts
function getActiveRecognitionCount(queue: RecognitionQueueItem[]): number {
  return queue.filter((item) => (
    item.status === 'preparing' || item.status === 'recognizing'
  )).length
}

export function markQueueItemActive(
  queue: RecognitionQueueItem[],
  id: string,
  maxConcurrent = MAX_CONCURRENT_RECOGNITIONS,
): RecognitionQueueItem[] {
  const selected = queue.find((item) => item.id === id)
  if (
    !selected
    || selected.status !== 'queued'
    || getActiveRecognitionCount(queue) >= Math.max(1, maxConcurrent)
  ) {
    return queue
  }
  return updateQueueItem(queue, id, {
    status: 'preparing',
    stage: '正在处理图片',
    error: '',
    skipRequested: false,
  })
}

export interface ClaimedRecognitionQueueItems {
  queue: RecognitionQueueItem[]
  claimed: RecognitionQueueItem[]
}

export function claimQueuedRecognitionItems(
  queue: RecognitionQueueItem[],
  maxConcurrent = MAX_CONCURRENT_RECOGNITIONS,
): ClaimedRecognitionQueueItems {
  const safeMaxConcurrent = Math.max(1, maxConcurrent)
  let nextQueue = queue
  const claimed: RecognitionQueueItem[] = []

  while (getActiveRecognitionCount(nextQueue) < safeMaxConcurrent) {
    const next = getNextQueuedItem(nextQueue)
    if (!next) break
    nextQueue = markQueueItemActive(nextQueue, next.id, safeMaxConcurrent)
    const active = nextQueue.find((item) => item.id === next.id)
    if (!active || active.status !== 'preparing') break
    claimed.push(active)
  }

  return { queue: nextQueue, claimed }
}
```

- [ ] **Step 4: Run focused tests and verify GREEN**

Run:

```bash
npx tsx --test tests/recognition-queue.test.ts
```

Expected: all queue tests pass, including the two new slot-claiming tests and existing 6-second progress tests.

- [ ] **Step 5: Commit the isolated domain change**

```bash
git add miniprogram/domain/recognition-queue.ts tests/recognition-queue.test.ts
git commit -m "feat: add two-slot recognition queue"
```

Expected: the commit contains only the queue-domain implementation and its tests.

### Task 2: Dispatch two requests and track progress per card

**Files:**
- Modify: `tests/ui-consistency.test.ts`
- Modify: `miniprogram/pages/index/index.ts`

**Interfaces:**
- Consumes: `MAX_CONCURRENT_RECOGNITIONS` and `claimQueuedRecognitionItems()` from Task 1.
- Produces: `runRecognitionQueue()` that fills all currently available slots, and `startQueueRecognition(id: string)` that owns one request lifecycle.
- Produces: `startRecognitionProgress(id: string)`, `stopRecognitionProgress(id: string)`, and `stopAllRecognitionProgress()` based on per-ID timer maps.
- Removes: the single-item `activeRecognitionQueueId`, `recognitionProgressTimer`, `recognitionProgressStartedAt`, and `recognitionProgressItemId` flow.

- [ ] **Step 1: Update the static page-contract test before implementation**

In the `recognition cards advance progress on a 300ms wall-clock timer while a request is active` test in `tests/ui-consistency.test.ts`, replace the single-timer assertions with:

```ts
assert.match(page, /const recognitionProgressTimers = new Map<string, ReturnType<typeof setInterval>>\(\)/)
assert.match(page, /const recognitionProgressStartedAt = new Map<string, number>\(\)/)
assert.match(page, /stopRecognitionProgress\(id: string\)/)
assert.match(page, /stopAllRecognitionProgress\(\)/)
assert.match(page, /this\.stopAllRecognitionProgress\(\)/)
assert.match(page, /MAX_CONCURRENT_RECOGNITIONS/)
assert.match(page, /claimQueuedRecognitionItems\(this\.data\.recognitionQueue\)/)
assert.match(page, /claimed\.claimed\.forEach\(\(item\) => this\.startQueueRecognition\(item\.id\)\)/)
assert.match(page, /this\.stopRecognitionProgress\(next\.id\)/)
assert.doesNotMatch(page, /activeRecognitionQueueId/)
```

Remove assertions that require `this.startRecognitionProgress(next.id)`, a parameterless `stopRecognitionProgress()`, or compare `id` with `activeRecognitionQueueId`.

- [ ] **Step 2: Run the focused UI contract test and verify RED**

Run:

```bash
npx tsx --test --test-name-pattern="recognition cards advance progress" tests/ui-consistency.test.ts
```

Expected: FAIL because the page still declares one timer and `activeRecognitionQueueId`.

- [ ] **Step 3: Replace global recognition progress state with per-item maps**

At module scope in `miniprogram/pages/index/index.ts`, keep `RECOGNITION_PROGRESS_TICK_MS = 300`, then replace the three singleton variables with:

```ts
const recognitionProgressTimers = new Map<string, ReturnType<typeof setInterval>>()
const recognitionProgressStartedAt = new Map<string, number>()
```

Remove `activeRecognitionQueueId` from `data`.

Replace `stopRecognitionProgress()` and `startRecognitionProgress()` with:

```ts
stopRecognitionProgress(id: string) {
  const timer = recognitionProgressTimers.get(id)
  if (timer !== undefined) clearInterval(timer)
  recognitionProgressTimers.delete(id)
  recognitionProgressStartedAt.delete(id)
},
stopAllRecognitionProgress() {
  recognitionProgressTimers.forEach((timer) => clearInterval(timer))
  recognitionProgressTimers.clear()
  recognitionProgressStartedAt.clear()
},
startRecognitionProgress(id: string) {
  this.stopRecognitionProgress(id)
  recognitionProgressStartedAt.set(id, Date.now())
  const tick = () => {
    const current = this.data.recognitionQueue.find((item) => item.id === id)
    const startedAt = recognitionProgressStartedAt.get(id)
    if (
      !current
      || startedAt === undefined
      || (current.status !== 'preparing' && current.status !== 'recognizing')
    ) {
      this.stopRecognitionProgress(id)
      return
    }
    const progress = Math.max(
      current.progress,
      getTimedRecognitionProgress(Date.now() - startedAt),
    )
    if (progress === current.progress) return
    this.applyRecognitionQueue(updateQueueItem(this.data.recognitionQueue, id, { progress }))
  }
  recognitionProgressTimers.set(id, setInterval(tick, RECOGNITION_PROGRESS_TICK_MS))
  tick()
},
```

Change `detached()` to call `this.stopAllRecognitionProgress()`.

- [ ] **Step 4: Split the serial request method into slot filling and an item-owned lifecycle**

Import `MAX_CONCURRENT_RECOGNITIONS` and `claimQueuedRecognitionItems` from `../../domain/recognition-queue`; remove the `getNextQueuedItem` import.

Replace the current `runRecognitionQueue()` with:

```ts
runRecognitionQueue() {
  const claimed = claimQueuedRecognitionItems(
    this.data.recognitionQueue,
    MAX_CONCURRENT_RECOGNITIONS,
  )
  if (claimed.claimed.length === 0) return
  this.applyRecognitionQueue(claimed.queue, () => {
    claimed.claimed.forEach((item) => this.startQueueRecognition(item.id))
  })
},
```

Extend `applyRecognitionQueue` to accept an optional callback, so all claim state has reached page data before requests start:

```ts
applyRecognitionQueue(queue: RecognitionQueueItem[], callback?: () => void) {
  const visibleQueue = queue.filter((item) => item.status !== 'skipped')
  this.setData({
    recognitionQueue: visibleQueue,
    recognitionQueueStats: getQueueStats(visibleQueue),
  }, callback)
},
```

Add `startQueueRecognition(id: string)`. It must retrieve the currently claimed item by ID, start the item-specific progress timer, perform the existing `setTimeout` transition to `markQueueItemRecognizing`, and execute the existing `recognizeInspection()` success/error normalization unchanged. Its `finally` block must be:

```ts
.finally(() => {
  this.stopRecognitionProgress(id)
  this.runRecognitionQueue()
})
```

Use `id` throughout this method instead of the old `next.id`. Retain the existing purchase-order prefill merge and `buildRecognitionReviewHints()` call verbatim.

- [ ] **Step 5: Make skip clean up only its own timer**

Replace the active-ID conditional in `skipQueueRecognition` with:

```ts
const current = this.data.recognitionQueue.find((item) => item.id === id)
if (current?.status === 'preparing' || current?.status === 'recognizing') {
  this.stopRecognitionProgress(id)
}
this.applyRecognitionQueue(requestQueueItemSkip(this.data.recognitionQueue, id))
```

Do not call `runRecognitionQueue()` here: the skipped active request still occupies its slot until its network promise settles, and `startQueueRecognition(...).finally()` will release the slot and refill it.

- [ ] **Step 6: Run the focused UI contract test and verify GREEN**

Run:

```bash
npx tsx --test --test-name-pattern="recognition cards advance progress" tests/ui-consistency.test.ts
```

Expected: the progress-card contract test passes and verifies that the implementation contains no single-active task state.

- [ ] **Step 7: Commit the page dispatcher change**

```bash
git add miniprogram/pages/index/index.ts tests/ui-consistency.test.ts
git commit -m "feat: recognize two reports concurrently"
```

Expected: the commit contains only page concurrency/progress changes and the updated contract test.

### Task 3: Verify interaction regressions and worktree hygiene

**Files:**
- Verify: `tests/recognition-queue.test.ts`
- Verify: `tests/ui-consistency.test.ts`
- Verify: `miniprogram/pages/index/index.ts`

**Interfaces:**
- Consumes: the pure two-slot claiming API from Task 1 and per-item timer dispatcher from Task 2.
- Produces: verification evidence that domain behavior, UI contracts, TypeScript compilation, and whitespace checks succeed.

- [ ] **Step 1: Run the queue behavior tests**

```bash
npx tsx --test tests/recognition-queue.test.ts
```

Expected: PASS, including two simultaneous claims, replacement after a failure, retry reset behavior, skip behavior, and six-second progress assertions.

- [ ] **Step 2: Run the full test suite**

```bash
npm test
```

Expected: PASS with zero failed tests.

- [ ] **Step 3: Run TypeScript validation**

```bash
npm run typecheck
```

Expected: exit code `0`.

- [ ] **Step 4: Inspect whitespace, commits, and unrelated modifications**

```bash
git diff --check
git status --short
git log --oneline -3
git diff -- miniprogram/app.json miniprogram/components/navigation-bar/navigation-bar.ts miniprogram/styles/_design-tokens.scss typings/index.d.ts
```

Expected: no whitespace errors; the two feature commits are present; unrelated pre-existing files remain unstaged and are not altered by the queue work.
