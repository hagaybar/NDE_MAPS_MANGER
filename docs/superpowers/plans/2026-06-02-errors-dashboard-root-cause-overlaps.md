# Root-cause overlap report — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restructure the Data Quality Dashboard's range-overlap (W001) report so root-cause ranges (a range overlapping ≥ 2 others) are surfaced with their blast radius across three views — on-screen collapsible groups, a Print report, and a styled `.xlsx` export.

**Architecture:** One pure cluster engine computes the model from the existing `findOverlappingRanges`; that single model feeds (a) the on-screen renderer, (b) a print stylesheet, and (c) an Excel workbook model written via vendored, lazy-loaded ExcelJS. Client-side admin SPA only; no server/Lambda/AWS changes.

**Tech Stack:** Vanilla ES-module JS (no bundler), jest (ESM via `node --experimental-vm-modules`), ExcelJS (vendored browser build, lazy `import()`).

**Spec:** `docs/superpowers/specs/2026-06-02-errors-dashboard-root-cause-overlaps-design.md`

**Conventions for every test run in this plan:** from `admin/`, run
`node --experimental-vm-modules node_modules/.bin/jest <file>` for a single file,
or `npm test` for the full suite. End each commit message with the trailer
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.

**Branch:** `feat/dashboard-root-cause-overlaps` (already created; spec committed).

---

## File structure

- **Create** `admin/components/errors-dashboard/overlap-clusters.js` — pure cluster engine (`buildOverlapClusters`, `ROOT_CAUSE_MIN_BLAST`).
- **Create** `admin/__tests__/overlap-clusters.test.js` — unit tests for the engine.
- **Modify** `admin/components/errors-dashboard/report-export.js` — replace CSV builders with `buildReportWorkbookModel` (pure) + `writeWorkbook` (thin ExcelJS adapter) + `reportFilename` (→ `.xlsx`).
- **Modify** `admin/__tests__/report-export.test.js` — rewrite for the workbook model.
- **Create** `admin/vendor/exceljs.min.js` — vendored ExcelJS browser/ESM build (lazy-loaded).
- **Modify** `admin/components/errors-dashboard.js` — render clusters in the `overlap` category; summary line; Print button + expand-before-print; export → `.xlsx`; new FALLBACKS strings.
- **Modify** `admin/styles/app.css` (or the dashboard stylesheet) — cluster group styling + `@media print` block.
- **Modify** `admin/i18n/en.json` + `admin/i18n/he.json` — mirror the new strings (kept in sync with FALLBACKS).

---

## Task 1: Cluster engine (pure)

**Files:**
- Create: `admin/components/errors-dashboard/overlap-clusters.js`
- Test: `admin/__tests__/overlap-clusters.test.js`

Reference: `findOverlappingRanges(rows)` (in `admin/services/data-model.js`) returns
`[{ row1Index, row2Index, collection, floor }]` for **every** overlapping pair within a
`collectionName|floor` group. `rows` are the dashboard's `csvData` objects (each has
`floor`, `collectionName`, `rangeStart`, `rangeEnd`, etc.).

- [ ] **Step 1: Write the failing test**

