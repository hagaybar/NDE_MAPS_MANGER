import { Page, Locator, expect } from '@playwright/test';
import { BasePage } from './base.page';

/**
 * Page Object for User Management functionality (Admin only)
 */
export class UserManagementPage extends BasePage {
  // Container
  readonly container: Locator;
  readonly card: Locator;

  // Header
  readonly title: Locator;
  readonly addUserButton: Locator;

  // User list
  readonly userListContainer: Locator;
  readonly userRows: Locator;
  readonly searchInput: Locator;

  // Pagination
  readonly pagination: Locator;
  readonly prevPageButton: Locator;
  readonly nextPageButton: Locator;
  readonly pageInfo: Locator;

  // Create user dialog
  readonly createUserDialog: Locator;
  readonly createUsernameInput: Locator;
  readonly createEmailInput: Locator;
  readonly createRoleSelect: Locator;
  readonly createPasswordInput: Locator;
  readonly createConfirmPasswordInput: Locator;
  readonly createSubmitButton: Locator;
  readonly createCancelButton: Locator;

  // Edit user dialog
  readonly editUserDialog: Locator;
  readonly editEmailInput: Locator;
  readonly editRoleSelect: Locator;
  readonly editSubmitButton: Locator;
  readonly editCancelButton: Locator;

  // Delete confirm dialog
  readonly deleteDialog: Locator;
  readonly deleteConfirmButton: Locator;
  readonly deleteCancelButton: Locator;

  // Loading state
  readonly loadingState: Locator;
  readonly emptyState: Locator;

  constructor(page: Page) {
    super(page);

    // Container
    this.container = page.locator('#user-management');
    this.card = this.container.locator('.card');

    // Header
    this.title = this.card.locator('h2').first();
    this.addUserButton = page.locator('#add-user-btn');

    // User list
    this.userListContainer = page.locator('#user-list-container');
    this.userRows = this.userListContainer.locator('[data-testid="user-row"]');
    this.searchInput = page.locator('[data-testid="user-search"]');

    // Pagination
    this.pagination = page.locator('[data-testid="pagination"]');
    this.prevPageButton = this.pagination.locator('[data-testid="pagination-prev"]');
    this.nextPageButton = this.pagination.locator('[data-testid="pagination-next"]');
    this.pageInfo = this.pagination.locator('[data-testid="pagination-info"]');

    // Create user dialog - uses data-testid attributes
    this.createUserDialog = page.locator('[data-testid="create-user-dialog"]');
    this.createUsernameInput = this.createUserDialog.locator('[data-testid="username-input"]');
    this.createEmailInput = this.createUserDialog.locator('[data-testid="email-input"]');
    this.createRoleSelect = this.createUserDialog.locator('[data-testid="role-select"]');
    this.createPasswordInput = this.createUserDialog.locator('[data-testid="password-input"]');
    this.createConfirmPasswordInput = this.createUserDialog.locator('[data-testid="confirm-password-input"]');
    this.createSubmitButton = this.createUserDialog.locator('[data-testid="create-button"]');
    this.createCancelButton = this.createUserDialog.locator('[data-testid="cancel-button"]');

    // Edit user dialog - uses data-testid attributes
    this.editUserDialog = page.locator('[data-testid="edit-user-dialog"]');
    this.editEmailInput = this.editUserDialog.locator('[data-testid="email-input"]');
    this.editRoleSelect = this.editUserDialog.locator('[data-testid="role-select"]');
    this.editSubmitButton = this.editUserDialog.locator('[data-testid="save-button"]');
    this.editCancelButton = this.editUserDialog.locator('[data-testid="cancel-button"]');

    // Delete confirm dialog - uses data-testid attributes
    this.deleteDialog = page.locator('[data-testid="delete-user-confirm-dialog"]');
    this.deleteConfirmButton = this.deleteDialog.locator('[data-testid="delete-button"]');
    this.deleteCancelButton = this.deleteDialog.locator('[data-testid="cancel-button"]');

    // States
    this.loadingState = page.locator('[data-testid="loading-state"]');
    this.emptyState = page.locator('[data-testid="empty-state"]');
  }

  /**
   * Navigate to User Management
   */
  async navigate(): Promise<void> {
    await this.goto();
    await this.waitForPageLoad();
    await this.navigateToUserManagement();
  }

  /**
   * Wait for user list to load
   */
  async waitForLoad(): Promise<void> {
    await expect(this.loadingState).toBeHidden({ timeout: 15000 });
  }

  /**
   * Check if loading
   */
  async isLoading(): Promise<boolean> {
    return await this.loadingState.isVisible();
  }

  /**
   * Check if empty
   */
  async isEmpty(): Promise<boolean> {
    return await this.emptyState.isVisible();
  }

  /**
   * Get user count
   */
  async getUserCount(): Promise<number> {
    await this.waitForLoad();
    return await this.userRows.count();
  }

  /**
   * Search for users
   */
  async search(query: string): Promise<void> {
    await this.searchInput.clear();
    await this.searchInput.fill(query);
    // Wait for search to take effect
    await this.page.waitForTimeout(300);
  }

  /**
   * Clear search
   */
  async clearSearch(): Promise<void> {
    await this.searchInput.clear();
    await this.page.waitForTimeout(300);
  }

