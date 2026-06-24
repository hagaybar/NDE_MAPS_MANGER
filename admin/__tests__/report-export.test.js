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
    hubRowIndex: 2, hubRowNumber: 4, hubRow: csvData[2], blastRadius: 2, affectsShown: 2,
    collection: 'C', floor: '2',
    affected: [
      { rowIndex: 0, rowNumber: 2, row: csvData[0] },
      { rowIndex: 1, rowNumber: 3, row: csvData[1] },
    ],
  }],
  hubConflicts: [],
  otherOverlaps: [],
};

test('hub row is first, styled "hub", carries blastRadius + ROOT CAUSE marker + outlineLevel 0', () => {
  const model = buildReportWorkbookModel(clusterModel, [], csvData);
  const hub = model.rows[0];
  expect(hub.style).toBe('hub');
  expect(hub.outlineLevel).toBe(0);
  expect(hub.blastRadius).toBe(2);
  expect(hub.cells.rootCause).toBe('ROOT CAUSE');
  // #158: Excel "Affects" reads affectsShown (rows actually listed), matching
  // the on-screen count — not the raw blastRadius.
  expect(hub.cells.affects).toBe(2);
  expect(hub.cells.csvRow).toBe(4); // 0-based index 2 -> CSV row 4 (header + 1-based)
});

test('#158: Excel "Affects" reads affectsShown (rows shown), not raw blastRadius', () => {
  const col = WORKBOOK_COLUMNS.find((c) => c.key === 'rootCause');
  expect(col.header).toBe('Root cause');
  // affectsShown (2) drives the Affects cell even when blastRadius differs.
  const withWiderBlast = {
    clusters: [{
      ...clusterModel.clusters[0], blastRadius: 5, affectsShown: 2,
    }],
    hubConflicts: [], otherOverlaps: [],
  };
  const model = buildReportWorkbookModel(withWiderBlast, [], csvData);
  expect(model.rows[0].cells.affects).toBe(2);
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

test('affected-row message and csvRow read the canonical row numbers from the model (#157)', () => {
  const model = buildReportWorkbookModel(clusterModel, [], csvData);
  // hub csvRow comes from hubRowNumber
  expect(model.rows[0].cells.csvRow).toBe(4);
  // affected child csvRow comes from its rowNumber, message refs the hub's number
  expect(model.rows[1].cells.csvRow).toBe(2);
  expect(model.rows[1].cells.message).toMatch(/Row 4\b/); // hub canonical number
});

test('#156: hub-conflict pairs are exported as their own rows (both-hub overlaps)', () => {
  const withHubConflict = {
    clusters: [],
    hubConflicts: [{
      row1Index: 2, row2Index: 0, row1Number: 4, row2Number: 2,
      row1: csvData[2], row2: csvData[0], collection: 'C', floor: '2',
    }],
    otherOverlaps: [],
  };
  const model = buildReportWorkbookModel(withHubConflict, [], csvData);
  expect(model.rows).toHaveLength(1);
  const r = model.rows[0];
  expect(r.cells.csvRow).toBe(4);          // first endpoint canonical number
  expect(r.cells.message).toMatch(/Row 2\b/); // refs the other endpoint canonical number
  expect(r.cells.category).toBe('overlap');
});

test('otherOverlaps message reads canonical row numbers (#157)', () => {
  const withOther = {
    clusters: [],
    hubConflicts: [],
    otherOverlaps: [{
      row1Index: 0, row2Index: 1, row1Number: 2, row2Number: 3,
      row1: csvData[0], row2: csvData[1], collection: 'C', floor: '2',
    }],
  };
  const model = buildReportWorkbookModel(withOther, [], csvData);
  expect(model.rows[0].cells.csvRow).toBe(2);
  expect(model.rows[0].cells.message).toMatch(/Row 3\b/);
});

test('empty input yields a model with columns and no rows', () => {
  const model = buildReportWorkbookModel({ clusters: [], hubConflicts: [], otherOverlaps: [] }, [], []);
  expect(model.columns).toEqual(WORKBOOK_COLUMNS);
  expect(model.rows).toHaveLength(0);
});

test('reportFilename uses .xlsx and a UTC date', () => {
  expect(reportFilename(new Date('2026-06-02T23:30:00Z'))).toBe('errors-report-2026-06-02.xlsx');
});

// ── #193 (AC6): the export gains a plain-language Explanation column matching
// the on-screen "What's the problem" column, derived from the shared sub-range.
test('#193 export has an Explanation column and overlap pairs carry the shared-sub-range sentence', () => {
  const col = WORKBOOK_COLUMNS.find((c) => c.key === 'explanation');
  expect(col).toBeDefined();
  expect(col.header).toBe('Explanation');

  const withOther = {
    clusters: [],
    hubConflicts: [],
    otherOverlaps: [{
      row1Index: 0, row2Index: 1, row1Number: 2, row2Number: 3,
      // 701–704 and 704–705 share exactly 704–704
      row1: csvData[0], row2: csvData[1], collection: 'C', floor: '2',
    }],
  };
  const model = buildReportWorkbookModel(withOther, [], csvData);
  const explanation = model.rows[0].cells.explanation;
  expect(explanation).toMatch(/either shelf/);
  expect(explanation).toMatch(/704–704/); // shared sub-range max(701,704)–min(704,705)
});
