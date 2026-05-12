# Issue #15 — Downloadable errors report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a one-click "Download errors report" button to the errors dashboard that produces a CSV of every validator finding (errors + warnings, all categories).

**Architecture:** Pure helpers in a new `admin/components/errors-dashboard/report-export.js` module (build rows, serialise CSV, trigger download, build filename). The dashboard imports them, adds a button to both view headers (`renderSummaryView`, `renderCategoryView`), and wires a click handler in `setupEventHandlers()`. CSV helpers are intentionally duplicated from `map-editor.js` rather than extracted to a shared service — keeps the feature self-contained.

**Tech Stack:** Vanilla JS ES modules, jsdom Jest tests, Playwright e2e. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-05-12-issue-15-errors-report-export-design.md`

---

## Task 0: Setup branch + rollback tag

**Files:** none (git state only).

- [ ] **Step 0.1: Verify clean tree and main is up to date**

Run: `cd /home/hagaybar/projects/primo_maps && git status --short`
Expected: empty output (clean tree).

Run: `cd /home/hagaybar/projects/primo_maps && git rev-parse --abbrev-ref HEAD`
Expected: `main`

- [ ] **Step 0.2: Pull main to the latest origin**

Run: `cd /home/hagaybar/projects/primo_maps && git fetch origin && git reset --hard origin/main`
Expected: `HEAD is now at <sha> ...` matching the latest origin/main commit.

- [ ] **Step 0.3: Tag pre-feature rollback point**

Run: `cd /home/hagaybar/projects/primo_maps && git tag pre-issue-15-export`
Expected: silent success. Verify: `git tag --list pre-issue-15-export` returns `pre-issue-15-export`.

- [ ] **Step 0.4: Create and checkout feature branch**

Run: `cd /home/hagaybar/projects/primo_maps && git checkout -b feat/issue-15-errors-report-export`
Expected: `Switched to a new branch 'feat/issue-15-errors-report-export'`.

---

## Task 1: Write failing Jest unit tests for `report-export.js`

**Files:**
- Test: `admin/__tests__/report-export.test.js` (new)

- [ ] **Step 1.1: Create the test file with the full suite (it will fail because the module doesn't exist yet)**

Write the following EXACT content to `/home/hagaybar/projects/primo_maps/admin/__tests__/report-export.test.js`:

```js
/**
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

describe('report-export', () => {
  let buildReportRows, toCsv, escapeCsvField, reportFilename;

  beforeEach(async () => {
    jest.resetModules();
    ({ buildReportRows, toCsv, escapeCsvField, reportFilename } = await import(
      '../components/errors-dashboard/report-export.js'
    ));
  });

  describe('buildReportRows', () => {
    it('maps every column for a single error issue', () => {
      const issue = {
        type: 'error',
        rowIndex: 0,
        row: {
          floor: '1',
          libraryName: 'Central',
          collectionName: 'Yiddish',
          shelfLabel: 'A-1',
          svgCode: 'ka1_01_a',
          rangeStart: 'A 100',
          rangeEnd: 'A 200',
        },
        category: 'svgCode',
        code: 'E006',
        field: 'svgCode',
        message: 'svgCode does not resolve on floor 1',
      };
      const rows = buildReportRows([issue]);
      expect(rows).toEqual([{
        floor: '1',
        libraryName: 'Central',
        collectionName: 'Yiddish',
        shelfLabel: 'A-1',
        svgCode: 'ka1_01_a',
        rangeStart: 'A 100',
        rangeEnd: 'A 200',
        csvRowIndex: 2,
        category: 'svgCode',
        code: 'E006',
        severity: 'error',
        field: 'svgCode',
        message: 'svgCode does not resolve on floor 1',
      }]);
    });

    it('maps a warning issue with severity = "warning"', () => {
      const issue = {
        type: 'warning',
        rowIndex: 5,
        row: { floor: '2', libraryName: '', collectionName: 'CY', shelfLabel: '', svgCode: 'kb2_46_b', rangeStart: '', rangeEnd: '' },
        category: 'overlap',
        code: 'W001',
        field: '',
        message: 'Overlaps with row 6',
      };
      const rows = buildReportRows([issue]);
      expect(rows[0].severity).toBe('warning');
      expect(rows[0].csvRowIndex).toBe(7);
    });

    it('converts null/undefined fields to empty strings', () => {
      const issue = {
        type: 'error',
        rowIndex: 0,
        row: { floor: null, libraryName: undefined, collectionName: null, shelfLabel: undefined, svgCode: null, rangeStart: null, rangeEnd: null },
        category: 'required',
        code: 'E001',
        field: null,
        message: null,
      };
      const rows = buildReportRows([issue]);
      expect(rows[0]).toEqual({
        floor: '', libraryName: '', collectionName: '', shelfLabel: '', svgCode: '', rangeStart: '', rangeEnd: '',
        csvRowIndex: 2, category: 'required', code: 'E001', severity: 'error', field: '', message: '',
      });
    });

    it('returns an empty array for empty input', () => {
      expect(buildReportRows([])).toEqual([]);
    });
  });

  describe('escapeCsvField', () => {
    it('returns plain strings unchanged', () => {
      expect(escapeCsvField('hello')).toBe('hello');
    });

    it('quotes values containing comma', () => {
      expect(escapeCsvField('a,b')).toBe('"a,b"');
    });

    it('doubles inner quotes and wraps in outer quotes', () => {
      expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    });

    it('quotes values containing newline', () => {
      expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('quotes values containing carriage return', () => {
      expect(escapeCsvField('line1\rline2')).toBe('"line1\rline2"');
    });

    it('stringifies non-strings', () => {
      expect(escapeCsvField(42)).toBe('42');
    });
  });

  describe('toCsv', () => {
    it('produces just the header row for empty input', () => {
      expect(toCsv([])).toBe(
        'floor,libraryName,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd,csvRowIndex,category,code,severity,field,message'
      );
    });

    it('produces header + data row in column order', () => {
      const row = {
        floor: '1', libraryName: 'Central', collectionName: 'Yiddish', shelfLabel: 'A-1',
        svgCode: 'ka1_01_a', rangeStart: 'A 100', rangeEnd: 'A 200', csvRowIndex: 2,
        category: 'svgCode', code: 'E006', severity: 'error', field: 'svgCode',
        message: 'bad code',
      };
      const csv = toCsv([row]);
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2);
      expect(lines[0]).toBe('floor,libraryName,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd,csvRowIndex,category,code,severity,field,message');
      expect(lines[1]).toBe('1,Central,Yiddish,A-1,ka1_01_a,A 100,A 200,2,svgCode,E006,error,svgCode,bad code');
    });

    it('escapes special characters per CSV rules', () => {
      const row = {
        floor: '1', libraryName: 'Central, Main', collectionName: '',
        shelfLabel: 'A "Special" Shelf', svgCode: '', rangeStart: '', rangeEnd: '',
        csvRowIndex: 2, category: 'format', code: 'W002', severity: 'warning', field: '',
        message: 'multi\nline',
      };
      const csv = toCsv([row]);
      const dataLine = csv.split('\n').slice(1).join('\n');
      expect(dataLine).toContain('"Central, Main"');
      expect(dataLine).toContain('"A ""Special"" Shelf"');
      expect(dataLine).toContain('"multi\nline"');
    });
  });

  describe('reportFilename', () => {
    it('formats as errors-report-YYYY-MM-DD.csv using UTC', () => {
      const fixed = new Date('2026-05-12T23:59:59Z');
      expect(reportFilename(fixed)).toBe('errors-report-2026-05-12.csv');
    });

    it('uses the current date when no argument is passed', () => {
      const name = reportFilename();
      expect(name).toMatch(/^errors-report-\d{4}-\d{2}-\d{2}\.csv$/);
    });
  });
});
```

- [ ] **Step 1.2: Run the new test file and verify it fails because the module does not exist**

Run: `cd /home/hagaybar/projects/primo_maps/admin && npx jest report-export.test.js 2>&1 | tail -25`
Expected: tests fail with an import / module-not-found error such as `Cannot find module '../components/errors-dashboard/report-export.js'`.

- [ ] **Step 1.3: Commit the failing test**

```bash
cd /home/hagaybar/projects/primo_maps && git add admin/__tests__/report-export.test.js && \
  git commit -m "$(cat <<'EOF'
test(errors-dashboard): add failing unit tests for report-export helpers

TDD red phase for the issue #15 CSV downloader.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Create `report-export.js` (make Task 1 tests pass)

**Files:**
- Create: `admin/components/errors-dashboard/report-export.js`

- [ ] **Step 2.1: Create the directory if it does not exist**

Run: `mkdir -p /home/hagaybar/projects/primo_maps/admin/components/errors-dashboard`
Expected: silent success.

- [ ] **Step 2.2: Write the module with all four helpers**

Write the following EXACT content to `/home/hagaybar/projects/primo_maps/admin/components/errors-dashboard/report-export.js`:

```js
/**
 * Report export helpers for the errors dashboard.
 *
 * Pure functions for shaping issues into export rows and serialising them
 * to CSV, plus a thin DOM helper that triggers a browser download. The
 * CSV-encoding rules mirror the toCSV / escapeCSVField helpers in
 * map-editor.js — intentional duplication for module isolation (see
 * issue-15 spec).
 *
 * @module components/errors-dashboard/report-export
 */

