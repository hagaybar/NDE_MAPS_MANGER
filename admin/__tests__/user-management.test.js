/**
 * @jest-environment jsdom
 *
 * Reset-password flow (#152 redesign): clicking "Reset password" now SETS a
 * temporary password server-side (no email). The admin must see that returned
 * temporary password in the copyable dialog so they can relay it to the user.
 *
 * SAFETY: ../user-service.js is fully mocked — no real Cognito call is made.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

const mockResetPassword = jest.fn(async () => ({
  message: 'Temporary password set.',
  username: 'editor1',
  temporaryPassword: 'TMPxxxx9!'
}));
const mockListUsers = jest.fn(async () => ({
  users: [
    { username: 'editor1', email: 'editor1@example.com', role: 'editor', status: 'Enabled', created: '2024-02-20T14:15:00Z' }
  ],
  totalPages: 1,
  nextToken: null
}));

const mockShowTempPasswordDialog = jest.fn();
const mockShowToast = jest.fn();

describe('Users view: reset password shows the temporary password dialog (#152 redesign)', () => {
  let initUserManagement;

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
      resetPassword: mockResetPassword,
      createUser: jest.fn(),
      updateUser: jest.fn(),
      deleteUser: jest.fn(),
      default: {
        listUsers: mockListUsers,
        resetPassword: mockResetPassword,
        createUser: jest.fn(),
        updateUser: jest.fn(),
        deleteUser: jest.fn()
      }
    }));

    jest.unstable_mockModule('../app.js', () => ({ showToast: mockShowToast }));
    jest.unstable_mockModule('../components/create-user-dialog.js', () => ({ showCreateUserDialog: jest.fn(), hideCreateUserDialog: jest.fn() }));
    jest.unstable_mockModule('../components/edit-user-dialog.js', () => ({ showEditUserDialog: jest.fn(), hideEditUserDialog: jest.fn() }));
    jest.unstable_mockModule('../components/delete-user-confirm-dialog.js', () => ({ showDeleteUserConfirmDialog: jest.fn(), hideDeleteUserConfirmDialog: jest.fn() }));
    jest.unstable_mockModule('../components/temp-password-dialog.js', () => ({
      showTempPasswordDialog: mockShowTempPasswordDialog,
      hideTempPasswordDialog: jest.fn()
    }));

    const module = await import('../components/user-management.js');
    initUserManagement = module.initUserManagement;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  function clickReset(username) {
    const container = document.getElementById('user-list-container');
    const btn = container.querySelector(`[data-testid="reset-password-button"][data-username="${username}"]`);
    expect(btn).not.toBeNull();
    btn.click();
  }

  test('clicking Reset password shows the temp-password dialog with the returned password', async () => {
    await initUserManagement();

    clickReset('editor1');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockResetPassword).toHaveBeenCalledWith('editor1');
    expect(mockShowTempPasswordDialog).toHaveBeenCalledTimes(1);
    const arg = mockShowTempPasswordDialog.mock.calls[0][0];
    expect(arg.temporaryPassword).toBe('TMPxxxx9!');
    expect(arg.username).toBe('editor1@example.com');
  });

  test('does NOT use markResetSent / email semantics on success', async () => {
    await initUserManagement();

    clickReset('editor1');
    await Promise.resolve();
    await Promise.resolve();

    // The dialog is the success feedback; no "sent via email" toast is shown.
    const toastMessages = mockShowToast.mock.calls.map((c) => String(c[0]));
    toastMessages.forEach((m) => {
      expect(m.toLowerCase()).not.toContain('email');
      expect(m.toLowerCase()).not.toContain('code');
    });
  });
});
