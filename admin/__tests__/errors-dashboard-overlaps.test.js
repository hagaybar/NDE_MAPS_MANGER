/** @jest-environment jsdom */
import { jest } from '@jest/globals';

// data-model mock: validateRow emits a W001 warning on the hub row so the
// "overlap" category card renders (the dashboard categorizes issues from
// validateRow). The cluster engine, in turn, builds its groups directly from
// findOverlappingRanges (the star below), independent of categorizedIssues.
jest.unstable_mockModule('../services/data-model.js', () => ({
  validateRow: (row) => (
    row.shelfLabel === 'BIG'
      ? { errors: [], warnings: [{ code: 'W001', field: 'rangeStart', message: 'Overlaps other ranges' }] }
      : { errors: [], warnings: [] }
  ),
  findOverlappingRanges: () => ([
    { row1Index: 0, row2Index: 2, collection: 'C', floor: '2' },
    { row1Index: 1, row2Index: 2, collection: 'C', floor: '2' },
  ]),
  // Other named exports consumed transitively across the dashboard import graph
  // (svg-parser, edit-location-dialog, csv-editor, etc.) — stubbed so the real
  // modules link.
  CSV_COLUMNS: [], REQUIRED_FIELDS: [], FLOOR_VALUES: ['0', '1', '2'],
  VALIDATION_ERRORS: {}, VALIDATION_WARNINGS: {}, VALIDATION_RULES: {}, COLUMN_CONFIG: {},
  getRowKey: () => '', areRowsEqual: () => false, findDuplicateRows: () => [],
  parseRangeValue: () => null, parseRangeBoundary: () => null, compareCallNumbers: () => 0,
  doRangesOverlap: () => false, createEmptyRow: () => ({}), getMissingColumns: () => [],
  getColumnLabel: () => '', getBilingualFieldPairs: () => [], getBrokenRefs: () => [],
}));

const CSV = 'floor,collectionName,shelfLabel,svgCode,rangeStart,rangeEnd\n'
  + '2,C,69 A,kb2_69_a,701,704\n'
  + '2,C,69 B,kb2_69_b,704,705\n'
  + '2,C,BIG,kb2_big,497,792\n';

global.fetch = jest.fn().mockResolvedValue({ ok: true, status: 200, text: () => Promise.resolve(CSV), json: () => Promise.resolve({}) });

const { initErrorsDashboard } = await import('../components/errors-dashboard.js');

async function flush() { for (let i = 0; i < 4; i++) await new Promise(r => setTimeout(r, 0)); }

// Real code path: the dashboard has no programmatic showCategory; it switches to
// a category when the matching `.category-card` is clicked.
function openCategory(category) {
  const card = document.querySelector(`.category-card[data-category="${category}"]`);
  if (!card) throw new Error(`category card "${category}" not rendered`);
  card.click();
}

test('overlap category renders a root-cause group with its blast-radius count and collapsed children', async () => {
  document.body.innerHTML = '<div id="dash"></div>';
  initErrorsDashboard('dash');
  await flush();
  openCategory('overlap');
  await flush();

  const group = document.querySelector('.overlap-cluster');
  expect(group).not.toBeNull();
  expect(group.querySelector('.overlap-cluster-header').textContent).toMatch(/2/); // affects 2
  // children collapsed by default
  const children = group.querySelector('.overlap-cluster-children');
  expect(children.hidden).toBe(true);
});
