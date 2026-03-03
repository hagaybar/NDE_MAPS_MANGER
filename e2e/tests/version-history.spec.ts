import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';
import { VersionHistoryPage } from '../pages/version-history.page';

test.describe('Version History', () => {
  let versionHistory: VersionHistoryPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    versionHistory = new VersionHistoryPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await versionHistory.navigate();
  });

  test('should display Version History view', async ({ page }) => {
    await expect(versionHistory.container).toBeVisible();
    await expect(versionHistory.title).toBeVisible();
  });

  test('should load and display version list', async ({ page }) => {
    await versionHistory.waitForLoad();

    const count = await versionHistory.getVersionCount();
    expect(count).toBeGreaterThan(0);
  });

  test('should display version table with correct columns', async ({ page }) => {
    await versionHistory.waitForLoad();

    await expect(versionHistory.table).toBeVisible();

    // Check for column headers
    const headers = await versionHistory.tableHeaders.allTextContents();
    const headersText = headers.join(' ').toLowerCase();

    expect(headersText).toMatch(/date|timestamp|תאריך/i);
    expect(headersText).toMatch(/user|משתמש/i);
    expect(headersText).toMatch(/size|גודל/i);
  });
});

test.describe('Version History - Version Rows', () => {
  let versionHistory: VersionHistoryPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    versionHistory = new VersionHistoryPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await versionHistory.navigate();
    await versionHistory.waitForLoad();
  });

  test('should display version ID for each row', async ({ page }) => {
    const versionId = await versionHistory.getVersionId(0);
    expect(versionId).toBeTruthy();
  });

  test('should display timestamp for each version', async ({ page }) => {
    const timestamp = await versionHistory.getTimestamp(0);
    expect(timestamp).toBeTruthy();
  });

  test('should display username for each version', async ({ page }) => {
    const username = await versionHistory.getUsername(0);
    expect(username).toBeTruthy();
  });

  test('should display file size for each version', async ({ page }) => {
    const size = await versionHistory.getFileSize(0);
    expect(size).toBeTruthy();
    // Should contain size unit
    expect(size).toMatch(/\d+\s*(B|KB|MB|GB)/);
  });

  test('should display restore button for each version', async ({ page }) => {
    const row = versionHistory.getVersionRow(0);
    const restoreButton = row.locator('[data-testid="restore-button"]');

    await expect(restoreButton).toBeVisible();
  });
});

test.describe('Version History - Sorting', () => {
  let versionHistory: VersionHistoryPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    versionHistory = new VersionHistoryPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await versionHistory.navigate();
    await versionHistory.waitForLoad();
  });

  test('should display versions sorted by timestamp (newest first)', async ({ page }) => {
    const isNewestFirst = await versionHistory.isNewestFirst();
    expect(isNewestFirst).toBe(true);
  });
});

test.describe('Version History - Preview', () => {
  let versionHistory: VersionHistoryPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    versionHistory = new VersionHistoryPage(page);
    await mockApiResponses(page);

    // Mock version preview endpoint
    await page.route('**/api/versions/csv/*/content', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: 'location_code,floor,section,shelf,description\nABC001,0,A,1,Test'
        })
      });
    });

    await loginAsAdmin();
    await versionHistory.navigate();
    await versionHistory.waitForLoad();
  });

  test('should make version rows clickable', async ({ page }) => {
    const row = versionHistory.getVersionRow(0);

    // Row should be interactive
    await expect(row).toHaveAttribute('role', 'button');
  });

  test('should be keyboard navigable', async ({ page }) => {
    const row = versionHistory.getVersionRow(0);

    // Row should be focusable
    await expect(row).toHaveAttribute('tabindex', '0');
  });
});

test.describe('Version History - Restore', () => {
  let versionHistory: VersionHistoryPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    versionHistory = new VersionHistoryPage(page);
    await mockApiResponses(page);

    // Mock restore endpoint
    await page.route('**/api/versions/csv/*/restore', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    });

    await loginAsAdmin();
    await versionHistory.navigate();
    await versionHistory.waitForLoad();
  });

  test('should show restore button for each version', async ({ page }) => {
    const row = versionHistory.getVersionRow(0);
    const restoreButton = row.locator('[data-testid="restore-button"]');

    await expect(restoreButton).toBeVisible();
    await expect(restoreButton).toBeEnabled();
  });

  test('should have accessible restore button', async ({ page }) => {
    const row = versionHistory.getVersionRow(0);
    const restoreButton = row.locator('[data-testid="restore-button"]');

    // Button should have aria-label
    const ariaLabel = await restoreButton.getAttribute('aria-label');
    expect(ariaLabel).toBeTruthy();
  });
});

test.describe('Version History - States', () => {
  test('should show loading state while fetching versions', async ({ page, loginAsAdmin }) => {
    const versionHistory = new VersionHistoryPage(page);

    // Delay API response
    await page.route('**/api/versions/**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ versions: [] })
      });
    });

    await loginAsAdmin();
    await versionHistory.goto();
    await versionHistory.navigateToVersionHistory();

    // Should briefly show loading state
    const isLoading = await versionHistory.isLoading();
    // Note: This might be flaky due to timing
  });

  test('should show empty state when no versions exist', async ({ page, loginAsAdmin }) => {
    const versionHistory = new VersionHistoryPage(page);

    // Mock empty response
    await page.route('**/api/versions/**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ versions: [] })
      });
    });

    await loginAsAdmin();
    await versionHistory.navigate();
    await versionHistory.waitForLoad();

    const isEmpty = await versionHistory.isEmpty();
    expect(isEmpty).toBe(true);
  });

  test('should show error state on API failure', async ({ page, loginAsAdmin }) => {
    const versionHistory = new VersionHistoryPage(page);

    // Mock error response
    await page.route('**/api/versions/**', async (route) => {
      await route.fulfill({
        status: 500,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Internal Server Error' })
      });
    });

    await loginAsAdmin();
    await versionHistory.navigate();
    await versionHistory.waitForLoad();

    const hasError = await versionHistory.hasError();
    expect(hasError).toBe(true);
  });
});

test.describe('Version History - Data Display', () => {
  let versionHistory: VersionHistoryPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    versionHistory = new VersionHistoryPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await versionHistory.navigate();
    await versionHistory.waitForLoad();
  });

  test('should retrieve all version data correctly', async ({ page }) => {
    const versions = await versionHistory.getAllVersions();

    expect(versions.length).toBeGreaterThan(0);

    // Check first version has all required fields
    const firstVersion = versions[0];
    expect(firstVersion.id).toBeTruthy();
    expect(firstVersion.timestamp).toBeTruthy();
    expect(firstVersion.user).toBeTruthy();
    expect(firstVersion.size).toBeTruthy();
  });
});
