# Issue #15 — Downloadable errors report

**Status:** Spec approved 2026-05-12. Implementation pending.
**Issue:** [#15](https://github.com/hagaybar/NDE_MAPS_MANGER/issues/15)
**Scope decision:** Issue narrowed to "export feature only" — the errors dashboard already aggregates, categorises, and surfaces fix-dialogs. The one missing piece is the downloadable CSV.

---

## Goal

Add a one-click "Download errors report" button to the errors dashboard. Clicking it produces a CSV of every finding the validator has detected — errors *and* warnings, every category — so the librarian can save, share, and diff offline (typically in Excel).

No filter UI. No per-category exports. One button → one CSV with everything.

## User flow

1. Librarian opens the errors dashboard (any view: summary or category drill-down).
2. Sees a `📥 Download errors report` button in the dashboard header (next to the refresh control).
3. Clicks it.
4. Browser downloads `errors-report-YYYY-MM-DD.csv` (UTC date).
5. Librarian opens the CSV in Excel / Numbers / a text editor.

Disabled state: when `allIssues.length === 0`, the button is grayed out with tooltip "No errors to export" (en) / "אין שגיאות לייצוא" (he).

## CSV shape

One row per finding. Columns in order:

| Column | Source field | Notes |
|---|---|---|
| `floor` | `issue.row.floor` | Integer-as-string (0/1/2) |
| `libraryName` | `issue.row.libraryName` | Free text |
| `collectionName` | `issue.row.collectionName` | Free text |
| `shelfLabel` | `issue.row.shelfLabel` | Free text |
| `svgCode` | `issue.row.svgCode` | The CSV's svgCode for this row |
| `rangeStart` | `issue.row.rangeStart` | Free text (call-number form) |
| `rangeEnd` | `issue.row.rangeEnd` | Free text |
| `csvRowIndex` | `issue.rowIndex + 2` | 1-based row number including header line. This is the line number the librarian sees when scrolling in Excel. |
| `category` | `issue.category` | `required`, `range`, `floor`, `duplicate`, `svgCode`, `overlap`, `description`, `format` |
| `code` | `issue.code` | E001…E006, etc. The granular validator code. |
| `severity` | `issue.type` | `error` or `warning` |
| `field` | `issue.field` | Which CSV column the finding points at (may be empty for cross-row issues like overlaps). |
| `message` | `issue.message` | The human-readable diagnostic. Already i18n-ready: validator emits en or he based on locale. |

**Encoding:** UTF-8. CSV field rule: wrap in double quotes when the value contains a comma, double quote, or newline; escape inner double quotes by doubling them. No BOM (matches existing `toCSV` in `map-editor.js`).

**Header row:** Plain English column names (the table above). Not localised — CSV is a data-exchange artifact, not a UI surface. Matches the existing `mapping.csv` convention.

## Architecture

### New module — `admin/components/errors-dashboard/report-export.js`

Three pure helpers + one DOM helper. ~80 lines.

```js
// Pure: shape findings into export rows
export function buildReportRows(allIssues) {
  return allIssues.map(issue => ({
    floor: issue.row.floor ?? '',
    libraryName: issue.row.libraryName ?? '',
    collectionName: issue.row.collectionName ?? '',
    shelfLabel: issue.row.shelfLabel ?? '',
    svgCode: issue.row.svgCode ?? '',
    rangeStart: issue.row.rangeStart ?? '',
    rangeEnd: issue.row.rangeEnd ?? '',
    csvRowIndex: issue.rowIndex + 2,
    category: issue.category,
    code: issue.code,
    severity: issue.type,
    field: issue.field ?? '',
    message: issue.message ?? '',
  }));
}

// Pure: serialise rows to CSV
export function toCsv(rows) { /* copy of map-editor.js:toCSV, scoped */ }
export function escapeCsvField(value) { /* copy of map-editor.js:escapeCSVField */ }

// Side-effecting: trigger browser download
export function downloadCsv(filename, content) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Pure: filename builder
export function reportFilename(now = new Date()) {
  const iso = now.toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
  return `errors-report-${iso}.csv`;
}
```

### Wiring — `admin/components/errors-dashboard.js`

1. Import the helpers from `./errors-dashboard/report-export.js`.
2. Add three i18n keys in the local `i18nKeys` object at the top of the file (matches existing pattern):
   - `errorsDashboard.export.cta` = `"📥 Download errors report"` / `"📥 הורד דוח שגיאות"`
   - `errorsDashboard.export.empty` = `"No errors to export"` / `"אין שגיאות לייצוא"`
   - `errorsDashboard.export.error` = `"Could not generate the report."` / `"לא ניתן ליצור את הדוח."` (used in the error-handling fallback below)
3. Add a button to the dashboard header — both `renderSummaryView()` and `renderCategoryView()` already render a header `<div>`; add the button there. Reuse the existing button styling next to the refresh control.
4. Onclick handler:
   ```js
   const rows = buildReportRows(allIssues);
   const csv = toCsv(rows);
   downloadCsv(reportFilename(), csv);
   ```
5. Disable the button when `allIssues.length === 0`. Title attribute = the `errorsDashboard.export.empty` string.

### CSV-helper duplication

By design, we **copy** `toCSV` / `escapeCSVField` from `map-editor.js` into the new module rather than refactor to a shared `csv-utils.js`. Rationale: the extraction would touch unrelated files outside this feature's scope, and the duplicated code is ~20 lines of well-understood logic. If a third caller needs CSV serialisation later, that's the right moment to consolidate.

## Tests

### Jest unit — `admin/__tests__/report-export.test.js`

- `buildReportRows`
  - Maps every column from a single error issue.
  - Maps every column from a single warning issue.
  - Empty/null source fields become `''` (not `undefined`, not `null`).
  - `csvRowIndex` is 1-based + 2-offset (Excel-friendly).
- `toCsv`
  - Header row matches the spec.
  - Values containing comma are quoted.
  - Values containing double quote have doubled inner quotes and outer quotes.
  - Values containing newline are quoted.
  - Empty array produces just the header row.
- `escapeCsvField`
  - Plain strings unchanged.
  - Comma → quoted.
  - Double quote → doubled + quoted.
  - Newline → quoted.
- `reportFilename`
  - Uses UTC date.
  - Format is `errors-report-YYYY-MM-DD.csv`.

### Playwright e2e — `e2e/tests/errors-report-export.spec.ts`

- Authenticate as admin, go to errors dashboard.
- Wait for findings to populate.
- Click the download button; assert the browser fires a download event with filename matching `errors-report-\d{4}-\d{2}-\d{2}\.csv`.
- Parse the downloaded CSV (Playwright supports `download.saveAs` → read file). Assert:
  - First line is the expected header.
  - At least 1 data row (the fixture is seeded with known errors).
  - One known E006 finding appears with `category=svgCode`, `severity=error`.
- Cover both `en-admin` and `he-admin` projects so the i18n button label is verified.

### Out of scope

- Filter UI (deferred).
- JSON export (CSV is sufficient for the librarian's Excel workflow).
- Server-side export (everything happens in-browser; no Lambda touched).
- Deep links from the CSV back into the admin (the librarian works offline once exported).

## Error handling

- If `allIssues` is unset (dashboard not yet initialised), the button is disabled (no click handler fires).
- If `downloadCsv` throws (very rare — old browsers without `Blob` support), surface a toast via the existing `showToast` helper: `i18n.t('errorsDashboard.export.error')` (defined in the i18n section above).
- No retry. The button is idempotent — user can click again.

## File-by-file change list

| File | Change |
|---|---|
| `admin/components/errors-dashboard/report-export.js` | **new** — helpers above |
| `admin/components/errors-dashboard.js` | import helpers, add button to both view headers, wire onclick, three new i18n keys |
| `admin/__tests__/report-export.test.js` | **new** — Jest unit tests |
| `e2e/tests/errors-report-export.spec.ts` | **new** — Playwright e2e |

No SVG changes. No CSS changes (button uses existing Tailwind utility classes already in use elsewhere on the dashboard). No Lambda changes.

## Rollout

1. Feature branch `feat/issue-15-errors-report-export` off `main` at the current HEAD.
2. Pre-feature rollback tag `pre-issue-15-export` on `main` (per user's rollback-safety preference).
3. Standard babysitter-driven task-by-task implementation.
4. Open PR; merge; redeploy admin via `redeploy.sh`; invalidate `/admin/*`.

No data migrations. No CSV schema change. No floor SVG re-upload.
