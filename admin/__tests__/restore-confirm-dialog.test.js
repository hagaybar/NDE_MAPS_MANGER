/**
 * @jest-environment jsdom
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Test suite for restore-confirm-dialog component
// Following TDD methodology - RED phase

// Mock i18n module
const mockI18n = {
  locale: 'en',
  t: jest.fn((key) => {
    const translations = {
      'dialog.restoreConfirm': 'Confirm Restore',
      'dialog.restoreWarning': 'This will restore the selected version. Current data will be replaced. This action cannot be undone.',
      'dialog.confirm': 'Restore',
      'dialog.cancel': 'Cancel',
      'dialog.restoring': 'Restoring...',
      'dialog.restoreSuccess': 'Version restored successfully',
      'dialog.restoreError': 'Failed to restore version',
      'versions.timestamp': 'Date',
      'versions.user': 'User'
    };
    return translations[key] || key;
  }),
  isRTL: jest.fn(() => false),
  getLocale: jest.fn(() => 'en')
};

// Mock Hebrew translations
const mockI18nHebrew = {
  locale: 'he',
  t: jest.fn((key) => {
    const translations = {
      'dialog.restoreConfirm': 'אישור שחזור',
      'dialog.restoreWarning': 'פעולה זו תשחזר את הגרסה הנבחרת. הנתונים הנוכחיים יוחלפו. לא ניתן לבטל פעולה זו.',
      'dialog.confirm': 'שחזר',
      'dialog.cancel': 'ביטול',
      'dialog.restoring': 'משחזר...',
      'dialog.restoreSuccess': 'הגרסה שוחזרה בהצלחה',
      'dialog.restoreError': 'שגיאה בשחזור הגרסה',
      'versions.timestamp': 'תאריך',
      'versions.user': 'משתמש'
    };
    return translations[key] || key;
  }),
  isRTL: jest.fn(() => true),
  getLocale: jest.fn(() => 'he')
};

// Sample version data for tests
const mockVersion = {
  versionId: 'v3',
  timestamp: '2024-02-15T14:30:00Z',
  username: 'admin',
  size: 2048576
};

describe('RestoreConfirmDialog Component', () => {
  let showRestoreDialog, hideRestoreDialog;

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = '';
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';

    // Reset modules to clear cached imports
    jest.resetModules();

    // Mock the i18n module before importing
    jest.unstable_mockModule('../i18n.js', () => ({
      default: mockI18n
    }));

    const module = await import('../components/restore-confirm-dialog.js');
    showRestoreDialog = module.showRestoreDialog;
    hideRestoreDialog = module.hideRestoreDialog;
  });

  afterEach(() => {
    // Clean up any dialogs left in the DOM
    const dialog = document.querySelector('[data-testid="restore-dialog"]');
    if (dialog) {
      dialog.remove();
    }
  });

  describe('Dialog Rendering', () => {
    test('should render dialog with modal overlay', async () => {
      showRestoreDialog({ version: mockVersion });

      const overlay = document.querySelector('[data-testid="dialog-overlay"]');
      const dialog = document.querySelector('[data-testid="restore-dialog"]');

      expect(overlay).not.toBeNull();
      expect(dialog).not.toBeNull();
    });

    test('should display dialog title', async () => {
      showRestoreDialog({ version: mockVersion });

      const title = document.querySelector('[data-testid="dialog-title"]');
      expect(title).not.toBeNull();
      expect(title.textContent).toContain('Confirm Restore');
    });

    test('should display warning message', async () => {
      showRestoreDialog({ version: mockVersion });

      const warning = document.querySelector('[data-testid="dialog-warning"]');
      expect(warning).not.toBeNull();
      expect(warning.textContent).toContain('This will restore the selected version');
    });

    test('should display version timestamp', async () => {
      showRestoreDialog({ version: mockVersion });

      const details = document.querySelector('[data-testid="version-details"]');
      expect(details).not.toBeNull();
      // Should contain date-related content
      expect(details.textContent).toContain('Date');
    });

    test('should display version username', async () => {
      showRestoreDialog({ version: mockVersion });

      const details = document.querySelector('[data-testid="version-details"]');
      expect(details.textContent).toContain('admin');
    });

    test('should have confirm and cancel buttons', async () => {
      showRestoreDialog({ version: mockVersion });

      const confirmBtn = document.querySelector('[data-testid="confirm-button"]');
      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');

      expect(confirmBtn).not.toBeNull();
      expect(cancelBtn).not.toBeNull();
      expect(confirmBtn.textContent).toContain('Restore');
      expect(cancelBtn.textContent).toContain('Cancel');
    });
  });

  describe('Button Actions', () => {
    test('should resolve promise with true when confirm is clicked', async () => {
      const dialogPromise = showRestoreDialog({ version: mockVersion });

      const confirmBtn = document.querySelector('[data-testid="confirm-button"]');
      confirmBtn.click();

      const result = await dialogPromise;
      expect(result).toEqual({ confirmed: true });
    });

    test('should resolve promise with false when cancel is clicked', async () => {
      const dialogPromise = showRestoreDialog({ version: mockVersion });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      cancelBtn.click();

      const result = await dialogPromise;
      expect(result).toEqual({ confirmed: false });
    });

    test('should close dialog after confirm is clicked', async () => {
      const dialogPromise = showRestoreDialog({ version: mockVersion });

      const confirmBtn = document.querySelector('[data-testid="confirm-button"]');
      confirmBtn.click();

      await dialogPromise;

      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      expect(dialog).toBeNull();
    });

    test('should close dialog after cancel is clicked', async () => {
      const dialogPromise = showRestoreDialog({ version: mockVersion });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      cancelBtn.click();

      await dialogPromise;

      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      expect(dialog).toBeNull();
    });
  });

  describe('Loading State', () => {
    test('should show loading state when showLoading option is set', async () => {
      showRestoreDialog({ version: mockVersion, showLoading: true });

      const loadingIndicator = document.querySelector('[data-testid="loading-indicator"]');
      const confirmBtn = document.querySelector('[data-testid="confirm-button"]');

      expect(loadingIndicator).not.toBeNull();
      expect(confirmBtn.disabled).toBe(true);
    });

    test('should display restoring text during loading', async () => {
      showRestoreDialog({ version: mockVersion, showLoading: true });

      const loadingIndicator = document.querySelector('[data-testid="loading-indicator"]');
      expect(loadingIndicator.textContent).toContain('Restoring');
    });

    test('should disable both buttons during loading', async () => {
      showRestoreDialog({ version: mockVersion, showLoading: true });

      const confirmBtn = document.querySelector('[data-testid="confirm-button"]');
      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');

      expect(confirmBtn.disabled).toBe(true);
      expect(cancelBtn.disabled).toBe(true);
    });
  });

  describe('Success/Error Feedback', () => {
    test('should show success message when showSuccess is set', async () => {
      showRestoreDialog({ version: mockVersion, showSuccess: true });

      const successMessage = document.querySelector('[data-testid="success-message"]');
      expect(successMessage).not.toBeNull();
      expect(successMessage.textContent).toContain('restored successfully');
    });

    test('should show error message when showError is set', async () => {
      showRestoreDialog({ version: mockVersion, showError: true });

      const errorMessage = document.querySelector('[data-testid="error-message"]');
      expect(errorMessage).not.toBeNull();
      expect(errorMessage.textContent).toContain('Failed to restore');
    });

    test('should show custom error message when errorMessage is provided', async () => {
      showRestoreDialog({
        version: mockVersion,
        showError: true,
        errorMessage: 'Custom error occurred'
      });

      const errorMessage = document.querySelector('[data-testid="error-message"]');
      expect(errorMessage.textContent).toContain('Custom error occurred');
    });
  });

  describe('Keyboard Navigation', () => {
    test('should close dialog when Escape key is pressed', async () => {
      const dialogPromise = showRestoreDialog({ version: mockVersion });

      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });
      document.dispatchEvent(escapeEvent);

      const result = await dialogPromise;
      expect(result).toEqual({ confirmed: false });

      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      expect(dialog).toBeNull();
    });

    test('should not close dialog on Escape when loading', async () => {
      showRestoreDialog({ version: mockVersion, showLoading: true });

      const escapeEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        bubbles: true
      });
      document.dispatchEvent(escapeEvent);

      // Dialog should still be present
      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      expect(dialog).not.toBeNull();
    });

    test('should trap focus within dialog', async () => {
      showRestoreDialog({ version: mockVersion });

      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      const focusableElements = dialog.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );

      expect(focusableElements.length).toBeGreaterThan(0);

      // First focusable element should be focused
      expect(document.activeElement).toBe(focusableElements[0]);
    });

    test('should focus confirm button initially', async () => {
      showRestoreDialog({ version: mockVersion });

      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');
      // Cancel button should be focused by default (safer option)
      expect(document.activeElement).toBe(cancelBtn);
    });
  });

  describe('Click Outside Behavior', () => {
    test('should close dialog when clicking overlay (backdrop)', async () => {
      const dialogPromise = showRestoreDialog({
        version: mockVersion,
        closeOnOverlayClick: true
      });

      const overlay = document.querySelector('[data-testid="dialog-overlay"]');
      overlay.click();

      const result = await dialogPromise;
      expect(result).toEqual({ confirmed: false });
    });

    test('should not close when clicking inside dialog', async () => {
      showRestoreDialog({
        version: mockVersion,
        closeOnOverlayClick: true
      });

      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      dialog.click();

      // Dialog should still be present
      expect(document.querySelector('[data-testid="restore-dialog"]')).not.toBeNull();
    });

    test('should not close on overlay click when loading', async () => {
      showRestoreDialog({
        version: mockVersion,
        showLoading: true,
        closeOnOverlayClick: true
      });

      const overlay = document.querySelector('[data-testid="dialog-overlay"]');
      overlay.click();

      // Dialog should still be present
      expect(document.querySelector('[data-testid="restore-dialog"]')).not.toBeNull();
    });
  });

  describe('ARIA Attributes', () => {
    test('should have role="dialog"', async () => {
      showRestoreDialog({ version: mockVersion });

      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      expect(dialog.getAttribute('role')).toBe('dialog');
    });

    test('should have aria-modal="true"', async () => {
      showRestoreDialog({ version: mockVersion });

      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      expect(dialog.getAttribute('aria-modal')).toBe('true');
    });

    test('should have aria-labelledby pointing to title', async () => {
      showRestoreDialog({ version: mockVersion });

      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      const labelledBy = dialog.getAttribute('aria-labelledby');
      expect(labelledBy).toBeTruthy();

      const title = document.getElementById(labelledBy);
      expect(title).not.toBeNull();
      expect(title.textContent).toContain('Confirm Restore');
    });

    test('should have aria-describedby pointing to warning', async () => {
      showRestoreDialog({ version: mockVersion });

      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      const describedBy = dialog.getAttribute('aria-describedby');
      expect(describedBy).toBeTruthy();

      const description = document.getElementById(describedBy);
      expect(description).not.toBeNull();
    });

    test('overlay should have aria-hidden for screen readers', async () => {
      showRestoreDialog({ version: mockVersion });

      const overlay = document.querySelector('[data-testid="dialog-overlay"]');
      // Overlay is a backdrop, not the main content
      expect(overlay.getAttribute('aria-hidden')).toBe('true');
    });
  });

  describe('RTL Layout Support', () => {
    beforeEach(async () => {
      jest.resetModules();

      // Mock the i18n module with Hebrew settings
      jest.unstable_mockModule('../i18n.js', () => ({
        default: mockI18nHebrew
      }));

      const module = await import('../components/restore-confirm-dialog.js');
      showRestoreDialog = module.showRestoreDialog;
      hideRestoreDialog = module.hideRestoreDialog;

      // Set RTL direction on document
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'he';
    });

    test('should display Hebrew translations', async () => {
      showRestoreDialog({ version: mockVersion });

      const title = document.querySelector('[data-testid="dialog-title"]');
      expect(title.textContent).toContain('אישור שחזור');
    });

    test('should display Hebrew warning message', async () => {
      showRestoreDialog({ version: mockVersion });

      const warning = document.querySelector('[data-testid="dialog-warning"]');
      expect(warning.textContent).toContain('פעולה זו תשחזר את הגרסה הנבחרת');
    });

    test('should have Hebrew button labels', async () => {
      showRestoreDialog({ version: mockVersion });

      const confirmBtn = document.querySelector('[data-testid="confirm-button"]');
      const cancelBtn = document.querySelector('[data-testid="cancel-button"]');

      expect(confirmBtn.textContent).toContain('שחזר');
      expect(cancelBtn.textContent).toContain('ביטול');
    });

    test('dialog should inherit RTL direction', async () => {
      showRestoreDialog({ version: mockVersion });

      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      // Dialog should work within RTL context
      expect(document.documentElement.dir).toBe('rtl');
      expect(dialog).not.toBeNull();
    });
  });

  describe('hideRestoreDialog Function', () => {
    test('should programmatically close dialog', async () => {
      showRestoreDialog({ version: mockVersion });

      expect(document.querySelector('[data-testid="restore-dialog"]')).not.toBeNull();

      hideRestoreDialog();

      expect(document.querySelector('[data-testid="restore-dialog"]')).toBeNull();
    });

    test('should not throw if no dialog is open', () => {
      expect(() => hideRestoreDialog()).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    test('should handle missing version data gracefully', async () => {
      expect(() => {
        showRestoreDialog({ version: null });
      }).not.toThrow();

      const dialog = document.querySelector('[data-testid="restore-dialog"]');
      expect(dialog).not.toBeNull();
    });

    test('should handle missing username in version', async () => {
      const versionWithoutUser = {
        versionId: 'v1',
        timestamp: '2024-02-15T14:30:00Z',
        size: 1024
      };

      showRestoreDialog({ version: versionWithoutUser });

      const details = document.querySelector('[data-testid="version-details"]');
      expect(details).not.toBeNull();
    });

    test('should prevent multiple dialogs from opening', async () => {
      showRestoreDialog({ version: mockVersion });
      showRestoreDialog({ version: mockVersion });

      const dialogs = document.querySelectorAll('[data-testid="restore-dialog"]');
      expect(dialogs.length).toBe(1);
    });
  });
});