```js
// admin/__tests__/overlap-clusters.test.js
/** @jest-environment node */
import { jest } from '@jest/globals';

// Stub data-model.findOverlappingRanges so the engine is tested in isolation.
let PAIRS = [];
jest.unstable_mockModule('../services/data-model.js', () => ({
  findOverlappingRanges: () => PAIRS,
}));
const { buildOverlapClusters, ROOT_CAUSE_MIN_BLAST } =
  await import('../components/errors-dashboard/overlap-clusters.js');

// Helper: rows indexed 0..N; only identity matters for these tests.
const rows = Array.from({ length: 12 }, (_, i) => ({ _index: i, collectionName: 'C', floor: '2' }));

afterEach(() => { PAIRS = []; });

test('one giant range over N small ranges => 1 cluster, hub = giant, blast = N', () => {
  // Row 5 overlaps rows 1,2,3 (a star). findOverlappingRanges emits each pair once.
  PAIRS = [
    { row1Index: 1, row2Index: 5, collection: 'C', floor: '2' },
    { row1Index: 2, row2Index: 5, collection: 'C', floor: '2' },
    { row1Index: 3, row2Index: 5, collection: 'C', floor: '2' },
  ];
  const { clusters, otherOverlaps } = buildOverlapClusters(rows);
  expect(clusters).toHaveLength(1);
  expect(clusters[0].hubRowIndex).toBe(5);
  expect(clusters[0].blastRadius).toBe(3);
  expect(clusters[0].affected.map(a => a.rowIndex)).toEqual([1, 2, 3]);
  expect(otherOverlaps).toHaveLength(0);
});

test('two independent simple pairs => no clusters, both pairs in otherOverlaps', () => {
  PAIRS = [
    { row1Index: 1, row2Index: 2, collection: 'C', floor: '2' },
    { row1Index: 7, row2Index: 8, collection: 'C', floor: '2' },
  ];
  const { clusters, otherOverlaps } = buildOverlapClusters(rows);
  expect(clusters).toHaveLength(0);
  expect(otherOverlaps).toHaveLength(2);
});

test('chain A-B-C (B overlaps both) => hub = B, affected = [A, C]', () => {
  PAIRS = [
    { row1Index: 1, row2Index: 2, collection: 'C', floor: '2' }, // A-B
    { row1Index: 2, row2Index: 3, collection: 'C', floor: '2' }, // B-C
  ];
  const { clusters } = buildOverlapClusters(rows);
  expect(clusters).toHaveLength(1);
  expect(clusters[0].hubRowIndex).toBe(2);
  expect(clusters[0].affected.map(a => a.rowIndex)).toEqual([1, 3]);
});

test('hubs sorted by blast radius desc, tie broken by row index asc', () => {
  // Row 9 overlaps 1,2,3 (blast 3); Row 4 overlaps 5,6 (blast 2).
  PAIRS = [
    { row1Index: 1, row2Index: 9, collection: 'C', floor: '2' },
    { row1Index: 2, row2Index: 9, collection: 'C', floor: '2' },
    { row1Index: 3, row2Index: 9, collection: 'C', floor: '2' },
    { row1Index: 5, row2Index: 4, collection: 'C', floor: '2' },
    { row1Index: 6, row2Index: 4, collection: 'C', floor: '2' },
  ];
  const { clusters } = buildOverlapClusters(rows);
  expect(clusters.map(c => c.hubRowIndex)).toEqual([9, 4]);
});

test('two overlapping hubs are not nested under each other; no row listed twice', () => {
  // Rows 4 and 9 are both hubs and also overlap each other.
  PAIRS = [
    { row1Index: 1, row2Index: 4, collection: 'C', floor: '2' },
    { row1Index: 2, row2Index: 4, collection: 'C', floor: '2' },
    { row1Index: 6, row2Index: 9, collection: 'C', floor: '2' },
    { row1Index: 7, row2Index: 9, collection: 'C', floor: '2' },
    { row1Index: 4, row2Index: 9, collection: 'C', floor: '2' }, // hub-hub edge
  ];
  const { clusters } = buildOverlapClusters(rows);
  const hubIndexes = clusters.map(c => c.hubRowIndex).sort((a, b) => a - b);
  expect(hubIndexes).toEqual([4, 9]);
  // No hub appears as another hub's affected child.
  const allAffected = clusters.flatMap(c => c.affected.map(a => a.rowIndex));
  expect(allAffected).not.toContain(4);
  expect(allAffected).not.toContain(9);
  // No affected row listed under two hubs.
  expect(new Set(allAffected).size).toBe(allAffected.length);
});

test('ROOT_CAUSE_MIN_BLAST is 2', () => {
  expect(ROOT_CAUSE_MIN_BLAST).toBe(2);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-vm-modules node_modules/.bin/jest __tests__/overlap-clusters.test.js`
Expected: FAIL — `Cannot find module '../components/errors-dashboard/overlap-clusters.js'`.

- [ ] **Step 3: Write the implementation**

```js
// admin/components/errors-dashboard/overlap-clusters.js
/**
 * Root-cause overlap clustering for the Data Quality Dashboard.
 *
 * Turns the flat list of overlapping range PAIRS (from data-model's
 * findOverlappingRanges) into clusters keyed by a "hub" range — the range that
 * overlaps the most others. A hub that overlaps >= ROOT_CAUSE_MIN_BLAST ranges
 * is a root cause. Pure: no DOM, no fetch. Single source of truth for the
 * on-screen, print, and Excel views.
 *
 * @module components/errors-dashboard/overlap-clusters
 */
import { findOverlappingRanges } from '../../services/data-model.js';

export const ROOT_CAUSE_MIN_BLAST = 2;

/**
 * @param {Object[]} rows - the dashboard's csvData rows.
 * @returns {{ clusters: Array<{hubRowIndex, hubRow, blastRadius, affected: Array<{rowIndex,row}>, collection, floor}>,
 *             otherOverlaps: Array<{row1Index,row2Index,collection,floor}> }}
 */
export function buildOverlapClusters(rows) {
  const pairs = findOverlappingRanges(rows);

  const adj = new Map();   // index -> Set<index>
  const meta = new Map();  // index -> {collection, floor}
  const link = (a, b, collection, floor) => {
    if (!adj.has(a)) adj.set(a, new Set());
    adj.get(a).add(b);
    if (!meta.has(a)) meta.set(a, { collection, floor });
  };
  for (const p of pairs) {
    link(p.row1Index, p.row2Index, p.collection, p.floor);
    link(p.row2Index, p.row1Index, p.collection, p.floor);
  }

  const blast = (i) => (adj.has(i) ? adj.get(i).size : 0);

  // Hubs: degree >= threshold, ranked by blast radius desc then row index asc.
  const hubs = [...adj.keys()]
    .filter((i) => blast(i) >= ROOT_CAUSE_MIN_BLAST)
    .sort((a, b) => blast(b) - blast(a) || a - b);
  const hubSet = new Set(hubs);

  const claimed = new Set();
  const clusters = [];
  for (const h of hubs) {
    const affected = [...adj.get(h)]
      .filter((i) => i !== h && !hubSet.has(i) && !claimed.has(i))
      .sort((a, b) => a - b);
    affected.forEach((i) => claimed.add(i));
    const m = meta.get(h) || { collection: '', floor: '' };
    clusters.push({
      hubRowIndex: h,
      hubRow: rows[h],
      blastRadius: blast(h),
      affected: affected.map((i) => ({ rowIndex: i, row: rows[i] })),
      collection: m.collection,
      floor: m.floor,
    });
  }

  // Other overlaps: pairs where NEITHER endpoint is a hub (plain A<->B pairs).
  const otherOverlaps = pairs.filter(
    (p) => !hubSet.has(p.row1Index) && !hubSet.has(p.row2Index),
  );

  return { clusters, otherOverlaps };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-vm-modules node_modules/.bin/jest __tests__/overlap-clusters.test.js`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add admin/components/errors-dashboard/overlap-clusters.js admin/__tests__/overlap-clusters.test.js
