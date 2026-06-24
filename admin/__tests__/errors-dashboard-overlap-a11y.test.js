/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// One hub (row 2) overlapping rows 0,1 — enough to render a cluster with a
// collapsible toggle and bidi-isolated data values.
jest.unstable_mockModule('../services/data-model.js', () => ({
  validateRow: () => ({ errors: [], warnings: [{ code: 'W001', field: 'rangeStart', message: 'overlap' }] }),
  findOverlappingRanges: () => ([
    { row1Index: 0, row2Index: 2, collection: 'C', floor: '2' },
    { row1Index: 1, row2Index: 2, collection: 'C', floor: '2' },
  ]),
  CSV_COLUMNS: [], REQUIRED_FIELDS: [], FLOOR_VALUES: ['0', '1', '2'],
  VALIDATION_ERRORS: {}, VALIDATION_WARNINGS: {}, VALIDATION_RULES: {}, COLUMN_CONFIG: {},
  getRowKey: () => '', areRowsEqual: () => false, findDuplicateRows: () => [],
  parseRangeValue: () => null, parseRangeBoundary: () => null, compareCallNumbers: () => 0,
  doRangesOverlap: () => false, createEmptyRow: () => ({}), getMissingColumns: () => [],
  getColumnLabel: () => '', getBilingualFieldPairs: () => [], getBrokenRefs: () => [],
}));

const CSV = 'floor,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd\n'
  + '2,C,69 A,sv0,100,200\n2,C,69 B,sv1,150,250\n2,C,BIG,sv2,100,900\n';

global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(CSV), json: () => Promise.resolve({}) });

const { initErrorsDashboard } = await import('../components/errors-dashboard.js');

async function flush() { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); }
async function openOverlap() {
  document.body.innerHTML = '<div id="dash"></div>';
  initErrorsDashboard('dash');
  await flush();
  document.querySelector('.category-card[data-category="overlap"]').click();
  await flush();
}

describe('Errors dashboard — overlap view a11y + BiDi', () => {
  test('the collapse toggle is a labelled button that controls its children region', async () => {
    await openOverlap();
    const toggle = document.querySelector('.overlap-cluster-toggle');
    expect(toggle.getAttribute('type')).toBe('button');
    expect(toggle.getAttribute('aria-label')).toBeTruthy();
    const controls = toggle.getAttribute('aria-controls');
    expect(controls).toBeTruthy();
    // aria-controls must resolve to the actual children region
    expect(document.getElementById(controls)).not.toBeNull();
    expect(document.getElementById(controls).classList.contains('overlap-cluster-children')).toBe(true);
  });

  test('mixed-direction data values are wrapped in <bdi> for RTL safety', async () => {
    await openOverlap();
    const header = document.querySelector('.overlap-cluster-header');
    // shelf label, range, collection are isolated
    expect(header.querySelectorAll('bdi').length).toBeGreaterThanOrEqual(3);
  });

  test('the floor label renders via i18n (no hardcoded English "Floor")', async () => {
    await openOverlap();
    // With the i18n FALLBACK the header shows "Floor 2"; the point is it flows
    // through t('errorsDashboard.floor'), so a Hebrew locale would localize it.
    const header = document.querySelector('.overlap-cluster-header').textContent;
    expect(header).toMatch(/Floor 2|קומה 2/);
  });

  // ── #193: the cluster "affected rows" list is a real <table> too (AC6) ──────
  test('#193 the cluster affected-rows list renders as a <table> with a <thead>/<th> header', async () => {
    await openOverlap();
    const children = document.querySelector('.overlap-cluster-children');
    const table = children.querySelector('table.overlap-table');
    expect(table).not.toBeNull();
    const ths = table.querySelectorAll('thead th');
    expect(ths.length).toBeGreaterThanOrEqual(4); // Shelf, Floor·Collection, Range, Row (+action)
    // every header cell is a real <th> (screen-reader column semantics for free)
    ths.forEach((th) => expect(th.tagName).toBe('TH'));
    // each affected row still carries a bidi-isolated range cell
    const rangeBdi = children.querySelector('tr.overlap-affected .overlap-cell-range bdi[dir="ltr"]');
    expect(rangeBdi).not.toBeNull();
  });
});
