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

  // ── #157: canonical spreadsheet row numbers on screen = rowIndex + 2 ───────
  // (was rowIndex + 1; rebaselined to agree with Excel/Print.)
  test('on-screen row numbers use the canonical spreadsheet line (rowIndex + 2)', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();
    openCategory('overlap');
    await flush();

    // hub row 2 -> "Row 4" (2 + 2). The old code printed "Row 3".
    const firstHeader = document.querySelector('.overlap-cluster-header').textContent;
    expect(firstHeader).toMatch(/\b4\b/);
    expect(firstHeader).not.toMatch(/\b3\b/);

    // an affected child of hub 2 is row 0 -> "Row 2" (0 + 2)
    document.querySelector('[data-cluster-toggle]').click();
    const child = document.querySelector('.overlap-cluster-children .overlap-affected');
    expect(child.textContent).toMatch(/\b2\b/);
  });

  // ── #156: the both-hub edge (rows 2↔3) is shown in its own section ─────────
  test('hub-conflict section renders the both-hub overlap with detail + jump buttons', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();
    openCategory('overlap');
    await flush();

    const section = document.querySelector('.overlap-hub-conflicts');
    expect(section).not.toBeNull();
    const pair = section.querySelector('.overlap-affected');
    expect(pair).not.toBeNull();
    // both endpoints get a jump button, carrying their 0-based indices 2 and 3
    const btns = pair.querySelectorAll('.overlap-goto-btn');
    expect(new Set([...btns].map(b => b.dataset.rowIndex))).toEqual(new Set(['2', '3']));
    // canonical numbers shown: 2->4 and 3->5
    expect(pair.textContent).toMatch(/\b4\b/);
    expect(pair.textContent).toMatch(/\b5\b/);
    // detail (range) present, not a bare "Row a <-> Row b"
    expect(pair.textContent).toMatch(/–/); // range start–end dash
  });

  // ── #156/#157: otherOverlaps carry range detail so Print/Excel/screen agree ─
  test('"Other overlaps" rows include range detail, not just bare row numbers', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();
    openCategory('overlap');
    await flush();

    const other = document.querySelector('.overlap-other .overlap-affected');
    expect(other.textContent).toMatch(/–/); // contains a range dash
  });

  // ── #156/#157: Print carries the hub-conflict overlaps with detail ─────────
  // Print = window.print() over the screen DOM after expanding clusters, so once
  // the screen renders every section with detail, Print inherits all of it.
  test('Print includes the hub-conflict section and expands cluster children', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    const printSpy = jest.spyOn(window, 'print').mockImplementation(() => {});
    initErrorsDashboard('dash');
    await flush();
    openCategory('overlap');
    await flush();
    document.querySelector('.print-btn').click();

    expect(printSpy).toHaveBeenCalled();
    // children expanded for paper
    expect(document.querySelector('.overlap-cluster-children').hidden).toBe(false);
    // both-hub overlap (2↔3) present in the printed DOM, with detail
    const hubSection = document.querySelector('.overlap-hub-conflicts .overlap-affected');
    expect(hubSection).not.toBeNull();
    expect(hubSection.textContent).toMatch(/–/); // range detail, not bare row refs
    printSpy.mockRestore();
  });

  // ── #193: "Other overlaps" renders as a real columned <table> ──────────────
  // The librarian asked for "a table with clear categories", not run-on lines.
  test('#193 "Other overlaps" renders a semantic <table> with a <thead>/<th> header row', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();
    openCategory('overlap');
    await flush();

    const section = document.querySelector('.overlap-other');
    expect(section).not.toBeNull();
    const table = section.querySelector('table.overlap-table');
    expect(table).not.toBeNull();
    // a visible header row of column labels
    const thead = table.querySelector('thead');
    expect(thead).not.toBeNull();
    const headers = thead.querySelectorAll('th');
    expect(headers.length).toBeGreaterThanOrEqual(5); // Shelf, Floor·Collection, Range, Row, Explanation (+action)
    // each overlapping pair is its own <tbody> (a clean "one overlap" unit)
    const pairBodies = table.querySelectorAll('tbody.overlap-pair');
    expect(pairBodies.length).toBe(1); // exactly the 7↔8 pair
    // the two shelves are two <tr> rows inside that tbody
    expect(pairBodies[0].querySelectorAll('tr.overlap-shelf-row').length).toBe(2);
  });

  test('#193 each shelf row exposes labelled cells: range in <bdi dir="ltr">, row number, and a goto button', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();
    openCategory('overlap');
    await flush();

    const rows = document.querySelectorAll('.overlap-other tbody.overlap-pair tr.overlap-shelf-row');
    expect(rows.length).toBe(2);
    rows.forEach((tr) => {
      // a range cell with the call-number range isolated LTR
      const rangeBdi = tr.querySelector('.overlap-cell-range bdi[dir="ltr"]');
      expect(rangeBdi).not.toBeNull();
      expect(rangeBdi.textContent).toMatch(/–/); // start–end
      // a row-number cell
      expect(tr.querySelector('.overlap-cell-row')).not.toBeNull();
      // the existing Go-to-row contract preserved
      const btn = tr.querySelector('.overlap-goto-btn');
      expect(btn).not.toBeNull();
      expect(btn.dataset.rowIndex).toMatch(/^\d+$/);
    });
    // both 0-based indices (7,8) reachable, contract preserved exactly
    const idxs = new Set([...document.querySelectorAll('.overlap-other .overlap-goto-btn')].map(b => b.dataset.rowIndex));
    expect(idxs).toEqual(new Set(['7', '8']));
  });

  test('#193 (AC8) each "Other overlaps" pair carries ONE plain-language explanation cell', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();
    openCategory('overlap');
    await flush();

    const tbody = document.querySelector('.overlap-other tbody.overlap-pair');
    const explanations = tbody.querySelectorAll('.overlap-cell-explanation');
    // exactly one explanation per pair (not duplicated per shelf row)
    expect(explanations.length).toBe(1);
    const text = explanations[0].textContent.trim();
    expect(text.length).toBeGreaterThan(10);
    // librarian-voice: mentions both shelves / either shelf (en or he)
    expect(text).toMatch(/either shelf|שני המדפים|שני מדפים/);
  });

  test('#193 (AC6) "Hub conflicts" uses the SAME table treatment', async () => {
    document.body.innerHTML = '<div id="dash"></div>';
    initErrorsDashboard('dash');
    await flush();
    openCategory('overlap');
    await flush();

    const section = document.querySelector('.overlap-hub-conflicts');
    expect(section).not.toBeNull();
    const table = section.querySelector('table.overlap-table');
    expect(table).not.toBeNull();
    expect(table.querySelector('thead th')).not.toBeNull();
    const pairBody = table.querySelector('tbody.overlap-pair');
    expect(pairBody).not.toBeNull();
    // both endpoints (0-based 2 and 3) still reachable via goto
    const btns = pairBody.querySelectorAll('.overlap-goto-btn');
    expect(new Set([...btns].map(b => b.dataset.rowIndex))).toEqual(new Set(['2', '3']));
    // explanation present for the conflict too
    expect(pairBody.querySelector('.overlap-cell-explanation')).not.toBeNull();
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
