# Data Quality Dashboard — root-cause overlap report

**Date:** 2026-06-02
**Status:** design (awaiting owner review)
**Scope:** client-side admin SPA only (`admin/components/errors-dashboard*`). No server / Lambda / S3 / CloudFront changes. Adds one self-hosted, lazy-loaded vendor library (ExcelJS) used only for the Excel export. The cluster logic and the workbook *model* are jest-testable; the thin ExcelJS write/download is covered by e2e/manual.

## Problem

The Data Quality Dashboard lists every range-overlap (`W001`) warning as its own
flat row. One oversized range commonly overlaps many small, legitimate shelf
ranges, so a single mistake produces a cascade of warnings. Example from live
data: Row 406's range `497.45058–792(43)` (Reading room 2 B, Floor 2) overlaps
~30 small ranges; each emits a separate warning saying "overlaps with Row 406".

The librarian sees 30 scattered yellow rows and cannot tell that **one** fix
clears them all. They need to (1) identify the few root-cause ranges quickly and
(2) see the magnitude of each one's effect, so they fix the highest-impact range
first. This must hold both on screen **and** in the report they download/print.

## Goals

- Surface **root-cause ranges** (a range that overlaps ≥ 2 others) prominently,
  each with its **blast radius** (how many ranges it breaks).
- Group each root cause's affected ranges beneath it; rank root causes by blast
  radius (biggest first).
