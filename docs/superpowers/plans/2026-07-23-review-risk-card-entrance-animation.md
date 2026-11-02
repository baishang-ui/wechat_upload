# Review Risk Card Entrance Animation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the missing entrance animation to the accuracy review prompt card and preserve the review page’s DOM-order stagger.

**Architecture:** Reuse the existing `content-rise` keyframes and verify the delay sequence through the source-level UI consistency test. Execute in the current workspace. Per the user’s explicit choice after baseline verification, formalize the existing `.01s` queue-summary delay and update its UI contract in the same commit.

**Tech Stack:** WeChat Mini Program SCSS, TypeScript, Node test runner through `tsx --test`, Git partial staging.

## Global Constraints

- Accuracy review prompt uses `content-rise .38s .04s ease-out both`.
- API, report-information, and inspection-data delays become `.08s`, `.12s`, and `.16s` respectively.
- Do not add JavaScript state or new keyframes.
- Preserve and formally commit the current `.recognition-queue-summary` delay change from `.06s` to `.01s`, with its test updated to `.01s`.
- Do not stage or commit unrelated changes in `miniprogram/config/server.ts`, `miniprogram/styles/_design-tokens.scss`, `package-lock.json`, `package.json`, `project.config.json`, or `tests/server-client.test.ts`.

---

### Task 1: Review Card Stagger Contract and SCSS Fix

**Files:**
- Modify: `tests/ui-consistency.test.ts:35-52`
- Modify: `miniprogram/pages/index/index.scss:402-413,1988-1995`

**Interfaces:**
- Consumes: existing `@keyframes content-rise`.
- Produces: a `.04s / .08s / .12s / .16s` review-card entrance sequence.

- [ ] **Step 1: Confirm the approved queue-summary contract update**

Update the existing `.recognition-queue-summary` UI assertion from `.06s` to `.01s`. This formalizes the user-approved delay and removes the known baseline mismatch.

- [ ] **Step 2: Write the failing UI contract assertions**

Extend `scan workspace exposes recognition queue and confidence review states`:

```ts
const riskSummary = scss.match(/\.review-risk-summary\s*\{([^}]*)\}/)?.[1] || ''
assert.match(
  riskSummary,
  /animatio<workspace-path>
)
assert.match(scss, /\.api-card\s*\{\s*animation-dela<workspace-path>
assert.match(scss, /\.form-card\s*\{\s*animation-dela<workspace-path>
assert.match(scss, /\.table-card\s*\{\s*animation-dela<workspace-path>
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

- [ ] **Step 6: Stage only this task’s files**

```bash
git add tests/ui-consistency.test.ts miniprogram/pages/index/index.scss
git diff --cached --check
git diff --cached -- miniprogram/pages/index/index.scss tests/ui-consistency.test.ts
```

Expected staged diff:

- formalizes the `.06s` to `.01s` recognition-summary delay and test contract;
- adds the review-risk animation;
- changes API/form/table delays;
- adds the new UI assertions.

- [ ] **Step 7: Commit the isolated fix**

```bash
git commit -m "fix: animate review risk summary entrance"
```

After committing, run:

```bash
git status --short
git diff -- miniprogram/pages/index/index.scss
```

Expected: the `.01s` queue-summary delay is committed with the review-card animation; all other unrelated local changes remain untouched.
