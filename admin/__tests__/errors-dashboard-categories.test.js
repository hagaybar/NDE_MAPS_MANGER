/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// #105 regression guards for the Data Quality Dashboard's per-type distribution
// and per-type drill-down filter. Mirrors the harness in
// errors-dashboard-overlap-nav.test.js (jsdom; mock ../services/data-model.js;
// global.fetch returns a CSV; <div id="errors-dashboard">).
//
// Per-row finding mix across the 9 data rows (0-based index):
//   rows 0,1,2 -> 1 error   E006  (category 'svgCode')
//   rows 3,4   -> 1 warning W001  (category 'overlap')
//   rows 5,6,7 -> 1 warning W003  (category 'description')
//   row  8     -> no findings
// => errorCount 3, warningCount 5, total findings 8.
//    Populated categories: svgCode(3), overlap(2), description(3).
//    Zero-count categories include 'floor' (asserted hidden in guard 4).
// findOverlappingRanges returns [] so the overlap drill-down renders no
// clusters — guard 4 deliberately drills into 'svgCode' (the standard list
// renderer), not the special overlap view.
jest.unstable_mockModule('../services/data-model.js', () => ({
  validateRow: (row) => {
    if (row.kind === 'svg') {
      return { errors: [{ code: 'E006', field: 'svgCode', message: 'svg not found' }], warnings: [] };
    }
    if (row.kind === 'overlap') {
      return { errors: [], warnings: [{ code: 'W001', field: 'rangeStart', message: 'overlap' }] };
    }
    if (row.kind === 'desc') {
      return { errors: [], warnings: [{ code: 'W003', field: 'description', message: 'no description' }] };
    }
    return { errors: [], warnings: [] };
  },
  findOverlappingRanges: () => [],
  CSV_COLUMNS: [], REQUIRED_FIELDS: [], FLOOR_VALUES: ['0', '1', '2'],
  VALIDATION_ERRORS: {}, VALIDATION_WARNINGS: {}, VALIDATION_RULES: {}, COLUMN_CONFIG: {},
  getRowKey: () => '', areRowsEqual: () => false, findDuplicateRows: () => [],
  parseRangeValue: () => null, parseRangeBoundary: () => null, compareCallNumbers: () => 0,
  doRangesOverlap: () => false, createEmptyRow: () => ({}), getMissingColumns: () => [],
  getColumnLabel: () => '', getBilingualFieldPairs: () => [], getBrokenRefs: () => [],
}));

// `kind` is a per-row marker the mocked validateRow keys off of. The dashboard's
// parseCSV reads it as just another column, so it round-trips into row.kind.
const HEADER = 'floor,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd,kind';
const KIND_BY_ROW = ['svg', 'svg', 'svg', 'overlap', 'overlap', 'desc', 'desc', 'desc', 'none'];
const rows = KIND_BY_ROW.map((kind, i) =>
  `2,C,L${i},sv${i},${100 + i},${200 + i},${kind}`);
const CSV = [HEADER, ...rows].join('\n');

global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(CSV), json: () => Promise.resolve({}) });

const { initErrorsDashboard, ERROR_CATEGORIES, CATEGORY_META } =
  await import('../components/errors-dashboard.js');

async function flush() { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); }

// Emitted codes, split by the severity validateRow actually attaches them to.
const EMITTED_ERROR_CODES = ['E001', 'E002', 'E003', 'E004', 'E005', 'E006'];
const EMITTED_WARNING_CODES = ['W001', 'W003'];

describe('Errors dashboard — #105 per-type distribution + drill-down filter guards', () => {
  // ── Guard 1: severity consistency (unit) ──────────────────────────────────
  // Every emitted code maps to a category whose CATEGORY_META.severity matches
  // the severity validateRow assigns it. Pins svgCode/E006 = error.
  test('each emitted error code maps to a category whose severity is "error"', () => {
    EMITTED_ERROR_CODES.forEach((code) => {
      const cat = ERROR_CATEGORIES[code];
      expect(cat).toBeDefined();
      expect(CATEGORY_META[cat]).toBeDefined();
      expect(CATEGORY_META[cat].severity).toBe('error');
    });
  });

  test('each emitted warning code maps to a category whose severity is "warning"', () => {
    EMITTED_WARNING_CODES.forEach((code) => {
      const cat = ERROR_CATEGORIES[code];
      expect(cat).toBeDefined();
      expect(CATEGORY_META[cat]).toBeDefined();
      expect(CATEGORY_META[cat].severity).toBe('warning');
    });
  });

  // ── Guard 2: no dead category mapping (cleanup guard) ─────────────────────
  // RED before the W002 cleanup, GREEN after. W002 is declared but never
  // emitted, so it must not be mapped; and every mapped code must point at a
  // category present in CATEGORY_META.
  test('ERROR_CATEGORIES has no dead W002 mapping and every code maps to a real category', () => {
    expect('W002' in ERROR_CATEGORIES).toBe(false);
    Object.entries(ERROR_CATEGORIES).forEach(([code, cat]) => {
      expect(CATEGORY_META[cat]).toBeDefined();
    });
  });

  // ── Guard 3: counts reconcile (via init) ──────────────────────────────────
  // getStats() error+warning totals === sum of categorized-issue list lengths
  // === total findings, for the known per-row mix.
  test('getStats totals reconcile with the categorized-issue partition', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    const api = initErrorsDashboard('dash');
    await flush();

    const stats = api.getStats();
    const categorized = api.getCategorizedIssues();

    const statTotal = stats.errorCount + stats.warningCount;
    const partitionTotal = Object.values(categorized).reduce((sum, list) => sum + list.length, 0);

    // Known mix: 3 errors (E006), 5 warnings (W001x2 + W003x3) = 8 findings.
    expect(stats.errorCount).toBe(3);
    expect(stats.warningCount).toBe(5);
    expect(statTotal).toBe(8);
    expect(partitionTotal).toBe(8);
    expect(statTotal).toBe(partitionTotal);
  });

  // ── Guard 4a: zero-count categories are hidden from the summary ───────────
  test('summary shows a card for a populated category but none for a zero-count one', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();

    // populated: 'svgCode' (3 errors). zero-count: 'floor'.
    expect(document.querySelector('.category-card[data-category="svgCode"]')).not.toBeNull();
    expect(document.querySelector('.category-card[data-category="floor"]')).toBeNull();
    // and the populated card's count reflects its findings
    const card = document.querySelector('.category-card[data-category="svgCode"]');
    expect(card.querySelector('.category-count').textContent).toBe('3');
  });

  // ── Guard 4b: drill-down partition — each category bucket holds only its
  // own type, so drilling into a type shows only that type. ─────────────────
  test('every issue in each category bucket carries that category', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    const api = initErrorsDashboard('dash');
    await flush();

    const categorized = api.getCategorizedIssues();
    Object.entries(categorized).forEach(([cat, issues]) => {
      issues.forEach((issue) => {
        expect(issue.category).toBe(cat);
      });
    });

    // And the drill-down for a populated non-overlap category lists exactly its
    // bucket (3 svgCode issue cards), nothing from other types.
    const card = document.querySelector('.category-card[data-category="svgCode"]');
    card.click();
    await flush();
    expect(document.querySelectorAll('.issues-list .issue-card').length)
      .toBe(categorized.svgCode.length);
  });
});
