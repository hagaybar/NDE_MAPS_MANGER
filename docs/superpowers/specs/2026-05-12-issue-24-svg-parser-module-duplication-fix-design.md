# Issue #24 — Eliminate svg-parser module duplication

## Goal

Make `data-model.js validateRow → isValidSvgCode` and `app.js preloadAllFloors → fetchAndParseSvg` share a single svg-parser ES-module singleton, so phase-1 E006 detection works reliably on the first call from any consumer.

## Context

Phase 1 (issue #14) shipped an `E006` validation rule in `data-model.js validateRow` that calls `isValidSvgCode(code, floor)` from `services/svg-parser.js`. App init runs `preloadAllFloors()` (also from `services/svg-parser.js`) to warm the per-floor cache so that rule produces accurate findings.

The [2026-05-12 audit](../audits/2026-05-12-orphan-panel-audit.md) discovered the cache populated by `preloadAllFloors` is **not the cache read by `isValidSvgCode`**. Two ES-module singletons exist for the same file because consumers import it under two different URLs:

- **Instance A** — `services/svg-parser.js` (no version suffix). Used by `data-model.js`. The instance `isValidSvgCode` reads from.
- **Instance B** — `services/svg-parser.js?v=5`. Used by `svg-autocomplete.js`, `map-editor.js`, `app.js`. The instance `preloadAllFloors` and `fetchAndParseSvg` populate.

ES modules treat distinct URLs as distinct singletons. Module-level state — including the `svgCodeCache` Map — is not shared across instances.

`data-model.js` is similarly fragmented across **three** URLs (no-suffix, `?v=5`, `?v=6`), but the consequences are less visible because the consumers consult the validator output rather than module-level state.

The bug manifests as a noticeable lag the first time the librarian clicks the orphan badge on a floor with broken rows: the panel opens with the empty state ("No orphans on this floor") even though the badge correctly counts non-zero orphans. PR #22's cache-warmup fix awaited the wrong instance (Module B) and did not address the underlying duplication.

## Decisions

- **Scope:** strict — only `svg-parser.js` and `data-model.js` imports. The other ~100 `?v=N` imports admin-wide are filed as a separate tech-debt issue.
- **Direction:** drop the `?v=N` suffix from the seven offending imports, matching the no-suffix convention already used by `validation.js`, `orphan-deriver.js`, and the data-model's own import of svg-parser.
- **Regression guard:** static Jest test that scans the admin source tree for any future import of `svg-parser.js` or `data-model.js` with a `?v=N` suffix.
- **PR #22's cache-warmup is left in place** as defense-in-depth; once the duplication is gone, the warmup is redundant for correctness but harmless.

## Architecture

Seven import paths rewritten:

| file | line | currently | new |
|---|---|---|---|
| `admin/components/svg-autocomplete.js` | 3 | `../services/svg-parser.js?v=5` | `../services/svg-parser.js` |
| `admin/components/map-editor.js` | 14 | `../services/svg-parser.js?v=5` | `../services/svg-parser.js` |
| `admin/app.js` | 21 | `./services/svg-parser.js?v=5` | `./services/svg-parser.js` |
| `admin/components/errors-dashboard.js` | 3 | `../services/data-model.js?v=6` | `../services/data-model.js` |
| `admin/components/edit-location-dialog.js` | 5 | `../services/data-model.js?v=6` | `../services/data-model.js` |
| `admin/components/validation-panel.js` | 3 | `../services/data-model.js?v=6` | `../services/data-model.js` |
| `admin/components/map-editor/range-validation.js` | 25 | `../../services/data-model.js?v=5` | `../../services/data-model.js` |

After this, every consumer of `svg-parser.js` resolves to a single ES-module instance, and likewise every consumer of `data-model.js` resolves to a single instance. `preloadAllFloors`, `fetchAndParseSvg`, and `isValidSvgCode` all operate on the same `svgCodeCache` Map.

One new file:

- `admin/__tests__/no-duplicate-module-imports.test.js` — Jest test scanning the admin source tree for the forbidden pattern.

## Component details

### Regression guard test

A single test in a single new file. Walks the admin source tree (excluding `__tests__`, `node_modules`, `coverage`), reads each `.js` file as text, runs a regex against the content, and fails with file paths and offending line snippets if any match.

```js
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

Runs in well under 100ms. Failure message is the offenders array — list of `{file, matches}` pairs naming the bad imports.

## Data flow change

Before:

```
app.js (Module B) ──── preloadAllFloors ──→ Module B.svgCodeCache (warm)
data-model.js (Module A) ──── isValidSvgCode ──→ Module A.svgCodeCache (cold, lenient)
                                                 ↑ different state ↑
```

After:

```
app.js ──── preloadAllFloors ──┐
                               ├─→ shared svgCodeCache (warm after init)
data-model.js ── isValidSvgCode ┘
```

`validateRow`'s `E006` rule now reads the warm cache from the first call onward.

## Edge cases

1. **The browser cache.** Browsers cache imports keyed by full URL. Existing users who pulled `?v=5` instances will see those URLs revalidate / re-fetch after the deploy; the no-suffix URLs are fresh fetches. Since the file contents are identical, both retrieve the same source code. No behavioural risk.

2. **Hot-reload during a dev session.** Once the patch ships, only the no-suffix URL is referenced in source; the `?v=N` variants never get loaded again. Old browser tabs that still hold a `?v=5` reference would continue to see the old split until they refresh, but this only affects developers actively running the admin during the deploy window — not librarians.

3. **CloudFront cache invalidation.** `redeploy.sh` invalidates `/admin/*` already; no additional invalidation needed.

4. **PR #22's `await fetchAndParseSvg(currentFloor)` becomes redundant.** Once the cache is shared, `preloadAllFloors` at init has already populated the floor's data by the time the user could click the badge. The `await` is harmless when the cache is hot (resolves immediately to the cached Promise). Leave it in place for defense-in-depth; revisit removal later if it ever becomes noisy.

5. **Tests that import these modules.** `admin/__tests__/svg-parser.test.js` and `admin/__tests__/data-model.test.js` already use no-suffix imports; no changes there.

## Testing strategy

**Unit:**
- New `no-duplicate-module-imports.test.js` test must pass.
- Existing `data-model.test.js`, `svg-parser.test.js`, `orphan-deriver.test.js`, `orphan-card.test.js`, `orphan-panel.test.js` must continue to pass unchanged.
- Full admin Jest suite must show the same pass/fail signature as `main` (existing issue-#9 failures are pre-existing tech debt unrelated to this fix).

**E2E:**
- Existing `e2e/tests/map-editor-orphan-panel.spec.ts` happy-path must pass.
- Other map-editor e2e specs must show no new regressions.

**Manual verification (post-deploy):**
- Hard-reload admin → click any floor's orphan badge → panel opens directly to the orphan list, no empty-state flash.
- Errors Dashboard shows E006 findings on first render, no Refresh required.

## Rollback strategy

Three layers, in increasing severity:

1. **Pre-feature tag + feature branch.** Tag `pre/issue-24` marks `main` before any work; branch `fix/issue-24-svg-parser-module-duplication` branches off it.
2. **Surgical PR boundary.** Seven import-path edits + one new test file. No structural changes. `git revert <merge-commit>` undoes the entire fix in one step.
3. **If something subtle regresses on a consumer of `svg-parser` or `data-model`** (unlikely given the file contents are unchanged — only the import URL changes), revert is the recovery; iterate on a different fix design.

## Out of scope

- The broader admin-wide cleanup of the ~100 other `?v=N` imports (will be filed as a separate tech-debt issue after this lands).
- Issues #23 (RTL panel positioning) and #25 (locale re-render) — independent, can be parallel branches.
- Issue #16 (clickable empty shelves) — depends on stable phase-2a foundation, comes after this trio.

## Acceptance criteria

- Seven import paths in `admin/` no longer contain `?v=N` for `svg-parser.js` or `data-model.js`.
- New `admin/__tests__/no-duplicate-module-imports.test.js` exists and passes.
- All other Jest tests pass with the same signature as `main`.
- All e2e tests pass with the same signature as `main`.
- After deploy, manual verification confirms the orphan panel opens directly to the orphan list on first badge click, with no empty-state flash.
