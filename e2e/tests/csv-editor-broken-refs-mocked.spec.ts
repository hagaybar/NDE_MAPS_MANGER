import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';
import { CsvEditorPage } from '../pages/csv-editor.page';

/**
 * Mocked end-to-end coverage for the "Show only broken refs" filter in the
 * CSV Editor.
 *
 * Unlike the seed-data placeholder spec (csv-editor-broken-refs.spec.ts),
 * this test fully controls the CSV + floor SVG payloads via page.route(),
 * so the broken-ref count is deterministic: exactly 2 broken rows
 * (MISSING_A on floor 0, MISSING_B on floor 1) and 2 valid rows
 * (GOOD_A on floor 0, GOOD_B on floor 1).
 *
 * Flow:
 *   1. Toggle is visible and labelled "(2)".
 *   2. Activating the toggle leaves only the 2 broken rows visible.
 *   3. The first broken row exposes a rename dropdown with the unclaimed
 *      shelf on its floor; selecting it drops the row from the filter (count → 1).
 *   4. The remaining broken row exposes a delete button; confirming the
 *      window.confirm() splices the row out (count → 0).
 */

const CSV_HEADERS =
  'libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe';

// 4 rows: valid floor-0, BROKEN floor-0, valid floor-1, BROKEN floor-1.
// All non-svgCode/floor fields are filler to keep the parsed shape sane.
const MOCK_CSV = [
  CSV_HEADERS,
  'Lib,ספריה,Coll1,אוסף1,000,099,GOOD_A,desc,תיאור,0,Label,תווית,,',
  'Lib,ספריה,Coll2,אוסף2,100,199,MISSING_A,desc,תיאור,0,Label,תווית,,',
  'Lib,ספריה,Coll3,אוסף3,200,299,GOOD_B,desc,תיאור,1,Label,תווית,,',
  'Lib,ספריה,Coll4,אוסף4,300,399,MISSING_B,desc,תיאור,1,Label,תווית,,',
].join('\n');

const FLOOR_0_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
  '<rect id="GOOD_A" data-map-object="shelf"/>' +
  '<rect id="UNCLAIMED_A" data-map-object="shelf"/>' +
  '</svg>';

const FLOOR_1_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100">' +
  '<rect id="GOOD_B" data-map-object="shelf"/>' +
  '<rect id="UNCLAIMED_B" data-map-object="shelf"/>' +
  '</svg>';

const FLOOR_2_SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"/>';

test.describe('CSV Editor — Broken refs filter (mocked data)', () => {
  test('toggle filters to broken rows; rename + delete actions clear the filter', async ({ page, loginAsAdmin }) => {
    // Standard API mocks (auth, etc) — same setup csv-editor.spec.ts uses.
    await mockApiResponses(page);

    // CRITICAL: Register routes BEFORE navigation so the admin app's initial
    // fetch() for the CSV / floor SVGs hits our mocks rather than CloudFront.
    await page.route('**/data/mapping.csv', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: MOCK_CSV,
      });
    });

    await page.route('**/maps/floor_0.svg', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: FLOOR_0_SVG,
      });
    });

    await page.route('**/maps/floor_1.svg', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: FLOOR_1_SVG,
      });
    });

    await page.route('**/maps/floor_2.svg', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: FLOOR_2_SVG,
      });
    });

    await loginAsAdmin();

    // Use the established CsvEditorPage pattern so we go through the proper
    // auth-overlay / nav-tabs handshake (same as csv-editor.spec.ts).
    const csvEditor = new CsvEditorPage(page);
    await csvEditor.navigate();

    // The toggle is appended to #csv-toolbar after renderBrokenRefsToggle()
    // fires once the CSV load + floor-SVG fetches resolve. Wait for the
    // element to exist, then wait for the count to settle to "(2)" — the
    // initial render may run with empty svgShelfIdsByFloor (which would show
    // ALL 4 rows as broken) before the SVG fetches resolve.
    const toggle = page.locator('[data-action="toggle-broken-refs"]');
    await toggle.waitFor({ state: 'visible', timeout: 10000 });
    await expect(toggle).toContainText('(2)', { timeout: 10000 });

    // Activate the filter.
    await toggle.click();

    // Only the 2 broken rows should remain visible. We count via DOM rather
    // than Playwright's :visible pseudo to avoid timing flakiness around the
    // style.display='' / 'none' toggles in applyBrokenRefsFilter().
    await expect.poll(async () => {
      return await page.evaluate(() => {
        const trs = Array.from(document.querySelectorAll('#csv-table tr[data-row-index]'));
        return trs.filter((tr) => (tr as HTMLElement).style.display !== 'none').length;
      });
    }, { timeout: 5000 }).toBe(2);

    // First broken row: rename via dropdown.
    const firstDropdown = page
      .locator('tr[data-row-index]')
      .filter({ has: page.locator('select[data-action="rename-svgcode"]') })
      .first()
      .locator('select[data-action="rename-svgcode"]');
    await expect(firstDropdown).toBeVisible();

    const optionCount = await firstDropdown.locator('option:not([value=""])').count();
    expect(optionCount).toBeGreaterThan(0);

    // Pick the unclaimed shelf option (index 0 is the placeholder "-- Rename to --").
    await firstDropdown.selectOption({ index: 1 });

    // After rename, only 1 broken row remains. The selection handler calls
    // renderRows() which preserves the filter via applyBrokenRefsFilter().
    await expect(toggle).toContainText('(1)', { timeout: 5000 });

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const trs = Array.from(document.querySelectorAll('#csv-table tr[data-row-index]'));
        return trs.filter((tr) => (tr as HTMLElement).style.display !== 'none').length;
      });
    }, { timeout: 5000 }).toBe(1);

    // Remaining broken row: delete via the inline button. The handler calls
    // window.confirm() — install the dialog handler BEFORE clicking so it's
    // auto-accepted.
    page.once('dialog', (dialog) => dialog.accept());

    const deleteButton = page
      .locator('tr[data-row-index]')
      .filter({ has: page.locator('button[data-action="delete-broken-row"]') })
      .first()
      .locator('button[data-action="delete-broken-row"]');
    await expect(deleteButton).toBeVisible();
    await deleteButton.click();

    // After delete, no rows are broken and the filter shows an empty table.
    await expect(toggle).toContainText('(0)', { timeout: 5000 });

    await expect.poll(async () => {
      return await page.evaluate(() => {
        const trs = Array.from(document.querySelectorAll('#csv-table tr[data-row-index]'));
        return trs.filter((tr) => (tr as HTMLElement).style.display !== 'none').length;
      });
    }, { timeout: 5000 }).toBe(0);
  });
});