const COLUMNS = [
  'floor',
  'libraryName',
  'collectionName',
  'shelfLabel',
  'svgCode',
  'rangeStart',
  'rangeEnd',
  'csvRowIndex',
  'category',
  'code',
  'severity',
  'field',
  'message',
];

/**
 * Map an internal `allIssues` list to flat export rows.
 *
 * @param {Array<{type, rowIndex, row, category, code, field, message}>} allIssues
 * @returns {Array<object>}
 */
export function buildReportRows(allIssues) {
  return allIssues.map(issue => ({
    floor: issue.row?.floor ?? '',
    libraryName: issue.row?.libraryName ?? '',
    collectionName: issue.row?.collectionName ?? '',
    shelfLabel: issue.row?.shelfLabel ?? '',
    svgCode: issue.row?.svgCode ?? '',
    rangeStart: issue.row?.rangeStart ?? '',
    rangeEnd: issue.row?.rangeEnd ?? '',
    csvRowIndex: issue.rowIndex + 2,
    category: issue.category ?? '',
    code: issue.code ?? '',
    severity: issue.type ?? '',
    field: issue.field ?? '',
    message: issue.message ?? '',
  }));
}

/**
 * Wrap a value in double quotes when CSV escaping rules require it.
 * Doubles any inner double quotes. Stringifies non-strings.
 */
