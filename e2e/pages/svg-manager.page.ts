import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object for SVG Manager functionality
 */
export class SvgManagerPage extends BasePage {
  // Container
  readonly container: Locator;
  readonly card: Locator;

  // Header elements
  readonly title: Locator;
  readonly uploadToggleButton: Locator;

  // Upload dropzone
  readonly uploadDropzone: Locator;
  readonly fileInput: Locator;

  // File grid
  readonly fileGrid: Locator;
  readonly fileCards: Locator;

  // Preview modal
  readonly previewModal: Locator;
  readonly previewTitle: Locator;
  readonly previewContent: Locator;
  readonly closePreviewButton: Locator;

  // Loading and empty states
  readonly loadingIndicator: Locator;
  readonly noFilesMessage: Locator;

  constructor(page: Page) {
    super(page);

    // Container
    this.container = page.locator('#svg-manager');
    this.card = this.container.locator('.card');

    // Header elements
    this.title = this.card.locator('h2').first();
    this.uploadToggleButton = page.locator('#btn-upload-toggle');

    // Upload dropzone
    this.uploadDropzone = page.locator('#upload-dropzone');
    this.fileInput = page.locator('#svg-file-input');

    // File grid
    this.fileGrid = page.locator('#svg-grid');
    this.fileCards = this.fileGrid.locator('.svg-card');

    // Preview modal
    this.previewModal = page.locator('#svg-preview-modal');
    this.previewTitle = page.locator('#preview-title');
    this.previewContent = page.locator('#preview-content');
    this.closePreviewButton = page.locator('#btn-close-preview');

    // Loading and empty states
    this.loadingIndicator = this.fileGrid.getByText('Loading').or(this.fileGrid.locator('.loading'));
    this.noFilesMessage = this.fileGrid.getByText('No SVG files found').or(this.fileGrid.getByText('לא נמצאו קבצי SVG'));
  }

  /**
   * Navigate to SVG Manager
   */
  async navigate(): Promise<void> {
    await this.goto();
    await this.waitForPageLoad();
    await this.navigateToSvgManager();
  }

  /**
   * Wait for file grid to load
   */
  async waitForGridLoad(): Promise<void> {
    await expect(this.loadingIndicator).toBeHidden({ timeout: 10000 });
    // Also wait for at least one file card to appear (or empty state)
    await expect(this.fileCards.first().or(this.noFilesMessage)).toBeVisible({ timeout: 10000 });
  }

  /**
   * Get number of file cards
   */
  async getFileCount(): Promise<number> {
    await this.waitForGridLoad();
    return await this.fileCards.count();
  }

  /**
   * Toggle upload dropzone visibility
   */
  async toggleUploadDropzone(): Promise<void> {
    await this.uploadToggleButton.click();
  }

  /**
   * Show upload dropzone
   */
  async showUploadDropzone(): Promise<void> {
    const isHidden = await this.uploadDropzone.isHidden();
    if (isHidden) {
      await this.toggleUploadDropzone();
    }
    await expect(this.uploadDropzone).toBeVisible();
  }

  /**
   * Hide upload dropzone
   */
  async hideUploadDropzone(): Promise<void> {
    const isVisible = await this.uploadDropzone.isVisible();
    if (isVisible) {
      await this.toggleUploadDropzone();
    }
    await expect(this.uploadDropzone).toBeHidden();
  }

  /**
   * Upload an SVG file
   */
  async uploadFile(filePath: string): Promise<void> {
    await this.showUploadDropzone();
    await this.fileInput.setInputFiles(filePath);
  }

  /**
   * Get file card by filename
   */
  getFileCard(filename: string): Locator {
    return this.fileGrid.locator(`.svg-card[data-name="${filename}"]`);
  }

  /**
   * Check if file exists in grid
   */
  async fileExists(filename: string): Promise<boolean> {
    const card = this.getFileCard(filename);
    return await card.isVisible();
  }

  /**
   * Preview a file by filename
   */
  async previewFile(filename: string): Promise<void> {
    const card = this.getFileCard(filename);
    const previewButton = card.locator('.btn-preview');
    await previewButton.click();
    await expect(this.previewModal).toBeVisible();
  }

  /**
   * Close preview modal
   */
  async closePreview(): Promise<void> {
    await this.closePreviewButton.click();
    await expect(this.previewModal).toBeHidden();
  }

  /**
   * Close preview modal by clicking backdrop
   */
  async closePreviewByBackdrop(): Promise<void> {
    // Click on the modal backdrop (outside the content area)
    await this.previewModal.click({ position: { x: 10, y: 10 } });
    await expect(this.previewModal).toBeHidden();
  }

  /**
   * Close preview modal by pressing Escape
   */
  async closePreviewByEscape(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.previewModal).toBeHidden();
  }

  /**
   * Delete a file by filename
   */
  async deleteFile(filename: string): Promise<void> {
    const card = this.getFileCard(filename);
    const deleteButton = card.locator('.btn-delete');
    await deleteButton.click();
  }

  /**
   * Delete a file and accept confirmation dialog
   */
  async deleteFileWithConfirmation(filename: string): Promise<void> {
    // Set up dialog handler before clicking delete
    this.page.once('dialog', dialog => dialog.accept());
    await this.deleteFile(filename);
  }

  /**
   * Delete a file but cancel confirmation dialog
   */
  async deleteFileCancelled(filename: string): Promise<void> {
    // Set up dialog handler before clicking delete
    this.page.once('dialog', dialog => dialog.dismiss());
    await this.deleteFile(filename);
  }

  /**
   * Get all filenames in the grid
   */
  async getAllFilenames(): Promise<string[]> {
    await this.waitForGridLoad();
    const cards = await this.fileCards.all();
    const filenames: string[] = [];

    for (const card of cards) {
      const name = await card.getAttribute('data-name');
      if (name) {
        filenames.push(name);
      }
    }

    return filenames;
  }

  /**
   * Check if delete button is visible for a file (admin only)
   */
  async isDeleteButtonVisible(filename: string): Promise<boolean> {
    const card = this.getFileCard(filename);
    const deleteButton = card.locator('.btn-delete');
    return await deleteButton.isVisible();
  }

  /**
   * Check if empty state is shown
   */
  async isEmptyState(): Promise<boolean> {
    return await this.noFilesMessage.isVisible();
  }

  /**
   * Get preview modal title
   */
  async getPreviewTitle(): Promise<string> {
    return await this.previewTitle.textContent() || '';
  }

  /**
   * Check if preview modal shows image
   */
  async previewHasImage(): Promise<boolean> {
    const img = this.previewContent.locator('img');
    // Wait for image to load
    try {
      await expect(img).toBeVisible({ timeout: 5000 });
      return true;
    } catch {
      return false;
    }
  }
}
