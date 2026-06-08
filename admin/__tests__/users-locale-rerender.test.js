/**
 * @jest-environment jsdom
 *
 * Regression test for "Finding A": toggling the UI language while on the Users
 * screen flips direction (handled globally) but the Users LIST text does not
 * re-translate until some other action triggers a re-render.
 *
 * Root cause: the locale-change handler only re-paints static chrome; the Users
 * view never re-renders its component on `localeChanged`.
 *
 * This test renders the Users view in English, then switches the locale to
 * Hebrew (which dispatches `localeChanged`, exactly like the language toggle),
 * and asserts the list's "Reset password" button text re-translates with no
 * other interaction. SAFETY: ../user-service.js is fully mocked.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

const mockListUsers = jest.fn(async () => ({
  users: [
    { username: 'editor1', email: 'editor1@example.com', role: 'editor', status: 'Enabled', created: '2024-02-20T14:15:00Z' }
  ],
  totalPages: 1,
  nextToken: null
}));

describe('Users view re-translates on language toggle (Finding A)', () => {
  let initUserManagement;
  let i18n;

  beforeEach(async () => {
    jest.resetModules();

    document.body.innerHTML = `
      <div id="user-management">
        <button id="add-user-btn">Add user</button>
        <div id="user-list-container"></div>
      </div>
    `;

    jest.unstable_mockModule('../user-service.js', () => ({
      listUsers: mockListUsers,
      resetPassword: jest.fn(async () => ({ success: true })),
      createUser: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn(),
      default: { listUsers: mockListUsers, resetPassword: jest.fn(), createUser: jest.fn(), updateUser: jest.fn(), deleteUser: jest.fn() }
    }));
    jest.unstable_mockModule('../app.js', () => ({ showToast: jest.fn() }));
    jest.unstable_mockModule('../components/create-user-dialog.js', () => ({ showCreateUserDialog: jest.fn(), hideCreateUserDialog: jest.fn() }));
    jest.unstable_mockModule('../components/edit-user-dialog.js', () => ({ showEditUserDialog: jest.fn(), hideEditUserDialog: jest.fn() }));
    jest.unstable_mockModule('../components/delete-user-confirm-dialog.js', () => ({ showDeleteUserConfirmDialog: jest.fn(), hideDeleteUserConfirmDialog: jest.fn() }));

    const mgmt = await import('../components/user-management.js');
    initUserManagement = mgmt.initUserManagement;

    // Same singleton instance the components use (matching specifier incl. ?v=5).
    i18n = (await import('../i18n.js?v=5')).default;
    i18n.translations = {
      en: { users: { resetPassword: 'Reset password' } },
      he: { users: { resetPassword: 'איפוס סיסמה' } }
    };
    i18n.locale = 'en';
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function resetButtonText() {
    const btn = document.querySelector('[data-testid="reset-password-button"][data-username="editor1"]');
    expect(btn).not.toBeNull();
    return btn.textContent;
  }

  test('switching language re-translates the user list without any other action', async () => {
    await initUserManagement();
    expect(resetButtonText()).toContain('Reset password');

    // User toggles language while sitting on the Users screen (no clicks).
    i18n.setLocale('he');
    await Promise.resolve();

    expect(resetButtonText()).toContain('איפוס סיסמה');
  });
});
