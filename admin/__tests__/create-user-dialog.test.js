/**
 * @jest-environment jsdom
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Test suite for create-user-dialog component
// Following TDD methodology - RED phase

// Mock i18n module - English
const mockI18nEnglish = {
  locale: 'en',
  t: jest.fn((key) => {
    const translations = {
      'users.createUser': 'Create User',
      'users.email': 'Email',
      'users.role': 'Role',
      'users.createSuccess': 'User created successfully. Temporary password sent via email.',
      'users.createError': 'Failed to create user',
      'users.invalidEmail': 'Invalid email format',
      'users.userExists': 'User already exists',
      'auth.admin': 'Admin',
      'auth.editor': 'Editor',
      'dialog.cancel': 'Cancel',
      'common.loading': 'Loading...',
      'validation.required': 'This field is required'
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
      'users.createUser': 'יצירת משתמש',
      'users.email': 'דוא״ל',
      'users.role': 'תפקיד',
      'users.createSuccess': 'המשתמש נוצר בהצלחה. סיסמה זמנית נשלחה בדוא״ל.',
      'users.createError': 'שגיאה ביצירת המשתמש',
      'users.invalidEmail': 'כתובת דוא״ל לא תקינה',
      'users.userExists': 'משתמש כבר קיים',
      'auth.admin': 'מנהל',
      'auth.editor': 'עורך',
      'dialog.cancel': 'ביטול',
      'common.loading': 'טוען...',
      'validation.required': 'שדה חובה'
    };
    return translations[key] || key;
  }),
  isRTL: jest.fn(() => true),
  getLocale: jest.fn(() => 'he')
};

// Mock user service
const createMockUserService = () => ({
  createUser: jest.fn()
});

describe('CreateUserDialog Component', () => {
  let showCreateUserDialog, hideCreateUserDialog;
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

    const module = await import('../components/create-user-dialog.js');
    showCreateUserDialog = module.showCreateUserDialog;
    hideCreateUserDialog = module.hideCreateUserDialog;
  });

  afterEach(() => {
    // Clean up any dialogs left in the DOM
    const overlay = document.querySelector('[data-testid="create-user-dialog-overlay"]');
    if (overlay) {
      overlay.remove();
    }
    jest.clearAllMocks();
  });

  describe('Dialog Rendering', () => {
    test('should render dialog with modal overlay', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const overlay = document.querySelector('[data-testid="create-user-dialog-overlay"]');
      const dialog = document.querySelector('[data-testid="create-user-dialog"]');

      expect(overlay).not.toBeNull();
      expect(dialog).not.toBeNull();
    });

    test('should display dialog title', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const title = document.querySelector('[data-testid="dialog-title"]');
      expect(title).not.toBeNull();
      expect(title.textContent).toContain('Create User');
    });

    test('should have email input field', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      expect(emailInput).not.toBeNull();
      expect(emailInput.type).toBe('email');
    });

    test('should have email label', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const emailLabel = document.querySelector('[data-testid="email-label"]');
      expect(emailLabel).not.toBeNull();
      expect(emailLabel.textContent).toContain('Email');
    });

    test('should have role dropdown', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      expect(roleSelect).not.toBeNull();
      expect(roleSelect.tagName.toLowerCase()).toBe('select');
    });

    test('should have Admin and Editor options in role dropdown', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      const options = roleSelect.querySelectorAll('option');

      const optionValues = Array.from(options).map(opt => opt.value);
      expect(optionValues).toContain('admin');
      expect(optionValues).toContain('editor');
    });

    test('should default role to Editor', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      expect(roleSelect.value).toBe('editor');
    });

    test('should have Create button', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const createBtn = document.querySelector('[data-testid="create-button"]');
      expect(createBtn).not.toBeNull();
    });

    test('should have Cancel button', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      expect(cancelBtn).not.toBeNull();
      expect(cancelBtn.textContent).toContain('Cancel');
    });
  });

  describe('Email Validation', () => {
    test('should show error for empty email when Create is clicked', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      const errorMessage = document.querySelector('[data-testid="email-error"]');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain('required');
    });

    test('should show error for invalid email format', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'invalid-email';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      const errorMessage = document.querySelector('[data-testid="email-error"]');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain('Invalid email');
    });

    test('should not show error for valid email', async () => {
      mockUserService.createUser.mockResolvedValue({ success: true });
      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'valid@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Re-query elements after input event might have updated DOM
      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      // Wait for async API call
      await new Promise(resolve => setTimeout(resolve, 150));

      // Re-query error message after DOM update
      const errorMessage = document.querySelector('[data-testid="email-error"]');
      expect(errorMessage).toBeNull();
    });

    test('should validate email on input blur', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      // First set the value through input event
      emailInput.value = 'invalid';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      // Then trigger blur
      emailInput.dispatchEvent(new Event('blur', { bubbles: true }));

      // Re-query after DOM update
      const errorMessage = document.querySelector('[data-testid="email-error"]');
      expect(errorMessage).not.toBeNull();
    });
  });

  describe('API Integration', () => {
    test('should call userService.createUser with email and role on Create click', async () => {
      mockUserService.createUser.mockResolvedValue({ success: true });
      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'newuser@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      roleSelect.value = 'admin';
      roleSelect.dispatchEvent(new Event('change', { bubbles: true }));

      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      expect(mockUserService.createUser).toHaveBeenCalledWith({
        email: 'newuser@example.com',
        role: 'admin'
      });
    });

    test('should not call API when email is invalid', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'invalid-email';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      expect(mockUserService.createUser).not.toHaveBeenCalled();
    });
  });

  describe('Loading State', () => {
    test('should show loading state during API call', async () => {
      // Create a promise that we control
      let resolveCreate;
      const createPromise = new Promise(resolve => {
        resolveCreate = resolve;
      });
      mockUserService.createUser.mockReturnValue(createPromise);

      showCreateUserDialog({ userService: mockUserService });

      let emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'test@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      let createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      // Re-query after DOM update
      const loadingIndicator = document.querySelector('[data-testid="loading-indicator"]');
      expect(loadingIndicator).not.toBeNull();

      // Resolve the promise to clean up
      resolveCreate({ success: true });
    });

    test('should disable Create button during loading', async () => {
      let resolveCreate;
      const createPromise = new Promise(resolve => {
        resolveCreate = resolve;
      });
      mockUserService.createUser.mockReturnValue(createPromise);

      showCreateUserDialog({ userService: mockUserService });

      let emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'test@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      let createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      // Re-query after DOM update
      createBtn = document.querySelector('[data-testid="create-button"]');
      expect(createBtn.disabled).toBe(true);

      resolveCreate({ success: true });
    });

    test('should disable Cancel button during loading', async () => {
      let resolveCreate;
      const createPromise = new Promise(resolve => {
        resolveCreate = resolve;
      });
      mockUserService.createUser.mockReturnValue(createPromise);

      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'test@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      expect(cancelBtn.disabled).toBe(true);

      resolveCreate({ success: true });
    });

    test('should disable email input during loading', async () => {
      let resolveCreate;
      const createPromise = new Promise(resolve => {
        resolveCreate = resolve;
      });
      mockUserService.createUser.mockReturnValue(createPromise);

      showCreateUserDialog({ userService: mockUserService });

      let emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'test@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      let createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      // Re-query after DOM update
      emailInput = document.querySelector('[data-testid="email-input"]');
      expect(emailInput.disabled).toBe(true);

      resolveCreate({ success: true });
    });
  });

  describe('Success Handling', () => {
    test('should show success message on successful creation', async () => {
      mockUserService.createUser.mockResolvedValue({ success: true });

      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'newuser@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      const successMessage = document.querySelector('[data-testid="success-message"]');
      expect(successMessage).not.toBeNull();
      expect(successMessage.textContent).toContain('Temporary password');
    });

    test('should resolve promise with success on successful creation', async () => {
      mockUserService.createUser.mockResolvedValue({ success: true });

      const dialogPromise = showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'newuser@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      const result = await dialogPromise;
      expect(result).toEqual({ success: true, email: 'newuser@example.com', role: 'editor' });
    });

    test('should close dialog after showing success message', async () => {
      mockUserService.createUser.mockResolvedValue({ success: true });

      const dialogPromise = showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'newuser@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await dialogPromise;

      // Wait for auto-close
      await new Promise(resolve => setTimeout(resolve, 2100));

      const dialog = document.querySelector('[data-testid="create-user-dialog"]');
      expect(dialog).toBeNull();
    });
  });

  describe('Error Handling', () => {
    test('should show error message when API returns error', async () => {
      mockUserService.createUser.mockRejectedValue(new Error('Failed to create user'));

      showCreateUserDialog({ userService: mockUserService });

      let emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'newuser@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      let createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Re-query after DOM update
      const errorMessage = document.querySelector('[data-testid="api-error"]');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain('Failed to create user');
    });

    test('should show user exists error when user already exists', async () => {
      const error = new Error('User already exists');
      error.code = 'USER_EXISTS';
      mockUserService.createUser.mockRejectedValue(error);

      showCreateUserDialog({ userService: mockUserService });

      let emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'existing@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      let createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Re-query after DOM update
      const errorMessage = document.querySelector('[data-testid="api-error"]');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain('User already exists');
    });

    test('should re-enable buttons after error', async () => {
      mockUserService.createUser.mockRejectedValue(new Error('API Error'));

      showCreateUserDialog({ userService: mockUserService });

      let emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'test@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      let createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      // Re-query after DOM update
      createBtn = document.querySelector('[data-testid="create-button"]');
      expect(createBtn.disabled).toBe(false);
    });
  });

  describe('Cancel Behavior', () => {
    test('should close dialog when Cancel is clicked', async () => {
      const dialogPromise = showCreateUserDialog({ userService: mockUserService });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      cancelBtn.click();

      const result = await dialogPromise;
      expect(result).toEqual({ cancelled: true });

      const dialog = document.querySelector('[data-testid="create-user-dialog"]');
      expect(dialog).toBeNull();
    });

    test('should resolve promise with cancelled when Cancel is clicked', async () => {
      const dialogPromise = showCreateUserDialog({ userService: mockUserService });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      cancelBtn.click();

      const result = await dialogPromise;
      expect(result).toEqual({ cancelled: true });
    });

    test('should close dialog when Escape key is pressed', async () => {
      const dialogPromise = showCreateUserDialog({ userService: mockUserService });

      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });
      document.dispatchEvent(escapeEvent);

      const result = await dialogPromise;
      expect(result).toEqual({ cancelled: true });

      const dialog = document.querySelector('[data-testid="create-user-dialog"]');
      expect(dialog).toBeNull();
    });

    test('should not close on Escape when loading', async () => {
      let resolveCreate;
      const createPromise = new Promise(resolve => {
        resolveCreate = resolve;
      });
      mockUserService.createUser.mockReturnValue(createPromise);

      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'test@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });
      document.dispatchEvent(escapeEvent);

      // Dialog should still be present
      const dialog = document.querySelector('[data-testid="create-user-dialog"]');
      expect(dialog).not.toBeNull();

      resolveCreate({ success: true });
    });
  });

  describe('hideCreateUserDialog Function', () => {
    test('should programmatically close dialog', async () => {
      showCreateUserDialog({ userService: mockUserService });

      expect(document.querySelector('[data-testid="create-user-dialog"]')).not.toBeNull();

      hideCreateUserDialog();

      expect(document.querySelector('[data-testid="create-user-dialog"]')).toBeNull();
    });

    test('should not throw if no dialog is open', () => {
      expect(() => hideCreateUserDialog()).not.toThrow();
    });
  });

  describe('ARIA Attributes', () => {
    test('should have role="dialog"', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const dialog = document.querySelector('[data-testid="create-user-dialog"]');
      expect(dialog.getAttribute('role')).toBe('dialog');
    });

    test('should have aria-modal="true"', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const dialog = document.querySelector('[data-testid="create-user-dialog"]');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });

    test('should have aria-labelledby pointing to title', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const dialog = document.querySelector('[data-testid="create-user-dialog"]');
      const labelledBy = dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();

      const title = document.getElementById(labelledBy);
      expect(title).not.toBeNull();
    });

    test('email input should have aria-invalid when invalid', async () => {
      showCreateUserDialog({ userService: mockUserService });

      let emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'invalid';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new Event('blur', { bubbles: true }));

      // Re-query after DOM update
      emailInput = document.querySelector('[data-testid="email-input"]');
      expect(emailInput.getAttribute('aria-invalid')).toBe('true');
    });

    test('email input should have aria-describedby for error', async () => {
      showCreateUserDialog({ userService: mockUserService });

      let emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'invalid';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));
      emailInput.dispatchEvent(new Event('blur', { bubbles: true }));

      // Re-query after DOM update
      emailInput = document.querySelector('[data-testid="email-input"]');
      const describedBy = emailInput.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();
    });
  });

  describe('Focus Management', () => {
    test('should focus email input when dialog opens', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      expect(document.activeElement).toBe(emailInput);
    });

    test('should trap focus within dialog', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const dialog = document.querySelector('[data-testid="create-user-dialog"]');
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

      const module = await import('../components/create-user-dialog.js');
      showCreateUserDialog = module.showCreateUserDialog;
      hideCreateUserDialog = module.hideCreateUserDialog;

      // Set RTL direction on document
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'he';
    });

    test('should display Hebrew title', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const title = document.querySelector('[data-testid="dialog-title"]');
      expect(title.textContent).toContain('יצירת משתמש');
    });

    test('should display Hebrew labels', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const emailLabel = document.querySelector('[data-testid="email-label"]');
      expect(emailLabel.textContent).toContain('דוא״ל');
    });

    test('should display Hebrew role options', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const roleSelect = document.querySelector('[data-testid="role-select"]');
      const options = Array.from(roleSelect.querySelectorAll('option'));
      const optionTexts = options.map(opt => opt.textContent);

      expect(optionTexts.some(text => text.includes('מנהל'))).toBe(true);
      expect(optionTexts.some(text => text.includes('עורך'))).toBe(true);
    });

    test('should display Hebrew error messages', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      const errorMessage = document.querySelector('[data-testid="email-error"]');
      expect(errorMessage.textContent).toContain('שדה חובה');
    });
  });

  describe('Edge Cases', () => {
    test('should prevent multiple dialogs from opening', async () => {
      showCreateUserDialog({ userService: mockUserService });
      showCreateUserDialog({ userService: mockUserService });

      const dialogs = document.querySelectorAll('[data-testid="create-user-dialog"]');
      expect(dialogs.length).toBe(1);
    });

    test('should trim whitespace from email', async () => {
      mockUserService.createUser.mockResolvedValue({ success: true });

      showCreateUserDialog({ userService: mockUserService });

      let emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = '  test@example.com  ';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      let createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(mockUserService.createUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        role: 'editor'
      });
    });

    test('should handle rapid Create button clicks', async () => {
      let resolveCreate;
      const createPromise = new Promise(resolve => {
        resolveCreate = resolve;
      });
      mockUserService.createUser.mockReturnValue(createPromise);

      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      emailInput.value = 'test@example.com';
      emailInput.dispatchEvent(new Event('input', { bubbles: true }));

      const createBtn = document.querySelector('[data-testid="create-button"]');
      createBtn.click();
      createBtn.click();
      createBtn.click();

      await new Promise(resolve => setTimeout(resolve, 50));

      // Should only call API once
      expect(mockUserService.createUser).toHaveBeenCalledTimes(1);

      resolveCreate({ success: true });
    });
  });

  describe('Tailwind CSS Styling', () => {
    test('should use Tailwind classes for dialog', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const dialog = document.querySelector('[data-testid="create-user-dialog"]');
      expect(dialog.className).toMatch(/bg-white|rounded|shadow/);
    });

    test('should use Tailwind classes for input', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const emailInput = document.querySelector('[data-testid="email-input"]');
      expect(emailInput.className).toMatch(/border|rounded|focus:/);
    });

    test('should use Tailwind classes for buttons', async () => {
      showCreateUserDialog({ userService: mockUserService });

      const createBtn = document.querySelector('[data-testid="create-button"]');
      expect(createBtn.className).toMatch(/bg-blue|hover:|text-white/);
    });
  });
});
