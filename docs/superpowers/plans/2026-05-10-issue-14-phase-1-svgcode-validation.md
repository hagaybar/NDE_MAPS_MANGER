# Issue #14 — Phase 1: svgCode resolution validation (E006)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Extend `data-model.js validateRow` to emit a new `E006` error whenever a CSV row's `svgCode` does not match any element id on the declared floor's SVG, and ensure the SVG-id cache is preloaded at admin startup.

**Architecture:** Reuse the existing `services/svg-parser.js` (which already fetches, caches, and exposes `isValidSvgCode(code, floor)`). The active validator in `services/data-model.js` imports `isValidSvgCode` directly. Admin app `init()` kicks off `preloadAllFloors()` so the cache warms while the UI mounts. The existing `errors-dashboard.js` already maps `E006 → 'svgCode'` category, so findings surface automatically; no UI work in this phase. The `validation.js` orphan validator (with its own `setSvgParser` hook) is left alone — separate cleanup.

**Tech Stack:** Vanilla ES modules (no bundler), Jest with `jest.unstable_mockModule` for ESM mocking, jsdom test environment.

---

## Files

- **Modify:** `admin/services/data-model.js` — add `E006` rule inside `validateRow` and a top-level import from svg-parser.
- **Modify:** `admin/app.js` — call `preloadAllFloors()` once at admin init.
- **Modify:** `admin/__tests__/data-model.test.js` — add E006 unit tests using mocked svg-parser.
- **Reference (no change expected):** `admin/services/svg-parser.js`, `admin/components/errors-dashboard.js`.

---

## Task 0: Set up branch and rollback tag

**Files:** none yet.

- [ ] **Step 0.1: Verify clean working tree on `main`**

Run: `git status --short && git rev-parse --abbrev-ref HEAD`
Expected output: untracked-only entries (none staged or modified) and `main`.

- [ ] **Step 0.2: Create feature branch and pre-feature tag**

Run:
```bash
git checkout -b feat/issue-14-phase-1-svgcode-validation main
git tag pre/issue-14 main
```
Expected: `Switched to a new branch 'feat/issue-14-phase-1-svgcode-validation'`. The tag is local-only (rollback safety net).

---

## Task 1: Add E006 unit tests (failing) to `data-model.test.js`

**Files:**
- Modify: `admin/__tests__/data-model.test.js`

The tests must be written and observed FAILING before any production code changes.

- [ ] **Step 1.1: Read the current test file structure**

Run: `head -40 admin/__tests__/data-model.test.js`
Purpose: confirm the import shape of `validateRow` from `../services/data-model.js` and how existing tests are organised so the new `describe` block fits in.

- [ ] **Step 1.2: Append the E006 describe block at the end of the file**

Add this block to `admin/__tests__/data-model.test.js`:

