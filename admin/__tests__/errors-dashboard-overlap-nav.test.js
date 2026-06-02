/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// Overlap topology with TWO hubs that overlap each other (rows 2 & 3), plus a
// non-hub pair (7↔8) for "Other overlaps", plus a duplicate row (6) for #131.
//   pairs: 0-2, 1-2, 2-3, 3-4, 3-5, 7-8
//   hub 2 (deg 3) -> affected [0,1]  (3 is a hub, filtered out)  blastRadius 3
//   hub 3 (deg 3) -> affected [4,5]  (2 is a hub, filtered out)  blastRadius 3
//   otherOverlaps: [7,8]
// Before the fix the header said "affects 3" over 2 listed rows; the count must
// now equal the rows actually shown.
jest.unstable_mockModule('../services/data-model.js', () => ({
  validateRow: (row) =>
    row.shelfLabel === 'DUP'
      ? { errors: [{ code: 'E005', field: 'rangeStart', message: 'dup', details: { duplicateRowIndex: 3 } }], warnings: [] }
      : { errors: [], warnings: [{ code: 'W001', field: 'rangeStart', message: 'overlap' }] },
  findOverlappingRanges: () => ([
    { row1Index: 0, row2Index: 2, collection: 'C', floor: '2' },
    { row1Index: 1, row2Index: 2, collection: 'C', floor: '2' },
    { row1Index: 2, row2Index: 3, collection: 'C', floor: '2' },
    { row1Index: 3, row2Index: 4, collection: 'C', floor: '2' },
    { row1Index: 3, row2Index: 5, collection: 'C', floor: '2' },
    { row1Index: 7, row2Index: 8, collection: 'C', floor: '2' },
  ]),
  CSV_COLUMNS: [], REQUIRED_FIELDS: [], FLOOR_VALUES: ['0', '1', '2'],
  VALIDATION_ERRORS: {}, VALIDATION_WARNINGS: {}, VALIDATION_RULES: {}, COLUMN_CONFIG: {},
  getRowKey: () => '', areRowsEqual: () => false, findDuplicateRows: () => [],
  parseRangeValue: () => null, parseRangeBoundary: () => null, compareCallNumbers: () => 0,
  doRangesOverlap: () => false, createEmptyRow: () => ({}), getMissingColumns: () => [],
  getColumnLabel: () => '', getBilingualFieldPairs: () => [], getBrokenRefs: () => [],
}));

const HEADER = 'floor,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd';
const rows = Array.from({ length: 9 }, (_, i) =>
  `2,C,${i === 6 ? 'DUP' : 'L' + i},sv${i},${100 + i},${200 + i}`);
const CSV = [HEADER, ...rows].join('\n');

global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(CSV), json: () => Promise.resolve({}) });

const { initErrorsDashboard } = await import('../components/errors-dashboard.js');

async function flush() { for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 0)); }
function openCategory(category) {
  const card = document.querySelector(`.category-card[data-category="${category}"]`);
  if (!card) throw new Error(`category card "${category}" not rendered`);
  card.click();
}

describe('Errors dashboard — overlap cluster navigation + honest counts', () => {
  test('cluster header "affects N" equals the number of affected rows actually listed', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();
    openCategory('overlap');
    await flush();

    const clusters = document.querySelectorAll('.overlap-cluster');
    expect(clusters.length).toBe(2); // hubs 2 and 3
    clusters.forEach((cluster) => {
      const headerNum = Number(cluster.dataset.affected); // the "affects N" count
      const childCount = cluster.querySelectorAll('.overlap-affected').length;
      expect(headerNum).toBe(childCount); // before fix: 3 vs 2
    });
  });

  test('every affected row has a "Go to Row" button carrying its row index', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();
    openCategory('overlap');
    await flush();

    const firstCluster = document.querySelector('.overlap-cluster');
    const affected = firstCluster.querySelectorAll('.overlap-affected');
    expect(affected.length).toBeGreaterThan(0);
    affected.forEach((row) => {
      const btn = row.querySelector('.overlap-goto-btn');
      expect(btn).not.toBeNull();
      expect(btn.dataset.rowIndex).toMatch(/^\d+$/);
    });
  });

  test('"Other overlaps" pairs expose a jump button for BOTH endpoints', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();
    openCategory('overlap');
    await flush();

    const other = document.querySelector('.overlap-other .overlap-affected');
    expect(other).not.toBeNull();
    const btns = other.querySelectorAll('.overlap-goto-btn');
    expect(btns.length).toBe(2);
    expect(new Set([...btns].map(b => b.dataset.rowIndex))).toEqual(new Set(['7', '8']));
  });

  // #131: the duplicate category's "Duplicate of: Go to Row X" link only renders
  // if the issue builder carries `details` through from validateRow.
  test('duplicate category renders a working "Go to Row" link (#131)', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();
    openCategory('duplicate');
    await flush();

    const link = document.querySelector('.related-link[data-go-to-row]');
    expect(link).not.toBeNull();
    expect(link.dataset.goToRow).toBe('2'); // duplicateRowIndex 3 -> 0-based 2
  });
});
