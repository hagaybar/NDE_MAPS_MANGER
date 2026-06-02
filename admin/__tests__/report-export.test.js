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