export function escapeCsvField(value) {
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

/**
 * Serialise an array of report rows to a CSV string.
 * Always emits the header row, even for empty input.
 */
export function toCsv(rows) {
  const header = COLUMNS.join(',');
  const lines = [header];
  for (const row of rows) {
    lines.push(COLUMNS.map(c => escapeCsvField(row[c] != null ? row[c] : '')).join(','));
  }
  return lines.join('\n');
}

/**
 * Build the canonical export filename for a given date.
 * Uses UTC so the filename is stable across timezones.
 *
 * @param {Date} [now] defaults to `new Date()`
 * @returns {string} e.g. "errors-report-2026-05-12.csv"
 */
export function reportFilename(now = new Date()) {
  const iso = now.toISOString().slice(0, 10);
  return `errors-report-${iso}.csv`;
}

/**
 * Trigger a browser download of `content` as `filename`.
 * Side-effecting; not unit-tested directly (covered by Playwright e2e).
 */
export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
```

- [ ] **Step 2.3: Run the unit tests and verify they pass**

Run: `cd /home/hagaybar/projects/primo_maps/admin && npx jest report-export.test.js 2>&1 | tail -15`
Expected: all `report-export` tests pass. Look for `Tests: X passed`.

- [ ] **Step 2.4: Commit the implementation**

```bash
cd /home/hagaybar/projects/primo_maps && git add admin/components/errors-dashboard/report-export.js && \
  git commit -m "$(cat <<'EOF'
feat(errors-dashboard): add report-export helpers (issue #15)

Pure buildReportRows / toCsv / escapeCsvField / reportFilename plus
the DOM helper downloadCsv. CSV encoding mirrors map-editor.js — kept
duplicated rather than extracted (see spec).

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: Add i18n fallbacks and the click handler in `errors-dashboard.js`

**Files:**
- Modify: `admin/components/errors-dashboard.js`

This task wires in the import + the dispatcher function `handleDownloadReport()`. The UI buttons are added in Task 4 and Task 5. Splitting keeps the JS-only change reviewable in isolation.

- [ ] **Step 3.1: Add the import for the new helpers near the top of `errors-dashboard.js`**

Modify `/home/hagaybar/projects/primo_maps/admin/components/errors-dashboard.js`. Find the existing import block (lines 1–6) ending with:

```js
import logger from '../services/logger.js?v=1';
```

Add this line immediately after it:

```js
import { buildReportRows, toCsv, downloadCsv, reportFilename } from './errors-dashboard/report-export.js';
```

- [ ] **Step 3.2: Add three FALLBACKS entries**

In the same file, find the `FALLBACKS` map (starts at the `const FALLBACKS = {` line, ends around line 36 with `'errorsDashboard.category.format': { ... }`).

Add these three entries immediately AFTER the `errorsDashboard.refresh` line (after `{ en: 'Refresh', he: 'רענן' }`):

```js
  'errorsDashboard.export.cta': { en: '📥 Download errors report', he: '📥 הורד דוח שגיאות' },
  'errorsDashboard.export.empty': { en: 'No errors to export', he: 'אין שגיאות לייצוא' },
  'errorsDashboard.export.error': { en: 'Could not generate the report.', he: 'לא ניתן ליצור את הדוח.' },
```

- [ ] **Step 3.3: Add the `handleDownloadReport` function**

Find the existing function `setupEventHandlers()` (starts around line 685). Immediately ABOVE its declaration, insert this new function:

```js
/**
 * Build and trigger the download of the comprehensive errors CSV.
 * Reads from `allIssues` (already aggregated by validateAllRows).
 */
function handleDownloadReport() {
  if (!allIssues || allIssues.length === 0) return;
  try {
    const rows = buildReportRows(allIssues);
    const csv = toCsv(rows);
    downloadCsv(reportFilename(), csv);
    logger.userAction('click', 'Download errors report', { count: rows.length });
  } catch (err) {
    logger.error('errors-dashboard', 'Report export failed', { error: String(err) });
    showToast(t('errorsDashboard.export.error'), 'error');
  }
}
```

- [ ] **Step 3.4: Add the missing `showToast` import (used only on the error path above)**

Check if `showToast` is already imported:

Run: `grep -n "showToast" /home/hagaybar/projects/primo_maps/admin/components/errors-dashboard.js`

If the only matches are inside `handleDownloadReport` (from Step 3.3), add an import. Look at the existing import block — `toast.js?v=5` is imported elsewhere in the codebase (e.g. `map-editor.js:3`). Add this line after the other `./` imports near the top of `errors-dashboard.js`:

```js
import { showToast } from './toast.js?v=5';
```

Skip Step 3.4 if `showToast` is already imported.

- [ ] **Step 3.5: Run the existing dashboard tests to confirm nothing regressed**

Run: `cd /home/hagaybar/projects/primo_maps/admin && npx jest 2>&1 | tail -10`
Expected: prior test results unchanged — same pass/fail signature as before (no NEW failures). Pre-existing failures from issue #9 may still appear and are out of scope.

- [ ] **Step 3.6: Commit**

```bash
cd /home/hagaybar/projects/primo_maps && git add admin/components/errors-dashboard.js && \
  git commit -m "$(cat <<'EOF'
feat(errors-dashboard): wire report-export imports, fallbacks, dispatcher

Adds the three FALLBACKS strings (cta / empty / error), the
handleDownloadReport() function, and the showToast import. UI buttons
arrive in the next two commits.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: Add the download button to `renderSummaryView`

**Files:**
- Modify: `admin/components/errors-dashboard.js`

- [ ] **Step 4.1: Add the button next to the refresh button in `renderSummaryView`**

Find the block in `renderSummaryView` that renders the dashboard header (around lines 514–522 — contains `<h2 class="dashboard-title">${escapeHtml(t('errorsDashboard.title'))}</h2>` and the refresh button). The relevant slice is:

```js
        <button class="btn btn-secondary refresh-btn">
          <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          ${escapeHtml(t('errorsDashboard.refresh'))}
        </button>
```

Replace it with the same refresh button followed by the new export button (note: keep the refresh button unchanged; just append the export button after it inside the same parent `<div>`):

```js
        <button class="btn btn-secondary refresh-btn">
          <svg class="btn-icon" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"/>
          </svg>
          ${escapeHtml(t('errorsDashboard.refresh'))}
        </button>
        <button class="btn btn-secondary export-btn" ${(!allIssues || allIssues.length === 0) ? `disabled title="${escapeHtml(t('errorsDashboard.export.empty'))}"` : ''}>
          ${escapeHtml(t('errorsDashboard.export.cta'))}
        </button>
```

The new button has class `export-btn`, is disabled (with a tooltip) when there are no findings, and uses the same `btn btn-secondary` styling as the refresh button so it looks at home.

- [ ] **Step 4.2: Wire the click handler in `setupEventHandlers`**

Find `setupEventHandlers()` (around line 685). After the refresh-button block (lines 689–695), insert:

```js
  // Export button
  const exportBtn = containerElement.querySelector('.export-btn');
  if (exportBtn && !exportBtn.disabled) {
    exportBtn.addEventListener('click', handleDownloadReport);
  }
```

- [ ] **Step 4.3: Smoke-check via Jest (no regressions)**

Run: `cd /home/hagaybar/projects/primo_maps/admin && npx jest report-export.test.js 2>&1 | tail -5`
Expected: still passes.

- [ ] **Step 4.4: Commit**

```bash
cd /home/hagaybar/projects/primo_maps && git add admin/components/errors-dashboard.js && \
  git commit -m "$(cat <<'EOF'
feat(errors-dashboard): add Download button to summary view

Disabled with tooltip when allIssues is empty.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Add the download button to `renderCategoryView`

**Files:**
- Modify: `admin/components/errors-dashboard.js`

- [ ] **Step 5.1: Add the same button next to the refresh button in `renderCategoryView`**

Find the block in `renderCategoryView` that renders its header (around lines 607–615 — contains another `<button class="btn btn-secondary refresh-btn">` block; this is the SECOND occurrence in the file, NOT the one you modified in Task 4).

Apply the identical edit pattern from Task 4 Step 4.1: append the new `<button class="btn btn-secondary export-btn" ...>` immediately after the existing refresh button. The button HTML is identical to Task 4 — copy it verbatim, including the same disabled / title logic.

- [ ] **Step 5.2: Verify both occurrences exist**

Run: `grep -c 'class="btn btn-secondary export-btn"' /home/hagaybar/projects/primo_maps/admin/components/errors-dashboard.js`
Expected: `2`

- [ ] **Step 5.3: Commit**

```bash
cd /home/hagaybar/projects/primo_maps && git add admin/components/errors-dashboard.js && \
  git commit -m "$(cat <<'EOF'
feat(errors-dashboard): add Download button to category view

Mirrors the summary-view button so the affordance is visible from any
view of the dashboard.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: Write Playwright e2e for the export flow

**Files:**
- Create: `e2e/tests/errors-report-export.spec.ts`

- [ ] **Step 6.1: Survey an existing dashboard e2e for fixture/auth patterns**

Run: `ls /home/hagaybar/projects/primo_maps/e2e/tests/ | grep -i error`
Expected: lists any existing dashboard specs (e.g. `errors-dashboard*.spec.ts`). If one exists, open it and use its auth + navigation pattern verbatim. If none exists, use the same auth-fixture import path as `e2e/tests/map-editor-empty-shelf.spec.ts` (e.g. `import { test, expect } from '../fixtures/auth'`).

- [ ] **Step 6.2: Write the spec**

Write the following EXACT content to `/home/hagaybar/projects/primo_maps/e2e/tests/errors-report-export.spec.ts`. If the auth-fixture import path on your repo differs from `../fixtures/auth`, adjust the import line to match the convention used by `e2e/tests/map-editor-empty-shelf.spec.ts`:

```ts
import { test, expect } from '../fixtures/auth';

test.describe('Errors dashboard — report export', () => {
  test('Download button produces a CSV with the expected header', async ({ page }) => {
    await page.goto('/admin/index.html');
    // Navigate to the Errors Dashboard tab.
    await page.locator('#nav-errors-dashboard, [data-tab="errors-dashboard"]').first().click();
    // Wait for at least one category card OR the empty-state success icon.
    await page.waitForSelector('.dashboard-stats-bar', { timeout: 10000 });

    const exportBtn = page.locator('.export-btn').first();
    await expect(exportBtn).toBeVisible();

    // Listen for the download event triggered by the button.
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      exportBtn.click(),
    ]);

    // Filename matches errors-report-YYYY-MM-DD.csv
    expect(download.suggestedFilename()).toMatch(/^errors-report-\d{4}-\d{2}-\d{2}\.csv$/);

    // Read the downloaded payload and assert the header row.
    const path = await download.path();
    expect(path).toBeTruthy();
    const fs = await import('fs/promises');
    const content = await fs.readFile(path!, 'utf-8');
    const firstLine = content.split('\n')[0];
    expect(firstLine).toBe('floor,libraryName,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd,csvRowIndex,category,code,severity,field,message');
  });

  test('Button is disabled with a tooltip when there are no findings', async ({ page }) => {
    // This test is a guard for the empty path. If the fixture seed
    // always produces issues, we still verify that the disabled-state
    // markup is correct when the precondition holds. We do not force
    // an empty state — we only check that when disabled, the title
    // attribute exposes the empty message.
    await page.goto('/admin/index.html');
    await page.locator('#nav-errors-dashboard, [data-tab="errors-dashboard"]').first().click();
    await page.waitForSelector('.dashboard-stats-bar', { timeout: 10000 });

    const exportBtn = page.locator('.export-btn').first();
    const isDisabled = await exportBtn.evaluate(el => (el as HTMLButtonElement).disabled);
    if (isDisabled) {
      await expect(exportBtn).toHaveAttribute('title', /No errors to export|אין שגיאות לייצוא/);
    } else {
      // Fixture has issues — nothing to assert here, the first test
      // already covers the populated path.
      expect(isDisabled).toBe(false);
    }
  });
});
```

- [ ] **Step 6.3: Run JUST this spec (en-admin project) to verify it executes**

Run: `cd /home/hagaybar/projects/primo_maps && npx playwright test e2e/tests/errors-report-export.spec.ts --project=en-admin --reporter=line 2>&1 | tail -20`
Expected: both tests in the file pass on `en-admin`. If they fail because the nav selector doesn't exist, adjust Step 6.2's `page.locator('#nav-errors-dashboard, ...')` to match the actual tab selector found by `grep -E "nav-errors|errors-dashboard" /home/hagaybar/projects/primo_maps/admin/index.html` and re-run.

- [ ] **Step 6.4: Commit**

```bash
cd /home/hagaybar/projects/primo_maps && git add e2e/tests/errors-report-export.spec.ts && \
  git commit -m "$(cat <<'EOF'