  /**
   * Go to next page
   */
  async nextPage(): Promise<void> {
    await this.nextPageButton.click();
    await this.waitForLoad();
  }

  /**
   * Go to previous page
   */
  async prevPage(): Promise<void> {
    await this.prevPageButton.click();
    await this.waitForLoad();
  }

  /**
   * Click add user button
   */
  async clickAddUser(): Promise<void> {
    await this.addUserButton.click();
    await expect(this.createUserDialog).toBeVisible();
  }

  /**
   * Fill create user form
   */
  async fillCreateUserForm(data: {
    username: string;
    email: string;
    role: 'admin' | 'editor';
    password: string;
  }): Promise<void> {
    await this.createUsernameInput.fill(data.username);
    await this.createEmailInput.fill(data.email);
    await this.createRoleSelect.selectOption(data.role);
    await this.createPasswordInput.fill(data.password);
    if (await this.createConfirmPasswordInput.isVisible()) {
      await this.createConfirmPasswordInput.fill(data.password);
    }
  }

  /**
   * Submit create user form
   */
  async submitCreateUser(): Promise<void> {
    await this.createSubmitButton.click();
  }

  /**
   * Cancel create user dialog
   */
  async cancelCreateUser(): Promise<void> {
    await this.createCancelButton.click();
    await expect(this.createUserDialog).toBeHidden();
  }

  /**
   * Create a new user (full flow)
   */
  async createUser(data: {
    username: string;
    email: string;
    role: 'admin' | 'editor';
    password: string;
  }): Promise<void> {
    await this.clickAddUser();
    await this.fillCreateUserForm(data);
    await this.submitCreateUser();
    await this.waitForToast('success');
    await expect(this.createUserDialog).toBeHidden();
  }

  /**
   * Get user row by username (actually email since email is displayed)
   */
  getUserRow(username: string): Locator {
    return this.userRows.filter({ hasText: username }).first();
  }

  /**
   * Click edit button for user
   */
  async clickEditUser(username: string): Promise<void> {
    const row = this.getUserRow(username);
    const editButton = row.locator('[data-testid="edit-button"]');
    await editButton.click();
    await expect(this.editUserDialog).toBeVisible();
  }

  /**
   * Fill edit user form
   */
  async fillEditUserForm(data: {
    email?: string;
    role?: 'admin' | 'editor';
  }): Promise<void> {
    if (data.email) {
      await this.editEmailInput.clear();
      await this.editEmailInput.fill(data.email);
    }
    if (data.role) {
      await this.editRoleSelect.selectOption(data.role);
    }
  }

  /**
   * Submit edit user form
   */
  async submitEditUser(): Promise<void> {
    await this.editSubmitButton.click();
  }

  /**
   * Cancel edit user dialog
   */
  async cancelEditUser(): Promise<void> {
    await this.editCancelButton.click();
    await expect(this.editUserDialog).toBeHidden();
  }

  /**
   * Edit a user (full flow)
   */
  async editUser(username: string, data: {
    email?: string;
    role?: 'admin' | 'editor';
  }): Promise<void> {
    await this.clickEditUser(username);
    await this.fillEditUserForm(data);
    await this.submitEditUser();
    await this.waitForToast('success');
    await expect(this.editUserDialog).toBeHidden();
  }

  /**
   * Click delete button for user
   */
  async clickDeleteUser(username: string): Promise<void> {
    const row = this.getUserRow(username);
    const deleteButton = row.locator('[data-testid="delete-button"]');
    await deleteButton.click();
    await expect(this.deleteDialog).toBeVisible();
  }

  /**
   * Confirm delete user
   */
  async confirmDelete(): Promise<void> {
    await this.deleteConfirmButton.click();
  }

  /**
   * Cancel delete user
   */
  async cancelDelete(): Promise<void> {
    await this.deleteCancelButton.click();
    await expect(this.deleteDialog).toBeHidden();
  }

  /**
   * Delete a user (full flow)
   */
  async deleteUser(username: string): Promise<void> {
    await this.clickDeleteUser(username);
    await this.confirmDelete();
    await this.waitForToast('success');
    await expect(this.deleteDialog).toBeHidden();
  }

  /**
   * Click reset password for user
   */
  async clickResetPassword(username: string): Promise<void> {
    const row = this.getUserRow(username);
    const resetButton = row.locator('[data-testid="reset-password-button"]');
    await resetButton.click();
  }

  /**
   * Check if user exists in list
   */
  async userExists(username: string): Promise<boolean> {
    await this.waitForLoad();
    const row = this.getUserRow(username);
    return await row.isVisible();
  }

  /**
   * Get user role from list
   */
  async getUserRole(username: string): Promise<string> {
    const row = this.getUserRow(username);
    const roleBadge = row.locator('[data-testid="role-badge-admin"], [data-testid="role-badge-editor"]');
    return await roleBadge.textContent() || '';
  }

  /**
   * Get user email from list
   */
  async getUserEmail(username: string): Promise<string> {
    const row = this.getUserRow(username);
    const emailCell = row.locator('[data-testid="user-email"], td:nth-child(2)');
    return await emailCell.textContent() || '';
  }
}