git commit -m "feat(errors-dashboard): pure overlap-cluster engine (root cause = blast >= 2)"
```

---

## Task 2: Excel workbook model (pure)

The single source of truth for the exported file's rows/styles/grouping, with no
ExcelJS dependency (so it is unit-testable). The thin ExcelJS adapter comes in Task 3.

**Files:**
- Modify: `admin/components/errors-dashboard/report-export.js`
- Test: `admin/__tests__/report-export.test.js` (rewrite)

- [ ] **Step 1: Write the failing test** (replace the file's contents)

```js
// admin/__tests__/report-export.test.js
/** @jest-environment node */
import { buildReportWorkbookModel, reportFilename, WORKBOOK_COLUMNS }
  from '../components/errors-dashboard/report-export.js';

const csvData = [
  { floor: '2', libraryName: 'Lib', collectionName: 'C', shelfLabel: '69 A', svgCode: 'kb2_69_a', rangeStart: '701', rangeEnd: '704' }, // 0
  { floor: '2', libraryName: 'Lib', collectionName: 'C', shelfLabel: '69 B', svgCode: 'kb2_69_b', rangeStart: '704', rangeEnd: '705' }, // 1
  { floor: '2', libraryName: 'Lib', collectionName: 'C', shelfLabel: 'BIG',  svgCode: 'kb2_big',  rangeStart: '497', rangeEnd: '792' }, // 2 (hub)
];

const clusterModel = {
  clusters: [{
    hubRowIndex: 2, hubRow: csvData[2], blastRadius: 2, collection: 'C', floor: '2',
    affected: [{ rowIndex: 0, row: csvData[0] }, { rowIndex: 1, row: csvData[1] }],
  }],
  otherOverlaps: [],
};

test('hub row is first, styled "hub", carries blastRadius + ROOT CAUSE marker + outlineLevel 0', () => {
  const model = buildReportWorkbookModel(clusterModel, [], csvData);
  const hub = model.rows[0];
  expect(hub.style).toBe('hub');
  expect(hub.outlineLevel).toBe(0);
  expect(hub.blastRadius).toBe(2);
  expect(hub.cells.rootCause).toBe('ROOT CAUSE');
  expect(hub.cells.affects).toBe(2);
  expect(hub.cells.csvRow).toBe(4); // 0-based index 2 -> CSV row 4 (header + 1-based)
});

test('affected rows follow the hub, styled "affected", outlineLevel 1', () => {
  const model = buildReportWorkbookModel(clusterModel, [], csvData);
  expect(model.rows.slice(1, 3).map(r => r.style)).toEqual(['affected', 'affected']);
  expect(model.rows.slice(1, 3).map(r => r.outlineLevel)).toEqual([1, 1]);
  expect(model.rows[1].cells.shelfLabel).toBe('69 A');
});

test('non-overlap issues are appended as plain rows after the overlap block', () => {
  const otherIssues = [
    { rowIndex: 0, row: csvData[0], category: 'required', code: 'E001', type: 'error', message: 'X' },
  ];
  const model = buildReportWorkbookModel(clusterModel, otherIssues, csvData);
  const last = model.rows[model.rows.length - 1];
  expect(last.style).toBe('plain');
  expect(last.cells.code).toBe('E001');
});

test('empty input yields a model with columns and no rows', () => {
  const model = buildReportWorkbookModel({ clusters: [], otherOverlaps: [] }, [], []);
  expect(model.columns).toEqual(WORKBOOK_COLUMNS);
  expect(model.rows).toHaveLength(0);
});

