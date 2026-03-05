import { test as base, Page, BrowserContext } from '@playwright/test';

/**
 * User role types
 */
export type UserRole = 'admin' | 'editor' | 'viewer';

/**
 * Mock user data
 */
export interface MockUser {
  username: string;
  email: string;
  role: UserRole;
  allowedRanges?: {
    enabled: boolean;
    filterGroups: Array<{
      collections: string[];
      floors: number[];
      callNumberRanges: Array<{ start: string; end: string }>;
    }>;
  };
}

/**
 * Mock users for testing
 */
export const mockUsers: Record<UserRole, MockUser> = {
  admin: {
    username: 'test-admin',
    email: 'admin@test.com',
    role: 'admin'
  },
  editor: {
    username: 'test-editor',
    email: 'editor@test.com',
    role: 'editor',
    // Editor with full access (no restrictions) for general tests
    allowedRanges: {
      enabled: true,
      filterGroups: [
        {
          collections: [],  // Empty = all collections
          floors: [],       // Empty = all floors
          callNumberRanges: []  // Empty = all call numbers
        }
      ]
    }
  },
  viewer: {
    username: 'test-viewer',
    email: 'viewer@test.com',
    role: 'viewer'
  }
};

/**
 * Create a mock JWT token with the user data
 * This creates a valid JWT structure that can be parsed by the app
 */
function createMockJwt(user: MockUser): string {
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    sub: `test-sub-${user.username}`,
    email: user.email,
    email_verified: true,
    'custom:role': user.role,
    'cognito:username': user.username,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600, // 1 hour from now
    iss: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_test'
  };

  // Base64URL encode without padding
  const base64url = (obj: object) => {
    const json = JSON.stringify(obj);
    const b64 = Buffer.from(json).toString('base64');
    return b64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
  };

  // Create a fake signature (tests don't verify signatures)
  const signature = 'fake-signature-for-testing';

  return `${base64url(header)}.${base64url(payload)}.${signature}`;
}

/**
 * Extended test fixtures with authentication helpers
 */
export interface AuthFixtures {
  /** Login as admin user */
  loginAsAdmin: () => Promise<void>;
  /** Login as editor user */
  loginAsEditor: () => Promise<void>;
  /** Login as viewer user */
  loginAsViewer: () => Promise<void>;
  /** Login as specific user role */
  loginAs: (role: UserRole) => Promise<void>;
  /** Logout current user */
  logout: () => Promise<void>;
  /** Get current mock user */
  currentUser: MockUser | null;
}

/**
 * Get auth storage data for the app
 * Uses the correct storage keys that the app expects
 */
function getAuthStorageData(user: MockUser): Record<string, string> {
  const idToken = createMockJwt(user);
  const accessToken = createMockJwt(user);
  const tokenExpiry = (Date.now() + 3600000).toString(); // 1 hour from now

  return {
    'primo_maps_access_token': accessToken,
    'primo_maps_id_token': idToken,
    'primo_maps_refresh_token': 'mock-refresh-token',
    'primo_maps_token_expiry': tokenExpiry,
    'primo_maps_user': JSON.stringify({
      username: user.username,
      email: user.email,
      role: user.role,
      ...(user.allowedRanges && { allowedRanges: user.allowedRanges })
    })
  };
}

/**
 * Inject authentication state into the page using sessionStorage
 * This must be called BEFORE navigating to the page
 */
async function injectAuthState(page: Page, user: MockUser): Promise<void> {
  const storageData = getAuthStorageData(user);

  // Use addInitScript to inject auth state before any page scripts run
  // This runs in the browser context before any other scripts
  await page.addInitScript((data) => {
    // Store auth data in sessionStorage (that's what the app uses)
    Object.entries(data.storage).forEach(([key, value]) => {
      window.sessionStorage.setItem(key, value as string);
    });

    // Also set a flag for test detection
    (window as any).__E2E_TEST_MODE__ = true;
    (window as any).__E2E_USER__ = data.user;

    console.log('[E2E] Auth state injected for user:', data.user.username);
  }, { storage: storageData, user });
}

/**
 * Navigate to the app and wait for authenticated state
 */
