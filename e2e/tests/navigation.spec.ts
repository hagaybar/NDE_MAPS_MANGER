import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';
import { BasePage } from '../pages/base.page';

test.describe('Navigation', () => {
  let basePage: BasePage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    basePage = new BasePage(page);
    // Set up auth and API mocks BEFORE navigating
    await loginAsAdmin();
    await mockApiResponses(page);
    // Now navigate
    await basePage.goto();
    // Wait for authenticated state
    await basePage.waitForAuthenticatedState();
  });

  test('should display all navigation tabs', async ({ page }) => {
    await expect(basePage.navCsvTab).toBeVisible();
    await expect(basePage.navSvgTab).toBeVisible();
    await expect(basePage.navVersionsTab).toBeVisible();
    await expect(basePage.navUsersTab).toBeVisible();
  });

  test('should show CSV Editor as default view', async ({ page }) => {
    await expect(basePage.navCsvTab).toHaveClass(/active/);
    await expect(page.locator('#csv-editor')).toBeVisible();
    await expect(page.locator('#svg-manager')).toBeHidden();
    await expect(page.locator('#version-history')).toBeHidden();
    await expect(page.locator('#user-management')).toBeHidden();
  });

  test('should navigate to SVG Manager', async ({ page }) => {
    await basePage.navigateToSvgManager();
    await expect(basePage.navSvgTab).toHaveClass(/active/);
    await expect(basePage.navCsvTab).not.toHaveClass(/active/);
    await expect(page.locator('#svg-manager')).toBeVisible();
    await expect(page.locator('#csv-editor')).toBeHidden();
  });

  test('should navigate to Version History', async ({ page }) => {
    await basePage.navigateToVersionHistory();
    await expect(basePage.navVersionsTab).toHaveClass(/active/);
    await expect(page.locator('#version-history')).toBeVisible();
    await expect(page.locator('#csv-editor')).toBeHidden();
  });

  test('should navigate to User Management', async ({ page }) => {
    await basePage.navigateToUserManagement();
    await expect(basePage.navUsersTab).toHaveClass(/active/);
    await expect(page.locator('#user-management')).toBeVisible();
    await expect(page.locator('#csv-editor')).toBeHidden();
  });

  test('should navigate between all tabs', async ({ page }) => {
    // CSV -> SVG
    await basePage.navigateToSvgManager();
    await expect(page.locator('#svg-manager')).toBeVisible();

    // SVG -> Versions
    await basePage.navigateToVersionHistory();
    await expect(page.locator('#version-history')).toBeVisible();

    // Versions -> Users
    await basePage.navigateToUserManagement();
    await expect(page.locator('#user-management')).toBeVisible();

    // Users -> CSV
    await basePage.navigateToCsvEditor();
    await expect(page.locator('#csv-editor')).toBeVisible();
  });

  test('should maintain active state on tab navigation', async ({ page }) => {
    await basePage.navigateToSvgManager();
    await expect(basePage.navSvgTab).toHaveClass(/active/);
    await expect(basePage.navCsvTab).not.toHaveClass(/active/);

    await basePage.navigateToVersionHistory();
    await expect(basePage.navVersionsTab).toHaveClass(/active/);
    await expect(basePage.navSvgTab).not.toHaveClass(/active/);
  });
});

test.describe('Navigation - Role-based visibility', () => {
  test('should hide Users tab for editor role', async ({ page, loginAsEditor }) => {
    const basePage = new BasePage(page);
    await loginAsEditor();
    await mockApiResponses(page);
    await basePage.goto();
    // Wait a bit for role-based UI to apply
    await page.waitForTimeout(500);

    // Users tab should be hidden for editors
    await expect(basePage.navUsersTab).toBeHidden();

    // Other tabs should be visible
    await expect(basePage.navCsvTab).toBeVisible();
    await expect(basePage.navSvgTab).toBeVisible();
    await expect(basePage.navVersionsTab).toBeVisible();
  });

  test('should show Users tab for admin role', async ({ page, loginAsAdmin }) => {
    const basePage = new BasePage(page);
    await loginAsAdmin();
    await mockApiResponses(page);
    await basePage.goto();
    await basePage.waitForAuthenticatedState();

    // All tabs should be visible for admin
    await expect(basePage.navCsvTab).toBeVisible();
    await expect(basePage.navSvgTab).toBeVisible();
    await expect(basePage.navVersionsTab).toBeVisible();
    await expect(basePage.navUsersTab).toBeVisible();
  });
});

test.describe('Navigation - App Header', () => {
  test('should display app title', async ({ page, loginAsAdmin }) => {
    const basePage = new BasePage(page);
    await loginAsAdmin();
    await mockApiResponses(page);
    await basePage.goto();

    await expect(basePage.appTitle).toBeVisible();
    await expect(basePage.appTitle).toContainText(/Primo Maps Admin|ניהול מפות/);
  });

  test('should display language toggle buttons', async ({ page, loginAsAdmin }) => {
    const basePage = new BasePage(page);
    await loginAsAdmin();
    await mockApiResponses(page);
    await basePage.goto();

    await expect(basePage.langEnButton).toBeVisible();
    await expect(basePage.langHeButton).toBeVisible();
  });

  test('should display user menu container', async ({ page, loginAsAdmin }) => {
    const basePage = new BasePage(page);
    await loginAsAdmin();
    await mockApiResponses(page);
    await basePage.goto();

    await expect(basePage.userMenuContainer).toBeVisible();
  });
});
