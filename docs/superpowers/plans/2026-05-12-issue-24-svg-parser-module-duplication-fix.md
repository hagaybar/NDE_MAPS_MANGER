# Issue #24 — svg-parser module-duplication fix Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Drop the `?v=N` query-string suffix from seven admin imports of `svg-parser.js` and `data-model.js` so each resolves to a single ES-module singleton; add a static Jest test as a regression guard.

**Architecture:** Pure import-path edits — file contents of the imported modules don't change. The new Jest test scans the admin source tree for any `from '...(svg-parser|data-model).js?v=N'` pattern and fails with offending file paths.

**Tech Stack:** Vanilla ES modules (no bundler), Jest with `--experimental-vm-modules`, jsdom + node test environments. The new regression test uses node's `fs` + `path` modules.

**Spec:** `docs/superpowers/specs/2026-05-12-issue-24-svg-parser-module-duplication-fix-design.md`

---

## File map

**Modified (admin/):**
- `admin/components/svg-autocomplete.js` — drop `?v=5` on svg-parser import.
- `admin/components/map-editor.js` — drop `?v=5` on svg-parser import.
- `admin/app.js` — drop `?v=5` on svg-parser import.
- `admin/components/errors-dashboard.js` — drop `?v=6` on data-model import.
- `admin/components/edit-location-dialog.js` — drop `?v=6` on data-model import.
- `admin/components/validation-panel.js` — drop `?v=6` on data-model import.
- `admin/components/map-editor/range-validation.js` — drop `?v=5` on data-model import.

**New (admin/__tests__/):**
- `no-duplicate-module-imports.test.js` — regression guard.

No other files change. No new modules. No structural refactoring.

---

## Task 0: Setup branch and rollback tag

**Files:** none yet.

- [ ] **Step 0.1: Verify clean working tree on `main`**

Run: `git status --short && git rev-parse --abbrev-ref HEAD`
Expected: untracked-only entries (none staged or modified) and `main`.

- [ ] **Step 0.2: Create feature branch and pre-feature tag**

Run:
```bash
git checkout -b fix/issue-24-svg-parser-module-duplication main
git tag pre/issue-24 main
```
Expected: `Switched to a new branch 'fix/issue-24-svg-parser-module-duplication'`. The tag is local-only (rollback safety net).

---

## Task 1: Add the regression-guard test (failing)

**Files:**
- Create: `admin/__tests__/no-duplicate-module-imports.test.js`

Write the test FIRST and verify it fails finding the 7 known offenders. This proves the test actually exercises the rule before the fix lands.

- [ ] **Step 1.1: Create the test file**

Create `admin/__tests__/no-duplicate-module-imports.test.js`:

```js
/**
 * Regression guard for issue #24.
 *
 * Scans the admin source tree and fails if any file imports
 * `svg-parser.js` or `data-model.js` with a `?v=N` query-string
 * suffix. Different URLs are different ES-module singletons; if
 * these two foundational modules ever get imported under multiple
 * URLs again, validateRow / preloadAllFloors stop sharing cache
 * state and E006 detection becomes unreliable. The first time the
 * orphan panel opens shows the empty state even when orphans
 * exist. See docs/audits/2026-05-12-orphan-panel-audit.md.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ADMIN_ROOT = path.join(__dirname, '..');
const SKIP_DIRS = new Set(['__tests__', 'node_modules', 'coverage']);

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.isFile() && full.endsWith('.js')) out.push(full);
  }
  return out;
}

describe('module-import hygiene', () => {
  test('no ?v=N suffix on svg-parser.js or data-model.js imports', () => {
    const files = walk(ADMIN_ROOT);
    const offenders = [];
    const re = /from\s+['"][^'"]*\/(svg-parser|data-model)\.js\?v=\d+['"]/g;
    for (const f of files) {
      const src = fs.readFileSync(f, 'utf8');
      const matches = src.match(re);
      if (matches) {
        offenders.push({
          file: path.relative(ADMIN_ROOT, f),
          matches,
        });
      }
    }
    expect(offenders).toEqual([]);
  });
});
```

- [ ] **Step 1.2: Run the test and confirm it fails listing 7 offenders**

Run: `cd admin && npm test -- no-duplicate-module-imports.test.js 2>&1 | tail -40`

Expected: the test FAILS. The failure should include something like:

```
Expected: []
Received: [
  { file: 'app.js', matches: [Array] },
  { file: 'components/edit-location-dialog.js', matches: [Array] },
  { file: 'components/errors-dashboard.js', matches: [Array] },
  { file: 'components/map-editor.js', matches: [Array] },
  { file: 'components/map-editor/range-validation.js', matches: [Array] },
  { file: 'components/svg-autocomplete.js', matches: [Array] },
  { file: 'components/validation-panel.js', matches: [Array] }
]
```

