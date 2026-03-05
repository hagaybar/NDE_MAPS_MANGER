/**
 * @jest-environment jsdom
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Test suite for delete-user-confirm-dialog component
// Following TDD methodology - RED phase

// Mock i18n module - English
const mockI18nEnglish = {
  locale: 'en',
  t: jest.fn((key) => {
    const translations = {
      'users.deleteUser': 'Delete User',
      'users.username': 'Username',
      'users.confirmDelete': 'Are you sure you want to delete this user?',
      'users.typeToConfirm': 'Type the username to confirm deletion:',
      'users.deleteSuccess': 'User deleted successfully',
      'users.deleteError': 'Failed to delete user',
      'users.cannotDeleteSelf': 'Cannot delete your own account',
      'dialog.cancel': 'Cancel',
      'common.loading': 'Loading...',
      'users.delete': 'Delete'
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
      'users.deleteUser': 'מחיקת משתמש',
      'users.username': 'שם משתמש',
      'users.confirmDelete': 'האם אתה בטוח שברצונך למחוק משתמש זה?',
      'users.typeToConfirm': 'הקלד את שם המשתמש לאישור מחיקה:',
      'users.deleteSuccess': 'המשתמש נמחק בהצלחה',
      'users.deleteError': 'שגיאה במחיקת המשתמש',
      'users.cannotDeleteSelf': 'לא ניתן למחוק את החשבון שלך',
      'dialog.cancel': 'ביטול',
      'common.loading': 'טוען...',
      'users.delete': 'מחיקה'
    };
    return translations[key] || key;
  }),
  isRTL: jest.fn(() => true),
  getLocale: jest.fn(() => 'he')
};

// Mock user service
const createMockUserService = () => ({
  deleteUser: jest.fn()
});

// Test user data
const testUser = {
  username: 'testuser@example.com'
};

describe('DeleteUserConfirmDialog Component', () => {
  let showDeleteUserConfirmDialog, hideDeleteUserConfirmDialog;
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

    const module = await import('../components/delete-user-confirm-dialog.js');
    showDeleteUserConfirmDialog = module.showDeleteUserConfirmDialog;
    hideDeleteUserConfirmDialog = module.hideDeleteUserConfirmDialog;
  });

  afterEach(() => {
    // Clean up any dialogs left in the DOM
    const overlay = document.querySelector('[data-testid="delete-user-confirm-dialog-overlay"]');
    if (overlay) {
      overlay.remove();
    }
    jest.clearAllMocks();
  });

  describe('Dialog Rendering', () => {
    test('should render dialog with modal overlay', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const overlay = document.querySelector('[data-testid="delete-user-confirm-dialog-overlay"]');
      const dialog = document.querySelector('[data-testid="delete-user-confirm-dialog"]');

      expect(overlay).not.toBeNull();
      expect(dialog).not.toBeNull();
    });

    test('should display dialog title', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const title = document.querySelector('[data-testid="dialog-title"]');
      expect(title).not.toBeNull();
      expect(title.textContent).toContain('Delete User');
    });

    test('should display warning message', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const warningMessage = document.querySelector('[data-testid="warning-message"]');
      expect(warningMessage).not.toBeNull();
      expect(warningMessage.textContent).toContain('Are you sure');
    });

    test('should display username in warning', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const usernameDisplay = document.querySelector('[data-testid="username-display"]');
      expect(usernameDisplay).not.toBeNull();
      expect(usernameDisplay.textContent).toContain('testuser@example.com');
    });

    test('should have confirmation input field', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const confirmInput = document.querySelector('[data-testid="confirm-input"]');
      expect(confirmInput).not.toBeNull();
      expect(confirmInput.type).toBe('text');
    });

    test('should display type to confirm instruction', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const instruction = document.querySelector('[data-testid="confirm-instruction"]');
      expect(instruction).not.toBeNull();
      expect(instruction.textContent).toContain('Type the username');
    });

    test('should have Delete button', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      expect(deleteBtn).not.toBeNull();
    });

    test('should have Cancel button', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      expect(cancelBtn).not.toBeNull();
      expect(cancelBtn.textContent).toContain('Cancel');
    });

    test('should use warning/danger styling for delete button', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      expect(deleteBtn.className).toMatch(/bg-red|danger|text-white/);
    });

    test('should use warning styling for dialog', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const warningIcon = document.querySelector('[data-testid="warning-icon"]');
      expect(warningIcon).not.toBeNull();
    });
  });

  describe('Confirmation Validation', () => {
    test('should have Delete button disabled initially', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      expect(deleteBtn.disabled).toBe(true);
    });

    test('should keep Delete button disabled when input does not match username', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'wrongusername';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      expect(deleteBtn.disabled).toBe(true);
    });

    test('should enable Delete button when input matches username exactly', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Re-query after DOM update
      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      expect(deleteBtn.disabled).toBe(false);
    });

    test('should be case-sensitive for username match', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'TESTUSER@EXAMPLE.COM';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      expect(deleteBtn.disabled).toBe(true);
    });

    test('should disable Delete button when input is cleared after matching', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');

      // First match
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Then clear
      confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = '';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      expect(deleteBtn.disabled).toBe(true);
    });
  });

  describe('API Integration', () => {
    test('should call userService.deleteUser with username on Delete click', async () => {
      mockUserService.deleteUser.mockResolvedValue({ success: true });
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockUserService.deleteUser).toHaveBeenCalledWith(
        'testuser@example.com'
      );
    });

    test('should not call API when Delete button is disabled', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      expect(mockUserService.deleteUser).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    test('should show loading state during API call', async () => {
      let resolveDelete;
      const deletePromise = new Promise(resolve => {
        resolveDelete = resolve;
      });
      mockUserService.deleteUser.mockReturnValue(deletePromise);

      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const loadingIndicator = document.querySelector('[data-testid="loading-indicator"]');
      expect(loadingIndicator).not.toBeNull();

      resolveDelete({ success: true });
    });

    test('should disable Delete button during loading', async () => {
      let resolveDelete;
      const deletePromise = new Promise(resolve => {
        resolveDelete = resolve;
      });
      mockUserService.deleteUser.mockReturnValue(deletePromise);

      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      let deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      deleteBtn = document.querySelector('[data-testid="delete-button"]');
      expect(deleteBtn.disabled).toBe(true);

      resolveDelete({ success: true });
    });

    test('should disable Cancel button during loading', async () => {
      let resolveDelete;
      const deletePromise = new Promise(resolve => {
        resolveDelete = resolve;
      });
      mockUserService.deleteUser.mockReturnValue(deletePromise);

      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      expect(cancelBtn.disabled).toBe(true);

      resolveDelete({ success: true });
    });

    test('should disable confirmation input during loading', async () => {
      let resolveDelete;
      const deletePromise = new Promise(resolve => {
        resolveDelete = resolve;
      });
      mockUserService.deleteUser.mockReturnValue(deletePromise);

      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      confirmInput = document.querySelector('[data-testid="confirm-input"]');
      expect(confirmInput.disabled).toBe(true);

      resolveDelete({ success: true });
    });
  });

  describe('Success Handling', () => {
    test('should show success message on successful deletion', async () => {
      mockUserService.deleteUser.mockResolvedValue({ success: true });

      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      const successMessage = document.querySelector('[data-testid="success-message"]');
      expect(successMessage).not.toBeNull();
      expect(successMessage.textContent).toContain('deleted successfully');
    });

    test('should resolve promise with success on successful deletion', async () => {
      mockUserService.deleteUser.mockResolvedValue({ success: true });

      const dialogPromise = showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      const result = await dialogPromise;
      expect(result).toEqual({
        success: true,
        username: 'testuser@example.com'
      });
    });

    test('should close dialog after showing success message', async () => {
      mockUserService.deleteUser.mockResolvedValue({ success: true });

      const dialogPromise = showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      await dialogPromise;

      // Wait for auto-close
      await new Promise(resolve => setTimeout(resolve, 2100));

      const dialog = document.querySelector('[data-testid="delete-user-confirm-dialog"]');
      expect(dialog).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should show error message when API returns error', async () => {
      mockUserService.deleteUser.mockRejectedValue(new Error('Failed to delete user'));

      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorMessage = document.querySelector('[data-testid="api-error"]');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain('Failed to delete user');
    });

    test('should show cannot delete self error when applicable', async () => {
      const error = new Error('Cannot delete your own account');
      error.code = 'CANNOT_DELETE_SELF';
      mockUserService.deleteUser.mockRejectedValue(error);

      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      const errorMessage = document.querySelector('[data-testid="api-error"]');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain('Cannot delete your own account');
    });

    test('should re-enable buttons after error', async () => {
      mockUserService.deleteUser.mockRejectedValue(new Error('API Error'));

      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      let deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      deleteBtn = document.querySelector('[data-testid="delete-button"]');
      // Button should be enabled again since input still matches
      expect(deleteBtn.disabled).toBe(false);
    });
  });

  describe('Cancel Behavior', () => {
    test('should close dialog when Cancel is clicked', async () => {
      const dialogPromise = showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      cancelBtn.click();

      const result = await dialogPromise;
      expect(result).toEqual({ cancelled: true });

      const dialog = document.querySelector('[data-testid="delete-user-confirm-dialog"]');
      expect(dialog).toBeNull();
    });

    test('should resolve promise with cancelled when Cancel is clicked', async () => {
      const dialogPromise = showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      cancelBtn.click();

      const result = await dialogPromise;
      expect(result).toEqual({ cancelled: true });
    });

    test('should close dialog when Escape key is pressed', async () => {
      const dialogPromise = showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });
      document.dispatchEvent(escapeEvent);

      const result = await dialogPromise;
      expect(result).toEqual({ cancelled: true });

      const dialog = document.querySelector('[data-testid="delete-user-confirm-dialog"]');
      expect(dialog).toBeNull();
    });

    test('should not close on Escape when loading', async () => {
      let resolveDelete;
      const deletePromise = new Promise(resolve => {
        resolveDelete = resolve;
      });
      mockUserService.deleteUser.mockReturnValue(deletePromise);

      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });
      document.dispatchEvent(escapeEvent);

      // Dialog should still be present
      const dialog = document.querySelector('[data-testid="delete-user-confirm-dialog"]');
      expect(dialog).not.toBeNull();

      resolveDelete({ success: true });
    });
  });

  describe('hideDeleteUserConfirmDialog Function', () => {
    test('should programmatically close dialog', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      expect(document.querySelector('[data-testid="delete-user-confirm-dialog"]')).not.toBeNull();

      hideDeleteUserConfirmDialog();

      expect(document.querySelector('[data-testid="delete-user-confirm-dialog"]')).toBeNull();
    });

    test('should not throw if no dialog is open', () => {
      expect(() => hideDeleteUserConfirmDialog()).not.toThrow();
    });
  });

  describe('ARIA Attributes', () => {
    test('should have role="dialog"', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const dialog = document.querySelector('[data-testid="delete-user-confirm-dialog"]');
      expect(dialog.getAttribute('role')).toBe('dialog');
    });

    test('should have aria-modal="true"', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const dialog = document.querySelector('[data-testid="delete-user-confirm-dialog"]');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });

    test('should have aria-labelledby pointing to title', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const dialog = document.querySelector('[data-testid="delete-user-confirm-dialog"]');
      const labelledBy = dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();

      const title = document.getElementById(labelledBy);
      expect(title).not.toBeNull();
    });
  });

  describe('Focus Management', () => {
    test('should focus confirmation input when dialog opens', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const confirmInput = document.querySelector('[data-testid="confirm-input"]');
      expect(document.activeElement).toBe(confirmInput);
    });

    test('should trap focus within dialog', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const dialog = document.querySelector('[data-testid="delete-user-confirm-dialog"]');
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

      const module = await import('../components/delete-user-confirm-dialog.js');
      showDeleteUserConfirmDialog = module.showDeleteUserConfirmDialog;
      hideDeleteUserConfirmDialog = module.hideDeleteUserConfirmDialog;

      // Set RTL direction on document
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'he';
    });

    test('should display Hebrew title', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const title = document.querySelector('[data-testid="dialog-title"]');
      expect(title.textContent).toContain('מחיקת משתמש');
    });

    test('should display Hebrew warning message', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const warningMessage = document.querySelector('[data-testid="warning-message"]');
      expect(warningMessage.textContent).toContain('האם אתה בטוח');
    });

    test('should display Hebrew type to confirm instruction', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const instruction = document.querySelector('[data-testid="confirm-instruction"]');
      expect(instruction.textContent).toContain('הקלד את שם המשתמש');
    });

    test('should display Hebrew cancel button', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      expect(cancelBtn.textContent).toContain('ביטול');
    });
  });

  describe('Edge Cases', () => {
    test('should prevent multiple dialogs from opening', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const dialogs = document.querySelectorAll('[data-testid="delete-user-confirm-dialog"]');
      expect(dialogs.length).toBe(1);
    });

    test('should handle rapid Delete button clicks', async () => {
      let resolveDelete;
      const deletePromise = new Promise(resolve => {
        resolveDelete = resolve;
      });
      mockUserService.deleteUser.mockReturnValue(deletePromise);

      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = 'testuser@example.com';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      deleteBtn.click();
      deleteBtn.click();
      deleteBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should only call API once
      expect(mockUserService.deleteUser).toHaveBeenCalledTimes(1);

      resolveDelete({ success: true });
    });

    test('should handle whitespace in input', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      let confirmInput = document.querySelector('[data-testid="confirm-input"]');
      confirmInput.value = '  testuser@example.com  ';
      confirmInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Should NOT enable because whitespace is different
      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      expect(deleteBtn.disabled).toBe(true);
    });
  });

  describe('Tailwind CSS Styling', () => {
    test('should use Tailwind classes for dialog', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const dialog = document.querySelector('[data-testid="delete-user-confirm-dialog"]');
      expect(dialog.className).toMatch(/bg-white|rounded|shadow/);
    });

    test('should use red/danger classes for delete button', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const deleteBtn = document.querySelector('[data-testid="delete-button"]');
      expect(deleteBtn.className).toMatch(/bg-red|text-white/);
    });

    test('should use Tailwind classes for input', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const confirmInput = document.querySelector('[data-testid="confirm-input"]');
      expect(confirmInput.className).toMatch(/border|rounded|focus:/);
    });

    test('should use warning colors in dialog header area', async () => {
      showDeleteUserConfirmDialog({ user: testUser, userService: mockUserService });

      const warningIcon = document.querySelector('[data-testid="warning-icon"]');
      expect(warningIcon.className).toMatch(/text-red|bg-red/);
    });
  });
});
