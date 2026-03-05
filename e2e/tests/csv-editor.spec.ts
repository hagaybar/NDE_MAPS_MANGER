import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';
import { CsvEditorPage } from '../pages/csv-editor.page';

test.describe('CSV Editor', () => {
  let csvEditor: CsvEditorPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    csvEditor = new CsvEditorPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await csvEditor.navigate();
  });

  test('should display CSV Editor view', async ({ page }) => {
    await expect(csvEditor.container).toBeVisible();
    await expect(csvEditor.title).toBeVisible();
  });

  test('should load and display CSV data in table', async ({ page }) => {
    await csvEditor.waitForTableLoad();

    await expect(csvEditor.table).toBeVisible();
    const rowCount = await csvEditor.getRowCount();
    expect(rowCount).toBeGreaterThan(0);
  });

  test('should display correct column headers', async ({ page }) => {
    await csvEditor.waitForTableLoad();

    const headers = await csvEditor.getColumnHeaders();
    expect(headers).toContain('location_code');
    expect(headers).toContain('floor');
    expect(headers).toContain('section');
    expect(headers).toContain('shelf');
    expect(headers).toContain('description');
  });

  test('should display search input', async ({ page }) => {
    await expect(csvEditor.searchInput).toBeVisible();
    await expect(csvEditor.searchInput).toBeEditable();
  });

  test('should display add row button', async ({ page }) => {
    await expect(csvEditor.addRowButton).toBeVisible();
    await expect(csvEditor.addRowButton).toBeEnabled();
  });

  test('should display save button (disabled initially)', async ({ page }) => {
    await csvEditor.waitForTableLoad();

    await expect(csvEditor.saveButton).toBeVisible();
    // Save should be disabled when no changes made
    await expect(csvEditor.saveButton).toBeDisabled();
  });
});

test.describe('CSV Editor - Search', () => {
  let csvEditor: CsvEditorPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    csvEditor = new CsvEditorPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await csvEditor.navigate();
    await csvEditor.waitForTableLoad();
  });

  test('should filter rows when searching', async ({ page }) => {
    const initialCount = await csvEditor.getRowCount();

    // Search for a specific term
    await csvEditor.search('ABC001');

    // Wait for filtering
    await page.waitForTimeout(300);

    const filteredCount = await csvEditor.getVisibleRowCount();
    expect(filteredCount).toBeLessThanOrEqual(initialCount);
    expect(filteredCount).toBeGreaterThan(0);
  });

  test('should show all rows when search is cleared', async ({ page }) => {
    const initialCount = await csvEditor.getRowCount();

    // Search and then clear
    await csvEditor.search('ABC001');
    await page.waitForTimeout(300);

    await csvEditor.clearSearch();
    await page.waitForTimeout(300);

    const currentCount = await csvEditor.getVisibleRowCount();
    expect(currentCount).toBe(initialCount);
  });

  test('should handle case-insensitive search', async ({ page }) => {
    // Search with uppercase
    await csvEditor.search('ABC');
    await page.waitForTimeout(300);
    const upperCount = await csvEditor.getVisibleRowCount();

    // Search with lowercase
    await csvEditor.search('abc');
    await page.waitForTimeout(300);
    const lowerCount = await csvEditor.getVisibleRowCount();

    expect(upperCount).toBe(lowerCount);
  });

  test('should show no rows for non-matching search', async ({ page }) => {
    await csvEditor.search('NONEXISTENT12345');
    await page.waitForTimeout(300);

    const count = await csvEditor.getVisibleRowCount();
    expect(count).toBe(0);
  });
});

