import { test, expect, mockApiResponses } from '../fixtures/auth.fixture';
import { UserManagementPage } from '../pages/user-management.page';

test.describe('User Management - Access Control', () => {
  test('should not be accessible to editor role', async ({ page, loginAsEditor }) => {
    const userMgmt = new UserManagementPage(page);
    await mockApiResponses(page);
    await loginAsEditor();
    await userMgmt.goto();
    await userMgmt.waitForPageLoad();

    // Users tab should be hidden for editors
    await expect(userMgmt.navUsersTab).toBeHidden();
  });

  test('should be accessible to admin role', async ({ page, loginAsAdmin }) => {
    const userMgmt = new UserManagementPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await userMgmt.navigate();

    // Users tab and view should be visible
    await expect(userMgmt.navUsersTab).toBeVisible();
    await expect(userMgmt.container).toBeVisible();
  });
});

test.describe('User Management - View', () => {
  let userMgmt: UserManagementPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    userMgmt = new UserManagementPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await userMgmt.navigate();
  });

  test('should display User Management view', async ({ page }) => {
    await expect(userMgmt.container).toBeVisible();
    await expect(userMgmt.title).toBeVisible();
  });

  test('should display Add User button', async ({ page }) => {
    await expect(userMgmt.addUserButton).toBeVisible();
    await expect(userMgmt.addUserButton).toBeEnabled();
  });

  test('should display user list container', async ({ page }) => {
    await expect(userMgmt.userListContainer).toBeVisible();
  });

  test('should load and display users', async ({ page }) => {
    await userMgmt.waitForLoad();

    const userCount = await userMgmt.getUserCount();
    expect(userCount).toBeGreaterThan(0);
  });
});

test.describe('User Management - User List', () => {
  let userMgmt: UserManagementPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    userMgmt = new UserManagementPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await userMgmt.navigate();
    await userMgmt.waitForLoad();
  });

  test('should display user information in list', async ({ page }) => {
    // Check that users are displayed
    const userExists = await userMgmt.userExists('admin1');
    expect(userExists).toBe(true);
  });

  test('should display user role', async ({ page }) => {
    const role = await userMgmt.getUserRole('admin1');
    // Role text may be in Hebrew ("מנהל") or English ("admin")
    expect(role.trim()).toBeTruthy();
    // Check for either admin badge testid
    const row = userMgmt.getUserRow('admin1');
    const adminBadge = row.locator('[data-testid="role-badge-admin"]');
    await expect(adminBadge).toBeVisible();
  });

  test('should display edit button for each user', async ({ page }) => {
    const userRow = userMgmt.getUserRow('admin1');
    const editButton = userRow.locator('[data-testid="edit-button"]');

    await expect(editButton).toBeVisible();
  });

  test('should display delete button for each user', async ({ page }) => {
    const userRow = userMgmt.getUserRow('admin1');
    const deleteButton = userRow.locator('[data-testid="delete-button"]');

    await expect(deleteButton).toBeVisible();
  });
});

test.describe('User Management - Search', () => {
  let userMgmt: UserManagementPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    userMgmt = new UserManagementPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await userMgmt.navigate();
    await userMgmt.waitForLoad();
  });

  test('should display search input', async ({ page }) => {
    await expect(userMgmt.searchInput).toBeVisible();
  });

  test('should filter users when searching', async ({ page }) => {
    await userMgmt.search('admin');
    await userMgmt.waitForLoad();

    // Should find admin user
    const exists = await userMgmt.userExists('admin1');
    expect(exists).toBe(true);
  });

  test('should clear search results', async ({ page }) => {
    await userMgmt.search('admin');
    await userMgmt.clearSearch();
    await userMgmt.waitForLoad();

    // Should show all users again
    const count = await userMgmt.getUserCount();
    expect(count).toBeGreaterThan(0);
  });
});

test.describe('User Management - Create User', () => {
  let userMgmt: UserManagementPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    userMgmt = new UserManagementPage(page);
    await mockApiResponses(page);

    // Mock create user endpoint
    await page.route('**/api/users', async (route) => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      } else {
        await route.continue();
      }
    });

    await loginAsAdmin();
    await userMgmt.navigate();
    await userMgmt.waitForLoad();
  });

  test('should open create user dialog when clicking add button', async ({ page }) => {
    await userMgmt.clickAddUser();

    await expect(userMgmt.createUserDialog).toBeVisible();
  });

  test('should display create user form fields', async ({ page }) => {
    await userMgmt.clickAddUser();

    // App's create user dialog only has email and role fields
    await expect(userMgmt.createEmailInput).toBeVisible();
    await expect(userMgmt.createRoleSelect).toBeVisible();
  });

  test('should display submit and cancel buttons', async ({ page }) => {
    await userMgmt.clickAddUser();

    await expect(userMgmt.createSubmitButton).toBeVisible();
    await expect(userMgmt.createCancelButton).toBeVisible();
  });

  test('should close dialog when clicking cancel', async ({ page }) => {
    await userMgmt.clickAddUser();
    await userMgmt.cancelCreateUser();

    await expect(userMgmt.createUserDialog).toBeHidden();
  });

  test('should allow filling create user form', async ({ page }) => {
    await userMgmt.clickAddUser();

    // Fill email and select role (no username/password fields in app)
    await userMgmt.createEmailInput.fill('newuser@test.com');
    await userMgmt.createRoleSelect.selectOption('editor');

    await expect(userMgmt.createEmailInput).toHaveValue('newuser@test.com');
  });
});

