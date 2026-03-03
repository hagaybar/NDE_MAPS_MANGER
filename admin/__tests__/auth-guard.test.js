/**
 * Auth Guard Tests
 * TDD tests for route protection and role-based UI visibility
 * @jest-environment jsdom
 */

import { jest } from '@jest/globals';

// Mock authService
const mockAuthService = {
  _authenticated: false,
  _user: null,
  _callbacks: [],

  init: jest.fn().mockResolvedValue(undefined),
  isAuthenticated: jest.fn(function() { return mockAuthService._authenticated; }),
  getUser: jest.fn(function() { return mockAuthService._user; }),
  login: jest.fn(),
  logout: jest.fn(),
  onAuthStateChanged: jest.fn(function(callback) {
    mockAuthService._callbacks.push(callback);
    callback(mockAuthService._authenticated, mockAuthService._user);
    return () => {
      const idx = mockAuthService._callbacks.indexOf(callback);
      if (idx > -1) mockAuthService._callbacks.splice(idx, 1);
    };
  }),

  _setAuthenticated(auth, user = null) {
    mockAuthService._authenticated = auth;
    mockAuthService._user = user;
    mockAuthService._callbacks.forEach(cb => cb(auth, user));
  },

  _reset() {
    mockAuthService._authenticated = false;
    mockAuthService._user = null;
    mockAuthService._callbacks = [];
    mockAuthService.init.mockClear();
    mockAuthService.login.mockClear();
    mockAuthService.logout.mockClear();
  }
};

const mockI18n = {
  t: jest.fn((key) => {
    const translations = {
      'auth.unauthorized': 'Please log in to continue',
      'auth.login': 'Login',
      'auth.permissionDenied': 'You do not have permission for this action'
    };
    return translations[key] || key;
  }),
  getLocale: jest.fn(() => 'en')
};

// Mock modules before importing
jest.unstable_mockModule('../auth-service.js', () => ({
  default: mockAuthService
}));

jest.unstable_mockModule('../i18n.js', () => ({
  default: mockI18n
}));

// Now import the module under test
const authGuardModule = await import('../auth-guard.js');
const {
  init,
  isAuthenticated,
  hasPermission,
  getRole,
  isAdmin,
  showIfAdmin,
  hideIfEditor,
  applyRoleBasedUI,
  requireAuth,
  requireAdmin,
  requirePermission
} = authGuardModule;

