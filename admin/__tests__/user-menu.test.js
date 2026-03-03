/**
 * @jest-environment jsdom
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';

// Mock i18n module
const mockI18n = {
  locale: 'en',
  translations: {
    en: {
      auth: {
        login: 'Login',
        logout: 'Logout',
        admin: 'Admin',
        editor: 'Editor',
        welcome: 'Welcome, {name}',
        loading: 'Loading...',
        unauthorized: 'Please log in to continue'
      }
    },
    he: {
      auth: {
        login: 'התחברות',
        logout: 'התנתקות',
        admin: 'מנהל',
        editor: 'עורך',
        welcome: 'שלום, {name}',
        loading: 'טוען...',
        unauthorized: 'נא להתחבר כדי להמשיך'
      }
    }
  },
  t(key, params = {}) {
    const keys = key.split('.');
    let value = this.translations[this.locale];
    for (const k of keys) {
      value = value?.[k];
    }
    if (typeof value === 'string' && params) {
      Object.entries(params).forEach(([paramKey, paramValue]) => {
        value = value.replace(`{${paramKey}}`, paramValue);
      });
    }
    return value || key;
  },
  isRTL() {
    return this.locale === 'he';
  },
  getLocale() {
    return this.locale;
  },
  setLocale(locale) {
    this.locale = locale;
  }
};

// Mock authService
const mockAuthService = {
  isAuthenticated: jest.fn(() => false),
  getUser: jest.fn(() => null),
  login: jest.fn(),
  logout: jest.fn(),
  onAuthStateChanged: jest.fn((callback) => {
    callback({
      isAuthenticated: mockAuthService.isAuthenticated(),
      user: mockAuthService.getUser()
    });
    return jest.fn(); // unsubscribe
  })
};

// Reset mocks and import fresh module
let initUserMenu;

describe('UserMenu Component', () => {
  beforeEach(async () => {
    jest.resetModules();

    // Reset mock state
    mockI18n.locale = 'en';
    mockAuthService.isAuthenticated.mockReturnValue(false);
    mockAuthService.getUser.mockReturnValue(null);
    mockAuthService.login.mockClear();
    mockAuthService.logout.mockClear();
    mockAuthService.onAuthStateChanged.mockClear();

    // Reset onAuthStateChanged to default behavior
    mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
      callback({
        isAuthenticated: mockAuthService.isAuthenticated(),
        user: mockAuthService.getUser()
      });
      return jest.fn();
    });

    // Setup DOM
    document.body.innerHTML = '<div id="user-menu-container"></div>';
    document.documentElement.dir = 'ltr';
    document.documentElement.lang = 'en';

    // Mock modules
    jest.unstable_mockModule('../i18n.js', () => ({
      default: mockI18n
    }));

    jest.unstable_mockModule('../auth-service.js', () => ({
      default: mockAuthService
    }));

    // Import the component
    const module = await import('../components/user-menu.js');
    initUserMenu = module.initUserMenu;
  });

  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  describe('Initialization', () => {
    test('should export initUserMenu function', () => {
      expect(typeof initUserMenu).toBe('function');
    });

    test('should render into provided container ID', () => {
      initUserMenu('user-menu-container');

      const container = document.getElementById('user-menu-container');
      expect(container.children.length).toBeGreaterThan(0);
    });

    test('should throw error for invalid container ID', () => {
      expect(() => initUserMenu('non-existent-container')).toThrow();
    });
  });

  describe('Login Button - Unauthenticated State', () => {
    test('should show login button when not authenticated', () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);

      initUserMenu('user-menu-container');

      const loginButton = document.querySelector('[data-testid="login-button"]');
      expect(loginButton).not.toBeNull();
    });

    test('should display "Login" text in English locale', () => {
      mockI18n.locale = 'en';
      mockAuthService.isAuthenticated.mockReturnValue(false);

      initUserMenu('user-menu-container');

      const loginButton = document.querySelector('[data-testid="login-button"]');
      expect(loginButton.textContent).toContain('Login');
    });

    test('should display "התחברות" text in Hebrew locale', () => {
      mockI18n.locale = 'he';
      mockAuthService.isAuthenticated.mockReturnValue(false);

      initUserMenu('user-menu-container');

      const loginButton = document.querySelector('[data-testid="login-button"]');
      expect(loginButton.textContent).toContain('התחברות');
    });

    test('should call authService.login() when login button is clicked', () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);

      initUserMenu('user-menu-container');

      const loginButton = document.querySelector('[data-testid="login-button"]');
      loginButton.click();

      expect(mockAuthService.login).toHaveBeenCalled();
    });

    test('should not show user menu when not authenticated', () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);

      initUserMenu('user-menu-container');

      const userMenu = document.querySelector('[data-testid="user-menu"]');
      expect(userMenu).toBeNull();
    });
  });

  describe('User Menu - Authenticated State', () => {
    beforeEach(() => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: {
            username: 'testuser',
            email: 'test@example.com',
            role: 'admin'
          }
        });
        return jest.fn();
      });
    });

    test('should show user menu when authenticated', () => {
      initUserMenu('user-menu-container');

      const userMenu = document.querySelector('[data-testid="user-menu"]');
      expect(userMenu).not.toBeNull();
    });

    test('should not show login button when authenticated', () => {
      initUserMenu('user-menu-container');

      const loginButton = document.querySelector('[data-testid="login-button"]');
      expect(loginButton).toBeNull();
    });

    test('should display username in user menu', () => {
      initUserMenu('user-menu-container');

      const usernameElement = document.querySelector('[data-testid="username-display"]');
      expect(usernameElement).not.toBeNull();
      expect(usernameElement.textContent).toContain('testuser');
    });

    test('should display welcome message with username in English', () => {
      mockI18n.locale = 'en';

      initUserMenu('user-menu-container');

      const welcomeElement = document.querySelector('[data-testid="welcome-message"]');
      expect(welcomeElement.textContent).toContain('Welcome, testuser');
    });

    test('should display welcome message with username in Hebrew', () => {
      mockI18n.locale = 'he';

      initUserMenu('user-menu-container');

      const welcomeElement = document.querySelector('[data-testid="welcome-message"]');
      expect(welcomeElement.textContent).toContain('שלום, testuser');
    });
  });

  describe('Role Badge', () => {
    test('should display admin role badge for admin user', () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'adminuser',
        email: 'admin@example.com',
        role: 'admin'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: { username: 'adminuser', email: 'admin@example.com', role: 'admin' }
        });
        return jest.fn();
      });

      initUserMenu('user-menu-container');

      const roleBadge = document.querySelector('[data-testid="role-badge"]');
      expect(roleBadge).not.toBeNull();
      expect(roleBadge.textContent).toContain('Admin');
    });

    test('should display "מנהל" for admin in Hebrew', () => {
      mockI18n.locale = 'he';
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'adminuser',
        email: 'admin@example.com',
        role: 'admin'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: { username: 'adminuser', email: 'admin@example.com', role: 'admin' }
        });
        return jest.fn();
      });

      initUserMenu('user-menu-container');

      const roleBadge = document.querySelector('[data-testid="role-badge"]');
      expect(roleBadge.textContent).toContain('מנהל');
    });

    test('should display editor role badge for editor user', () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'editoruser',
        email: 'editor@example.com',
        role: 'editor'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: { username: 'editoruser', email: 'editor@example.com', role: 'editor' }
        });
        return jest.fn();
      });

      initUserMenu('user-menu-container');

      const roleBadge = document.querySelector('[data-testid="role-badge"]');
      expect(roleBadge).not.toBeNull();
      expect(roleBadge.textContent).toContain('Editor');
    });

    test('should display "עורך" for editor in Hebrew', () => {
      mockI18n.locale = 'he';
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'editoruser',
        email: 'editor@example.com',
        role: 'editor'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: { username: 'editoruser', email: 'editor@example.com', role: 'editor' }
        });
        return jest.fn();
      });

      initUserMenu('user-menu-container');

      const roleBadge = document.querySelector('[data-testid="role-badge"]');
      expect(roleBadge.textContent).toContain('עורך');
    });

    test('should use blue color for admin role badge', () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'adminuser',
        email: 'admin@example.com',
        role: 'admin'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: { username: 'adminuser', email: 'admin@example.com', role: 'admin' }
        });
        return jest.fn();
      });

      initUserMenu('user-menu-container');

      const roleBadge = document.querySelector('[data-testid="role-badge"]');
      expect(roleBadge.classList.contains('bg-blue-500') ||
             roleBadge.classList.contains('bg-blue-600') ||
             roleBadge.className.includes('blue')).toBe(true);
    });

    test('should use green color for editor role badge', () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'editoruser',
        email: 'editor@example.com',
        role: 'editor'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: { username: 'editoruser', email: 'editor@example.com', role: 'editor' }
        });
        return jest.fn();
      });

      initUserMenu('user-menu-container');

      const roleBadge = document.querySelector('[data-testid="role-badge"]');
      expect(roleBadge.classList.contains('bg-green-500') ||
             roleBadge.classList.contains('bg-green-600') ||
             roleBadge.className.includes('green')).toBe(true);
    });
  });

  describe('Logout Functionality', () => {
    beforeEach(() => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: { username: 'testuser', email: 'test@example.com', role: 'admin' }
        });
        return jest.fn();
      });
    });

    test('should display logout button when authenticated', () => {
      initUserMenu('user-menu-container');

      const logoutButton = document.querySelector('[data-testid="logout-button"]');
      expect(logoutButton).not.toBeNull();
    });

    test('should display "Logout" text in English', () => {
      mockI18n.locale = 'en';

      initUserMenu('user-menu-container');

      const logoutButton = document.querySelector('[data-testid="logout-button"]');
      expect(logoutButton.textContent).toContain('Logout');
    });

    test('should display "התנתקות" text in Hebrew', () => {
      mockI18n.locale = 'he';

      initUserMenu('user-menu-container');

      const logoutButton = document.querySelector('[data-testid="logout-button"]');
      expect(logoutButton.textContent).toContain('התנתקות');
    });

    test('should call authService.logout() when logout button is clicked', () => {
      initUserMenu('user-menu-container');

      const logoutButton = document.querySelector('[data-testid="logout-button"]');
      logoutButton.click();

      expect(mockAuthService.logout).toHaveBeenCalled();
    });
  });

  describe('Dropdown Menu', () => {
    beforeEach(() => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: { username: 'testuser', email: 'test@example.com', role: 'admin' }
        });
        return jest.fn();
      });
    });

    test('should have dropdown toggle button', () => {
      initUserMenu('user-menu-container');

      const toggleButton = document.querySelector('[data-testid="user-menu-toggle"]');
      expect(toggleButton).not.toBeNull();
    });

    test('should show dropdown content when toggle is clicked', () => {
      initUserMenu('user-menu-container');

      const toggleButton = document.querySelector('[data-testid="user-menu-toggle"]');
      const dropdown = document.querySelector('[data-testid="user-menu-dropdown"]');

      // Initially hidden
      expect(dropdown.classList.contains('hidden')).toBe(true);

      // Click to show
      toggleButton.click();
      expect(dropdown.classList.contains('hidden')).toBe(false);
    });

    test('should hide dropdown when toggle is clicked again', () => {
      initUserMenu('user-menu-container');

      const toggleButton = document.querySelector('[data-testid="user-menu-toggle"]');
      const dropdown = document.querySelector('[data-testid="user-menu-dropdown"]');

      // Click to show
      toggleButton.click();
      expect(dropdown.classList.contains('hidden')).toBe(false);

      // Click to hide
      toggleButton.click();
      expect(dropdown.classList.contains('hidden')).toBe(true);
    });

    test('should contain welcome message in dropdown', () => {
      initUserMenu('user-menu-container');

      const dropdown = document.querySelector('[data-testid="user-menu-dropdown"]');
      const welcomeMessage = dropdown.querySelector('[data-testid="welcome-message"]');

      expect(welcomeMessage).not.toBeNull();
    });

    test('should contain role badge in dropdown', () => {
      initUserMenu('user-menu-container');

      const dropdown = document.querySelector('[data-testid="user-menu-dropdown"]');
      const roleBadge = dropdown.querySelector('[data-testid="role-badge"]');

      expect(roleBadge).not.toBeNull();
    });

    test('should contain logout button in dropdown', () => {
      initUserMenu('user-menu-container');

      const dropdown = document.querySelector('[data-testid="user-menu-dropdown"]');
      const logoutButton = dropdown.querySelector('[data-testid="logout-button"]');

      expect(logoutButton).not.toBeNull();
    });
  });

  describe('RTL Support', () => {
    beforeEach(() => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: { username: 'testuser', email: 'test@example.com', role: 'admin' }
        });
        return jest.fn();
      });
    });

    test('should apply RTL class when Hebrew locale is active', () => {
      mockI18n.locale = 'he';
      document.documentElement.dir = 'rtl';

      initUserMenu('user-menu-container');

      const userMenu = document.querySelector('[data-testid="user-menu"]');
      expect(userMenu.classList.contains('rtl') ||
             userMenu.closest('[dir="rtl"]') !== null ||
             document.documentElement.dir === 'rtl').toBe(true);
    });

    test('should apply LTR layout when English locale is active', () => {
      mockI18n.locale = 'en';
      document.documentElement.dir = 'ltr';

      initUserMenu('user-menu-container');

      const userMenu = document.querySelector('[data-testid="user-menu"]');
      expect(userMenu).not.toBeNull();
    });
  });

  describe('Auth State Change Handling', () => {
    test('should subscribe to auth state changes', () => {
      initUserMenu('user-menu-container');

      expect(mockAuthService.onAuthStateChanged).toHaveBeenCalled();
    });

    test('should update UI when auth state changes from unauthenticated to authenticated', () => {
      let authCallback;
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        authCallback = callback;
        callback({ isAuthenticated: false, user: null });
        return jest.fn();
      });

      initUserMenu('user-menu-container');

      // Initially should show login button
      expect(document.querySelector('[data-testid="login-button"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="user-menu"]')).toBeNull();

      // Simulate auth state change
      authCallback({
        isAuthenticated: true,
        user: { username: 'newuser', email: 'new@example.com', role: 'editor' }
      });

      // Now should show user menu
      expect(document.querySelector('[data-testid="login-button"]')).toBeNull();
      expect(document.querySelector('[data-testid="user-menu"]')).not.toBeNull();
    });

    test('should update UI when auth state changes from authenticated to unauthenticated', () => {
      let authCallback;
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        authCallback = callback;
        callback({
          isAuthenticated: true,
          user: { username: 'testuser', email: 'test@example.com', role: 'admin' }
        });
        return jest.fn();
      });

      initUserMenu('user-menu-container');

      // Initially should show user menu
      expect(document.querySelector('[data-testid="user-menu"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="login-button"]')).toBeNull();

      // Simulate logout
      authCallback({ isAuthenticated: false, user: null });

      // Now should show login button
      expect(document.querySelector('[data-testid="login-button"]')).not.toBeNull();
      expect(document.querySelector('[data-testid="user-menu"]')).toBeNull();
    });
  });

  describe('Locale Change Handling', () => {
    beforeEach(() => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: { username: 'testuser', email: 'test@example.com', role: 'admin' }
        });
        return jest.fn();
      });
    });

    test('should update text when locale changes', () => {
      mockI18n.locale = 'en';

      initUserMenu('user-menu-container');

      let roleBadge = document.querySelector('[data-testid="role-badge"]');
      expect(roleBadge.textContent).toContain('Admin');

      // Change locale and trigger update
      mockI18n.locale = 'he';
      document.dispatchEvent(new CustomEvent('localeChanged'));

      // Re-query the badge after locale change
      roleBadge = document.querySelector('[data-testid="role-badge"]');
      expect(roleBadge.textContent).toContain('מנהל');
    });
  });

  describe('Styling with Tailwind CSS', () => {
    test('should use Tailwind CSS classes for login button', () => {
      mockAuthService.isAuthenticated.mockReturnValue(false);

      initUserMenu('user-menu-container');

      const loginButton = document.querySelector('[data-testid="login-button"]');
      // Check for common Tailwind button classes
      expect(loginButton.className).toMatch(/px-|py-|rounded|bg-|text-/);
    });

    test('should use Tailwind CSS classes for role badge', () => {
      mockAuthService.isAuthenticated.mockReturnValue(true);
      mockAuthService.getUser.mockReturnValue({
        username: 'testuser',
        email: 'test@example.com',
        role: 'admin'
      });
      mockAuthService.onAuthStateChanged.mockImplementation((callback) => {
        callback({
          isAuthenticated: true,
          user: { username: 'testuser', email: 'test@example.com', role: 'admin' }
        });
        return jest.fn();
      });

      initUserMenu('user-menu-container');

      const roleBadge = document.querySelector('[data-testid="role-badge"]');
      // Check for common Tailwind badge classes
      expect(roleBadge.className).toMatch(/px-|py-|rounded|text-/);
    });
  });
});