test('reportFilename uses .xlsx and a UTC date', () => {
  expect(reportFilename(new Date('2026-06-02T23:30:00Z'))).toBe('errors-report-2026-06-02.xlsx');
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --experimental-vm-modules node_modules/.bin/jest __tests__/report-export.test.js`
Expected: FAIL — `buildReportWorkbookModel` / `WORKBOOK_COLUMNS` not exported (and old `toCsv`/`buildReportRows` gone).

- [ ] **Step 3: Write the implementation** (replace `report-export.js` contents)

```js
// admin/components/errors-dashboard/report-export.js
/**
 * Report export for the errors dashboard.
 *
 * `buildReportWorkbookModel` is a PURE description of the export sheet (rows,
 * styles, outline grouping) — no ExcelJS, fully unit-tested. `writeWorkbook` is
 * a thin adapter that maps that model onto a lazily-imported ExcelJS workbook
 * and triggers a browser download (not unit-tested on bytes; e2e/manual).
 *
 * @module components/errors-dashboard/report-export
 */

export const WORKBOOK_COLUMNS = [
  { key: 'floor', header: 'Floor', width: 8 },
  { key: 'libraryName', header: 'Library', width: 22 },
  { key: 'collectionName', header: 'Collection', width: 28 },
  { key: 'shelfLabel', header: 'Shelf', width: 12 },
  { key: 'svgCode', header: 'SVG code', width: 14 },
  { key: 'rangeStart', header: 'Range start', width: 12 },
  { key: 'rangeEnd', header: 'Range end', width: 12 },
  { key: 'csvRow', header: 'CSV row', width: 9 },
  { key: 'rootCause', header: 'Root cause', width: 12 },
  { key: 'affects', header: 'Affects', width: 9 },
  { key: 'category', header: 'Category', width: 12 },
  { key: 'code', header: 'Code', width: 8 },
  { key: 'severity', header: 'Severity', width: 10 },
  { key: 'message', header: 'Message', width: 90 },
];

function cells(row, extra) {
  return {
    floor: row?.floor ?? '',
    libraryName: row?.libraryName ?? '',
    collectionName: row?.collectionName ?? '',
    shelfLabel: row?.shelfLabel ?? '',
    svgCode: row?.svgCode ?? '',
    rangeStart: row?.rangeStart ?? '',
    rangeEnd: row?.rangeEnd ?? '',
    csvRow: extra.rowIndex != null ? extra.rowIndex + 2 : '',
    rootCause: extra.rootCause ?? '',
    affects: extra.affects ?? '',
    category: extra.category ?? '',
    code: extra.code ?? '',
    severity: extra.severity ?? '',
    message: extra.message ?? '',
  };
}

/**
 * @param {{clusters, otherOverlaps}} clusterModel - from buildOverlapClusters
 * @param {Array<{rowIndex,row,category,code,type,message}>} otherIssues - non-overlap issues
 * @param {Object[]} csvData - all rows (to resolve otherOverlaps indices)
 * @returns {{ columns: typeof WORKBOOK_COLUMNS, rows: Array<{cells, style, outlineLevel, blastRadius?}> }}
 */
export function buildReportWorkbookModel(clusterModel, otherIssues = [], csvData = []) {
  const rows = [];
  const { clusters = [], otherOverlaps = [] } = clusterModel || {};

  for (const c of clusters) {
    rows.push({
      style: 'hub',
      outlineLevel: 0,
      blastRadius: c.blastRadius,
      cells: cells(c.hubRow, {
        rowIndex: c.hubRowIndex, rootCause: 'ROOT CAUSE', affects: c.blastRadius,
        category: 'overlap', code: 'W001', severity: 'warning',
        message: `Overlaps ${c.blastRadius} ranges in "${c.collection}" (Floor ${c.floor})`,
      }),
    });
    for (const a of c.affected) {
      rows.push({
        style: 'affected',
        outlineLevel: 1,
        cells: cells(a.row, {
          rowIndex: a.rowIndex, category: 'overlap', code: 'W001', severity: 'warning',
          message: `Overlaps root-cause Row ${c.hubRowIndex + 2}`,
        }),
      });
    }
  }

  for (const p of otherOverlaps) {
    rows.push({
      style: 'plain',
      outlineLevel: 0,
      cells: cells(csvData[p.row1Index], {
        rowIndex: p.row1Index, category: 'overlap', code: 'W001', severity: 'warning',
        message: `Overlaps Row ${p.row2Index + 2} in "${p.collection}" (Floor ${p.floor})`,
      }),
    });
  }

  for (const issue of otherIssues) {
    rows.push({
      style: 'plain',
      outlineLevel: 0,
      cells: cells(issue.row, {
        rowIndex: issue.rowIndex, category: issue.category, code: issue.code,
        severity: issue.type, message: issue.message,
      }),
    });
  }

  return { columns: WORKBOOK_COLUMNS, rows };
}

/**
 * Canonical export filename. UTC date so it is timezone-stable.
 * @param {Date} [now]
 */
export function reportFilename(now = new Date()) {
  return `errors-report-${now.toISOString().slice(0, 10)}.xlsx`;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --experimental-vm-modules node_modules/.bin/jest __tests__/report-export.test.js`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add admin/components/errors-dashboard/report-export.js admin/__tests__/report-export.test.js
git commit -m "feat(errors-dashboard): pure workbook model for the root-cause report (replaces CSV)"
```

---

## Task 3: Vendor ExcelJS + the `writeWorkbook` adapter

**Files:**
- Create: `admin/vendor/exceljs.min.js`
- Modify: `admin/components/errors-dashboard/report-export.js` (add `writeWorkbook`)

- [ ] **Step 1: Vendor the ExcelJS browser ESM build**

Download a browser-capable ESM build of ExcelJS into the repo (so it is self-hosted on S3, no external runtime CDN). From repo root:

```bash
mkdir -p admin/vendor
curl -sL "https://esm.sh/exceljs@4.4.0/dist/exceljs.min.js" -o admin/vendor/exceljs.min.js
node -e "const s=require('fs').statSync('admin/vendor/exceljs.min.js'); if(s.size < 100000) throw new Error('exceljs vendor file too small: '+s.size)"
```

Expected: a file of ~hundreds of KB. (If `esm.sh` returns a redirect stub rather than the bundle, instead fetch the UMD build `https://cdnjs.cloudflare.com/ajax/libs/exceljs/4.4.0/exceljs.min.js` and load it via a classic-script shim — see Step 3 note.)

- [ ] **Step 2: Confirm it imports in Node** (sanity only)

Run from `admin/`:
```bash
node --input-type=module -e "import('./vendor/exceljs.min.js').then(m => console.log(typeof (m.default?.Workbook || m.Workbook)))"
```
Expected: prints `function` (the `Workbook` constructor is reachable as `default.Workbook` or `Workbook`).

- [ ] **Step 3: Add the `writeWorkbook` adapter to `report-export.js`**

Append to `admin/components/errors-dashboard/report-export.js`:

```js
const STYLE = {
  hub:      { bold: true,  fill: 'FFFDE68A' },  // amber-200
  affected: { bold: false, fill: null },
  plain:    { bold: false, fill: null },
};

/**
 * Write the workbook model to a styled .xlsx and trigger a browser download.
 * ExcelJS is lazy-imported here so it is not part of normal dashboard load.
 * Side-effecting; covered by e2e/manual, not unit tests.
 *
 * @param {ReturnType<typeof buildReportWorkbookModel>} model
 * @param {string} filename
 */
export async function writeWorkbook(model, filename) {
  const ExcelJSmod = await import('../../vendor/exceljs.min.js');
  const ExcelJS = ExcelJSmod.default || ExcelJSmod;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Errors');

  ws.columns = model.columns.map(c => ({ header: c.header, key: c.key, width: c.width }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];

  for (const r of model.rows) {
    const row = ws.addRow(r.cells);
    row.outlineLevel = r.outlineLevel || 0;
    const s = STYLE[r.style] || STYLE.plain;
    if (s.bold) row.font = { bold: true };
    if (s.fill) {
      row.eachCell((cell) => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: s.fill } };
      });
    }
  }
  ws.properties.outlineLevelRow = 1;       // enable the outline
  ws.properties.summaryBelow = false;       // hub (summary) sits ABOVE its group

  const buffer = await wb.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
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

Note (load shim fallback): if the vendored file is the UMD build (sets a global rather than ESM exports), replace the first two lines of `writeWorkbook` with a one-time injected `<script src="vendor/exceljs.min.js">` that resolves `window.ExcelJS`. Keep the rest identical. Decide based on Step 2's result.

- [ ] **Step 4: Commit**

```bash
git add admin/vendor/exceljs.min.js admin/components/errors-dashboard/report-export.js
git commit -m "feat(errors-dashboard): vendor ExcelJS + lazy writeWorkbook adapter (styled .xlsx)"
```

---

## Task 4: Render clusters on screen (collapsible groups + summary + Fix)

**Files:**
- Modify: `admin/components/errors-dashboard.js`
- Test: `admin/__tests__/errors-dashboard-overlaps.test.js` (create)

Integration points (verified):
- `import { buildReportRows, toCsv, downloadCsv, reportFilename }` at the top of
  `errors-dashboard.js` must become
  `import { buildReportWorkbookModel, writeWorkbook, reportFilename } from './errors-dashboard/report-export.js';`
  plus `import { buildOverlapClusters } from './errors-dashboard/overlap-clusters.js';`.
- W001 maps to category `overlap` (`ERROR_CATEGORIES.W001 === 'overlap'`).
- `renderCategoryView(dir)` renders `categorizedIssues[currentCategory]` into `.issues-list`
  (errors-dashboard.js:601-674).
- `handleFixClick(issue)` is the existing navigation used by `.fix-btn`.
- Strings come from the `FALLBACKS` map (the i18n JSON `errorsDashboard` block is empty);
  add new keys there (Task 6 mirrors them into the JSON).

- [ ] **Step 1: Add FALLBACKS strings** (errors-dashboard.js, in the `FALLBACKS` object near line 25)

```js
  'errorsDashboard.overlap.summary': { en: '{causes} root causes · {affected} ranges affected', he: '{causes} גורמי שורש · {affected} טווחים מושפעים' },
  'errorsDashboard.overlap.rootCause': { en: 'ROOT CAUSE', he: 'גורם שורש' },
  'errorsDashboard.overlap.affects': { en: 'affects {n} ranges', he: 'משפיע על {n} טווחים' },
  'errorsDashboard.overlap.fixRange': { en: 'Fix this range →', he: '← תקן את הטווח הזה' },
  'errorsDashboard.overlap.other': { en: 'Other overlaps', he: 'חפיפות אחרות' },
  'errorsDashboard.overlap.expand': { en: 'Show affected ranges', he: 'הצג טווחים מושפעים' },
```

- [ ] **Step 2: Write the failing render test**

```js
// admin/__tests__/errors-dashboard-overlaps.test.js
/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// Minimal data-model mock: validateRow returns no per-row issues (we drive
// overlaps via findOverlappingRanges), findOverlappingRanges returns the star.
jest.unstable_mockModule('../services/data-model.js', () => ({
  validateRow: () => ({ errors: [], warnings: [] }),
  findOverlappingRanges: () => ([
    { row1Index: 0, row2Index: 2, collection: 'C', floor: '2' },
    { row1Index: 1, row2Index: 2, collection: 'C', floor: '2' },
  ]),
  VALIDATION_ERRORS: {}, VALIDATION_WARNINGS: {},
}));

const CSV = 'floor,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd\n'
  + '2,C,69 A,kb2_69_a,701,704\n'
  + '2,C,69 B,kb2_69_b,704,705\n'
  + '2,C,BIG,kb2_big,497,792\n';

global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(CSV), json: () => Promise.resolve({}) });

const { initErrorsDashboard } = await import('../components/errors-dashboard.js');

async function flush() { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); }