describe('Auth Guard', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    mockAuthService._reset();
    mockI18n.t.mockClear();
  });

  describe('isAuthenticated()', () => {
    it('should return false when not authenticated', () => {
      mockAuthService._authenticated = false;
      expect(isAuthenticated()).toBe(false);
    });

    it('should return true when authenticated', () => {
      mockAuthService._authenticated = true;
      expect(isAuthenticated()).toBe(true);
    });
  });

  describe('hasPermission()', () => {
    describe('Admin role', () => {
      beforeEach(async () => {
        mockAuthService._setAuthenticated(true, { username: 'admin', role: 'admin' });
        await init();
      });

      it('should allow read permission', () => {
        expect(hasPermission('read')).toBe(true);
      });

      it('should allow write permission', () => {
        expect(hasPermission('write')).toBe(true);
      });

      it('should allow delete permission', () => {
        expect(hasPermission('delete')).toBe(true);
      });

      it('should allow manage-users permission', () => {
        expect(hasPermission('manage-users')).toBe(true);
      });

      it('should allow restore-versions permission', () => {
        expect(hasPermission('restore-versions')).toBe(true);
      });
    });

    describe('Editor role', () => {
      beforeEach(async () => {
        mockAuthService._setAuthenticated(true, { username: 'editor', role: 'editor' });
        await init();
      });

      it('should allow read permission', () => {
        expect(hasPermission('read')).toBe(true);
      });

      it('should allow write permission', () => {
        expect(hasPermission('write')).toBe(true);
      });

      it('should deny delete permission', () => {
        expect(hasPermission('delete')).toBe(false);
      });

      it('should deny manage-users permission', () => {
        expect(hasPermission('manage-users')).toBe(false);
      });

      it('should allow restore-versions permission', () => {
        expect(hasPermission('restore-versions')).toBe(true);
      });
    });
  });

  describe('getRole()', () => {
    it('should return null when not authenticated', () => {
      mockAuthService._authenticated = false;
      expect(getRole()).toBe(null);
    });

    it('should return admin role', async () => {
      mockAuthService._setAuthenticated(true, { username: 'admin', role: 'admin' });
      await init();
      expect(getRole()).toBe('admin');
    });

    it('should return editor role', async () => {
      mockAuthService._setAuthenticated(true, { username: 'editor', role: 'editor' });
      await init();
      expect(getRole()).toBe('editor');
    });
  });

  describe('isAdmin()', () => {
    it('should return false when not authenticated', () => {
      expect(isAdmin()).toBe(false);
    });

    it('should return true for admin user', async () => {
      mockAuthService._setAuthenticated(true, { username: 'admin', role: 'admin' });
      await init();
      expect(isAdmin()).toBe(true);
    });

    it('should return false for editor user', async () => {
      mockAuthService._setAuthenticated(true, { username: 'editor', role: 'editor' });
      await init();
      expect(isAdmin()).toBe(false);
    });
  });

  describe('showIfAdmin()', () => {
    it('should show element for admin', async () => {
      mockAuthService._setAuthenticated(true, { username: 'admin', role: 'admin' });
      await init();

      const el = document.createElement('div');
      el.style.display = 'none';
      showIfAdmin(el);

      expect(el.style.display).toBe('');
    });

    it('should hide element for non-admin', async () => {
      mockAuthService._setAuthenticated(true, { username: 'editor', role: 'editor' });
      await init();

      const el = document.createElement('div');
      showIfAdmin(el);

      expect(el.style.display).toBe('none');
    });

    it('should handle null element', () => {
      expect(() => showIfAdmin(null)).not.toThrow();
    });
  });

  describe('hideIfEditor()', () => {
    it('should hide element for editor', async () => {
      mockAuthService._setAuthenticated(true, { username: 'editor', role: 'editor' });
      await init();

      const el = document.createElement('div');
      hideIfEditor(el);

      expect(el.style.display).toBe('none');
    });

    it('should show element for admin', async () => {
      mockAuthService._setAuthenticated(true, { username: 'admin', role: 'admin' });
      await init();

      const el = document.createElement('div');
      el.style.display = 'none';
      hideIfEditor(el);

      expect(el.style.display).toBe('');
    });
  });

  describe('applyRoleBasedUI()', () => {
    it('should hide admin-only elements for editor', async () => {
      mockAuthService._setAuthenticated(true, { username: 'editor', role: 'editor' });
      await init();

      const adminBtn = document.createElement('button');
      adminBtn.setAttribute('data-role-required', 'admin');
      document.body.appendChild(adminBtn);

      applyRoleBasedUI();

      expect(adminBtn.style.display).toBe('none');
    });

    it('should show admin-only elements for admin', async () => {
      mockAuthService._setAuthenticated(true, { username: 'admin', role: 'admin' });
      await init();

      const adminBtn = document.createElement('button');
      adminBtn.setAttribute('data-role-required', 'admin');
      adminBtn.style.display = 'none';
      document.body.appendChild(adminBtn);

      applyRoleBasedUI();

      expect(adminBtn.style.display).toBe('');
    });
  });

  describe('requireAuth()', () => {
    it('should call function when authenticated', async () => {
      mockAuthService._setAuthenticated(true, { username: 'user', role: 'editor' });
      await init();

      const mockFn = jest.fn().mockReturnValue('result');
      const guarded = requireAuth(mockFn);
      const result = await guarded('arg');

      expect(mockFn).toHaveBeenCalledWith('arg');
      expect(result).toBe('result');
    });

    it('should not call function when not authenticated', async () => {
      mockAuthService._authenticated = false;

      const mockFn = jest.fn();
      const guarded = requireAuth(mockFn);
      const result = await guarded();

      expect(mockFn).not.toHaveBeenCalled();
      expect(result).toBe(null);
    });
  });

  describe('requireAdmin()', () => {
    it('should call function for admin', async () => {
      mockAuthService._setAuthenticated(true, { username: 'admin', role: 'admin' });
      await init();

      const mockFn = jest.fn().mockReturnValue('result');
      const guarded = requireAdmin(mockFn);
      const result = await guarded();

      expect(mockFn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should not call function for editor', async () => {
      mockAuthService._setAuthenticated(true, { username: 'editor', role: 'editor' });
      await init();

      const mockFn = jest.fn();
      const guarded = requireAdmin(mockFn);
      const result = await guarded();

      expect(mockFn).not.toHaveBeenCalled();
      expect(result).toBe(null);
    });
  });

  describe('requirePermission()', () => {
    it('should call function when user has permission', async () => {
      mockAuthService._setAuthenticated(true, { username: 'editor', role: 'editor' });
      await init();

      const mockFn = jest.fn().mockReturnValue('result');
      const guarded = requirePermission('write', mockFn);
      const result = await guarded();

      expect(mockFn).toHaveBeenCalled();
      expect(result).toBe('result');
    });

    it('should not call function when user lacks permission', async () => {
      mockAuthService._setAuthenticated(true, { username: 'editor', role: 'editor' });
      await init();

      const mockFn = jest.fn();
      const guarded = requirePermission('delete', mockFn);
      const result = await guarded();

      expect(mockFn).not.toHaveBeenCalled();
      expect(result).toBe(null);
    });
  });
});
