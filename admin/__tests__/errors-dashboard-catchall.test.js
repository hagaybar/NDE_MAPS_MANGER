/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// #158: a catch-all hub (range spans (near-)full Dewey, e.g. 000–999) overlaps
// almost everything, so it's always the top hub. The dashboard must reframe it
// as "usually intentional — review the shelves below", NOT push the librarian to
// edit the catch-all row.
//
// data-model mock: validateRow flags the catch-all row so the overlap category
// card renders; findOverlappingRanges makes the catch-all (row 2) the hub.
jest.unstable_mockModule('../services/data-model.js', () => ({
  validateRow: (row) => (
    row.shelfLabel === 'ALL'
      ? { errors: [], warnings: [{ code: 'W001', field: 'rangeStart', message: 'Overlaps other ranges' }] }
      : { errors: [], warnings: [] }
  ),
  findOverlappingRanges: () => ([
    { row1Index: 0, row2Index: 2, collection: 'C', floor: '2' },
    { row1Index: 1, row2Index: 2, collection: 'C', floor: '2' },
  ]),
  CSV_COLUMNS: [], REQUIRED_FIELDS: [], FLOOR_VALUES: ['0', '1', '2'],
  VALIDATION_ERRORS: {}, VALIDATION_WARNINGS: {}, VALIDATION_RULES: {}, COLUMN_CONFIG: {},
  getRowKey: () => '', areRowsEqual: () => false, findDuplicateRows: () => [],
  parseRangeValue: (v) => {
    const m = String(v ?? '').match(/^\d+/);
    return { numeric: m ? parseInt(m[0], 10) : null, prefix: '', original: String(v ?? '') };
  },
  parseRangeBoundary: (v) => {
    const m = String(v ?? '').match(/^\d+/);
    return m ? parseInt(m[0], 10) : NaN;
  },
  compareCallNumbers: () => 0,
  doRangesOverlap: () => false, createEmptyRow: () => ({}), getMissingColumns: () => [],
  getColumnLabel: () => '', getBilingualFieldPairs: () => [], getBrokenRefs: () => [],
}));

// Row 2 (hub) spans 000–999 → catch-all.
const CSV = 'floor,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd\n'
  + '2,C,69 A,kb2_69_a,701,704\n'
  + '2,C,69 B,kb2_69_b,704,705\n'
  + '2,C,ALL,kb2_all,000,999\n';

global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(CSV), json: () => Promise.resolve({}) });

const { initErrorsDashboard } = await import('../components/errors-dashboard.js');

async function flush() { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); }

function openCategory(category) {
  const card = document.querySelector(`.category-card[data-category="${category}"]`);
  if (!card) throw new Error(`category card "${category}" not rendered`);
  card.click();
}

test('catch-all hub (000–999) renders the catch-all framing, not the default hub label (#158)', async () => {
  document.body.innerHTML = '<div id="dash"></div>';
  initErrorsDashboard('dash');
  await flush();
  openCategory('overlap');
  await flush();

  const header = document.querySelector('.overlap-cluster-header');
  expect(header).not.toBeNull();
  // Catch-all framing present (the dashboard renders in the active i18n locale;
  // en "Catch-all range (usually intentional)…" / he "טווח כולל (בדרך כלל מכוון)…").
  expect(header.textContent).toMatch(/catch-all|טווח כולל/i);
  expect(header.textContent).toMatch(/usually intentional|בדרך כלל מכוון/i);
  // the neutral "start here" hub label is suppressed for catch-alls
  expect(header.textContent).not.toMatch(/start here|התחילו כאן/i);
  // children still listed as the primary navigable rows
  expect(document.querySelectorAll('.overlap-cluster-children .overlap-affected').length).toBeGreaterThan(0);
});
