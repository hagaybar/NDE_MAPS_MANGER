import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';
import { SvgManagerPage } from '../pages/svg-manager.page';
import * as path from 'path';

test.describe('SVG Manager', () => {
  let svgManager: SvgManagerPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    svgManager = new SvgManagerPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await svgManager.navigate();
  });

  test('should display SVG Manager view', async ({ page }) => {
    await expect(svgManager.container).toBeVisible();
    await expect(svgManager.title).toBeVisible();
  });

  test('should display upload toggle button', async ({ page }) => {
    await expect(svgManager.uploadToggleButton).toBeVisible();
    await expect(svgManager.uploadToggleButton).toBeEnabled();
  });

  test('should load and display file grid', async ({ page }) => {
    await svgManager.waitForGridLoad();

    await expect(svgManager.fileGrid).toBeVisible();
    const fileCount = await svgManager.getFileCount();
    expect(fileCount).toBeGreaterThan(0);
  });

  test('should display expected floor map files', async ({ page }) => {
    await svgManager.waitForGridLoad();

    const filenames = await svgManager.getAllFilenames();
    expect(filenames).toContain('floor_0.svg');
    expect(filenames).toContain('floor_1.svg');
    expect(filenames).toContain('floor_2.svg');
  });
});

test.describe('SVG Manager - Upload Dropzone', () => {
  let svgManager: SvgManagerPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    svgManager = new SvgManagerPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await svgManager.navigate();
    await svgManager.waitForGridLoad();
  });

  test('should toggle upload dropzone visibility', async ({ page }) => {
    // Dropzone should be hidden by default
    await expect(svgManager.uploadDropzone).toBeHidden();

    // Toggle to show
    await svgManager.toggleUploadDropzone();
    await expect(svgManager.uploadDropzone).toBeVisible();

    // Toggle to hide
    await svgManager.toggleUploadDropzone();
    await expect(svgManager.uploadDropzone).toBeHidden();
  });

  test('should show upload dropzone when clicking upload button', async ({ page }) => {
    await svgManager.showUploadDropzone();
    await expect(svgManager.uploadDropzone).toBeVisible();
  });

  test('should have file input accepting only SVG files', async ({ page }) => {
    await svgManager.showUploadDropzone();

    const accept = await svgManager.fileInput.getAttribute('accept');
    expect(accept).toBe('.svg');
  });
});

test.describe('SVG Manager - Preview', () => {
  let svgManager: SvgManagerPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    svgManager = new SvgManagerPage(page);
    await mockApiResponses(page);

    // Mock SVG file responses
    await page.route('**/maps/*.svg', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><rect width="100" height="100" fill="blue"/></svg>'
      });
    });

    await loginAsAdmin();
    await svgManager.navigate();
    await svgManager.waitForGridLoad();
  });

  test('should open preview modal when clicking preview button', async ({ page }) => {
    await svgManager.previewFile('floor_0.svg');

    await expect(svgManager.previewModal).toBeVisible();
  });

  test('should display correct filename in preview title', async ({ page }) => {
    await svgManager.previewFile('floor_0.svg');

    const title = await svgManager.getPreviewTitle();
    expect(title).toContain('floor_0.svg');
  });

  test('should display image in preview content', async ({ page }) => {
    await svgManager.previewFile('floor_0.svg');

    const hasImage = await svgManager.previewHasImage();
    expect(hasImage).toBe(true);
  });

  test('should close preview modal with close button', async ({ page }) => {
    await svgManager.previewFile('floor_0.svg');
    await expect(svgManager.previewModal).toBeVisible();

    await svgManager.closePreview();
    await expect(svgManager.previewModal).toBeHidden();
  });

  test('should close preview modal by pressing Escape', async ({ page }) => {
    await svgManager.previewFile('floor_0.svg');
    await expect(svgManager.previewModal).toBeVisible();

    await svgManager.closePreviewByEscape();
    await expect(svgManager.previewModal).toBeHidden();
  });

  test('should close preview modal by clicking backdrop', async ({ page }) => {
    await svgManager.previewFile('floor_0.svg');
    await expect(svgManager.previewModal).toBeVisible();

    await svgManager.closePreviewByBackdrop();
    await expect(svgManager.previewModal).toBeHidden();
  });
});

test.describe('SVG Manager - Delete', () => {
  let svgManager: SvgManagerPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    svgManager = new SvgManagerPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await svgManager.navigate();
    await svgManager.waitForGridLoad();
  });

  test('should show delete button for each file', async ({ page }) => {
    const isVisible = await svgManager.isDeleteButtonVisible('floor_0.svg');
    expect(isVisible).toBe(true);
  });

  test('should show confirmation dialog when clicking delete', async ({ page }) => {
    // Set up dialog handler to capture the dialog
    let dialogShown = false;
    page.once('dialog', dialog => {
      dialogShown = true;
      dialog.dismiss();
    });

    await svgManager.deleteFile('floor_0.svg');

    expect(dialogShown).toBe(true);
  });

  test('should not delete file when canceling confirmation', async ({ page }) => {
    const initialCount = await svgManager.getFileCount();

    await svgManager.deleteFileCancelled('floor_0.svg');

    // File count should remain the same
    const currentCount = await svgManager.getFileCount();
    expect(currentCount).toBe(initialCount);
  });
});

test.describe('SVG Manager - Upload', () => {
  let svgManager: SvgManagerPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    svgManager = new SvgManagerPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await svgManager.navigate();
    await svgManager.waitForGridLoad();
  });

  test('should have accessible file input', async ({ page }) => {
    await svgManager.showUploadDropzone();

    // File input should exist
    await expect(svgManager.fileInput).toBeAttached();
  });

  test('should show upload dropzone with correct instructions', async ({ page }) => {
    await svgManager.showUploadDropzone();

    // Check for dropzone text
    await expect(svgManager.uploadDropzone).toContainText(/drop|select|SVG/i);
  });
});

test.describe('SVG Manager - Role-based access', () => {
  test('delete buttons should be hidden for editor role', async ({ page, loginAsEditor }) => {
    const svgManager = new SvgManagerPage(page);
    await mockApiResponses(page);
    await loginAsEditor();
    await svgManager.navigate();
    await svgManager.waitForGridLoad();

    // Delete buttons should be hidden for editors
    const isVisible = await svgManager.isDeleteButtonVisible('floor_0.svg');
    expect(isVisible).toBe(false);
  });

  test('delete buttons should be visible for admin role', async ({ page, loginAsAdmin }) => {
    const svgManager = new SvgManagerPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await svgManager.navigate();
    await svgManager.waitForGridLoad();

    // Delete buttons should be visible for admins
    const isVisible = await svgManager.isDeleteButtonVisible('floor_0.svg');
    expect(isVisible).toBe(true);
  });
});

test.describe('SVG Manager - File Cards', () => {
  let svgManager: SvgManagerPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    svgManager = new SvgManagerPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await svgManager.navigate();
    await svgManager.waitForGridLoad();
  });

  test('should display file cards with preview button', async ({ page }) => {
    const card = svgManager.getFileCard('floor_0.svg');
    const previewBtn = card.locator('.btn-preview');

    await expect(previewBtn).toBeVisible();
  });

  test('should display filename in each card', async ({ page }) => {
    const card = svgManager.getFileCard('floor_0.svg');

    await expect(card).toContainText('floor_0.svg');
  });

  test('should display file size in each card', async ({ page }) => {
    const card = svgManager.getFileCard('floor_0.svg');

    // Should show some size indication (KB, MB, B)
    await expect(card).toContainText(/\d+\s*(B|KB|MB)/);
  });
});