```js
import { jest } from '@jest/globals';

describe('validateRow — E006 svgCode resolution', () => {
  let dataModel;
  let mockIsValidSvgCode;

  beforeEach(async () => {
    jest.resetModules();
    mockIsValidSvgCode = jest.fn();
    jest.unstable_mockModule('../services/svg-parser.js', () => ({
      isValidSvgCode: mockIsValidSvgCode,
      // Other exports left undefined — validateRow uses only isValidSvgCode.
    }));
    dataModel = await import('../services/data-model.js');
  });

  test('E006 fires when svgCode does not resolve on the declared floor', () => {
    mockIsValidSvgCode.mockReturnValue(false);
    const row = {
      libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
      collectionName: 'CL1', collectionNameHe: 'CL1',
      rangeStart: '010', rangeEnd: '184',
      svgCode: 'cl1_106_a', floor: '1',
      shelfLabel: '106 A', shelfLabelHe: '106 א',
    };
    const { errors } = dataModel.validateRow(row, [row], row);
    const e006 = errors.find(e => e.code === 'E006');
    expect(e006).toBeDefined();
    expect(e006.field).toBe('svgCode');
    expect(e006.message).toContain('cl1_106_a');
    expect(e006.message).toContain('floor 1');
    expect(e006.details).toEqual({ svgCode: 'cl1_106_a', floor: '1' });
    expect(mockIsValidSvgCode).toHaveBeenCalledWith('cl1_106_a', '1');
  });

  test('E006 does not fire when svgCode resolves correctly', () => {
    mockIsValidSvgCode.mockReturnValue(true);
    const row = {
      libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
      collectionName: 'CL1', collectionNameHe: 'CL1',
      rangeStart: '010', rangeEnd: '184',
      svgCode: 'cl1_106_a', floor: '1',
      shelfLabel: '106 A', shelfLabelHe: '106 א',
    };
    const { errors } = dataModel.validateRow(row, [row], row);
    expect(errors.find(e => e.code === 'E006')).toBeUndefined();
  });

  test('E006 is suppressed when svgCode is empty (E001 owns that case)', () => {
    mockIsValidSvgCode.mockReturnValue(false);
    const row = {
      libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
      collectionName: 'CL1', collectionNameHe: 'CL1',
      rangeStart: '010', rangeEnd: '184',
      svgCode: '', floor: '1',
      shelfLabel: '106 A', shelfLabelHe: '106 א',
    };
    const { errors } = dataModel.validateRow(row, [row], row);
    expect(errors.find(e => e.code === 'E006')).toBeUndefined();
    expect(mockIsValidSvgCode).not.toHaveBeenCalled();
  });

  test('E006 is suppressed when floor is invalid (E003 owns that case)', () => {
    mockIsValidSvgCode.mockReturnValue(false);
    const row = {
      libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
      collectionName: 'CL1', collectionNameHe: 'CL1',
      rangeStart: '010', rangeEnd: '184',
      svgCode: 'cl1_106_a', floor: '7',
      shelfLabel: '106 A', shelfLabelHe: '106 א',
    };
    const { errors } = dataModel.validateRow(row, [row], row);
    expect(errors.find(e => e.code === 'E006')).toBeUndefined();
    expect(mockIsValidSvgCode).not.toHaveBeenCalled();
  });

  test('E006 trims whitespace from svgCode and floor before checking', () => {
    mockIsValidSvgCode.mockReturnValue(true);
    const row = {
      libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
      collectionName: 'CL1', collectionNameHe: 'CL1',
      rangeStart: '010', rangeEnd: '184',
      svgCode: '  cl1_106_a  ', floor: '  1  ',
      shelfLabel: '106 A', shelfLabelHe: '106 א',
    };
    dataModel.validateRow(row, [row], row);
    expect(mockIsValidSvgCode).toHaveBeenCalledWith('cl1_106_a', '1');
  });
});
```

- [ ] **Step 1.3: Run the new tests and confirm they fail**

Run: `cd admin && npm test -- data-model.test.js -t "E006"`
Expected: 5 tests fail because `data-model.js` does not yet import `isValidSvgCode` and `validateRow` does not yet emit `E006`. Failure messages should mention "expected to be defined" or similar — NOT a module-resolution error. If you see "Cannot find module '../services/svg-parser.js'", check the import path in the mock.

- [ ] **Step 1.4: Commit the failing tests**

Run:
```bash
git add admin/__tests__/data-model.test.js
git commit -m "test(data-model): add failing E006 svgCode-resolution unit tests"
```

---

## Task 2: Implement E006 in `validateRow`

**Files:**
- Modify: `admin/services/data-model.js`

- [ ] **Step 2.1: Add the import at the top of `data-model.js`**

Add this immediately after the closing `*/` of the file's top JSDoc comment (around line 5), before `export const CSV_COLUMNS`:

```js
// Imports `isValidSvgCode` for the E006 rule. svg-parser.js imports FLOOR_VALUES
// from this module — the resulting circular dependency is safe because every
// cross-module reference happens inside function bodies (not top-level code),
// so ES module live bindings resolve correctly at call time.
import { isValidSvgCode } from './svg-parser.js';
```

- [ ] **Step 2.2: Add the E006 rule inside `validateRow`**