(File order may differ depending on `readdirSync` order, but there must be exactly 7 entries.)

If the failure shows a different count or different files, STOP and surface the discrepancy — the inventory in the spec was based on the audit and shouldn't have drifted, but if it has, the test is exposing real ground truth that the rest of the plan needs to be updated to reflect.

- [ ] **Step 1.3: Commit the failing test**

Run:
```bash
git add admin/__tests__/no-duplicate-module-imports.test.js
git commit -m "test(admin): add regression guard for svg-parser / data-model module duplication"
```

---

## Task 2: Rewrite the 7 import paths

**Files:**
- Modify: `admin/components/svg-autocomplete.js:3`
- Modify: `admin/components/map-editor.js:14`
- Modify: `admin/app.js:21`
- Modify: `admin/components/errors-dashboard.js:3`
- Modify: `admin/components/edit-location-dialog.js:5`
- Modify: `admin/components/validation-panel.js:3`
- Modify: `admin/components/map-editor/range-validation.js:25`

Each edit removes the `?v=N` query string from exactly one import line. File contents are otherwise untouched.

- [ ] **Step 2.1: Edit `admin/components/svg-autocomplete.js`**

In `admin/components/svg-autocomplete.js` line 3, change:

```js
import { getAvailableCodes } from '../services/svg-parser.js?v=5';
```

to:

```js
import { getAvailableCodes } from '../services/svg-parser.js';
```

- [ ] **Step 2.2: Edit `admin/components/map-editor.js`**

In `admin/components/map-editor.js` line 14, change:

```js
import { fetchAndParseSvg } from '../services/svg-parser.js?v=5';
```

to:

```js
import { fetchAndParseSvg } from '../services/svg-parser.js';
```

- [ ] **Step 2.3: Edit `admin/app.js`**

In `admin/app.js` line 21, change:

```js
import { preloadAllFloors } from './services/svg-parser.js?v=5';
```

to:

```js
import { preloadAllFloors } from './services/svg-parser.js';
```

- [ ] **Step 2.4: Edit `admin/components/errors-dashboard.js`**

In `admin/components/errors-dashboard.js` line 3, change:

```js
import { validateRow, VALIDATION_ERRORS, VALIDATION_WARNINGS } from '../services/data-model.js?v=6';
```

to:

```js
import { validateRow, VALIDATION_ERRORS, VALIDATION_WARNINGS } from '../services/data-model.js';
```

- [ ] **Step 2.5: Edit `admin/components/edit-location-dialog.js`**

In `admin/components/edit-location-dialog.js` line 5, change:

```js
import { validateRow, VALIDATION_RULES, VALIDATION_ERRORS, VALIDATION_WARNINGS } from '../services/data-model.js?v=6';
```

to:

```js
import { validateRow, VALIDATION_RULES, VALIDATION_ERRORS, VALIDATION_WARNINGS } from '../services/data-model.js';
```

- [ ] **Step 2.6: Edit `admin/components/validation-panel.js`**

In `admin/components/validation-panel.js` line 3, change:

```js
import { validateRow } from '../services/data-model.js?v=6';
```

to:

```js
import { validateRow } from '../services/data-model.js';
```

- [ ] **Step 2.7: Edit `admin/components/map-editor/range-validation.js`**

In `admin/components/map-editor/range-validation.js` line 25, change:

```js
import { parseRangeBoundary, parseRangeValue } from '../../services/data-model.js?v=5';
```

to:

```js
import { parseRangeBoundary, parseRangeValue } from '../../services/data-model.js';
```

- [ ] **Step 2.8: Syntax-check every edited file**

Run:
```bash
cd admin && \
  node --check components/svg-autocomplete.js && \
  node --check components/map-editor.js && \
  node --check app.js && \
  node --check components/errors-dashboard.js && \
  node --check components/edit-location-dialog.js && \
  node --check components/validation-panel.js && \
  node --check components/map-editor/range-validation.js && \
  echo "ALL OK"
```
Expected: `ALL OK` (no other output — each `--check` runs silently on success).

- [ ] **Step 2.9: Re-run the regression-guard test — expect PASS**

Run: `cd admin && npm test -- no-duplicate-module-imports.test.js`
Expected: 1 test passes.

- [ ] **Step 2.10: Run the full admin Jest suite — confirm no new failures**

Run: `cd admin && npm test 2>&1 | tail -15`
Expected: same pass/fail signature as `main`. Pre-existing issue-#9 failures (14 tests across 4 suites — data-model, validation, user-menu, edit-user-dialog) remain unchanged. **No NEW failures** outside that set.

- [ ] **Step 2.11: Commit the import edits**