test('overlap category renders a root-cause group with its blast-radius count and collapsed children', async () => {
  document.body.innerHTML = '<div id="dash"></div>';
  const api = initErrorsDashboard('dash');
  await flush();
  api.showCategory ? api.showCategory('overlap') : null; // open the overlap category if API exposes it
  await flush();

  const group = document.querySelector('.overlap-cluster');
  expect(group).not.toBeNull();
  expect(group.querySelector('.overlap-cluster-header').textContent).toMatch(/2/); // affects 2
  // children collapsed by default
  const children = group.querySelector('.overlap-cluster-children');
  expect(children.hidden).toBe(true);
});
```

> If `initErrorsDashboard` does not expose a way to open a category programmatically, the test instead calls the exported render path the same way the existing dashboard tests do; adjust the opener line to match the real API surfaced in `errors-dashboard.js` (the assertions on `.overlap-cluster` stay the same).

- [ ] **Step 3: Run the test to verify it fails**

Run: `node --experimental-vm-modules node_modules/.bin/jest __tests__/errors-dashboard-overlaps.test.js`
Expected: FAIL — `.overlap-cluster` not found.

- [ ] **Step 4: Implement cluster rendering in `renderCategoryView`**

In `errors-dashboard.js`, at the start of `renderCategoryView(dir)` (line 601), branch when
`currentCategory === 'overlap'`: build the cluster model from `csvData` and render groups
instead of the flat issue list. Replace the `<!-- Issues List -->` block for the overlap
category with:

```js
  if (currentCategory === 'overlap') {
    const { clusters, otherOverlaps } = buildOverlapClusters(csvData);
    const affectedTotal = clusters.reduce((n, c) => n + c.blastRadius, 0);
    const summary = t('errorsDashboard.overlap.summary')
      .replace('{causes}', clusters.length)
      .replace('{affected}', affectedTotal);

    const clusterHtml = clusters.map((c, ci) => `
      <div class="overlap-cluster" data-cluster="${ci}">
        <div class="overlap-cluster-header">
          <button class="overlap-cluster-toggle" aria-expanded="false" data-cluster-toggle="${ci}">▸</button>
          <strong>⚠ ${escapeHtml(t('errorsDashboard.overlap.rootCause'))}</strong>
          · ${escapeHtml(t('errorsDashboard.row'))} ${c.hubRowIndex + 1}
          "${escapeHtml(c.hubRow.rangeStart)}–${escapeHtml(c.hubRow.rangeEnd)}"
          · ${escapeHtml(t('errorsDashboard.overlap.affects').replace('{n}', c.blastRadius))}
          · Floor ${escapeHtml(String(c.floor))} · ${escapeHtml(c.collection)}
          <button class="btn btn-primary overlap-fix-btn" data-row-index="${c.hubRowIndex}">
            ${escapeHtml(t('errorsDashboard.overlap.fixRange'))}
          </button>
        </div>
        <div class="overlap-cluster-children" data-cluster-children="${ci}" hidden>
          ${c.affected.map(a => `
            <div class="overlap-affected">
              ${escapeHtml(t('errorsDashboard.row'))} ${a.rowIndex + 1}
              · ${escapeHtml(a.row.shelfLabel || '')}
              · "${escapeHtml(a.row.rangeStart)}–${escapeHtml(a.row.rangeEnd)}"
            </div>`).join('')}
        </div>
      </div>`).join('');

    const otherHtml = otherOverlaps.length ? `
      <div class="overlap-other">
        <h3>${escapeHtml(t('errorsDashboard.overlap.other'))}</h3>
        ${otherOverlaps.map(p => `
          <div class="overlap-affected">
            ${escapeHtml(t('errorsDashboard.row'))} ${p.row1Index + 1} ↔ ${escapeHtml(t('errorsDashboard.row'))} ${p.row2Index + 1}
          </div>`).join('')}
      </div>` : '';

    containerElement.innerHTML = `
      <div class="errors-dashboard" dir="${dir}">
        <div class="dashboard-header">
          <div class="dashboard-header-content">
            <button class="back-btn">${escapeHtml(t('errorsDashboard.back'))}</button>
            <h2 class="dashboard-title">${escapeHtml(t('errorsDashboard.category.overlap'))}</h2>
          </div>
          <button class="btn btn-secondary print-btn">${escapeHtml(t('errorsDashboard.print.cta'))}</button>
          <button class="btn btn-secondary export-btn">${escapeHtml(t('errorsDashboard.export.cta'))}</button>
        </div>
        <p class="overlap-summary">${escapeHtml(summary)}</p>
        <div class="overlap-clusters">${clusterHtml}${otherHtml}</div>
      </div>`;
    return;
  }