Locate the closing `}` of the duplicate-detection block (search for `// Check for range overlaps (warning only)` — the new code goes immediately BEFORE that comment, so E006 emits before W001).

Insert this block:

```js
  // E006: svgCode resolution — does this row's svgCode match an actual
  // element id on the declared floor's SVG? `isValidSvgCode` is lenient
  // when the cache is cold (returns true) so this rule cannot false-positive
  // during page load. Suppressed when svgCode is empty (E001 owns that case)
  // or when floor is invalid (E003 owns that case).
  const e006SvgCode = (row.svgCode ?? '').toString().trim();
  const e006Floor = (row.floor ?? '').toString().trim();
  if (e006SvgCode && e006Floor && FLOOR_VALUES.includes(e006Floor)) {
    if (!isValidSvgCode(e006SvgCode, e006Floor)) {
      errors.push({
        field: 'svgCode',
        code: 'E006',
        message: `SVG code "${e006SvgCode}" not found on floor ${e006Floor}`,
        details: { svgCode: e006SvgCode, floor: e006Floor }
      });
    }
  }
```

- [ ] **Step 2.3: Run the E006 tests and confirm they now pass**

Run: `cd admin && npm test -- data-model.test.js -t "E006"`
Expected: all 5 E006 tests pass. If any fail, fix inline before continuing.

- [ ] **Step 2.4: Run the full data-model test suite — no regressions**

Run: `cd admin && npm test -- data-model.test.js`
Expected: every existing test in the file still passes alongside the new ones.

- [ ] **Step 2.5: Run the full admin test suite — no regressions anywhere**