test.describe('CSV Editor - Add Row', () => {
  let csvEditor: CsvEditorPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    csvEditor = new CsvEditorPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await csvEditor.navigate();
    await csvEditor.waitForTableLoad();
  });

  test('should add a new row when clicking add button', async ({ page }) => {
    const initialCount = await csvEditor.getRowCount();

    await csvEditor.addRow();

    const newCount = await csvEditor.getRowCount();
    expect(newCount).toBe(initialCount + 1);
  });

  test('should enable save button after adding row', async ({ page }) => {
    await expect(csvEditor.saveButton).toBeDisabled();

    await csvEditor.addRow();

    await expect(csvEditor.saveButton).toBeEnabled();
  });

  test('should create empty row with all columns', async ({ page }) => {
    const initialCount = await csvEditor.getRowCount();
    await csvEditor.addRow();

    // Check the new row has empty values
    const newRowIndex = initialCount;
    const headers = await csvEditor.getColumnHeaders();

    for (let i = 0; i < headers.length; i++) {
      const value = await csvEditor.getCellValue(newRowIndex, i);
      expect(value).toBe('');
    }
  });
});

test.describe('CSV Editor - Edit Cells', () => {
  let csvEditor: CsvEditorPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    csvEditor = new CsvEditorPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await csvEditor.navigate();
    await csvEditor.waitForTableLoad();
  });

  test('should allow editing cell values', async ({ page }) => {
    const testValue = 'NEW_VALUE_123';

    await csvEditor.setCellValue(0, 0, testValue);

    const cellValue = await csvEditor.getCellValue(0, 0);
    expect(cellValue).toBe(testValue);
  });

  test('should enable save button after editing', async ({ page }) => {
    await expect(csvEditor.saveButton).toBeDisabled();

    await csvEditor.setCellValue(0, 0, 'edited');

    await expect(csvEditor.saveButton).toBeEnabled();
  });

  test('should maintain edits while navigating rows', async ({ page }) => {
    const testValue1 = 'EDIT_1';
    const testValue2 = 'EDIT_2';

    await csvEditor.setCellValue(0, 0, testValue1);
    await csvEditor.setCellValue(1, 0, testValue2);

    // Verify both edits are maintained
    expect(await csvEditor.getCellValue(0, 0)).toBe(testValue1);
    expect(await csvEditor.getCellValue(1, 0)).toBe(testValue2);
  });
});

test.describe('CSV Editor - Delete Row', () => {
  let csvEditor: CsvEditorPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    csvEditor = new CsvEditorPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await csvEditor.navigate();
    await csvEditor.waitForTableLoad();
  });

  test('should delete a row', async ({ page }) => {
    const initialCount = await csvEditor.getRowCount();

    await csvEditor.deleteRow(0);

    const newCount = await csvEditor.getRowCount();
    expect(newCount).toBe(initialCount - 1);
  });

  test('should enable save button after deleting row', async ({ page }) => {
    await expect(csvEditor.saveButton).toBeDisabled();

    await csvEditor.deleteRow(0);

    await expect(csvEditor.saveButton).toBeEnabled();
  });
});

test.describe('CSV Editor - Save', () => {
  let csvEditor: CsvEditorPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    csvEditor = new CsvEditorPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await csvEditor.navigate();
    await csvEditor.waitForTableLoad();
  });

  test('should save changes and show success toast', async ({ page }) => {
    // Make a change
    await csvEditor.setCellValue(0, 0, 'CHANGED');

    // Save
    await csvEditor.saveAndWaitForSuccess();

    // Check save button is disabled after save
    await expect(csvEditor.saveButton).toBeDisabled();
  });

  test('should disable save button after successful save', async ({ page }) => {
    await csvEditor.addRow();
    await expect(csvEditor.saveButton).toBeEnabled();

    await csvEditor.saveAndWaitForSuccess();

    await expect(csvEditor.saveButton).toBeDisabled();
  });
});

test.describe('CSV Editor - Role-based access', () => {
  // Note: CSV Editor is now admin-only, so no editor role tests needed

  test('delete buttons should be visible for admin role', async ({ page, loginAsAdmin }) => {
    const csvEditor = new CsvEditorPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await csvEditor.navigate();
    await csvEditor.waitForTableLoad();

    // Delete buttons should be visible for admins
    const deleteButtons = page.locator('.btn-delete-row');
    const count = await deleteButtons.count();

    expect(count).toBeGreaterThan(0);
    // At least the first one should be visible
    await expect(deleteButtons.first()).toBeVisible();
  });
});
