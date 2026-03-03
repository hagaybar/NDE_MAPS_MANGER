import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object for Version History functionality
 */
export class VersionHistoryPage extends BasePage {
  // Container
  readonly container: Locator;
  readonly card: Locator;

  // Header
  readonly title: Locator;

  // Table elements
  readonly table: Locator;
  readonly tableHeaders: Locator;
  readonly versionRows: Locator;

  // States
  readonly loadingState: Locator;
  readonly emptyState: Locator;
  readonly errorState: Locator;

  // Preview dialog (shown in version-preview component)
  readonly previewDialog: Locator;

  // Restore confirm dialog
  readonly restoreDialog: Locator;
  readonly restoreConfirmButton: Locator;
  readonly restoreCancelButton: Locator;

  constructor(page: Page) {
    super(page);

    // Container
    this.container = page.locator('#version-history');
    this.card = this.container.locator('.card');

    // Header
    this.title = this.card.locator('h2').first();

    // Table elements
    this.table = this.container.locator('table');
    this.tableHeaders = this.table.locator('thead th');
    this.versionRows = this.container.locator('[data-testid="version-row"]');

    // States
    this.loadingState = this.container.locator('[data-testid="loading-state"]');
    this.emptyState = this.container.locator('[data-testid="empty-state"]');
    this.errorState = this.container.locator('[data-testid="error-state"]');

    // Preview dialog
    this.previewDialog = page.locator('#version-preview-dialog, [role="dialog"][aria-label*="preview"]');

    // Restore confirm dialog
    this.restoreDialog = page.locator('#restore-confirm-dialog, [role="alertdialog"]');
    this.restoreConfirmButton = this.restoreDialog.locator('button:has-text("Confirm"), button:has-text("אישור")');
    this.restoreCancelButton = this.restoreDialog.locator('button:has-text("Cancel"), button:has-text("ביטול")');
  }

  /**
   * Navigate to Version History
   */
  async navigate(): Promise<void> {
    await this.goto();
    await this.waitForPageLoad();
    await this.navigateToVersionHistory();
  }

  /**
   * Wait for version list to load
   */
  async waitForLoad(): Promise<void> {
    // Wait for loading state to disappear
    await expect(this.loadingState).toBeHidden({ timeout: 15000 });
  }

  /**
   * Check if loading state is shown
   */
  async isLoading(): Promise<boolean> {
    return await this.loadingState.isVisible();
  }

  /**
   * Check if empty state is shown
   */
  async isEmpty(): Promise<boolean> {
    return await this.emptyState.isVisible();
  }

  /**
   * Check if error state is shown
   */
  async hasError(): Promise<boolean> {
    return await this.errorState.isVisible();
  }

  /**
   * Get number of versions
   */
  async getVersionCount(): Promise<number> {
    await this.waitForLoad();
    return await this.versionRows.count();
  }

  /**
   * Get version row by index
   */
  getVersionRow(index: number): Locator {
    return this.versionRows.nth(index);
  }

  /**
   * Get version ID from row
   */
  async getVersionId(index: number): Promise<string> {
    const row = this.getVersionRow(index);
    return await row.getAttribute('data-version-id') || '';
  }

  /**
   * Get timestamp from version row
   */
  async getTimestamp(index: number): Promise<string> {
    const row = this.getVersionRow(index);
    const cell = row.locator('[data-testid="version-timestamp"]');
    return await cell.textContent() || '';
  }

  /**
   * Get username from version row
   */
  async getUsername(index: number): Promise<string> {
    const row = this.getVersionRow(index);
    const cell = row.locator('[data-testid="version-user"]');
    return await cell.textContent() || '';
  }

  /**
   * Get file size from version row
   */
  async getFileSize(index: number): Promise<string> {
    const row = this.getVersionRow(index);
    const cell = row.locator('[data-testid="version-size"]');
    return await cell.textContent() || '';
  }

  /**
   * Click on version row to preview
   */
  async clickVersion(index: number): Promise<void> {
    const row = this.getVersionRow(index);
    await row.click();
  }

  /**
   * Click restore button for a version
   */
  async clickRestore(index: number): Promise<void> {
    const row = this.getVersionRow(index);
    const restoreButton = row.locator('[data-testid="restore-button"]');
    await restoreButton.click();
  }

  /**
   * Confirm restore in dialog
   */
  async confirmRestore(): Promise<void> {
    await expect(this.restoreDialog).toBeVisible();
    await this.restoreConfirmButton.click();
  }

  /**
   * Cancel restore in dialog
   */
  async cancelRestore(): Promise<void> {
    await expect(this.restoreDialog).toBeVisible();
    await this.restoreCancelButton.click();
  }

  /**
   * Restore a version (click + confirm)
   */
  async restoreVersion(index: number): Promise<void> {
    await this.clickRestore(index);
    await this.confirmRestore();
    // Wait for success toast
    await this.waitForToast('success');
  }

  /**
   * Check if preview dialog is visible
   */
  async isPreviewVisible(): Promise<boolean> {
    return await this.previewDialog.isVisible();
  }

  /**
   * Close preview dialog
   */
  async closePreview(): Promise<void> {
    const closeButton = this.previewDialog.locator('button[aria-label*="close"], .close-btn');
    if (await closeButton.isVisible()) {
      await closeButton.click();
    } else {
      await this.page.keyboard.press('Escape');
    }
    await expect(this.previewDialog).toBeHidden();
  }

  /**
   * Get all version data as array of objects
   */
  async getAllVersions(): Promise<Array<{ id: string; timestamp: string; user: string; size: string }>> {
    await this.waitForLoad();
    const count = await this.getVersionCount();
    const versions = [];

    for (let i = 0; i < count; i++) {
      versions.push({
        id: await this.getVersionId(i),
        timestamp: await this.getTimestamp(i),
        user: await this.getUsername(i),
        size: await this.getFileSize(i)
      });
    }

    return versions;
  }

  /**
   * Check if versions are sorted by timestamp (newest first)
   */
  async isNewestFirst(): Promise<boolean> {
    const versions = await this.getAllVersions();
    if (versions.length < 2) return true;

    for (let i = 1; i < versions.length; i++) {
      const prevDate = new Date(versions[i - 1].timestamp);
      const currDate = new Date(versions[i].timestamp);
      if (currDate > prevDate) {
        return false;
      }
    }

    return true;
  }

  /**
   * Use keyboard navigation to select version
   */
  async navigateWithKeyboard(index: number): Promise<void> {
    const row = this.getVersionRow(index);
    await row.focus();
    await this.page.keyboard.press('Enter');
  }
}
