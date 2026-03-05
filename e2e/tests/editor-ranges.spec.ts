/**
 * E2E Tests for Editor Range Configuration Feature
 *
 * Tests the admin UI for configuring which rows editors can see and edit,
 * based on collection, floor, and call number range filters.
 *
 * Note: CSV Editor is now admin-only, so these tests focus on admin configuration.
 * Range restrictions can be used for future features like Location Editor.
 */

import { test as base, expect, Page } from '@playwright/test';
import { mockUsers } from '../fixtures/auth.fixture';
import { CsvEditorPage } from '../pages/csv-editor.page';
import { UserManagementPage } from '../pages/user-management.page';

// Sample CSV data with various collections, floors, and call numbers
const MOCK_CSV_DATA = `collectionName,floor,rangeStart,rangeEnd,description,location_code
CK Science,0,100,199,Science collection ground floor,SC-001
CK Science,1,200,299,Science collection first floor,SC-002
CK Science,2,300,399,Science collection second floor,SC-003
CK Humanities,0,400,499,Humanities collection ground floor,HU-001
CK Humanities,1,500,599,Humanities collection first floor,HU-002
CK Humanities,2,600,699,Humanities collection second floor,HU-003
CK Law,0,700,799,Law collection ground floor,LW-001
CK Law,1,800,899,Law collection first floor,LW-002
CK Law,2,900,999,Law collection second floor,LW-003
Reference,0,1000,1099,Reference ground floor,RF-001
Reference,1,1100,1199,Reference first floor,RF-002
Reference,2,1200,1299,Reference second floor,RF-003`;

// Editor with configured ranges (restricted to CK Science on floors 0 and 1)
const EDITOR_WITH_RANGES = {
  username: 'editor-with-ranges',
  email: 'editor-ranges@test.com',
  role: 'editor' as const,
  enabled: true,
  allowedRanges: {
    enabled: true,
    filterGroups: [
      {
        collections: ['CK Science'],
        floors: [0, 1],
        callNumberRanges: []
      }
    ]
  }
};

/**
 * Create a mock JWT token with user data including allowedRanges
 */
function createMockJwtWithRanges(user: any): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    sub: `test-sub-${user.username}`,
    email: user.email,
    email_verified: true,
    'custom:role': user.role,
    'cognito:username': user.username,
    'custom:allowedRanges': user.allowedRanges ? JSON.stringify(user.allowedRanges) : undefined,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test'
  };

  const base64url = (obj: object) => {
    const json = JSON.stringify(obj);
    const b64 = Buffer.from(json).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  const signature = 'fake-signature-for-testing';
  return `${base64url(header)}.${base64url(payload)}.${signature}`;
}

/**
 * Set up mock API responses for tests
 */
async function setupMockApiResponses(page: Page, csvData: string = MOCK_CSV_DATA): Promise<void> {
  // Mock CSV data endpoint
  await page.route('**/data/mapping.csv', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      body: csvData
    });
  });

  // Mock CSV save endpoint
  await page.route('**/api/csv', async (route) => {
    const method = route.request().method();
    if (method === 'PUT' || method === 'POST') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'CSV saved successfully' })
      });
    } else {
      await route.continue();
    }
  });

  // Mock SVG files endpoint
  await page.route('**/api/svg', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        files: [
          { name: 'floor_0.svg', size: 12345, lastModified: new Date().toISOString() },
          { name: 'floor_1.svg', size: 23456, lastModified: new Date().toISOString() },
          { name: 'floor_2.svg', size: 34567, lastModified: new Date().toISOString() }
        ]
      })
    });
  });

  // Mock users endpoint with editor ranges
  await page.route('**/api/users**', async (route) => {
    const method = route.request().method();

    if (method === 'GET') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          users: [
            {
              username: 'admin1',
              email: 'admin1@test.com',
              role: 'admin',
              status: 'CONFIRMED',
              enabled: true,
              created: new Date().toISOString()
            },
            {
              username: 'editor1',
              email: 'editor1@test.com',
              role: 'editor',
              status: 'CONFIRMED',
              enabled: true,
              created: new Date().toISOString(),
              allowedRanges: EDITOR_WITH_RANGES.allowedRanges
            }
          ],
          totalPages: 1,
          currentPage: 1
        })
      });
    } else if (method === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'User updated' })
      });
    } else {
      await route.continue();
    }
  });

  // Mock individual user update endpoint
  await page.route('**/api/users/*', async (route) => {
    const method = route.request().method();
    if (method === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'User updated' })
      });
    } else {
      await route.continue();
    }
  });
}

