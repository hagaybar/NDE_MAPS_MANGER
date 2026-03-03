import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object for CSV Editor functionality
 */
export class CsvEditorPage extends BasePage {
  // Container
  readonly container: Locator;
  readonly card: Locator;

  // Header elements
  readonly title: Locator;
  readonly searchInput: Locator;
  readonly addRowButton: Locator;
  readonly saveButton: Locator;

  // Table elements
  readonly tableContainer: Locator;
  readonly table: Locator;
  readonly tableHeaders: Locator;
  readonly tableRows: Locator;

  // Loading state
  readonly loadingIndicator: Locator;

  constructor(page: Page) {
    super(page);

    // Container
    this.container = page.locator('#csv-editor');
    this.card = this.container.locator('.card');

    // Header elements
    this.title = this.card.locator('h2').first();
    this.searchInput = page.locator('#csv-search');
    this.addRowButton = page.locator('#btn-add-row');
    this.saveButton = page.locator('#btn-save');

    // Table elements
    this.tableContainer = page.locator('#table-container');
    this.table = page.locator('#csv-table');
    this.tableHeaders = this.table.locator('thead th');
    this.tableRows = this.table.locator('tbody tr.csv-row');

    // Loading state
    this.loadingIndicator = this.tableContainer.getByText('Loading').or(this.tableContainer.locator('.loading'));
  }

  /**
   * Navigate to CSV Editor
   */
  async navigate(): Promise<void> {
    await this.goto();
    await this.waitForPageLoad();
    await this.navigateToCsvEditor();
  }

  /**
   * Wait for table to load
   */
  async waitForTableLoad(): Promise<void> {
    // Wait for loading to disappear
    await expect(this.loadingIndicator).toBeHidden({ timeout: 10000 });
    // Wait for table to be visible
    await expect(this.table).toBeVisible({ timeout: 10000 });
  }

  /**
   * Get number of table rows
   */
  async getRowCount(): Promise<number> {
    return await this.tableRows.count();
  }

  /**
   * Get cell value by row and column index
   */
  async getCellValue(rowIndex: number, columnIndex: number): Promise<string> {
    const row = this.tableRows.nth(rowIndex);
    const cell = row.locator('td').nth(columnIndex);
    const input = cell.locator('input.csv-input');
    return await input.inputValue();
  }

  /**
   * Set cell value by row and column index
   */
  async setCellValue(rowIndex: number, columnIndex: number, value: string): Promise<void> {
    const row = this.tableRows.nth(rowIndex);
    const cell = row.locator('td').nth(columnIndex);
    const input = cell.locator('input.csv-input');
    await input.clear();
    await input.fill(value);
  }

  /**
   * Get cell input by row index and column name
   */
  async getCellInput(rowIndex: number, columnName: string): Promise<Locator> {
    const input = this.page.locator(`input.csv-input[data-row="${rowIndex}"][data-column="${columnName}"]`);
    return input;
  }

  /**
   * Edit cell by row and column name
   */
  async editCell(rowIndex: number, columnName: string, value: string): Promise<void> {
    const input = await this.getCellInput(rowIndex, columnName);
    await input.clear();
    await input.fill(value);
  }

  /**
   * Search in the table
   */
  async search(query: string): Promise<void> {
    await this.searchInput.clear();
    await this.searchInput.fill(query);
  }

  /**
   * Clear search
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
  }

  /**
   * Get visible row count (after filtering)
   */
  async getVisibleRowCount(): Promise<number> {
    const rows = this.tableRows;
    const count = await rows.count();
    let visibleCount = 0;

    for (let i = 0; i < count; i++) {
      const row = rows.nth(i);
      const isVisible = await row.isVisible();
      const style = await row.getAttribute('style');
      // Row is visible if it doesn't have display: none
      if (isVisible && (!style || !style.includes('display: none'))) {
        visibleCount++;
      }
    }

    return visibleCount;
  }

  /**
   * Add a new row
   */
  async addRow(): Promise<void> {
    const initialCount = await this.getRowCount();
    await this.addRowButton.click();
    // Wait for the new row to appear
    await expect(this.tableRows).toHaveCount(initialCount + 1);
  }

  /**
   * Delete a row by index
   */
  async deleteRow(rowIndex: number): Promise<void> {
    const row = this.tableRows.nth(rowIndex);
    const deleteButton = row.locator('.btn-delete-row');
    await deleteButton.click();
  }

  /**
   * Check if save button is enabled
   */
  async isSaveEnabled(): Promise<boolean> {
    return !(await this.saveButton.isDisabled());
  }

  /**
   * Save changes
   */
  async save(): Promise<void> {
    await this.saveButton.click();
  }

  /**
   * Save and wait for success toast
   */
  async saveAndWaitForSuccess(): Promise<void> {
    await this.save();
    await this.waitForToast('success');
  }

  /**
   * Get all column headers
   */
  async getColumnHeaders(): Promise<string[]> {
    const headers = await this.tableHeaders.allTextContents();
    // Remove the last header (delete column) and trim whitespace
    return headers.slice(0, -1).map(h => h.trim());
  }

  /**
   * Check if table shows no data message
   */
  async isEmptyState(): Promise<boolean> {
    const emptyMessage = this.tableContainer.locator('text=No data available');
    return await emptyMessage.isVisible();
  }

  /**
   * Check if table shows error state
   */
  async isErrorState(): Promise<boolean> {
    const errorMessage = this.tableContainer.locator('text=An error occurred');
    return await errorMessage.isVisible();
  }
}
