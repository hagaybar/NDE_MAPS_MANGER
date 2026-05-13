import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const REPLACEMENT_SVG = path.resolve(__dirname, '..', 'fixtures', 'floor_test_replacement.svg');

test.describe('SVG Manager — download + replace (issue #35)', () => {
  test.beforeEach(async ({ page, loginAsAdmin }) => {
    await mockApiResponses(page);
    await loginAsAdmin();
    await page.goto('/admin/');
    await page.waitForLoadState('domcontentloaded');
    // Navigate via the nav button so the SVG Manager tab renders.
    await page.waitForSelector('#nav-svg', { timeout: 10000 });
    await page.click('#nav-svg');
    await page.waitForSelector('.btn-preview', { timeout: 10000 });
  });

  test('Download button triggers a browser download with the card\'s filename', async ({ page }) => {
    const firstCardName = await page.locator('.btn-download').first().getAttribute('data-name');
    expect(firstCardName).toBeTruthy();

    // The Download handler points the <a download> at the CloudFront URL.
    // Chromium only honors `download` for cross-origin URLs when the server also
    // sends Content-Disposition: attachment, so override the existing mock here.
    await page.route('**/maps/*.svg', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        headers: { 'Content-Disposition': 'attachment' },
        body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>',
      });
    });

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.locator('.btn-download').first().click(),
    ]);
    expect(download.suggestedFilename()).toBe(firstCardName);
  });

  test('Replace button opens a file picker scoped to .svg', async ({ page }) => {
    const replaceBtn = page.locator('.btn-replace').first();
    await expect(replaceBtn).toBeVisible();
    // The native confirm() dialog fires AFTER setFiles → onchange → confirm.
    // Use page.on (persistent) so we catch the dialog whenever it appears.
    page.on('dialog', d => d.accept().catch(() => {}));
    const [chooser] = await Promise.all([
      page.waitForEvent('filechooser'),
      replaceBtn.click(),
    ]);
    expect(chooser).toBeTruthy();
    // FileChooser must be scoped to .svg per the handler's `picker.accept = '.svg'`.
    expect(chooser.isMultiple()).toBe(false);
    // Complete the file pick → onchange → confirm → replaceFile → POST → toast.
    await chooser.setFiles(REPLACEMENT_SVG);
    // After the confirm dialog accepts, the upload fires and a toast appears.
    // The admin SPA's toast.js renders a div with tailwind bg-* classes inside #toast-container.
    await expect(page.locator('#toast-container > div').first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('SVG Manager — download + replace — editor role', () => {
  test('Replace button is hidden for editors; Download is visible', async ({ page, loginAsEditor }) => {
    await mockApiResponses(page);
    await loginAsEditor();
    await page.goto('/admin/');
    await page.waitForLoadState('domcontentloaded');
    await page.waitForSelector('#nav-svg', { timeout: 10000 });
    await page.click('#nav-svg');
    await page.waitForSelector('.btn-preview', { timeout: 10000 });

    // Admin-only role gating in this app hides the element (display:none + hidden)
    // via applyRoleBasedUI(), rather than disabling it. Mirror Delete's behaviour.
    const replaceBtn = page.locator('.btn-replace').first();
    const downloadBtn = page.locator('.btn-download').first();
    await expect(downloadBtn).toBeVisible();
    await expect(replaceBtn).toBeHidden();
  });
});
