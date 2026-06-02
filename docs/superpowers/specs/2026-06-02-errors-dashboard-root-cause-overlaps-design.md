# Data Quality Dashboard — root-cause overlap report

**Date:** 2026-06-02
**Status:** design (awaiting owner review)
**Scope:** client-side admin SPA only (`admin/components/errors-dashboard*`). No server / Lambda / S3 / CloudFront changes. Fully jest-testable.

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
- Give the **downloaded report** and the **printed report** the *same*
  root-cause structure and marking — no drift between views.

## Non-goals (YAGNI)

- No change to validation rules, overlap math, `mapping.csv`, or any server code.
- No editing from the dashboard — it stays read-only; fixing happens in the
  Location Editor (the dashboard navigates there).
- No clustering for non-overlap categories (missing fields, broken refs) — those
  render as today. Duplicate-entry clustering could reuse the engine later; out
  of scope now.

## Architecture: one model, three views

The core principle is a single **cluster model** computed once and consumed
identically by the screen view, the print view, and the CSV export. This keeps
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

### 4. CSV export (same structure, carried into the data file)

`report-export.js` is extended so the downloaded `errors-report-YYYY-MM-DD.csv`
carries the cluster structure (a spreadsheet/print can't bold, so the
enhancement is expressed structurally):

- **Row order** follows the cluster model: for each cluster (biggest blast
  radius first) the hub row, then its affected ranges; then "Other overlaps";
  then all non-overlap issues (today's order) after the overlap block.
- **New columns** appended to the existing column set:
  - `rootCause` — `"ROOT CAUSE"` on a hub row, else empty.
  - `affectsCount` — the hub's blast radius (only on the hub row).
  - `rootCauseRow` — on an affected range, the CSV row number of its hub (so
    grouping survives sorting/filtering in a spreadsheet).
- Existing columns and CSV-escaping rules are unchanged; only ordering + three
  columns are added, so existing consumers keep working.

`buildReportRows(allIssues)` gains an overload/variant that takes the cluster
model so the export and the screen share the same ordering and markers.

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
         └─ buildReportRows(..., clusters) -> toCsv() -> downloadCsv()
```

## Edge cases

- **Unparseable range boundary** (e.g. malformed tokens): excluded from overlap
  math already by `doRangesOverlap` — such rows simply don't form edges.
- **Chain overlaps** (A–B–C where B overlaps both but A,C don't overlap): B has
  blastRadius 2 → hub; A and C are its affected ranges. Deterministic.
- **Two hubs overlap each other** (two oversized ranges): the higher-blast-radius
  hub claims the shared edge; both still appear as their own groups for their
  other partners. No range is listed twice.
- **Zero overlaps:** overlaps section hidden; CSV omits the overlap block;
  "Print report" still works for the remaining categories.
- **Threshold boundary:** a range overlapping exactly 1 other (a plain pair) is
  **not** a root cause → it appears under "Other overlaps" on screen and in the
  CSV's other-overlaps block.

## Testing (jest, client-side)

`overlap-clusters.test.js` (the core logic):
- One giant range over N small ranges → 1 cluster, hub = giant, `blastRadius = N`,
  affected lists the N small rows; `otherOverlaps` empty.
- Two independent pairs → 0 clusters, both pairs in `otherOverlaps`.
- Chain A–B–C → hub = B, affected = [A, C].
- Two overlapping hubs → no range listed twice; deterministic hub ordering.
- Tie-break by `rowIndex` when blast radii are equal.
- Threshold: a single pair (blastRadius 1 each) is not a root cause.

`report-export.test.js` (extend): rows ordered by cluster; `rootCause`,
`affectsCount`, `rootCauseRow` columns populated correctly; header includes the
new columns; empty input still emits the header.

`errors-dashboard` render test: root-cause header shows the count, children are
collapsed by default and expand on click, the summary line is correct, the
section is hidden at zero overlaps, and "Fix this range →" dispatches the
location-editor navigation for the hub row. A fixture mirrors the Row-406 case.

(Print `@media print` CSS and the `window.print()` trigger are not unit-asserted;
the expand-before-print toggle is, via the same render test.)

## Files touched

- `admin/components/errors-dashboard/overlap-clusters.js` — **new**, pure cluster engine.
- `admin/components/errors-dashboard.js` — render clusters; summary line; "Fix" + "Print report" actions; expand-before-print.
- `admin/components/errors-dashboard/report-export.js` — cluster-ordered rows + 3 new columns.
- `admin/styles/*` (dashboard CSS) — cluster group styling + `@media print` block.
- `admin/i18n/en.json` + `he.json` — new strings (summary, root-cause label, affects-count, print, fix).
- `admin/__tests__/` — `overlap-clusters.test.js` (new), extend `report-export` + dashboard render tests.

## Out of scope / follow-ups

- #131 (per-issue go-to-row navigation) — separate; this design does not depend on it.
- #105 (per-error-type distribution/filter) — this is the better answer for the
  overlaps category specifically; the broader filter work remains separate.
- Library-name grouping consistency in `findOverlappingRanges` (it groups by
  `collection|floor`, not library) — moot for the current single-library data
  (matches the #98 caveat); note but do not change here.