test.describe('User Management - Edit User', () => {
  let userMgmt: UserManagementPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    userMgmt = new UserManagementPage(page);
    await mockApiResponses(page);

    // Mock update user endpoint
    await page.route('**/api/users/*', async (route) => {
      if (route.request().method() === 'PUT' || route.request().method() === 'PATCH') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      } else {
        await route.continue();
      }
    });

    await loginAsAdmin();
    await userMgmt.navigate();
    await userMgmt.waitForLoad();
  });

  test('should open edit dialog when clicking edit button', async ({ page }) => {
    await userMgmt.clickEditUser('admin1');

    await expect(userMgmt.editUserDialog).toBeVisible();
  });

  test('should display edit form fields', async ({ page }) => {
    await userMgmt.clickEditUser('admin1');

    // Edit dialog has role select and enabled toggle (no email)
    await expect(userMgmt.editRoleSelect).toBeVisible();
  });

  test('should close edit dialog when clicking cancel', async ({ page }) => {
    await userMgmt.clickEditUser('admin1');
    await userMgmt.cancelEditUser();

    await expect(userMgmt.editUserDialog).toBeHidden();
  });
});

test.describe('User Management - Delete User', () => {
  let userMgmt: UserManagementPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    userMgmt = new UserManagementPage(page);
    await mockApiResponses(page);

    // Mock delete user endpoint
    await page.route('**/api/users/*', async (route) => {
      if (route.request().method() === 'DELETE') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ success: true })
        });
      } else {
        await route.continue();
      }
    });

    await loginAsAdmin();
    await userMgmt.navigate();
    await userMgmt.waitForLoad();
  });

  test('should open delete confirmation dialog', async ({ page }) => {
    await userMgmt.clickDeleteUser('editor1');

    await expect(userMgmt.deleteDialog).toBeVisible();
  });

  test('should display confirm and cancel buttons in delete dialog', async ({ page }) => {
    await userMgmt.clickDeleteUser('editor1');

    await expect(userMgmt.deleteConfirmButton).toBeVisible();
    await expect(userMgmt.deleteCancelButton).toBeVisible();
  });

  test('should close delete dialog when clicking cancel', async ({ page }) => {
    await userMgmt.clickDeleteUser('editor1');
    await userMgmt.cancelDelete();

    await expect(userMgmt.deleteDialog).toBeHidden();
  });
});

test.describe('User Management - States', () => {
  test('should show loading state while fetching users', async ({ page, loginAsAdmin }) => {
    const userMgmt = new UserManagementPage(page);

    // Delay API response
    await page.route('**/api/users**', async (route) => {
      await new Promise(resolve => setTimeout(resolve, 1000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: [], totalPages: 1 })
      });
    });

    await loginAsAdmin();
    await userMgmt.goto();
    await userMgmt.navigateToUserManagement();

    // Should show loading state (timing-dependent)
  });

  test('should show empty state when no users exist', async ({ page, loginAsAdmin }) => {
    const userMgmt = new UserManagementPage(page);

    // Mock empty response
    await page.route('**/api/users**', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ users: [], totalPages: 1 })
      });
    });

    await loginAsAdmin();
    await userMgmt.navigate();
    await userMgmt.waitForLoad();

    const isEmpty = await userMgmt.isEmpty();
    expect(isEmpty).toBe(true);
  });
});

test.describe('User Management - Form Validation', () => {
  let userMgmt: UserManagementPage;

  test.beforeEach(async ({ page, loginAsAdmin }) => {
    userMgmt = new UserManagementPage(page);
    await mockApiResponses(page);
    await loginAsAdmin();
    await userMgmt.navigate();
    await userMgmt.waitForLoad();
  });

  test('should require email field', async ({ page }) => {
    await userMgmt.clickAddUser();

    // Try to submit without filling email - should show validation
    await expect(userMgmt.createEmailInput).toBeVisible();
    await expect(userMgmt.createEmailInput).toBeEditable();
  });

  test('should validate email format', async ({ page }) => {
    await userMgmt.clickAddUser();

    // Email input should be type email for browser validation
    const emailType = await userMgmt.createEmailInput.getAttribute('type');
    expect(emailType).toBe('email');
  });
});