```

(Keep the existing flat rendering for all other categories — leave the rest of
`renderCategoryView` unchanged below this branch.)

- [ ] **Step 5: Wire the toggle + the cluster Fix button** (in `setupEventHandlers`, after the existing `.fix-btn` block near line 760)

```js
  containerElement.querySelectorAll('[data-cluster-toggle]').forEach(btn => {
    btn.addEventListener('click', () => {
      const ci = btn.dataset.clusterToggle;
      const children = containerElement.querySelector(`[data-cluster-children="${ci}"]`);
      const open = children.hidden;
      children.hidden = !open;
      btn.setAttribute('aria-expanded', String(open));
      btn.textContent = open ? '▾' : '▸';
    });
  });
  containerElement.querySelectorAll('.overlap-fix-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const rowIndex = parseInt(btn.dataset.rowIndex, 10);
      handleFixClick({ row: csvData[rowIndex], rowIndex });
    });
  });
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `node --experimental-vm-modules node_modules/.bin/jest __tests__/errors-dashboard-overlaps.test.js`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add admin/components/errors-dashboard.js admin/__tests__/errors-dashboard-overlaps.test.js
git commit -m "feat(errors-dashboard): collapsible root-cause overlap groups + summary + Fix"
```

---

## Task 5: Print report button + print stylesheet, and switch export to .xlsx

**Files:**
- Modify: `admin/components/errors-dashboard.js` (export handler → xlsx; print button handler)
- Modify: `admin/styles/app.css` (cluster styling + `@media print`)
- Test: extend `admin/__tests__/errors-dashboard-overlaps.test.js`

- [ ] **Step 1: Replace `handleDownloadReport` to produce .xlsx** (errors-dashboard.js:697)

```js
async function handleDownloadReport() {
  if (!allIssues || allIssues.length === 0) return;
  try {
    const clusterModel = buildOverlapClusters(csvData);
    const otherIssues = allIssues.filter(i => i.category !== 'overlap');
    const model = buildReportWorkbookModel(clusterModel, otherIssues, csvData);
    await writeWorkbook(model, reportFilename());
    logger.userAction('click', 'Download errors report', { count: model.rows.length });
  } catch (err) {
    logger.error('errors-dashboard', 'Report export failed', { error: String(err) });
    showToast(t('errorsDashboard.export.error'), 'error');
  }
}
```

- [ ] **Step 2: Add print handler + FALLBACKS string + button wiring**

FALLBACKS (Step-1 list of Task 4 + this):
```js
  'errorsDashboard.print.cta': { en: '🖨 Print report', he: '🖨 הדפס דוח' },