Run: `cd admin && npm test`
Expected: every test suite passes. If pre-existing jest failures (issue #9) appear, confirm they are the same failures as on `main` (run `git stash && npm test && git stash pop` to compare). The phase 1 changes must not introduce new failures.

- [ ] **Step 2.6: Commit the implementation**

Run:
```bash
git add admin/services/data-model.js
git commit -m "feat(data-model): add E006 svgCode-resolution validation rule"
```

---

## Task 3: Preload SVG cache at admin init

**Files:**
- Modify: `admin/app.js`

The `isValidSvgCode` rule is lenient when the SVG-id cache is cold — it returns `true` (no false positives) until each floor's SVG has been fetched and parsed. Calling `preloadAllFloors()` at admin init means by the time the librarian opens the errors dashboard or saves a row, the cache is hot and findings are accurate.

- [ ] **Step 3.1: Add the import**

In `admin/app.js`, add this import alongside the other top-of-file `import` statements (any position that keeps the file's existing alphabetical/grouping convention works — placing it near `import logger from './services/logger.js?v=1';` is a natural fit since both are services):

```js
import { preloadAllFloors } from './services/svg-parser.js?v=5';
```

- [ ] **Step 3.2: Locate the `init()` function and find the right seam**

Run: `grep -n "async function init" admin/app.js`
Expected: one hit at line 50 (or similar).

- [ ] **Step 3.3: Read the current init body to find the right insertion point**

Run: `sed -n '50,80p' admin/app.js`
Purpose: identify where authentication finishes and component mounting begins. The preload should fire BEFORE component mounting so the cache is warming while the UI builds, but it should NOT block init (use fire-and-forget).

- [ ] **Step 3.4: Add the preload call**

Inside `init()`, immediately after the i18n initialisation (search for `await i18n` or `i18n.init` — the line after that is the right place), add:

```js
  // Warm the SVG-id cache used by data-model.validateRow's E006 rule.
  // Fire-and-forget — the parser is lenient until cache lands, and the
  // dashboard / save path will see accurate findings once it does.
  preloadAllFloors().catch(err => {
    logger.warn('system', 'preloadAllFloors failed (E006 detection will be lenient)', {
      error: err.message
    });
  });
```

- [ ] **Step 3.5: Verify the file still parses (syntax check)**

Run: `cd admin && node --check app.js`
Expected: no output (success). If a syntax error appears, fix before continuing.

- [ ] **Step 3.6: Run the full test suite again**

Run: `cd admin && npm test`
Expected: same pass/fail signature as Step 2.5 — no new regressions from the app.js change. Tests don't import `app.js` directly, so this is a sanity check, not a behavioural one.

- [ ] **Step 3.7: Commit**

Run:
```bash
git add admin/app.js
git commit -m "feat(app): preload SVG-id cache at init for E006 validation"
```

---

## Task 4: Smoke test against fixture data

**Files:**
- Create: `admin/__tests__/fixtures/svgcode-smoke-fixtures.js`
- Create: `admin/__tests__/data-model-svgcode-smoke.test.js`

This task locks in the end-to-end behaviour — given a small but realistic CSV + a small but realistic SVG-id set, the count of E006 findings is what we expect. Catches future regressions where someone tweaks a rule and silently drops the check.

- [ ] **Step 4.1: Create the fixture file**

Create `admin/__tests__/fixtures/svgcode-smoke-fixtures.js`:

```js
// Smoke-test fixtures for E006 validation. Hand-curated: small, realistic,
// and covering the cases we know about from the live data investigation
// (issue #11) on 2026-05-10.

export const SMOKE_ROWS = [
  // Resolves: cl1_* matches floor_1.svg (post-#17)
  {
    libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
    collectionName: 'CL1', collectionNameHe: 'CL1',
    rangeStart: '010', rangeEnd: '184',
    svgCode: 'cl1_106_a', floor: '1',
    shelfLabel: '106 A', shelfLabelHe: '106 א',
  },
  // Does NOT resolve: ka1_61_a is in the SVG, but if a typo'd row pointed
  // at ka1_61_z it would not.
  {
    libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
    collectionName: 'KA', collectionNameHe: 'KA',
    rangeStart: '300', rangeEnd: '305',
    svgCode: 'ka1_61_z', floor: '1',
    shelfLabel: '61 Z', shelfLabelHe: '61 ז',
  },
  // Does NOT resolve: wrong floor — ka1_53_a exists on floor 1, not floor 2.
  {
    libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
    collectionName: 'KA', collectionNameHe: 'KA',
    rangeStart: '500', rangeEnd: '510',
    svgCode: 'ka1_53_a', floor: '2',
    shelfLabel: '53 A', shelfLabelHe: '53 א',
  },
  // Does NOT resolve: original CL bug pre-#17 (cl1_* in CSV, cl_* in SVG).
  // We simulate the OLD pre-fix state to prove the rule catches it.
  {
    libraryName: 'Sourasky', libraryNameHe: 'סוראסקי',
    collectionName: 'CL_OLD', collectionNameHe: 'CL_OLD',
    rangeStart: '600', rangeEnd: '610',
    svgCode: 'cl_106_a', floor: '1',
    shelfLabel: '106 OLD', shelfLabelHe: '106 ישן',
  },
];

// Synthetic SVG-id set: only the IDs the rows above legitimately point at.
// Keys are floor numbers (string), values are Sets of valid ids.
export const SMOKE_SVG_IDS = {
  '0': new Set([]),
  '1': new Set(['cl1_106_a', 'ka1_61_a', 'ka1_53_a']),
  '2': new Set(['cl2_89_a']),
};
```

- [ ] **Step 4.2: Create the smoke test**

Create `admin/__tests__/data-model-svgcode-smoke.test.js`:

```js
import { jest } from '@jest/globals';
import { SMOKE_ROWS, SMOKE_SVG_IDS } from './fixtures/svgcode-smoke-fixtures.js';

describe('data-model E006 smoke test against fixture data', () => {
  let dataModel;

  beforeEach(async () => {
    jest.resetModules();
    jest.unstable_mockModule('../services/svg-parser.js', () => ({
      isValidSvgCode: (code, floor) => {
        const ids = SMOKE_SVG_IDS[String(floor)];
        return ids ? ids.has(code) : false;
      },
    }));
    dataModel = await import('../services/data-model.js');
  });

  test('produces exactly 3 E006 findings across the fixture rows', () => {
    let e006Count = 0;
    const e006Codes = [];
    for (const row of SMOKE_ROWS) {
      const { errors } = dataModel.validateRow(row, SMOKE_ROWS, row);
      for (const e of errors) {
        if (e.code === 'E006') {
          e006Count += 1;
          e006Codes.push(e.details.svgCode);
        }
      }
    }
    expect(e006Count).toBe(3);
    expect(e006Codes).toEqual(expect.arrayContaining([
      'ka1_61_z',   // typo
      'ka1_53_a',   // wrong floor
      'cl_106_a',   // pre-#17 mismatch
    ]));
    // The legitimate cl1_106_a row must NOT be among them.
    expect(e006Codes).not.toContain('cl1_106_a');
  });
});
```

- [ ] **Step 4.3: Run the smoke test and confirm it passes**

Run: `cd admin && npm test -- data-model-svgcode-smoke.test.js`
Expected: 1 test passes.

- [ ] **Step 4.4: Run the full suite one more time**

Run: `cd admin && npm test`
Expected: same pass/fail signature as before, plus the new smoke test passing.

- [ ] **Step 4.5: Commit**

Run:
```bash
git add admin/__tests__/fixtures/svgcode-smoke-fixtures.js admin/__tests__/data-model-svgcode-smoke.test.js
git commit -m "test(data-model): smoke test E006 against curated fixture"
```

---

## Task 5: Push branch and open PR

**Files:** none modified.

- [ ] **Step 5.1: Verify final commit history is clean**

Run: `git log --oneline main..HEAD`
Expected: 4 commits — failing tests, implementation, app-init wiring, smoke test. No fix-up or revert noise.

- [ ] **Step 5.2: Push the branch**

Run: `git push -u origin feat/issue-14-phase-1-svgcode-validation`
Expected: branch created on origin.

- [ ] **Step 5.3: Open the PR**

Run:
```bash
gh pr create --title "feat(data-model): add E006 svgCode-resolution validation (issue #14 phase 1)" --body "$(cat <<'EOF'
## Summary

Phase 1 of issue #14. Adds a single new validation rule (`E006`) that flags CSV rows whose `svgCode` does not match any element id on the declared floor's SVG. No UI changes — the existing errors dashboard already maps `E006 → 'svgCode'` and renders findings as soon as the validator emits them.

## What this PR does

- `admin/services/data-model.js` — `validateRow` now emits `E006 errors[]` for unresolved svgCodes, suppressed when `svgCode` is empty (E001 owns that case) or floor is invalid (E003 owns that case).
- `admin/app.js init()` — fires `preloadAllFloors()` at startup so the SVG-id cache is warm by the time the dashboard or save path needs it. Lenient if the preload fails (logs a warning; rule under-reports rather than false-positives).
- Tests: 5 unit tests for the new rule + a smoke test using fixture data. Existing tests unchanged.

## What this PR does NOT do

- No UI changes (errors-dashboard already maps E006).
- No widening of `#csv-editor?orphans=floor=N` deep-link to use validator findings — phase 2.
- No save-time gating (warn vs block dialog) — phase 3.
- No cleanup of the orphaned `admin/components/validation.js` validator — separate tech-debt issue.

## Test plan

- [x] All 5 new E006 unit tests pass.
- [x] Smoke test passes (3 expected findings against fixture).
- [x] Full admin test suite shows the same pass/fail signature as `main` — no new regressions.
- [ ] After merge + deploy, hard-reload the admin and visit the Errors Dashboard tab. Expected: the "SVG Code Issues" category card appears with a non-zero count if any rows in the live CSV have unresolved svgCodes; or stays at zero if everything resolves cleanly post-#17.

## Rollback

Pre-feature tag `pre/issue-14` (local only) and pre-merge `main` both contain the prior state. Revert via the merge commit if a regression appears.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 5.4: Stop here — do NOT merge**

The PR opens for review. Wait for the human to:
1. Review the diff in GitHub.
2. Confirm tests pass in any CI that runs on the repo (none configured at time of writing).
3. Merge manually after smoke-test reasoning.

Phase 2 (visibility extras) and phase 3 (save-time gating) start after this merges and the human verifies the dashboard surfaces E006s in production.
