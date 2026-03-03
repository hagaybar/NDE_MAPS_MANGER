/**
 * @jest-environment jsdom
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Test suite for user-list component
// Following TDD methodology - RED phase

// Mock i18n module - English
const mockI18nEnglish = {
  locale: 'en',
  t: jest.fn((key) => {
    const translations = {
      'users.title': 'User Management',
      'users.username': 'Username',
      'users.email': 'Email',
      'users.role': 'Role',
      'users.status': 'Status',
      'users.created': 'Created',
      'users.actions': 'Actions',
      'users.edit': 'Edit',
      'users.delete': 'Delete',
      'users.resetPassword': 'Reset Password',
      'users.enabled': 'Enabled',
      'users.disabled': 'Disabled',
      'users.forceChangePassword': 'Must Change Password',
      'users.noUsers': 'No users found',
      'users.search': 'Search users...',
      'auth.admin': 'Admin',
      'auth.editor': 'Editor',
      'common.loading': 'Loading...',
      'common.error': 'An error occurred'
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
      'users.title': 'ניהול משתמשים',
      'users.username': 'שם משתמש',
      'users.email': 'דוא״ל',
      'users.role': 'תפקיד',
      'users.status': 'סטטוס',
      'users.created': 'נוצר',
      'users.actions': 'פעולות',
      'users.edit': 'עריכה',
      'users.delete': 'מחיקה',
      'users.resetPassword': 'איפוס סיסמה',
      'users.enabled': 'פעיל',
      'users.disabled': 'מושבת',
      'users.forceChangePassword': 'נדרש לשנות סיסמה',
      'users.noUsers': 'לא נמצאו משתמשים',
      'users.search': 'חיפוש משתמשים...',
      'auth.admin': 'מנהל',
      'auth.editor': 'עורך',
      'common.loading': 'טוען...',
      'common.error': 'אירעה שגיאה'
    };
    return translations[key] || key;
  }),
  isRTL: jest.fn(() => true),
  getLocale: jest.fn(() => 'he')
};

// Sample user data for tests
const mockUsers = [
  {
    username: 'admin_user',
    email: 'admin@example.com',
    role: 'admin',
    status: 'Enabled',
    created: '2024-01-15T10:30:00Z'
  },
  {
    username: 'editor1',
    email: 'editor1@example.com',
    role: 'editor',
    status: 'Enabled',
    created: '2024-02-20T14:15:00Z'
  },
  {
    username: 'editor2',
    email: 'editor2@example.com',
    role: 'editor',
    status: 'Disabled',
    created: '2024-03-01T09:00:00Z'
  },
  {
    username: 'new_user',
    email: 'newuser@example.com',
    role: 'editor',
    status: 'FORCE_CHANGE_PASSWORD',
    created: '2024-03-10T16:45:00Z'
  }
];

// More users for pagination tests
const generateManyUsers = (count) => {
  return Array.from({ length: count }, (_, i) => ({
    username: `user_${i + 1}`,
    email: `user${i + 1}@example.com`,
    role: i % 3 === 0 ? 'admin' : 'editor',
    status: 'Enabled',
    created: new Date(2024, 0, i + 1).toISOString()
  }));
};

describe('UserList Component', () => {
  let UserList;

  beforeEach(async () => {
    // Reset DOM
    document.body.innerHTML = '<div id="user-list"></div>';

    // Reset modules to clear cached imports
    jest.resetModules();

    // Mock the i18n module before importing user-list
    jest.unstable_mockModule('../i18n.js', () => ({
      default: mockI18nEnglish
    }));

    const module = await import('../components/user-list.js');
    UserList = module.default;
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    test('should create UserList instance with container element', () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);

      expect(userList).toBeInstanceOf(UserList);
    });

    test('should have init() method', () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);

      expect(typeof userList.init).toBe('function');
    });

    test('should have render() method', () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);

      expect(typeof userList.render).toBe('function');
    });

    test('should accept users array in init()', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);

      await userList.init({ users: mockUsers });

      const rows = document.querySelectorAll('[data-testid="user-row"]');
      expect(rows.length).toBe(4);
    });
  });

  describe('Table Structure', () => {
    test('should render table with correct columns', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const headers = document.querySelectorAll('th');
      const headerTexts = Array.from(headers).map(h => h.textContent.trim());

      expect(headerTexts).toContain('Username');
      expect(headerTexts).toContain('Role');
      expect(headerTexts).toContain('Status');
      expect(headerTexts).toContain('Created');
      expect(headerTexts).toContain('Actions');
    });

    test('should display username and email in first column', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const usernameCell = document.querySelector('[data-testid="user-username"]');
      expect(usernameCell.textContent).toContain('admin_user');
      expect(usernameCell.textContent).toContain('admin@example.com');
    });

    test('should display all users in the table', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const rows = document.querySelectorAll('[data-testid="user-row"]');
      expect(rows.length).toBe(4);
    });
  });

  describe('Role Badge Display', () => {
    test('should display Admin role as badge', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const adminBadge = document.querySelector('[data-testid="role-badge-admin"]');
      expect(adminBadge).not.toBeNull();
      expect(adminBadge.textContent.trim()).toBe('Admin');
    });

    test('should display Editor role as badge', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const editorBadges = document.querySelectorAll('[data-testid="role-badge-editor"]');
      expect(editorBadges.length).toBeGreaterThan(0);
      expect(editorBadges[0].textContent.trim()).toBe('Editor');
    });

    test('should style Admin badge differently from Editor badge', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const adminBadge = document.querySelector('[data-testid="role-badge-admin"]');
      const editorBadge = document.querySelector('[data-testid="role-badge-editor"]');

      // Admin badges should have different styling (e.g., different color class)
      expect(adminBadge.className).not.toBe(editorBadge.className);
    });
  });

  describe('Status Display', () => {
    test('should display Enabled status', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const enabledStatus = document.querySelector('[data-testid="status-enabled"]');
      expect(enabledStatus).not.toBeNull();
      expect(enabledStatus.textContent.trim()).toBe('Enabled');
    });

    test('should display Disabled status', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const disabledStatus = document.querySelector('[data-testid="status-disabled"]');
      expect(disabledStatus).not.toBeNull();
      expect(disabledStatus.textContent.trim()).toBe('Disabled');
    });

    test('should display Force Change Password status', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const forceChangeStatus = document.querySelector('[data-testid="status-force-change"]');
      expect(forceChangeStatus).not.toBeNull();
      expect(forceChangeStatus.textContent.trim()).toBe('Must Change Password');
    });
  });

  describe('Search/Filter Functionality', () => {
    test('should render search input', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const searchInput = document.querySelector('[data-testid="user-search"]');
      expect(searchInput).not.toBeNull();
      expect(searchInput.placeholder).toBe('Search users...');
    });

    test('should filter users by username', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const searchInput = document.querySelector('[data-testid="user-search"]');
      searchInput.value = 'admin';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      const rows = document.querySelectorAll('[data-testid="user-row"]');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('admin_user');
    });

    test('should filter users by email', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const searchInput = document.querySelector('[data-testid="user-search"]');
      searchInput.value = 'editor1@';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      const rows = document.querySelectorAll('[data-testid="user-row"]');
      expect(rows.length).toBe(1);
      expect(rows[0].textContent).toContain('editor1');
    });

    test('should show empty state when filter matches no users', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const searchInput = document.querySelector('[data-testid="user-search"]');
      searchInput.value = 'nonexistent';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      const emptyState = document.querySelector('[data-testid="empty-state"]');
      expect(emptyState).not.toBeNull();
      expect(emptyState.textContent).toContain('No users found');
    });

    test('should debounce search input', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      const renderSpy = jest.spyOn(userList, 'render');
      await userList.init({ users: mockUsers });

      renderSpy.mockClear();

      const searchInput = document.querySelector('[data-testid="user-search"]');

      // Type multiple characters quickly
      searchInput.value = 'a';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.value = 'ad';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));
      searchInput.value = 'adm';
      searchInput.dispatchEvent(new Event('input', { bubbles: true }));

      // Should not have rendered yet (within debounce time)
      expect(renderSpy).not.toHaveBeenCalled();

      // Wait for debounce
      await new Promise(resolve => setTimeout(resolve, 350));

      // Should render only once after debounce
      expect(renderSpy).toHaveBeenCalledTimes(1);
    });
  });

  describe('Pagination', () => {
    test('should show pagination controls when users exceed page size', async () => {
      const manyUsers = generateManyUsers(25);
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: manyUsers, pageSize: 10 });

      const pagination = document.querySelector('[data-testid="pagination"]');
      expect(pagination).not.toBeNull();
    });

    test('should display first page of users by default', async () => {
      const manyUsers = generateManyUsers(25);
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: manyUsers, pageSize: 10 });

      const rows = document.querySelectorAll('[data-testid="user-row"]');
      expect(rows.length).toBe(10);
    });

    test('should navigate to next page', async () => {
      const manyUsers = generateManyUsers(25);
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: manyUsers, pageSize: 10 });

      const nextButton = document.querySelector('[data-testid="pagination-next"]');
      nextButton.click();

      const rows = document.querySelectorAll('[data-testid="user-row"]');
      expect(rows.length).toBe(10);
      expect(rows[0].textContent).toContain('user_11');
    });

    test('should navigate to previous page', async () => {
      const manyUsers = generateManyUsers(25);
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: manyUsers, pageSize: 10 });

      // Go to page 2 first
      const nextButton = document.querySelector('[data-testid="pagination-next"]');
      nextButton.click();

      // Then go back
      const prevButton = document.querySelector('[data-testid="pagination-prev"]');
      prevButton.click();

      const rows = document.querySelectorAll('[data-testid="user-row"]');
      expect(rows[0].textContent).toContain('user_1');
    });

    test('should disable previous button on first page', async () => {
      const manyUsers = generateManyUsers(25);
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: manyUsers, pageSize: 10 });

      const prevButton = document.querySelector('[data-testid="pagination-prev"]');
      expect(prevButton.disabled).toBe(true);
    });

    test('should disable next button on last page', async () => {
      const manyUsers = generateManyUsers(25);
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: manyUsers, pageSize: 10 });

      // Go to last page - need to re-query after each click since DOM is re-rendered
      let nextButton = document.querySelector('[data-testid="pagination-next"]');
      nextButton.click();
      nextButton = document.querySelector('[data-testid="pagination-next"]');
      nextButton.click();

      // Re-query for the final state
      nextButton = document.querySelector('[data-testid="pagination-next"]');
      expect(nextButton.disabled).toBe(true);
    });

    test('should show page info (e.g., "1 of 3")', async () => {
      const manyUsers = generateManyUsers(25);
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: manyUsers, pageSize: 10 });

      const pageInfo = document.querySelector('[data-testid="pagination-info"]');
      expect(pageInfo.textContent).toContain('1');
      expect(pageInfo.textContent).toContain('3');
    });

    test('should not show pagination when users fit on one page', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers, pageSize: 10 });

      const pagination = document.querySelector('[data-testid="pagination"]');
      expect(pagination).toBeNull();
    });
  });

  describe('Action Buttons', () => {
    test('should render Edit button for each user', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const editButtons = document.querySelectorAll('[data-testid="edit-button"]');
      expect(editButtons.length).toBe(4);
    });

    test('should render Reset Password button for each user', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const resetButtons = document.querySelectorAll('[data-testid="reset-password-button"]');
      expect(resetButtons.length).toBe(4);
    });

    test('should render Delete button for each user', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const deleteButtons = document.querySelectorAll('[data-testid="delete-button"]');
      expect(deleteButtons.length).toBe(4);
    });

    test('should emit user-edit event when Edit is clicked', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const editEventHandler = jest.fn();
      container.addEventListener('user-edit', editEventHandler);

      const editButton = document.querySelector('[data-testid="edit-button"]');
      editButton.click();

      expect(editEventHandler).toHaveBeenCalled();
      expect(editEventHandler.mock.calls[0][0].detail.username).toBe('admin_user');
    });

    test('should emit user-reset-password event when Reset Password is clicked', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const resetEventHandler = jest.fn();
      container.addEventListener('user-reset-password', resetEventHandler);

      const resetButton = document.querySelector('[data-testid="reset-password-button"]');
      resetButton.click();

      expect(resetEventHandler).toHaveBeenCalled();
      expect(resetEventHandler.mock.calls[0][0].detail.username).toBe('admin_user');
    });

    test('should emit user-delete event when Delete is clicked', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const deleteEventHandler = jest.fn();
      container.addEventListener('user-delete', deleteEventHandler);

      const deleteButton = document.querySelector('[data-testid="delete-button"]');
      deleteButton.click();

      expect(deleteEventHandler).toHaveBeenCalled();
      expect(deleteEventHandler.mock.calls[0][0].detail.username).toBe('admin_user');
    });
  });

  describe('Empty State', () => {
    test('should show empty state when no users', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: [] });

      const emptyState = document.querySelector('[data-testid="empty-state"]');
      expect(emptyState).not.toBeNull();
      expect(emptyState.textContent).toContain('No users found');
    });
  });

  describe('Loading State', () => {
    test('should show loading state when loading is true', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: [], loading: true });

      const loadingState = document.querySelector('[data-testid="loading-state"]');
      expect(loadingState).not.toBeNull();
      expect(loadingState.textContent).toContain('Loading');
    });
  });

  describe('Date Formatting', () => {
    test('should format created date in English locale', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const dateCell = document.querySelector('[data-testid="user-created"]');
      // Should contain formatted date parts
      expect(dateCell.textContent).toMatch(/Jan|Feb|Mar|2024/);
    });
  });

  describe('RTL Layout Support', () => {
    beforeEach(async () => {
      jest.resetModules();

      // Mock the i18n module with Hebrew settings
      jest.unstable_mockModule('../i18n.js', () => ({
        default: mockI18nHebrew
      }));

      const module = await import('../components/user-list.js');
      UserList = module.default;

      // Set RTL direction on document
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'he';
    });

    test('should display Hebrew translations', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const headers = document.querySelectorAll('th');
      const headerTexts = Array.from(headers).map(h => h.textContent.trim());

      expect(headerTexts).toContain('שם משתמש');
      expect(headerTexts).toContain('תפקיד');
      expect(headerTexts).toContain('סטטוס');
    });

    test('should display Hebrew role badges', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const adminBadge = document.querySelector('[data-testid="role-badge-admin"]');
      expect(adminBadge.textContent.trim()).toBe('מנהל');
    });

    test('should display Hebrew status text', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const enabledStatus = document.querySelector('[data-testid="status-enabled"]');
      expect(enabledStatus.textContent.trim()).toBe('פעיל');
    });

    test('should use RTL-aware CSS classes', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      // Component should use text-start instead of text-left for RTL support
      const tableContainer = document.querySelector('table');
      expect(tableContainer).not.toBeNull();

      // Check that we're using logical CSS properties (text-start instead of text-left)
      const html = container.innerHTML;
      expect(html.includes('text-start') || !html.includes('text-left')).toBe(true);
    });
  });

  describe('Accessibility', () => {
    test('should have accessible table structure', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const table = document.querySelector('table');
      expect(table).not.toBeNull();

      const thead = document.querySelector('thead');
      const tbody = document.querySelector('tbody');
      expect(thead).not.toBeNull();
      expect(tbody).not.toBeNull();
    });

    test('should have scope="col" on column headers', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const headers = document.querySelectorAll('th');
      headers.forEach(header => {
        expect(header.getAttribute('scope')).toBe('col');
      });
    });

    test('should have aria-label on action buttons', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const editButton = document.querySelector('[data-testid="edit-button"]');
      const deleteButton = document.querySelector('[data-testid="delete-button"]');
      const resetButton = document.querySelector('[data-testid="reset-password-button"]');

      expect(editButton.getAttribute('aria-label')).toBeTruthy();
      expect(deleteButton.getAttribute('aria-label')).toBeTruthy();
      expect(resetButton.getAttribute('aria-label')).toBeTruthy();
    });

    test('should have accessible search input with label', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const searchInput = document.querySelector('[data-testid="user-search"]');
      expect(searchInput.getAttribute('aria-label') || searchInput.placeholder).toBeTruthy();
    });
  });

  describe('Tailwind CSS Styling', () => {
    test('should use Tailwind classes for table styling', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const table = document.querySelector('table');
      expect(table.className).toMatch(/min-w-full/);
    });

    test('should use Tailwind classes for badges', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const badge = document.querySelector('[data-testid="role-badge-admin"]');
      expect(badge.className).toMatch(/px-|py-|rounded/);
    });

    test('should use Tailwind classes for buttons', async () => {
      const container = document.getElementById('user-list');
      const userList = new UserList(container);
      await userList.init({ users: mockUsers });

      const button = document.querySelector('[data-testid="edit-button"]');
      expect(button.className).toMatch(/hover:|focus:/);
    });
  });
});