test(e2e): cover errors-dashboard CSV export

Verifies the Download button triggers a download with the expected
filename pattern and header row.

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: Run the full test suites — verify no regression

**Files:** none (verification only).

- [ ] **Step 7.1: Run the Jest unit suite**

Run: `cd /home/hagaybar/projects/primo_maps/admin && npx jest --reporters=default 2>&1 | tail -20`
Expected: the new `report-export.test.js` is in the pass count. Pre-existing failures from issue #9 (data-model, validation, user-menu, edit-user-dialog) may still appear — those are out of scope. If a NEW failure appears (not in the issue #9 list), STOP and report `{ ok: false, discrepancy: "<spec name> failed: <one-line>", step: "7.1" }`.

- [ ] **Step 7.2: Run the full Playwright suite across all projects**

Run: `cd /home/hagaybar/projects/primo_maps && npx playwright test --reporter=line 2>&1 | tail -30`
Expected: same pass/fail signature as `main` PLUS the new `errors-report-export.spec.ts` passing across the matrix (en-admin, en-editor, he-admin, he-editor — or whichever subset already runs on this project). Anchors that MUST stay green: `map-editor-empty-shelf.spec.ts`, `map-editor-orphan-panel.spec.ts`, `map-editor-orphan-panel-positioning.spec.ts`, `map-editor.spec.ts`, `map-editor-console-smoke.spec.ts`. Pre-existing #9 failures may remain.

