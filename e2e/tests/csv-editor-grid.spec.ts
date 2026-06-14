import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';
import { CsvEditorPage } from '../pages/csv-editor.page';

/**
 * #187 Task 8 — Usable wide grid e2e.
 *
 * Acceptance for Task 7's layout work (jsdom can't compute sticky/scroll):
 *  - the header row stays visible while scrolling vertically (frozen header),
 *  - the read-only left anchor column stays visible while scrolling
 *    horizontally (frozen anchor column),
 *  - the table scrolls horizontally inside its own bounded viewport (the
 *    horizontal scrollbar is on screen, not below all rows),
 *  - in RTL the anchor column pins to the right (inline-start) edge.
 *
 * The default mock CSV (auth.fixture mockApiResponses) is only 5 narrow columns
 * × 3 rows, which never overflows. We register a wide + tall CSV route AFTER
 * mockApiResponses so it is matched first (Playwright checks routes in reverse
 * registration order), giving the grid real horizontal and vertical overflow.
 */

// All 14 production columns so the table is wide enough to need horizontal scroll.
const HEADERS = [
  'libraryName', 'libraryNameHe', 'collectionName', 'collectionNameHe',
  'rangeStart', 'rangeEnd', 'svgCode', 'description', 'descriptionHe',
  'floor', 'shelfLabel', 'shelfLabelHe', 'notes', 'notesHe',
];

/** Build a wide (14-col) + tall (rowCount) CSV body so the grid overflows both axes. */
function buildWideCsv(rowCount: number): string {
  const lines = [HEADERS.join(',')];
  for (let i = 0; i < rowCount; i++) {
    const start = String(i * 10).padStart(3, '0');
    const end = String(i * 10 + 9).padStart(3, '0');
    lines.push([
      'Central Library', 'הספרייה המרכזית',
      'General Stacks', 'מאגר כללי',
      start, end,
      `SHELF_${i}`,
      `Description for shelf number ${i} with enough text to widen the column`,
      `תיאור עבור מדף מספר ${i}`,
      String(i % 3),
      `${i} A`, `${i} א`,
      'note', 'הערה',
    ].join(','));
  }
  return lines.join('\n');
}

test.describe('CSV Editor grid (#187)', () => {
  let csvEditor: CsvEditorPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    csvEditor = new CsvEditorPage(page);
    await mockApiResponses(page);
    // Override the CSV body with a wide + tall dataset so the grid scrolls.
    // Registered after mockApiResponses → matched first.
    await page.route('**/data/mapping.csv', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: buildWideCsv(60),
      });
    });
    await loginAsAdmin();
    await csvEditor.navigate();
    await csvEditor.waitForTableLoad();
  });

  test('header stays visible when the table scrolls vertically (frozen header)', async ({ page }) => {
    const container = page.locator('#table-container');
    const headerCell = page.locator('#csv-table thead th').first();

    // Sticky positioning is what keeps the header on screen.
    expect(await headerCell.evaluate(el => getComputedStyle(el).position)).toBe('sticky');

    const before = await headerCell.boundingBox();
    await container.evaluate(el => { el.scrollTop = el.scrollHeight; });
    const after = await headerCell.boundingBox();

    // The header tracks the top of the scroll container (does not scroll away).
    expect(Math.abs((after!.y) - (before!.y))).toBeLessThan(4);
  });

  test('anchor column stays visible when the table scrolls horizontally (frozen anchor)', async ({ page }) => {
    const container = page.locator('#table-container');
    const anchor = page.locator('#csv-table tbody .csv-anchor-cell').first();

    expect(await anchor.evaluate(el => getComputedStyle(el).position)).toBe('sticky');

    const before = await anchor.boundingBox();
    await container.evaluate(el => { el.scrollLeft = el.scrollWidth; });
    const after = await anchor.boundingBox();

    // The anchor column hugs the start edge and does not scroll away horizontally.
    expect(Math.abs((after!.x) - (before!.x))).toBeLessThan(4);
  });

  test('the table scrolls horizontally inside its own bounded viewport', async ({ page }) => {
    const metrics = await page.locator('#table-container').evaluate(el => ({
      hOverflow: el.scrollWidth > el.clientWidth,        // wide enough to need horizontal scroll
      bounded: el.clientHeight < el.scrollHeight,         // vertical content exceeds the window
      withinViewport: el.getBoundingClientRect().bottom <= window.innerHeight + 1,
    }));
    expect(metrics.hOverflow).toBe(true);
    expect(metrics.bounded).toBe(true);                   // the table has its own scroll window
    expect(metrics.withinViewport).toBe(true);            // the bottom (with its scrollbar) is on screen
  });

  test('RTL: anchor column pins to the right (inline-start) edge', async ({ page }) => {
    await page.locator('#lang-he').click();
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await page.locator('#csv-table').waitFor();

    const { containerRight, anchorRight } = await page.evaluate(() => {
      const c = document.getElementById('table-container')!.getBoundingClientRect();
      const a = document.querySelector('#csv-table tbody .csv-anchor-cell')!.getBoundingClientRect();
      return { containerRight: c.right, anchorRight: a.right };
    });
    // In RTL the frozen anchor hugs the right (start) edge of the container.
    expect(Math.abs(containerRight - anchorRight)).toBeLessThan(24);
  });
});