```
Add a print handler and wire both print buttons in `setupEventHandlers`:
```js
function handlePrintReport() {
  // Expand every cluster group so paper shows the affected ranges.
  containerElement.querySelectorAll('.overlap-cluster-children').forEach(el => { el.hidden = false; });
  window.print();
}
// in setupEventHandlers:
containerElement.querySelectorAll('.print-btn').forEach(btn => btn.addEventListener('click', handlePrintReport));
```
Also add a `.print-btn` next to the `.export-btn` in `renderSummaryView` (line ~529) the same way it is added in the overlap view.

- [ ] **Step 3: Add the print test**

Append to `errors-dashboard-overlaps.test.js`:
```js
test('Print expands collapsed cluster children before printing', async () => {
  document.body.innerHTML = '<div id="dash"></div>';
  const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});
  const api = initErrorsDashboard('dash');
  await flush(); api.showCategory && api.showCategory('overlap'); await flush();
  document.querySelector('.print-btn').click();
  expect(printSpy).toHaveBeenCalled();
  expect(document.querySelector('.overlap-cluster-children').hidden).toBe(false);
  printSpy.mockRestore();
});
```

- [ ] **Step 4: Add CSS** (`admin/styles/app.css`)

```css
.overlap-cluster { border: 1px solid #fcd34d; border-radius: 8px; margin-bottom: .75rem; }
.overlap-cluster-header { display: flex; align-items: center; gap: .5rem; padding: .5rem .75rem; background: #fffbeb; font-weight: 600; }
.overlap-cluster-toggle { background: none; border: none; cursor: pointer; font-size: 1rem; }
.overlap-cluster-children { padding: .25rem .75rem .5rem 2rem; }
.overlap-affected { padding: .15rem 0; color: #444; }
.overlap-summary { margin: .5rem 0; color: #92400e; font-weight: 600; }

@media print {
  nav, .nav-tabs, .refresh-btn, .export-btn, .print-btn, .back-btn,
  .overlap-cluster-toggle, .overlap-fix-btn { display: none !important; }
  .overlap-cluster-children { display: block !important; }
  .overlap-cluster { break-inside: avoid; }
}
```

- [ ] **Step 5: Run tests**

Run: `node --experimental-vm-modules node_modules/.bin/jest __tests__/errors-dashboard-overlaps.test.js`
Expected: PASS (all).

- [ ] **Step 6: Commit**

```bash
git add admin/components/errors-dashboard.js admin/styles/app.css admin/__tests__/errors-dashboard-overlaps.test.js
git commit -m "feat(errors-dashboard): Print report button + print stylesheet; export -> styled .xlsx"
```

---

## Task 6: i18n JSON + full suite + verification

**Files:**
- Modify: `admin/i18n/en.json`, `admin/i18n/he.json`
- (No new test; runs the full suite.)

- [ ] **Step 1: Mirror the new strings into the i18n JSON** under an `errorsDashboard` key (create the block if absent), matching the FALLBACKS keys added in Tasks 4–5: `overlap.summary`, `overlap.rootCause`, `overlap.affects`, `overlap.fixRange`, `overlap.other`, `overlap.expand`, `print.cta`. Use the same en/he text as the FALLBACKS.

- [ ] **Step 2: Run the full admin suite**

Run (from `admin/`): `npm test`
Expected: all suites pass (the prior 846 + the new overlap-clusters/report-export/dashboard-overlaps tests; report-export count changes because the file was rewritten).

- [ ] **Step 3: Manual / real-browser verification** (cannot be unit-asserted)

Against a repo-root static server (`npx http-server . -p 8123`, then load `/admin/`):
1. Open the Errors dashboard → Overlaps category → confirm root-cause groups appear, ranked, with "affects N", collapsed by default; expand works; "Fix this range →" opens the Location Editor on the hub row.
2. Click **Download Excel** → open the `.xlsx`: bold amber root-cause rows, affected ranges grouped (Excel's outline +/- collapses them), frozen header.
3. Click **🖨 Print report** → print preview shows expanded groups, no buttons/nav, root causes bold.
4. Toggle language → strings switch (en/he).

- [ ] **Step 4: Commit**

```bash
git add admin/i18n/en.json admin/i18n/he.json
git commit -m "i18n(errors-dashboard): root-cause overlap + print strings (en/he)"
```

---

## Self-review notes (author)

- **Spec coverage:** cluster engine (T1) ✓; one-model-three-views — screen (T4), print (T5), Excel (T2 model + T3 adapter) ✓; threshold ≥2 constant (T1) ✓; Fix→Location Editor (T4) ✓; hide-at-zero (overlap category only renders when there are overlaps; the category card itself already hides at 0 via existing count logic) ✓; edge cases covered by T1 tests ✓.
- **Excel visual parity** (bold + native outline grouping) via `writeWorkbook` (T3) ✓.
- **Open implementation decision flagged in T3:** ESM vs UMD ExcelJS load — resolved at Step 2 of T3 by inspecting the vendored file; both paths specified.
- **Type consistency:** `buildOverlapClusters` → `{clusters, otherOverlaps}` used identically in T2/T4/T5; `buildReportWorkbookModel(clusterModel, otherIssues, csvData)` signature consistent across T2 and T5; `writeWorkbook(model, filename)` consistent T3/T5.