// Create test with admin login helper
const test = base.extend<{
  loginAsAdmin: () => Promise<void>;
}>({
  loginAsAdmin: async ({ page }, use) => {
    const login = async () => {
      const idToken = createMockJwtWithRanges({
        ...mockUsers.admin,
        enabled: true,
        allowedRanges: null
      });
      const accessToken = idToken;
      const tokenExpiry = (Date.now() + 3600000).toString();

      await page.addInitScript((data) => {
        Object.entries(data).forEach(([key, value]) => {
          window.sessionStorage.setItem(key, value as string);
        });
      }, {
        'primo_maps_access_token': accessToken,
        'primo_maps_id_token': idToken,
        'primo_maps_refresh_token': 'mock-refresh-token',
        'primo_maps_token_expiry': tokenExpiry,
        'primo_maps_user': JSON.stringify({
          username: mockUsers.admin.username,
          email: mockUsers.admin.email,
          role: mockUsers.admin.role
        })
      });
    };
    await use(login);
  }
});

test.describe('Admin CSV Access', () => {
  test('admin can see all rows in CSV editor', async ({ page, loginAsAdmin }) => {
    await setupMockApiResponses(page);
    await loginAsAdmin();

    const csvEditor = new CsvEditorPage(page);
    await csvEditor.navigate();
    await csvEditor.waitForTableLoad();

    // Admin should see all 12 rows
    const rowCount = await csvEditor.getRowCount();
    expect(rowCount).toBe(12);
  });

  test('admin does not see filter banner', async ({ page, loginAsAdmin }) => {
    await setupMockApiResponses(page);
    await loginAsAdmin();

    const csvEditor = new CsvEditorPage(page);
    await csvEditor.navigate();
    await csvEditor.waitForTableLoad();

    // No filter info banner for admin
    const filterBanner = page.locator('#filter-info-banner');
    const bannerContent = await filterBanner.textContent();
    expect(bannerContent?.trim()).toBe('');
  });
});

test.describe('Admin Range Configuration', () => {
  /**
   * Helper to set up mock API responses specifically for admin user management tests
   */
  async function setupAdminMockApi(page: Page): Promise<void> {
    // Mock users endpoint
    await page.route('**/api/users**', async (route) => {
      const method = route.request().method();

      if (method === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            users: [
              {
                username: 'admin1',
                email: 'admin1@test.com',
                role: 'admin',
                status: 'CONFIRMED',
                enabled: true,
                created: new Date().toISOString()
              },
              {
                username: 'editor1',
                email: 'editor1@test.com',
                role: 'editor',
                status: 'CONFIRMED',
                enabled: true,
                created: new Date().toISOString(),
                allowedRanges: EDITOR_WITH_RANGES.allowedRanges
              }
            ],
            totalPages: 1,
            currentPage: 1
          })
        });
      } else if (method === 'PUT' || method === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'User updated' })
        });
      } else {
        await route.continue();
      }
    });

    // Mock individual user update endpoint
    await page.route('**/api/users/*', async (route) => {
      const method = route.request().method();
      if (method === 'PUT') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true, message: 'User updated' })
        });
      } else {
        await route.continue();
      }
    });

    // Mock CSV endpoint for navigation
    await page.route('**/data/mapping.csv', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/csv',
        body: MOCK_CSV_DATA
      });
    });

    // Mock SVG endpoint
    await page.route('**/api/svg', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ files: [] })
      });
    });
  }

  test('admin can access user management to configure ranges', async ({ page, loginAsAdmin }) => {
    await setupAdminMockApi(page);
    await loginAsAdmin();

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Navigate to users tab
    const usersTab = page.locator('#nav-users');
    await expect(usersTab).toBeVisible();
    await usersTab.click();

    // User management should be visible
    await expect(page.locator('#user-management')).toBeVisible();
  });

  test('admin can open edit dialog for editor user', async ({ page, loginAsAdmin }) => {
    await setupAdminMockApi(page);
    await loginAsAdmin();

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Navigate to users tab
    await page.locator('#nav-users').click();
    await page.waitForTimeout(500);

    // Wait for user list to load
    await expect(page.locator('[data-testid="user-row"]').first()).toBeVisible({ timeout: 10000 });

    // Click edit on editor user
    const editorRow = page.locator('[data-testid="user-row"]').filter({ hasText: 'editor1@test.com' });
    await editorRow.locator('[data-testid="edit-button"]').click();

    // Edit dialog should open
    await expect(page.locator('[data-testid="edit-user-dialog"]')).toBeVisible();
  });

  test('edit dialog shows editable ranges section for editor users', async ({ page, loginAsAdmin }) => {
    await setupAdminMockApi(page);
    await loginAsAdmin();

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // Navigate to users and open editor edit dialog
    await page.locator('#nav-users').click();
    await page.waitForTimeout(500);
    await expect(page.locator('[data-testid="user-row"]').first()).toBeVisible({ timeout: 10000 });

    const editorRow = page.locator('[data-testid="user-row"]').filter({ hasText: 'editor1@test.com' });
    await editorRow.locator('[data-testid="edit-button"]').click();
    await expect(page.locator('[data-testid="edit-user-dialog"]')).toBeVisible();

    // Ranges section should be visible for editor
    const rangesSection = page.locator('[data-testid="editable-ranges-section"]');
    await expect(rangesSection).toBeVisible();
  });

});
