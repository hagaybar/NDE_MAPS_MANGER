import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';

test.describe('CSV Editor — Broken refs filter (migration cleanup)', () => {
  test('toggle filters to broken rows; rename action removes a row from the filter', async ({ page, loginAsAdmin }) => {
    // Set up: navigate to admin, log in as admin, open CSV Editor
    // Uses existing e2e/fixtures/auth.fixture helpers (mock auth + API routes)
    await mockApiResponses(page);
    await loginAsAdmin();
    await page.goto('/admin/');
    await page.waitForLoadState('domcontentloaded');

    // Open CSV Editor view via the nav tab (admin app uses #nav-csv button)
    const navCsv = page.locator('#nav-csv');
    if (await navCsv.isVisible().catch(() => false)) {
      await navCsv.click();
    }

    // Click the broken-refs toggle
    const toggle = page.locator('[data-action="toggle-broken-refs"]');
    await expect(toggle).toBeVisible();
    const initialText = await toggle.textContent();
    const initialMatch = initialText?.match(/\((\d+)\)/);
    const initialCount = initialMatch ? Number(initialMatch[1]) : 0;
    test.skip(initialCount === 0, 'No broken refs present in seed data — nothing to clean up.');

    await toggle.click();

    // Verify only broken-ref rows are visible
    const visibleRows = page.locator('#csv-table tr[data-row-index]:visible');
    const visibleCount = await visibleRows.count();
    expect(visibleCount).toBe(initialCount);

    // Use the rename dropdown on the first broken row
    const firstDropdown = page.locator('tr[data-row-index]:visible select[data-action="rename-svgcode"]').first();
    const options = await firstDropdown.locator('option:not([value=""])').count();
    test.skip(options === 0, 'No unclaimed shelves on this floor to rename to — manual test needed.');

    await firstDropdown.selectOption({ index: 1 });

    // After rename, the row should disappear from the filter view
    const newVisibleCount = await visibleRows.count();
    expect(newVisibleCount).toBe(initialCount - 1);

    // Counter on the toggle should decrement
    const newText = await toggle.textContent();
    expect(newText).toContain(`(${initialCount - 1})`);
  });
});
