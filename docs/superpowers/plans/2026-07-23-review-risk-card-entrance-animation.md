# Review Risk Card Entrance Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing entrance animation to the accuracy review prompt card and preserve the review page’s DOM-order stagger.

**Architecture:** Reuse the existing `content-rise` keyframes and verify the delay sequence through the source-level UI consistency test. Because `miniprogram/pages/index/index.scss` already contains an unrelated uncommitted `.01s` queue-summary delay, execute in the current workspace and remove that pre-existing patch from the staged index before committing.

**Tech Stack:** WeChat Mini Program SCSS, TypeScript, Node test runner through `tsx --test`, Git partial staging.

## Global Constraints

- Accuracy review prompt uses `content-rise .38s .04s ease-out both`.
- API, report-information, and inspection-data delays become `.08s`, `.12s`, and `.16s` respectively.
- Do not add JavaScript state or new keyframes.
- Preserve the current uncommitted `.recognition-queue-summary` delay change from `.06s` to `.01s` exactly.
- Do not stage or commit unrelated changes in `miniprogram/config/server.ts`, `miniprogram/styles/_design-tokens.scss`, `package-lock.json`, `package.json`, `project.config.json`, or `tests/server-client.test.ts`.

---

### Task 1: Review Card Stagger Contract and SCSS Fix

**Files:**
- Modify: `tests/ui-consistency.test.ts:35-52`
- Modify: `miniprogram/pages/index/index.scss:402-413,1988-1995`

**Interfaces:**
- Consumes: existing `@keyframes content-rise`.
- Produces: a `.04s / .08s / .12s / .16s` review-card entrance sequence.

- [ ] **Step 1: Capture the pre-existing target-file patch**

Run before making any implementation edits:

```bash
git diff -- miniprogram/pages/index/index.scss > /tmp/review-risk-preexisting-index.patch
cat /tmp/review-risk-preexisting-index.patch
```

Expected: the patch contains only the unrelated `.recognition-queue-summary` delay change from `.06s` to `.01s`.

- [ ] **Step 2: Write the failing UI contract assertions**

Extend `scan workspace exposes recognition queue and confidence review states`:

```ts
const riskSummary = scss.match(/\.review-risk-summary\s*\{([^}]*)\}/)?.[1] || ''
assert.match(
  riskSummary,
  /animation:\s*content-rise\s+\.38s\s+\.04s\s+ease-out\s+both;/,
)
assert.match(scss, /\.api-card\s*\{\s*animation-delay:\s*\.08s;\s*\}/)
assert.match(scss, /\.form-card\s*\{\s*animation-delay:\s*\.12s;\s*\}/)
assert.match(scss, /\.table-card\s*\{\s*animation-delay:\s*\.16s;\s*\}/)
```

- [ ] **Step 3: Run the focused test and verify RED**

Run:

```bash
npx tsx --test tests/ui-consistency.test.ts
```

Expected: the review workspace test fails because the risk summary has no animation and existing delays are `.04s / .08s / .12s`.

- [ ] **Step 4: Implement the minimal staggered animation**

Change the delay rules to:

```scss
.api-card { animation-delay: .08s; }
.form-card { animation-delay: .12s; }
.table-card { animation-delay: .16s; }
```

Add to `.review-risk-summary`:

```scss
animation: content-rise .38s .04s ease-out both;
```

Do not edit `.recognition-queue-summary`.

- [ ] **Step 5: Run focused and full verification**

Run:

```bash
npx tsx --test tests/ui-consistency.test.ts
npm test
npm run typecheck
git diff --check
```

Expected: all UI tests and all project tests pass, TypeScript exits with code 0, and no whitespace errors are reported.

- [ ] **Step 6: Stage only this task’s changes**

Stage the test and SCSS, then remove the saved pre-existing `.01s` patch from the staged index only:

```bash
git add tests/ui-consistency.test.ts miniprogram/pages/index/index.scss
git apply --cached --reverse /tmp/review-risk-preexisting-index.patch
git diff --cached --check
git diff --cached -- miniprogram/pages/index/index.scss tests/ui-consistency.test.ts
```

Expected staged diff:

- adds the review-risk animation;
- changes API/form/table delays;
- adds UI assertions;
- does **not** contain the `.06s` to `.01s` recognition-summary change.

- [ ] **Step 7: Commit the isolated fix**

```bash
git commit -m "fix: animate review risk summary entrance"
```

After committing, run:

```bash
git status --short
git diff -- miniprogram/pages/index/index.scss
```

Expected: the user’s `.06s` to `.01s` change remains unstaged in the working tree; all other unrelated local changes remain untouched.