- Keep the screen view uncluttered (affected ranges collapsed by default).
- Give the **downloaded Excel report** and the **printed report** the *same*
  root-cause structure and visual marking as the screen — no drift between views.
  (The Excel file gets full visual parity: bold root-cause rows, colour fills,
  and Excel's native collapsible row-grouping.)

## Non-goals (YAGNI)

- No change to validation rules, overlap math, `mapping.csv`, or any server code.
- No editing from the dashboard — it stays read-only; fixing happens in the
  Location Editor (the dashboard navigates there).
- No clustering for non-overlap categories (missing fields, broken refs) — those
  render as today. Duplicate-entry clustering could reuse the engine later; out
  of scope now.

## Architecture: one model, three views

The core principle is a single **cluster model** computed once and consumed
identically by the screen view, the print view, and the Excel export. This keeps
the three from drifting and isolates the only non-trivial logic into one pure,
unit-testable function.

### 1. Cluster model (pure function)

New module: `admin/components/errors-dashboard/overlap-clusters.js`.

```
buildOverlapClusters(rows) -> {
  clusters: [
    { hubRowIndex, hubRow, blastRadius, affected: [{ rowIndex, row }], collection, floor }
    // sorted by blastRadius desc, then hubRowIndex asc
  ],
  otherOverlaps: [ { row1Index, row2Index, collection, floor } ],  // pairs with no hub
}
```

Algorithm:

1. Call the existing `findOverlappingRanges(rows)` (in `data-model.js`) to get
   **all** overlapping pairs `{row1Index, row2Index, collection, floor}`. (This
   already enumerates every pair within a `collection|floor` group — unlike the
   per-row `validateRow` path, which stops at the first overlap.)
2. Build an adjacency map: for each row index, the set of row indices it
   overlaps. **`blastRadius(row) = size of its overlap set`.**
3. **Hubs** = rows with `blastRadius ≥ 2`, sorted by `blastRadius` desc, then by
   `rowIndex` asc (deterministic tie-break).
4. Assign affected ranges greedily, so a range is listed under exactly one hub:
   process hubs in the sorted order; each hub **claims** its still-unclaimed
   overlap partners as its `affected` list (sorted by `rowIndex` asc). A range
   already claimed by an earlier (higher-impact) hub is not repeated. A hub is
   never nested as another hub's child (it always appears as its own group).
5. Any overlap pair where **neither** endpoint is a hub (i.e. both have
   `blastRadius < 2` — an isolated A↔B pair) goes to `otherOverlaps`.

**Root-cause threshold = `blastRadius ≥ 2`** (named constant
`ROOT_CAUSE_MIN_BLAST = 2`, so it is a one-line change later if needed).

This function depends only on `findOverlappingRanges` + plain data; no DOM, no
fetch. It is the single source of truth for all three views.

### 2. Screen view (collapsible groups)

In `errors-dashboard.js`, the Overlaps category renders from the cluster model:

- A one-line section summary: e.g. **"2 root causes · 37 ranges affected"**.
- One **collapsible group per cluster**, ordered biggest blast radius first:
  - Bold header: `⚠ ROOT CAUSE · Row {N} "{rangeStart}–{rangeEnd}" · affects {M} ranges · Floor {F} · {collection}` and a **"Fix this range →"** button.
  - Affected ranges nested underneath, **collapsed by default** (a disclosure
    triangle expands them). Each child shows its row, shelf label, and range.
- **"Other overlaps"** group below, listing the non-hub pairs plainly (today's
  style), so nothing is hidden.
- If there are zero overlaps, the section is omitted entirely (consistent with
  the broken-refs toggle / orphan-badge "hide at count 0" rule).

### 3. Print view (same visual enhancement on paper)

Printing must show the *same* enhancement, not a raw grid. Achieved with a
print stylesheet on the dashboard plus an expand-for-print step:

- A **"🖨 Print report"** action calls `window.print()` after expanding all
  collapsed cluster groups (collapsibles cannot be opened on paper).
- An `@media print` block: hides app chrome (nav, buttons, toolbars), forces all
  cluster groups expanded, keeps the bold root-cause headers + blast-radius
  counts, and applies `break-inside: avoid` so a cluster isn't split across
  pages where possible.
- Because print renders the **same DOM** as the screen view, visual parity is
  automatic — there is no second layout to maintain.

### 4. Excel (.xlsx) export via ExcelJS (full visual parity in the file)

The downloaded report is a real `.xlsx` (`errors-report-YYYY-MM-DD.xlsx`),
generated with **ExcelJS** so the file carries the *same* visual enhancement as
the screen — not just structure:

- **Bold root-cause rows** with a coloured fill; affected ranges in a normal
  style indented beneath.
- **Native Excel row-grouping (outline)**: each hub's affected ranges are an
  outline group under the hub row, so the librarian can **collapse/expand them
  inside Excel** — mirroring the on-screen collapsible groups. Groups collapsed
  by default.
- **Row order** = the cluster model: each cluster (biggest blast radius first) =
  hub row then its affected ranges; then an "Other overlaps" block; then the
  non-overlap issues. A blast-radius value sits on each hub row.
- Same data columns as today (floor, library, collection, shelf, svgCode, range,
  CSV row, category, code, severity, field, message) plus a `Root cause` / 
  `Affects` marker; column widths set for readability; a frozen header row.

**Dependency handling.** ExcelJS is **vendored** into the app
(`admin/vendor/exceljs.min.js`, an ESM/browser build served from our own S3 —
no new external runtime dependency, consistent with self-hosting) and
**lazy-loaded** via dynamic `import()` only when the export button is clicked, so
normal dashboard load is unchanged. It is excluded from `redeploy.sh`'s lint of
hand-written modules but synced like other static assets.

**Testability split.** A pure function
`buildReportWorkbookModel(clusters, otherOverlaps, otherIssues) -> { sheetName, columns, rows:[{ cells, style:'hub'|'affected'|'plain', outlineLevel, blastRadius }] }`
produces an abstract, ExcelJS-agnostic description of the sheet (order, styles,
grouping). This is fully unit-tested. A thin adapter
(`writeWorkbook(model) -> Blob` + download) maps that model onto ExcelJS calls;
it has no branching logic and is covered by e2e/manual verification rather than
asserting on binary `.xlsx` bytes. `report-export.js` is repurposed to hold the
workbook model + adapter (the old CSV `buildReportRows`/`toCsv` are superseded;
a raw-CSV option can be re-added trivially later if anyone needs machine-readable
data — out of scope now).

### 5. The "Fix this range →" action

Clicking it navigates to the **Location Editor** focused on the hub's row
(reusing the existing `errorsDashboardNavigate → location-editor` event path
already wired in `app.js`). The librarian lands on the offending range to
correct it; saving goes through the normal (bundle-invariant-guarded) path.
(Related: #131 reports the per-issue go-to-row nav as dead because the dashboard
drops `details`. The cluster engine sidesteps that by carrying the hub's
`rowIndex` directly, so this navigation does not depend on #131; #131 remains a
separate fix for the per-issue list.)

## Data flow

```
loadCSVData() -> csvData
   └─ validateAllRows()            (unchanged: per-issue list for other categories)
   └─ buildOverlapClusters(csvData)  (new: the cluster model)
         ├─ screen renderer  -> collapsible groups + summary
         ├─ print (@media print + expand) -> same DOM, paper-styled
         └─ buildReportWorkbookModel(clusters, ...) -> writeWorkbook() -> .xlsx download
                                            (ExcelJS lazy-loaded on click)
```

## Edge cases

- **Unparseable range boundary** (e.g. malformed tokens): excluded from overlap
  math already by `doRangesOverlap` — such rows simply don't form edges.
- **Chain overlaps** (A–B–C where B overlaps both but A,C don't overlap): B has
  blastRadius 2 → hub; A and C are its affected ranges. Deterministic.
- **Two hubs overlap each other** (two oversized ranges): the higher-blast-radius
  hub claims the shared edge; both still appear as their own groups for their
  other partners. No range is listed twice.
- **Zero overlaps:** overlaps section hidden; the Excel file omits the overlap
  block; "Print report" still works for the remaining categories.
- **Threshold boundary:** a range overlapping exactly 1 other (a plain pair) is
  **not** a root cause → it appears under "Other overlaps" on screen and in the
  Excel file's other-overlaps block.
- **ExcelJS fails to load** (offline / asset missing): the export button shows
  the existing "Could not generate the report" toast; the dashboard view and
  Print are unaffected.

## Testing (jest, client-side)

`overlap-clusters.test.js` (the core logic):
- One giant range over N small ranges → 1 cluster, hub = giant, `blastRadius = N`,
  affected lists the N small rows; `otherOverlaps` empty.
- Two independent pairs → 0 clusters, both pairs in `otherOverlaps`.
- Chain A–B–C → hub = B, affected = [A, C].
- Two overlapping hubs → no range listed twice; deterministic hub ordering.
- Tie-break by `rowIndex` when blast radii are equal.
- Threshold: a single pair (blastRadius 1 each) is not a root cause.

`report-export.test.js` (rework for the workbook model): `buildReportWorkbookModel`
emits rows in cluster order; hub rows carry `style:'hub'` + `blastRadius` +
`outlineLevel:0`; affected rows carry `style:'affected'` + `outlineLevel:1`;
"Other overlaps" then non-overlap issues follow; empty input yields a model with
just the header/columns. (The ExcelJS adapter `writeWorkbook` is not unit-tested
on bytes — see Scope.)

`errors-dashboard` render test: root-cause header shows the count, children are
collapsed by default and expand on click, the summary line is correct, the
section is hidden at zero overlaps, and "Fix this range →" dispatches the
location-editor navigation for the hub row. A fixture mirrors the Row-406 case.

(Print `@media print` CSS and the `window.print()` trigger are not unit-asserted;
the expand-before-print toggle is, via the same render test.)

## Files touched

- `admin/components/errors-dashboard/overlap-clusters.js` — **new**, pure cluster engine.
- `admin/components/errors-dashboard.js` — render clusters; summary line; "Fix" + "Print report" actions; expand-before-print.
- `admin/components/errors-dashboard/report-export.js` — repurposed: `buildReportWorkbookModel` (pure) + thin `writeWorkbook` ExcelJS adapter + `.xlsx` download.
- `admin/vendor/exceljs.min.js` — **new**, vendored ExcelJS browser/ESM build (self-hosted, lazy-loaded on export).
- `admin/styles/*` (dashboard CSS) — cluster group styling + `@media print` block.
- `admin/i18n/en.json` + `he.json` — new strings (summary, root-cause label, affects-count, print, download-excel, fix).
- `admin/__tests__/` — `overlap-clusters.test.js` (new), extend `report-export` + dashboard render tests.

## Out of scope / follow-ups

- #131 (per-issue go-to-row navigation) — separate; this design does not depend on it.
- #105 (per-error-type distribution/filter) — this is the better answer for the
  overlaps category specifically; the broader filter work remains separate.
- Library-name grouping consistency in `findOverlappingRanges` (it groups by
  `collection|floor`, not library) — moot for the current single-library data
  (matches the #98 caveat); note but do not change here.
