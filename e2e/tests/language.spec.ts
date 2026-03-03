import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';
import { BasePage } from '../pages/base.page';

test.describe('Language Toggle', () => {
  let basePage: BasePage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    basePage = new BasePage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await basePage.goto();
    await basePage.waitForPageLoad();
  });

  test('should default to Hebrew (RTL)', async ({ page }) => {
    // Default language is Hebrew based on index.html
    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(basePage.langHeButton).toHaveClass(/active/);
  });

  test('should switch to English (LTR)', async ({ page }) => {
    await basePage.switchToEnglish();

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');
    await expect(basePage.langEnButton).toHaveClass(/active/);
    await expect(basePage.langHeButton).not.toHaveClass(/active/);
  });

  test('should switch back to Hebrew (RTL)', async ({ page }) => {
    // First switch to English
    await basePage.switchToEnglish();
    await expect(page.locator('html')).toHaveAttribute('dir', 'ltr');

    // Then switch back to Hebrew
    await basePage.switchToHebrew();

    await expect(page.locator('html')).toHaveAttribute('lang', 'he');
    await expect(page.locator('html')).toHaveAttribute('dir', 'rtl');
    await expect(basePage.langHeButton).toHaveClass(/active/);
  });

  test('should update app title on language change', async ({ page }) => {
    // Get initial title (Hebrew)
    const hebrewTitle = await basePage.appTitle.textContent();

    // Switch to English
    await basePage.switchToEnglish();
    const englishTitle = await basePage.appTitle.textContent();

    // Titles should be different
    expect(englishTitle).not.toBe(hebrewTitle);
    // App title is "Shelf Maps Admin" in English
    expect(englishTitle).toContain('Admin');
  });

  test('should update navigation labels on language change', async ({ page }) => {
    // Switch to English
    await basePage.switchToEnglish();

    await expect(basePage.navCsvTab).toContainText('CSV Editor');
    await expect(basePage.navSvgTab).toContainText('Map Files');
    await expect(basePage.navVersionsTab).toContainText('Version History');

    // Switch to Hebrew
    await basePage.switchToHebrew();

    // Hebrew translations
    await expect(basePage.navCsvTab).toContainText('עורך');
    await expect(basePage.navSvgTab).toContainText('קבצי');
    await expect(basePage.navVersionsTab).toContainText('היסטוריית');
  });

  test('should persist language preference across navigation', async ({ page }) => {
    // Switch to English
    await basePage.switchToEnglish();

    // Navigate to different tabs
    await basePage.navigateToSvgManager();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await basePage.navigateToVersionHistory();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');

    await basePage.navigateToCsvEditor();
    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });

  test('should apply RTL styles correctly in Hebrew', async ({ page }) => {
    // Ensure Hebrew is active
    await basePage.switchToHebrew();

    // Check that body/main content has RTL direction
    const htmlDir = await page.locator('html').getAttribute('dir');
    expect(htmlDir).toBe('rtl');

    // Check CSS computed style shows RTL direction
    const direction = await page.evaluate(() => {
      return window.getComputedStyle(document.body).direction;
    });
    expect(direction).toBe('rtl');
  });

  test('should apply LTR styles correctly in English', async ({ page }) => {
    await basePage.switchToEnglish();

    const htmlDir = await page.locator('html').getAttribute('dir');
    expect(htmlDir).toBe('ltr');

    const direction = await page.evaluate(() => {
      return window.getComputedStyle(document.body).direction;
    });
    expect(direction).toBe('ltr');
  });

  test('should update button text on language change', async ({ page }) => {
    // Navigate to CSV editor to see buttons
    await basePage.navigateToCsvEditor();

    // Get buttons in English
    await basePage.switchToEnglish();
    const addRowBtn = page.locator('#btn-add-row');
    const saveBtn = page.locator('#btn-save');

    await expect(addRowBtn).toContainText('Add Row');
    await expect(saveBtn).toContainText('Save');

    // Switch to Hebrew
    await basePage.switchToHebrew();

    await expect(addRowBtn).toContainText('הוסף');
    await expect(saveBtn).toContainText('שמור');
  });
});

test.describe('Language Toggle - Accessibility', () => {
  test('should have accessible language buttons', async ({ page, loginAsAdmin }) => {
    const basePage = new BasePage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await basePage.goto();

    // Buttons should be focusable
    await basePage.langEnButton.focus();
    await expect(basePage.langEnButton).toBeFocused();

    await basePage.langHeButton.focus();
    await expect(basePage.langHeButton).toBeFocused();
  });

  test('should be keyboard accessible', async ({ page, loginAsAdmin }) => {
    const basePage = new BasePage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await basePage.goto();

    // Focus on English button and press Enter
    await basePage.langEnButton.focus();
    await page.keyboard.press('Enter');

    await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  });
});
