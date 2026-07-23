# Recognition Summary Entrance Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the recognition quantity summary card enter after the hero card using the page’s existing `content-rise` animation.

**Architecture:** Keep the change CSS-only by applying the shared keyframes directly to `.recognition-queue-summary`. Extend the existing source-level UI consistency tests to lock the animation contract without introducing runtime state.

**Tech Stack:** WeChat Mini Program WXML/SCSS, TypeScript, Node test runner through `tsx --test`.

## Global Constraints

- Reuse the existing `content-rise` keyframes.
- Use `.38s` duration, `.06s` delay, `ease-out`, and `both` fill mode.
- Do not add JavaScript state, timers, or per-counter animations.
- Do not modify existing unrelated changes in `miniprogram/config/server.ts`, `package-lock.json`, `package.json`, or `tests/server-client.test.ts`.

---

### Task 1: Recognition Summary Entrance Animation

**Files:**
- Modify: `tests/ui-consistency.test.ts:35-47`
- Modify: `miniprogram/pages/index/index.scss:1815-1821`

**Interfaces:**
- Consumes: existing `@keyframes content-rise` in `miniprogram/pages/index/index.scss`.
- Produces: a stable `.recognition-queue-summary` entrance animation contract.

- [ ] **Step 1: Write the failing UI contract test**

Extend `scan workspace exposes recognition queue and confidence review states` after the existing SCSS assertions:

```ts
const summary = scss.match(/\.recognition-queue-summary\s*\{([^}]*)\}/)?.[1] || ''
assert.match(
  summary,
  /animation:\s*content-rise\s+\.38s\s+\.06s\s+ease-out\s+both;/,
)
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```bash
npx tsx --test tests/ui-consistency.test.ts
```

Expected: the scan workspace test fails because `.recognition-queue-summary` currently has no `animation` declaration.

- [ ] **Step 3: Add the minimal SCSS implementation**

Update the summary rule:

```scss
.recognition-queue-summary {
  margin-top: 20rpx;
  padding: 24rpx;
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12rpx;
  animation: content-rise .38s .06s ease-out both;
}
```

- [ ] **Step 4: Run the focused test and verify GREEN**

Run:

```bash
npx tsx --test tests/ui-consistency.test.ts
```

Expected: all UI consistency tests pass.

- [ ] **Step 5: Run full verification**

Run:

```bash
npm test
npm run typecheck
git diff --check
```

Expected: all tests pass, TypeScript exits with code 0, and the diff has no whitespace errors.

- [ ] **Step 6: Commit the fix**

```bash
git add miniprogram/pages/index/index.scss tests/ui-consistency.test.ts
git commit -m "fix: animate recognition summary entrance"
```