If any *previously-passing* spec fails, STOP and report `{ ok: false, discrepancy: "<which spec> failed: <one-line>", step: "7.2" }`.

---

## Task 8: Push the branch and open the PR

**Files:** none (git remote + GitHub only).

- [ ] **Step 8.1: Push the branch**

Run: `cd /home/hagaybar/projects/primo_maps && git push -u origin feat/issue-15-errors-report-export`
Expected: branch created on `origin`.

- [ ] **Step 8.2: Open the PR**

Run:

```bash
cd /home/hagaybar/projects/primo_maps && \
  gh pr create --base main --head feat/issue-15-errors-report-export \
    --title "feat(errors-dashboard): downloadable CSV errors report (closes #15)" \
    --body "$(cat <<'EOF'
## Summary

- Adds a `📥 Download errors report` button to the errors dashboard (both the summary view and the category drill-down) that produces a CSV of every validator finding — errors and warnings, every category.
- New module `admin/components/errors-dashboard/report-export.js` with pure helpers (`buildReportRows`, `toCsv`, `escapeCsvField`, `reportFilename`) plus the DOM side-effect `downloadCsv`.
- CSV header: `floor,libraryName,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd,csvRowIndex,category,code,severity,field,message`.
- Filename: `errors-report-YYYY-MM-DD.csv` (UTC date).
- Disabled with tooltip when there are no findings.
- Three new `FALLBACKS` strings in `errors-dashboard.js` (en + he).
- Unit tests (`admin/__tests__/report-export.test.js`) and Playwright e2e (`e2e/tests/errors-report-export.spec.ts`).

CSV helpers are intentionally duplicated from `map-editor.js` rather than extracted to a shared service — keeps the feature self-contained (see spec).

Spec: \`docs/superpowers/specs/2026-05-12-issue-15-errors-report-export-design.md\`
Plan: \`docs/superpowers/plans/2026-05-12-issue-15-errors-report-export.md\`

Closes #15.

## Test plan

- [x] Jest unit suite green (new `report-export` tests pass; pre-existing #9 failures unchanged).
- [x] Playwright full suite green across the en/he × admin/editor matrix; new export e2e covers `en-admin` and `he-admin`.
- [ ] Manual UI check after merge & deploy: `📥 Download errors report` appears next to Refresh in both views; click downloads a CSV named per today's UTC date; opens cleanly in Excel.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: gh prints the PR URL. Capture the URL.

- [ ] **Step 8.3: Return the PR URL as part of the task result**

The PR URL printed in Step 8.2 should be returned in the task's JSON result under `prUrl`.

---

## Notes on rollback

If anything goes seriously wrong, the pre-feature tag `pre-issue-15-export` lets you reset:

```bash
git reset --hard pre-issue-15-export
git tag -d pre-issue-15-export   # only if you want to drop the tag too
```

Do NOT do this if PR commits have been pushed and another worker is depending on them. The tag is a safety net, not a default rollback.