Run:
```bash
git add admin/components/svg-autocomplete.js \
        admin/components/map-editor.js \
        admin/app.js \
        admin/components/errors-dashboard.js \
        admin/components/edit-location-dialog.js \
        admin/components/validation-panel.js \
        admin/components/map-editor/range-validation.js
git commit -m "fix(admin): drop ?v=N suffix from svg-parser and data-model imports

Each ES-module URL gets its own singleton, with its own module-level
state.  Inconsistent ?v=N across imports of these two foundational
modules caused validateRow's E006 rule to read a different
svgCodeCache than preloadAllFloors populated — the panel showed the
empty state on first click even when orphans existed.  See
docs/audits/2026-05-12-orphan-panel-audit.md.

Closes #24."
```

---

## Task 3: Verify end-to-end behavior unchanged

**Files:** none modified.

The fix is a pure import-path rewrite — module file contents are identical. So every existing behavior MUST be preserved. Catch any subtle regression now, before opening the PR.

- [ ] **Step 3.1: Run the existing orphan-panel e2e happy-path**

Run: `cd /home/hagaybar/projects/primo_maps && timeout 90 npx playwright test e2e/tests/map-editor-orphan-panel.spec.ts --project=en-admin 2>&1 | tail -10`
Expected: 1 test passes (the happy-path).

- [ ] **Step 3.2: Run the map-editor e2e suite (one project) — no new regressions**

Run: `cd /home/hagaybar/projects/primo_maps && timeout 240 npx playwright test e2e/tests/map-editor --project=en-admin 2>&1 | tail -15`
Expected: same pass/fail signature as `main`. If anything new fails, STOP and surface the failure with logs — this fix should be pure rename and shouldn't change behaviour.

- [ ] **Step 3.3: Confirm git history is clean**

Run: `git log --oneline main..HEAD`
Expected: exactly 2 commits — the regression-guard test, then the import edits.

---

## Task 4: Push branch and open PR

**Files:** none.

- [ ] **Step 4.1: Push the branch**

Run: `git push -u origin fix/issue-24-svg-parser-module-duplication`
Expected: branch created on origin.

- [ ] **Step 4.2: Open the PR**

```bash
gh pr create --title "fix(admin): drop ?v=N suffix from svg-parser / data-model imports (closes #24)" --body "$(cat <<'EOF'
## Summary

Closes #24. Drops the `?v=N` query-string suffix from 7 admin imports of `svg-parser.js` and `data-model.js`. Each module now resolves to a single ES-module singleton, so `validateRow`'s E006 rule reads the same `svgCodeCache` that `preloadAllFloors` populates.

Surfaced by the [2026-05-12 orphan-panel audit](../blob/main/docs/audits/2026-05-12-orphan-panel-audit.md). PR #22's cache-warmup turned out to await the wrong module instance and was effectively a no-op for correctness; with the duplication gone, the warmup is now redundant but harmless and stays in place as defense-in-depth.

## What this PR does

- Rewrites 7 imports — pure rename, no file-content changes to the imported modules.
- Adds `admin/__tests__/no-duplicate-module-imports.test.js` as a regression guard that scans the admin source tree and fails if anyone reintroduces a `?v=N` suffix on these specific modules.

## Files touched

- `admin/components/svg-autocomplete.js`
- `admin/components/map-editor.js`
- `admin/app.js`
- `admin/components/errors-dashboard.js`
- `admin/components/edit-location-dialog.js`
- `admin/components/validation-panel.js`
- `admin/components/map-editor/range-validation.js`
- `admin/__tests__/no-duplicate-module-imports.test.js` (new)

## Test plan

- [x] Regression-guard test passes.
- [x] Full admin Jest suite shows the same pass/fail signature as `main` (pre-existing issue-#9 failures unchanged).
- [x] Map-editor e2e suite shows the same pass/fail signature as `main`.
- [ ] After merge + deploy, hard-reload admin → click any floor's orphan badge → panel opens directly to the orphan list with no empty-state flash. Errors Dashboard shows E006 findings on first render with no Refresh required.

## Out of scope

- Broader admin-wide `?v=N` cleanup (the other ~100 imports) — a separate tech-debt issue will be filed after this lands.
- Bugs #23 (RTL panel positioning) and #25 (locale re-render) — independent fixes, queued in parallel.

## Rollback

Pre-feature tag `pre/issue-24` (local) marks pre-PR `main`. Revert the merge commit if anything regresses.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```
Expected: PR URL printed.

- [ ] **Step 4.3: Stop here — do NOT merge**

The PR opens for review. Wait for the human to:
1. Review the diff.
2. Merge manually.
3. Deploy via `redeploy.sh`.
4. Verify in the live admin that the orphan-panel empty-state flash is gone.

Once merge + deploy land, file the broader-cleanup follow-up issue (option C from issue #24's brainstorming) so the other ~100 `?v=N` imports get tracked as separate tech debt.