async function navigateAuthenticated(page: Page): Promise<void> {
  await page.goto('/');
  // Wait for the app to initialize with our auth state
  await page.waitForLoadState('domcontentloaded');
  // Give the app a moment to process auth state
  await page.waitForTimeout(500);
}

/**
 * Clear authentication state from the page
 */
async function clearAuthState(page: Page): Promise<void> {
  await page.evaluate(() => {
    // Clear all primo_maps auth keys from sessionStorage
    const keysToRemove = [
      'primo_maps_access_token',
      'primo_maps_id_token',
      'primo_maps_refresh_token',
      'primo_maps_token_expiry',
      'primo_maps_user'
    ];
    keysToRemove.forEach(key => sessionStorage.removeItem(key));

    // Clear test mode flags
    delete (window as any).__E2E_TEST_MODE__;
    delete (window as any).__E2E_USER__;
  });
}

/**
 * Create extended test with auth fixtures
 */
export const test = base.extend<AuthFixtures>({
  currentUser: null,

  loginAsAdmin: async ({ page }, use) => {
    const login = async () => {
      await injectAuthState(page, mockUsers.admin);
    };
    await use(login);
  },

  loginAsEditor: async ({ page }, use) => {
    const login = async () => {
      await injectAuthState(page, mockUsers.editor);
    };
    await use(login);
  },

  loginAsViewer: async ({ page }, use) => {
    const login = async () => {
      await injectAuthState(page, mockUsers.viewer);
    };
    await use(login);
  },

  loginAs: async ({ page }, use) => {
    const login = async (role: UserRole) => {
      await injectAuthState(page, mockUsers[role]);
    };
    await use(login);
  },

  logout: async ({ page }, use) => {
    const logout = async () => {
      await clearAuthState(page);
    };
    await use(logout);
  }
});

/**
 * Mock API responses for E2E tests
 */
export async function mockApiResponses(page: Page): Promise<void> {
  // Mock CSV data endpoint (CloudFront)
  await page.route('**/data/mapping.csv', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'text/csv',
      body: `location_code,floor,section,shelf,description
ABC001,0,A,1,Test location 1
ABC002,1,B,2,Test location 2
ABC003,2,C,3,Test location 3`
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

  // Mock SVG files list and delete endpoint
  await page.route('**/api/svg', async (route) => {
    const method = route.request().method();
    if (method === 'GET') {
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
    } else if (method === 'DELETE') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true })
      });
    } else if (method === 'POST') {
      // Handle upload
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, filename: 'uploaded.svg' })
      });
    } else {
      await route.continue();
    }
  });

  // Mock individual SVG file endpoints
  await page.route('**/maps/*.svg', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/svg+xml',
      body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>'
    });
  });

  // Mock versions list endpoint
  await page.route('**/api/versions/**', async (route) => {
    const url = route.request().url();

    // Handle version restore
    if (route.request().method() === 'POST' && url.includes('/restore')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'Version restored successfully' })
      });
      return;
    }

    // Handle version content request
    if (route.request().method() === 'GET' && url.match(/\/api\/versions\/\w+\/[^/]+$/)) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          content: 'location_code,floor,section,shelf,description\nABC001,0,A,1,Old location 1',
          metadata: {
            versionId: 'v1',
            timestamp: new Date().toISOString(),
            username: 'test-user'
          }
        })
      });
      return;
    }

    // Handle versions list
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        versions: [
          {
            versionId: 'v1',
            timestamp: new Date().toISOString(),
            username: 'test-user',
            size: 1024
          },
          {
            versionId: 'v2',
            timestamp: new Date(Date.now() - 86400000).toISOString(),
            username: 'another-user',
            size: 2048
          }
        ]
      })
    });
  });

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
              created: new Date().toISOString()
            }
          ],
          totalPages: 1,
          currentPage: 1
        })
      });
    } else if (method === 'POST') {
      // Create user
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'User created' })
      });
    } else if (method === 'PUT') {
      // Update user
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'User updated' })
      });
    } else if (method === 'DELETE') {
      // Delete user
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'User deleted' })
      });
    } else {
      await route.continue();
    }
  });

  // Mock CSV save endpoint
  await page.route('**/api/csv', async (route) => {
    if (route.request().method() === 'PUT') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ success: true, message: 'CSV saved successfully' })
      });
    } else {
      await route.continue();
    }
  });
}

export { expect } from '@playwright/test';
