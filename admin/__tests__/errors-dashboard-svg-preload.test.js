/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// #137: the dashboard ran validateAllRows() without awaiting the SVG cache, so
// E006 (svgCode not on its floor's SVG) silently under-reported on a cold cache
// (isValidSvgCode is lenient until the cache lands). loadCSVData must now await
// preloadAllFloors() before validating. We assert that ordering: validateRow
// (run by validateAllRows) must not fire until preloadAllFloors resolves.

let resolvePreload;
const preloadAllFloors = jest.fn(() => new Promise((r) => { resolvePreload = r; }));

jest.unstable_mockModule('../services/svg-parser.js', () => ({
  preloadAllFloors,
  isValidSvgCode: () => true,
  fetchAndParseSvg: jest.fn().mockResolvedValue({}),
  extractIdsFromSvg: () => [],
  getAvailableCodes: () => [],
  getAvailableCodesAsync: jest.fn().mockResolvedValue([]),
  clearCache: jest.fn(),
  getCacheStatus: () => ({}),
}));

const validateRow = jest.fn(() => ({ errors: [], warnings: [] }));
jest.unstable_mockModule('../services/data-model.js', () => ({
  validateRow,
  findOverlappingRanges: () => [],
  CSV_COLUMNS: [], REQUIRED_FIELDS: [], FLOOR_VALUES: ['0', '1', '2'],
  VALIDATION_ERRORS: {}, VALIDATION_WARNINGS: {}, VALIDATION_RULES: {}, COLUMN_CONFIG: {},
  getRowKey: () => '', areRowsEqual: () => false, findDuplicateRows: () => [],
  parseRangeValue: () => null, parseRangeBoundary: () => null, compareCallNumbers: () => 0,
  doRangesOverlap: () => false, createEmptyRow: () => ({}), getMissingColumns: () => [],
  getColumnLabel: () => '', getBilingualFieldPairs: () => [], getBrokenRefs: () => [],
}));

const CSV = 'floor,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd\n2,C,L1,sv1,100,200';
global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(CSV), json: () => Promise.resolve({}) });

const { initErrorsDashboard } = await import('../components/errors-dashboard.js');

const flush = async () => { for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0)); };

describe('Errors dashboard awaits the SVG cache before validating (#137)', () => {
  test('validateAllRows runs only after preloadAllFloors resolves (E006 not under-reported on cold cache)', async () => {
    document.body.innerHTML = '<div id="errors-dashboard"></div>';

    initErrorsDashboard('errors-dashboard');
    await flush(); // CSV fetch resolves; preload is still pending

    expect(preloadAllFloors).toHaveBeenCalled();      // before the fix: never imported/called
    expect(validateRow).not.toHaveBeenCalled();        // blocked awaiting the SVG cache

    resolvePreload();
    await flush();

    expect(validateRow).toHaveBeenCalled();            // validation ran after the cache warmed
  });
});
