/**
 * @jest-environment jsdom
 *
 * Regression test for the admin "Reset password" EMAIL FLOOD (#7).
 *
 * Bug: every visit to the Users tab calls initUserManagement() again, which
 * (a) creates a fresh UserList that re-binds another delegated click listener
 *     on the SAME persistent #user-list-container element, and
 * (b) re-runs user-management's setupEventListeners() which binds another set of
 *     user-edit / user-delete / user-reset-password listeners on that same
 *     persistent container — with NO guard at all.
 * Net: after N visits, a single physical "Reset password" click fans out to N
 * handlers → N user-reset-password dispatches → N userService.resetPassword()
 * calls → N Cognito reset emails. Edit + Delete multi-dispatch identically.
 *
 * This test visits the Users view THREE times (three initUserManagement calls),
 * then issues exactly ONE click of each action and asserts exactly ONE downstream
 * effect. SAFETY: ../user-service.js is fully mocked, so no real Cognito reset /
 * email is ever triggered.
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// SAFETY: mock the service so resetPassword never hits the network / Cognito.
const mockResetPassword = jest.fn(async () => ({ success: true }));
const mockListUsers = jest.fn(async () => ({
  users: [
    { username: 'editor1', email: 'editor1@example.com', role: 'editor', status: 'Enabled', created: '2024-02-20T14:15:00Z' },
    { username: 'editor2', email: 'editor2@example.com', role: 'editor', status: 'Enabled', created: '2024-03-01T09:00:00Z' }
  ],
  totalPages: 1,
  nextToken: null
}));

const mockShowEditUserDialog = jest.fn(async () => ({ success: false }));
const mockShowDeleteUserConfirmDialog = jest.fn(async () => ({ success: false }));
const mockShowCreateUserDialog = jest.fn(async () => ({ success: false }));

describe('Users view: action listeners are bound once across re-inits (#7 reset-password flood)', () => {
  let initUserManagement;

  beforeEach(async () => {
    jest.resetModules();

    // The persistent DOM the Users view wires up. showView() only toggles
    // .hidden — this container survives across visits.
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

    jest.unstable_mockModule('../app.js', () => ({
      showToast: jest.fn()
    }));

    jest.unstable_mockModule('../components/create-user-dialog.js', () => ({
      showCreateUserDialog: mockShowCreateUserDialog,
      hideCreateUserDialog: jest.fn()
    }));

    jest.unstable_mockModule('../components/edit-user-dialog.js', () => ({
      showEditUserDialog: mockShowEditUserDialog,
      hideEditUserDialog: jest.fn()
    }));

    jest.unstable_mockModule('../components/delete-user-confirm-dialog.js', () => ({
      showDeleteUserConfirmDialog: mockShowDeleteUserConfirmDialog,
      hideDeleteUserConfirmDialog: jest.fn()
    }));

    const module = await import('../components/user-management.js');
    initUserManagement = module.initUserManagement;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  // Simulate three visits to the Users tab. Each visit re-runs init exactly as
  // app.js's showView('users') does, against the SAME persistent container.
  async function visitUsersViewThreeTimes() {
    await initUserManagement();
    await initUserManagement();
    await initUserManagement();
  }

  function clickActionFor(testid, username) {
    const container = document.getElementById('user-list-container');
    const btn = container.querySelector(`[data-testid="${testid}"][data-username="${username}"]`);
    expect(btn).not.toBeNull();
    btn.click();
  }

  test('one Reset password click triggers exactly ONE resetPassword call after 3 visits', async () => {
    await visitUsersViewThreeTimes();

    clickActionFor('reset-password-button', 'editor1');
    // Let the async handler microtasks settle.
    await Promise.resolve();
    await Promise.resolve();

    expect(mockResetPassword).toHaveBeenCalledTimes(1);
    expect(mockResetPassword).toHaveBeenCalledWith('editor1');
  });

  test('one Delete click triggers exactly ONE delete-confirm flow after 3 visits', async () => {
    await visitUsersViewThreeTimes();

    clickActionFor('delete-button', 'editor1');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockShowDeleteUserConfirmDialog).toHaveBeenCalledTimes(1);
  });

  test('one Edit click triggers exactly ONE edit flow after 3 visits', async () => {
    await visitUsersViewThreeTimes();

    clickActionFor('edit-button', 'editor1');
    await Promise.resolve();
    await Promise.resolve();

    expect(mockShowEditUserDialog).toHaveBeenCalledTimes(1);
  });
});
