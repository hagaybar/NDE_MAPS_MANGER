/**
 * @jest-environment jsdom
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Test suite for edit-user-dialog component
// Following TDD methodology - RED phase

// Mock i18n module - English
const mockI18nEnglish = {
  locale: 'en',
  t: jest.fn((key) => {
    const translations = {
      'users.editUser': 'Edit User',
      'users.username': 'Username',
      'users.role': 'Role',
      'users.status': 'Status',
      'users.enabled': 'Enabled',
      'users.disabled': 'Disabled',
      'users.updateSuccess': 'User updated successfully',
      'users.updateError': 'Failed to update user',
      'users.cannotModifySelf': 'Cannot modify your own admin status',
      'auth.admin': 'Admin',
      'auth.editor': 'Editor',
      'dialog.cancel': 'Cancel',
      'common.loading': 'Loading...',
      'common.save': 'Save'
    };
    return translations[key] || key;
  }),
  isRTL: jest.fn(() => false),
  getLocale: jest.fn(() => 'en')
};

// Mock i18n module - Hebrew
const mockI18nHebrew = {
  locale: 'he',
  t: jest.fn((key) => {
    const translations = {
      'users.editUser': 'עריכת משתמש',
      'users.username': 'שם משתמש',
      'users.role': 'תפקיד',
      'users.status': 'סטטוס',
      'users.enabled': 'פעיל',
      'users.disabled': 'מושבת',
      'users.updateSuccess': 'המשתמש עודכן בהצלחה',
      'users.updateError': 'שגיאה בעדכון המשתמש',
      'users.cannotModifySelf': 'לא ניתן לשנות את הרשאות המנהל שלך',
      'auth.admin': 'מנהל',
      'auth.editor': 'עורך',
      'dialog.cancel': 'ביטול',
      'common.loading': 'טוען...',
      'common.save': 'שמור'
    };
    return translations[key] || key;
  }),
  isRTL: jest.fn(() => true),
  getLocale: jest.fn(() => 'he')
};

// Mock user service
const createMockUserService = () => ({
  updateUser: jest.fn()
});

// Test user data
const testUser = {
  username: 'testuser@example.com',
  role: 'editor',
  enabled: true
};

describe('EditUserDialog Component', () => {
  let showEditUserDialog, hideEditUserDialog;
  let mockUserService;

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = '';
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';

    // Reset modules to clear cached imports
    jest.resetModules();

    // Create fresh mock user service
    mockUserService = createMockUserService();

    // Mock the i18n module before importing
    jest.unstable_mockModule('../i18n.js', () => ({
      default: mockI18nEnglish
    }));

    const module = await import('../components/edit-user-dialog.js');
    showEditUserDialog = module.showEditUserDialog;
    hideEditUserDialog = module.hideEditUserDialog;
  });

  afterEach(() => {
    // Clean up any dialogs left in the DOM
    const overlay = document.querySelector('[data-testid="edit-user-dialog-overlay"]');
    if (overlay) {
      overlay.remove();
    }
    jest.clearAllMocks();
  });

  describe('Dialog Rendering', () => {
    test('should render dialog with modal overlay', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const overlay = document.querySelector('[data-testid="edit-user-dialog-overlay"]');
      const dialog = document.querySelector('[data-testid="edit-user-dialog"]');

      expect(overlay).not.toBeNull();
      expect(dialog).not.toBeNull();
    });

    test('should display dialog title', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const title = document.querySelector('[data-testid="dialog-title"]');
      expect(title).not.toBeNull();
      expect(title.textContent).toContain('Edit User');
    });

    test('should display username as readonly', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const usernameField = document.querySelector('[data-testid="username-field"]');
      expect(usernameField).not.toBeNull();
      expect(usernameField.textContent).toContain('testuser@example.com');
    });

    test('should have username label', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const usernameLabel = document.querySelector('[data-testid="username-label"]');
      expect(usernameLabel).not.toBeNull();
      expect(usernameLabel.textContent).toContain('Username');
    });

    test('should have role dropdown', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      expect(roleSelect).not.toBeNull();
      expect(roleSelect.tagName.toLowerCase()).toBe('select');
    });

    test('should have Admin and Editor options in role dropdown', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      const options = roleSelect.querySelectorAll('option');

      const optionValues = Array.from(options).map(opt => opt.value);
      expect(optionValues).toContain('admin');
      expect(optionValues).toContain('editor');
    });

    test('should select current user role in dropdown', async () => {
      showEditUserDialog({ user: { ...testUser, role: 'admin' }, userService: mockUserService });

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      expect(roleSelect.value).toBe('admin');
    });

    test('should have enable/disable toggle', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const enabledToggle = document.querySelector('[data-testid="enabled-toggle"]');
      expect(enabledToggle).not.toBeNull();
    });

    test('should show current enabled status in toggle', async () => {
      showEditUserDialog({ user: { ...testUser, enabled: true }, userService: mockUserService });

      const enabledToggle = document.querySelector('[data-testid="enabled-toggle"]');
      expect(enabledToggle.checked).toBe(true);
    });

    test('should show disabled status in toggle when user is disabled', async () => {
      showEditUserDialog({ user: { ...testUser, enabled: false }, userService: mockUserService });

      const enabledToggle = document.querySelector('[data-testid="enabled-toggle"]');
      expect(enabledToggle.checked).toBe(false);
    });

    test('should have Save button', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      expect(saveBtn).not.toBeNull();
    });

    test('should have Cancel button', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      expect(cancelBtn).not.toBeNull();
      expect(cancelBtn.textContent).toContain('Cancel');
    });

    test('should display status label', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const statusLabel = document.querySelector('[data-testid="status-label"]');
      expect(statusLabel).not.toBeNull();
      expect(statusLabel.textContent).toContain('Status');
    });
  });

  describe('API Integration', () => {
    test('should call userService.updateUser with username, role, and enabled on Save click', async () => {
      mockUserService.updateUser.mockResolvedValue({ success: true });
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      roleSelect.value = 'admin';
      roleSelect.dispatchEvent(new Event('change', { bubbles: true }));

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockUserService.updateUser).toHaveBeenCalledWith({
        username: 'testuser@example.com',
        role: 'admin',
        enabled: true
      });
    });

    test('should call API with updated enabled status', async () => {
      mockUserService.updateUser.mockResolvedValue({ success: true });
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const enabledToggle = document.querySelector('[data-testid="enabled-toggle"]');
      enabledToggle.checked = false;
      enabledToggle.dispatchEvent(new Event('change', { bubbles: true }));

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockUserService.updateUser).toHaveBeenCalledWith({
        username: 'testuser@example.com',
        role: 'editor',
        enabled: false
      });
    });
  });

  describe('Loading State', () => {
    test('should show loading state during API call', async () => {
      let resolveUpdate;
      const updatePromise = new Promise(resolve => {
        resolveUpdate = resolve;
      });
      mockUserService.updateUser.mockReturnValue(updatePromise);

      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const loadingIndicator = document.querySelector('[data-testid="loading-indicator"]');
      expect(loadingIndicator).not.toBeNull();

      resolveUpdate({ success: true });
    });

    test('should disable Save button during loading', async () => {
      let resolveUpdate;
      const updatePromise = new Promise(resolve => {
        resolveUpdate = resolve;
      });
      mockUserService.updateUser.mockReturnValue(updatePromise);

      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const saveBtnAfter = document.querySelector('[data-testid="save-button"]');
      expect(saveBtnAfter.disabled).toBe(true);

      resolveUpdate({ success: true });
    });

    test('should disable Cancel button during loading', async () => {
      let resolveUpdate;
      const updatePromise = new Promise(resolve => {
        resolveUpdate = resolve;
      });
      mockUserService.updateUser.mockReturnValue(updatePromise);

      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      expect(cancelBtn.disabled).toBe(true);

      resolveUpdate({ success: true });
    });

    test('should disable role select during loading', async () => {
      let resolveUpdate;
      const updatePromise = new Promise(resolve => {
        resolveUpdate = resolve;
      });
      mockUserService.updateUser.mockReturnValue(updatePromise);

      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      expect(roleSelect.disabled).toBe(true);

      resolveUpdate({ success: true });
    });

    test('should disable enabled toggle during loading', async () => {
      let resolveUpdate;
      const updatePromise = new Promise(resolve => {
        resolveUpdate = resolve;
      });
      mockUserService.updateUser.mockReturnValue(updatePromise);

      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const enabledToggle = document.querySelector('[data-testid="enabled-toggle"]');
      expect(enabledToggle.disabled).toBe(true);

      resolveUpdate({ success: true });
    });
  });

  describe('Success Handling', () => {
    test('should show success message on successful update', async () => {
      mockUserService.updateUser.mockResolvedValue({ success: true });

      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      const successMessage = document.querySelector('[data-testid="success-message"]');
      expect(successMessage).not.toBeNull();
      expect(successMessage.textContent).toContain('User updated successfully');
    });

    test('should resolve promise with success on successful update', async () => {
      mockUserService.updateUser.mockResolvedValue({ success: true });

      const dialogPromise = showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      const result = await dialogPromise;
      expect(result).toEqual({
        success: true,
        username: 'testuser@example.com',
        role: 'editor',
        enabled: true
      });
    });

    test('should close dialog after showing success message', async () => {
      mockUserService.updateUser.mockResolvedValue({ success: true });

      const dialogPromise = showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await dialogPromise;

      // Wait for auto-close
      await new Promise(resolve => setTimeout(resolve, 2100));

      const dialog = document.querySelector('[data-testid="edit-user-dialog"]');
      expect(dialog).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should show error message when API returns error', async () => {
      mockUserService.updateUser.mockRejectedValue(new Error('Failed to update user'));

      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorMessage = document.querySelector('[data-testid="api-error"]');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain('Failed to update user');
    });

    test('should show cannot modify self error when applicable', async () => {
      const error = new Error('Cannot modify your own admin status');
      error.code = 'CANNOT_MODIFY_SELF';
      mockUserService.updateUser.mockRejectedValue(error);

      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorMessage = document.querySelector('[data-testid="api-error"]');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain('Cannot modify your own admin status');
    });

    test('should re-enable buttons after error', async () => {
      mockUserService.updateUser.mockRejectedValue(new Error('API Error'));

      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      const saveBtnAfter = document.querySelector('[data-testid="save-button"]');
      expect(saveBtnAfter.disabled).toBe(false);
    });
  });

  describe('Cancel Behavior', () => {
    test('should close dialog when Cancel is clicked', async () => {
      const dialogPromise = showEditUserDialog({ user: testUser, userService: mockUserService });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      cancelBtn.click();

      const result = await dialogPromise;
      expect(result).toEqual({ cancelled: true });

      const dialog = document.querySelector('[data-testid="edit-user-dialog"]');
      expect(dialog).toBeNull();
    });

    test('should resolve promise with cancelled when Cancel is clicked', async () => {
      const dialogPromise = showEditUserDialog({ user: testUser, userService: mockUserService });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      cancelBtn.click();

      const result = await dialogPromise;
      expect(result).toEqual({ cancelled: true });
    });

    test('should close dialog when Escape key is pressed', async () => {
      const dialogPromise = showEditUserDialog({ user: testUser, userService: mockUserService });

      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });
      document.dispatchEvent(escapeEvent);

      const result = await dialogPromise;
      expect(result).toEqual({ cancelled: true });

      const dialog = document.querySelector('[data-testid="edit-user-dialog"]');
      expect(dialog).toBeNull();
    });

    test('should not close on Escape when loading', async () => {
      let resolveUpdate;
      const updatePromise = new Promise(resolve => {
        resolveUpdate = resolve;
      });
      mockUserService.updateUser.mockReturnValue(updatePromise);

      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });
      document.dispatchEvent(escapeEvent);

      // Dialog should still be present
      const dialog = document.querySelector('[data-testid="edit-user-dialog"]');
      expect(dialog).not.toBeNull();

      resolveUpdate({ success: true });
    });
  });

  describe('hideEditUserDialog Function', () => {
    test('should programmatically close dialog', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      expect(document.querySelector('[data-testid="edit-user-dialog"]')).not.toBeNull();

      hideEditUserDialog();

      expect(document.querySelector('[data-testid="edit-user-dialog"]')).toBeNull();
    });

    test('should not throw if no dialog is open', () => {
      expect(() => hideEditUserDialog()).not.toThrow();
    });
  });

  describe('ARIA Attributes', () => {
    test('should have role="dialog"', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const dialog = document.querySelector('[data-testid="edit-user-dialog"]');
      expect(dialog.getAttribute('role')).toBe('dialog');
    });

    test('should have aria-modal="true"', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const dialog = document.querySelector('[data-testid="edit-user-dialog"]');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });

    test('should have aria-labelledby pointing to title', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const dialog = document.querySelector('[data-testid="edit-user-dialog"]');
      const labelledBy = dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();

      const title = document.getElementById(labelledBy);
      expect(title).not.toBeNull();
    });
  });

  describe('Focus Management', () => {
    test('should focus role select when dialog opens', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      expect(document.activeElement).toBe(roleSelect);
    });

    test('should trap focus within dialog', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const dialog = document.querySelector('[data-testid="edit-user-dialog"]');
      const focusableElements = dialog.querySelectorAll(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])'
      );

      expect(focusableElements.length).toBeGreaterThan(0);
    });
  });

  describe('RTL Layout Support', () => {
    beforeEach(async () => {
      jest.resetModules();

      // Mock the i18n module with Hebrew settings
      jest.unstable_mockModule('../i18n.js', () => ({
        default: mockI18nHebrew
      }));

      const module = await import('../components/edit-user-dialog.js');
      showEditUserDialog = module.showEditUserDialog;
      hideEditUserDialog = module.hideEditUserDialog;

      // Set RTL direction on document
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'he';
    });

    test('should display Hebrew title', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const title = document.querySelector('[data-testid="dialog-title"]');
      expect(title.textContent).toContain('עריכת משתמש');
    });

    test('should display Hebrew labels', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const usernameLabel = document.querySelector('[data-testid="username-label"]');
      expect(usernameLabel.textContent).toContain('שם משתמש');
    });

    test('should display Hebrew role options', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      const options = Array.from(roleSelect.querySelectorAll('option'));
      const optionTexts = options.map(opt => opt.textContent);

      expect(optionTexts.some(text => text.includes('מנהל'))).toBe(true);
      expect(optionTexts.some(text => text.includes('עורך'))).toBe(true);
    });

    test('should display Hebrew status labels', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const statusLabel = document.querySelector('[data-testid="status-label"]');
      expect(statusLabel.textContent).toContain('סטטוס');
    });
  });

  describe('Edge Cases', () => {
    test('should prevent multiple dialogs from opening', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const dialogs = document.querySelectorAll('[data-testid="edit-user-dialog"]');
      expect(dialogs.length).toBe(1);
    });

    test('should handle rapid Save button clicks', async () => {
      let resolveUpdate;
      const updatePromise = new Promise(resolve => {
        resolveUpdate = resolve;
      });
      mockUserService.updateUser.mockReturnValue(updatePromise);

      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      saveBtn.click();
      saveBtn.click();
      saveBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should only call API once
      expect(mockUserService.updateUser).toHaveBeenCalledTimes(1);

      resolveUpdate({ success: true });
    });

    test('should handle user with disabled status', async () => {
      const disabledUser = { ...testUser, enabled: false };
      showEditUserDialog({ user: disabledUser, userService: mockUserService });

      const enabledToggle = document.querySelector('[data-testid="enabled-toggle"]');
      expect(enabledToggle.checked).toBe(false);
    });
  });

  describe('Tailwind CSS Styling', () => {
    test('should use Tailwind classes for dialog', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const dialog = document.querySelector('[data-testid="edit-user-dialog"]');
      expect(dialog.className).toMatch(/bg-white|rounded|shadow/);
    });

    test('should use Tailwind classes for select', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      expect(roleSelect.className).toMatch(/border|rounded|focus:/);
    });

    test('should use Tailwind classes for buttons', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const saveBtn = document.querySelector('[data-testid="save-button"]');
      expect(saveBtn.className).toMatch(/bg-blue|hover:|text-white/);
    });

    test('should style toggle switch with Tailwind', async () => {
      showEditUserDialog({ user: testUser, userService: mockUserService });

      const enabledToggle = document.querySelector('[data-testid="enabled-toggle"]');
      expect(enabledToggle).not.toBeNull();
    });
  });
});
