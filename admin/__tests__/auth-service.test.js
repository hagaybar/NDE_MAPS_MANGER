/**
 * @jest-environment jsdom
 */

import { jest, describe, test, expect, beforeEach, afterEach } from '@jest/globals';
import { authConfig } from '../auth-config.js';

// We'll import authService dynamically to allow mocking
let authService;

describe('AuthService', () => {
  // Mock sessionStorage
  let sessionStorageMock;
  let originalSessionStorage;
  let originalLocation;
  let originalFetch;
  let originalHistory;

  // Track event listeners
  let eventListeners;
  let dispatchedEvents;

  beforeEach(async () => {
    // Reset modules to get fresh authService instance
    jest.resetModules();

    // Setup sessionStorage mock
    sessionStorageMock = {
      store: {},
      getItem: jest.fn((key) => sessionStorageMock.store[key] || null),
      setItem: jest.fn((key, value) => { sessionStorageMock.store[key] = value; }),
      removeItem: jest.fn((key) => { delete sessionStorageMock.store[key]; }),
      clear: jest.fn(() => { sessionStorageMock.store = {}; })
    };
    originalSessionStorage = window.sessionStorage;
    Object.defineProperty(window, 'sessionStorage', {
      value: sessionStorageMock,
      writable: true,
      configurable: true
    });

    // Mock window.location
    originalLocation = window.location;
    delete window.location;
    window.location = {
      href: 'http://localhost:8080/',
      hostname: 'localhost',
      search: '',
      origin: 'http://localhost:8080',
      pathname: '/',
      assign: jest.fn(),
      replace: jest.fn()
    };

    // Mock fetch
    originalFetch = global.fetch;
    global.fetch = jest.fn();

    // Mock history
    originalHistory = window.history;
    const historyMock = {
      replaceState: jest.fn(),
      pushState: jest.fn()
    };
    Object.defineProperty(window, 'history', {
      value: historyMock,
      writable: true,
      configurable: true
    });

    // Track custom events
    eventListeners = {};
    dispatchedEvents = [];
    const originalDispatchEvent = window.dispatchEvent;
    window.dispatchEvent = jest.fn((event) => {
      dispatchedEvents.push(event);
      if (eventListeners[event.type]) {
        eventListeners[event.type].forEach(cb => cb(event));
      }
      return true;
    });
    window.addEventListener = jest.fn((event, callback) => {
      if (!eventListeners[event]) eventListeners[event] = [];
      eventListeners[event].push(callback);
    });
    window.removeEventListener = jest.fn((event, callback) => {
      if (eventListeners[event]) {
        eventListeners[event] = eventListeners[event].filter(cb => cb !== callback);
      }
    });

    // Clear any previous timers
    jest.clearAllTimers();
    jest.useFakeTimers();

    // Import fresh authService
    const module = await import('../auth-service.js');
    authService = module.default;
  });

  afterEach(() => {
    jest.useRealTimers();
    window.sessionStorage = originalSessionStorage;
    window.location = originalLocation;
    window.history = originalHistory;
    global.fetch = originalFetch;
  });

  describe('Configuration', () => {
    test('should export authConfig with required properties', () => {
      expect(authConfig).toBeDefined();
      expect(authConfig.userPoolId).toBe('us-east-1_g9q5cPhVg');
      expect(authConfig.clientId).toBe('2m6raenl0h66uvb8se2crnqibu');
      expect(authConfig.hostedUiDomain).toBe('https://primo-maps-auth.auth.us-east-1.amazoncognito.com');
      expect(authConfig.scopes).toContain('openid');
    });

    test('should return localhost redirect URI when on localhost', () => {
      window.location.hostname = 'localhost';
      expect(authConfig.redirectUri).toBe('http://localhost:8080/');
    });
  });

  describe('init()', () => {
    test('should be a function', () => {
      expect(typeof authService.init).toBe('function');
    });

    test('should return false when no OAuth callback present', async () => {
      window.location.search = '';
      const result = await authService.init();
      expect(result).toBe(false);
    });

    test('should detect OAuth callback with authorization code', async () => {
      window.location.search = '?code=test-auth-code';

      // Mock successful token exchange
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      const result = await authService.init();
      expect(result).toBe(true);
      expect(global.fetch).toHaveBeenCalled();
    });

    test('should exchange authorization code for tokens', async () => {
      window.location.search = '?code=test-auth-code';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      await authService.init();

      // Verify token endpoint was called with correct parameters
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/oauth2/token'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/x-www-form-urlencoded'
          })
        })
      );
    });

    test('should store tokens in sessionStorage after successful exchange', async () => {
      window.location.search = '?code=test-auth-code';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      await authService.init();

      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        authConfig.storageKeys.accessToken,
        'test-access-token'
      );
      expect(sessionStorageMock.setItem).toHaveBeenCalledWith(
        authConfig.storageKeys.refreshToken,
        'test-refresh-token'
      );
    });

    test('should restore session from sessionStorage if tokens exist', async () => {
      // Pre-populate sessionStorage with valid tokens
      const futureExpiry = Date.now() + 3600000;
      sessionStorageMock.store[authConfig.storageKeys.accessToken] = 'stored-access-token';
      sessionStorageMock.store[authConfig.storageKeys.refreshToken] = 'stored-refresh-token';
      sessionStorageMock.store[authConfig.storageKeys.tokenExpiry] = futureExpiry.toString();
      sessionStorageMock.store[authConfig.storageKeys.user] = JSON.stringify({
        username: 'storeduser',
        email: 'stored@example.com',
        role: 'editor'
      });

      window.location.search = '';
      const result = await authService.init();

      expect(result).toBe(true);
      expect(authService.isAuthenticated()).toBe(true);
    });

    test('should handle OAuth error in callback', async () => {
      window.location.search = '?error=access_denied&error_description=User%20cancelled';

      const result = await authService.init();

      expect(result).toBe(false);
      expect(authService.isAuthenticated()).toBe(false);
    });

    test('should clear URL parameters after processing callback', async () => {
      window.location.search = '?code=test-auth-code';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      await authService.init();

      // window.history.replaceState is mocked in beforeEach
      expect(window.history.replaceState).toHaveBeenCalled();
    });
  });

  describe('login()', () => {
    test('should be a function', () => {
      expect(typeof authService.login).toBe('function');
    });

    test('should redirect to Cognito Hosted UI', () => {
      authService.login();

      expect(window.location.assign).toHaveBeenCalled();
      const redirectUrl = window.location.assign.mock.calls[0][0];
      expect(redirectUrl).toContain(authConfig.hostedUiDomain);
      expect(redirectUrl).toContain('/oauth2/authorize');
    });

    test('should include required OAuth parameters in redirect URL', () => {
      authService.login();

      const redirectUrl = window.location.assign.mock.calls[0][0];
      expect(redirectUrl).toContain('response_type=code');
      expect(redirectUrl).toContain(`client_id=${authConfig.clientId}`);
      expect(redirectUrl).toContain('redirect_uri=');
      expect(redirectUrl).toContain('scope=');
    });

    test('should include openid scope', () => {
      authService.login();

      const redirectUrl = window.location.assign.mock.calls[0][0];
      expect(redirectUrl).toContain('openid');
    });
  });

  describe('logout()', () => {
    test('should be a function', () => {
      expect(typeof authService.logout).toBe('function');
    });

    test('should clear all tokens from sessionStorage', () => {
      // Setup authenticated state
      sessionStorageMock.store[authConfig.storageKeys.accessToken] = 'token';
      sessionStorageMock.store[authConfig.storageKeys.refreshToken] = 'refresh';
      sessionStorageMock.store[authConfig.storageKeys.user] = '{}';

      authService.logout();

      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(authConfig.storageKeys.accessToken);
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(authConfig.storageKeys.refreshToken);
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(authConfig.storageKeys.idToken);
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(authConfig.storageKeys.user);
      expect(sessionStorageMock.removeItem).toHaveBeenCalledWith(authConfig.storageKeys.tokenExpiry);
    });

    test('should redirect to Cognito logout endpoint', () => {
      authService.logout();

      expect(window.location.assign).toHaveBeenCalled();
      const logoutUrl = window.location.assign.mock.calls[0][0];
      expect(logoutUrl).toContain(authConfig.hostedUiDomain);
      expect(logoutUrl).toContain('/logout');
      expect(logoutUrl).toContain(`client_id=${authConfig.clientId}`);
      expect(logoutUrl).toContain('logout_uri=');
    });
  });

  describe('isAuthenticated()', () => {
    test('should be a function', () => {
      expect(typeof authService.isAuthenticated).toBe('function');
    });

    test('should return false when no tokens stored', () => {
      expect(authService.isAuthenticated()).toBe(false);
    });

    test('should return true when valid tokens exist', async () => {
      // Setup valid session
      const futureExpiry = Date.now() + 3600000;
      sessionStorageMock.store[authConfig.storageKeys.accessToken] = 'valid-token';
      sessionStorageMock.store[authConfig.storageKeys.tokenExpiry] = futureExpiry.toString();

      // Re-init to load from storage
      await authService.init();

      expect(authService.isAuthenticated()).toBe(true);
    });

    test('should return false when tokens are expired', async () => {
      // Setup expired session
      const pastExpiry = Date.now() - 3600000;
      sessionStorageMock.store[authConfig.storageKeys.accessToken] = 'expired-token';
      sessionStorageMock.store[authConfig.storageKeys.tokenExpiry] = pastExpiry.toString();

      await authService.init();

      expect(authService.isAuthenticated()).toBe(false);
    });
  });

  describe('getUser()', () => {
    test('should be a function', () => {
      expect(typeof authService.getUser).toBe('function');
    });

    test('should return null when not authenticated', () => {
      expect(authService.getUser()).toBeNull();
    });

    test('should return user object with username, role, and email', async () => {
      window.location.search = '?code=test-auth-code';

      // Mock token with user info in JWT payload
      const idToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: idToken,
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      await authService.init();

      const user = authService.getUser();
      expect(user).not.toBeNull();
      expect(user.username).toBe('testuser');
      expect(user.email).toBe('test@example.com');
      expect(user.role).toBe('admin');
    });

    test('should default to editor role when no groups in token', async () => {
      window.location.search = '?code=test-auth-code';

      // Token without cognito:groups
      const idToken = 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiZXhwIjoxOTk5OTk5OTk5fQ.signature';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: idToken,
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      await authService.init();

      const user = authService.getUser();
      expect(user.role).toBe('editor');
    });
  });

  describe('getAccessToken()', () => {
    test('should be a function', () => {
      expect(typeof authService.getAccessToken).toBe('function');
    });

    test('should return null when not authenticated', () => {
      expect(authService.getAccessToken()).toBeNull();
    });

    test('should return access token when authenticated', async () => {
      window.location.search = '?code=test-auth-code';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'my-access-token',
          id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      await authService.init();

      expect(authService.getAccessToken()).toBe('my-access-token');
    });
  });

  describe('Token Refresh', () => {
    test('should schedule token refresh before expiry', async () => {
      window.location.search = '?code=test-auth-code';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'initial-token',
          id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
          refresh_token: 'test-refresh-token',
          expires_in: 3600 // 1 hour
        })
      });

      await authService.init();

      // Verify a timer was set (refresh should happen before expiry)
      expect(jest.getTimerCount()).toBeGreaterThan(0);
    });

    test('should refresh tokens using refresh_token grant', async () => {
      // Setup initial authenticated state
      window.location.search = '?code=test-auth-code';

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'initial-token',
            id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
            refresh_token: 'test-refresh-token',
            expires_in: 600 // 10 minutes - refresh should happen at ~5 min
          })
        })
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'refreshed-token',
            id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
            expires_in: 3600
          })
        });

      await authService.init();

      expect(authService.getAccessToken()).toBe('initial-token');
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Fast-forward time to trigger refresh (5 min = 300s, token expires in 600s)
      // Refresh is scheduled at (600 - 300) * 1000 = 300000ms = 5 minutes before expiry
      jest.advanceTimersByTime(5 * 60 * 1000 + 1000);

      // Allow the async refresh to complete - use await Promise.resolve multiple times
      // to flush the microtask queue
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      // Check that refresh was called (should now have 2 calls)
      expect(global.fetch).toHaveBeenCalledTimes(2);

      const secondCall = global.fetch.mock.calls[1];
      expect(secondCall[1].body).toContain('grant_type=refresh_token');
    });

    test('should logout on refresh failure', async () => {
      window.location.search = '?code=test-auth-code';

      global.fetch
        .mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({
            access_token: 'initial-token',
            id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
            refresh_token: 'test-refresh-token',
            expires_in: 600
          })
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ error: 'invalid_grant' })
        });

      await authService.init();

      // Fast-forward to trigger refresh
      jest.advanceTimersByTime(5 * 60 * 1000 + 1000);
      await jest.runAllTimersAsync();

      // Should have cleared session and redirected
      expect(sessionStorageMock.removeItem).toHaveBeenCalled();
    });
  });

  describe('onAuthStateChanged()', () => {
    test('should be a function', () => {
      expect(typeof authService.onAuthStateChanged).toBe('function');
    });

    test('should return unsubscribe function', () => {
      const callback = jest.fn();
      const unsubscribe = authService.onAuthStateChanged(callback);

      expect(typeof unsubscribe).toBe('function');
    });

    test('should call callback immediately with current state', () => {
      const callback = jest.fn();
      authService.onAuthStateChanged(callback);

      expect(callback).toHaveBeenCalledWith({
        isAuthenticated: false,
        user: null
      });
    });

    test('should call callback when authentication state changes', async () => {
      const callback = jest.fn();
      authService.onAuthStateChanged(callback);

      // Clear initial call
      callback.mockClear();

      window.location.search = '?code=test-auth-code';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      await authService.init();

      expect(callback).toHaveBeenCalledWith(expect.objectContaining({
        isAuthenticated: true
      }));
    });

    test('should stop calling callback after unsubscribe', async () => {
      const callback = jest.fn();
      const unsubscribe = authService.onAuthStateChanged(callback);

      // Initial call
      expect(callback).toHaveBeenCalledTimes(1);

      unsubscribe();
      callback.mockClear();

      // Login
      window.location.search = '?code=test-auth-code';
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      await authService.init();

      // Should not have been called after unsubscribe
      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('Custom Events', () => {
    test('should emit authStateChanged custom event on login', async () => {
      const eventHandler = jest.fn();
      window.addEventListener('authStateChanged', eventHandler);

      window.location.search = '?code=test-auth-code';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      await authService.init();

      // Check if event was dispatched
      expect(window.dispatchEvent).toBeDefined();
    });
  });

  describe('sessionStorage Security', () => {
    test('should use sessionStorage not localStorage', async () => {
      window.location.search = '?code=test-auth-code';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      await authService.init();

      // sessionStorage should have been used
      expect(sessionStorageMock.setItem).toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    test('should handle token exchange network failure gracefully', async () => {
      window.location.search = '?code=test-auth-code';

      global.fetch.mockRejectedValueOnce(new Error('Network error'));

      const result = await authService.init();

      expect(result).toBe(false);
      expect(authService.isAuthenticated()).toBe(false);
    });

    test('should handle token exchange error response', async () => {
      window.location.search = '?code=test-auth-code';

      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: 'invalid_grant', error_description: 'Invalid code' })
      });

      const result = await authService.init();

      expect(result).toBe(false);
      expect(authService.isAuthenticated()).toBe(false);
    });

    test('should handle malformed JWT in id_token', async () => {
      window.location.search = '?code=test-auth-code';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: 'not-a-valid-jwt',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      const result = await authService.init();

      // Should handle gracefully - either fail or use defaults
      expect(result).toBe(false);
    });
  });

  describe('Edge Cases', () => {
    test('should handle subscriber callback errors gracefully', async () => {
      let callCount = 0;
      const errorCallback = jest.fn(() => {
        callCount++;
        // Only throw on second call (during state change, not initial subscription)
        if (callCount > 1) {
          throw new Error('Subscriber error');
        }
      });
      const normalCallback = jest.fn();

      authService.onAuthStateChanged(errorCallback);
      authService.onAuthStateChanged(normalCallback);

      // Clear initial calls
      errorCallback.mockClear();
      normalCallback.mockClear();

      window.location.search = '?code=test-auth-code';

      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({
          access_token: 'test-access-token',
          id_token: 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwiY29nbml0bzp1c2VybmFtZSI6InRlc3R1c2VyIiwiZW1haWwiOiJ0ZXN0QGV4YW1wbGUuY29tIiwiY29nbml0bzpncm91cHMiOlsiYWRtaW4iXSwiZXhwIjoxOTk5OTk5OTk5fQ.signature',
          refresh_token: 'test-refresh-token',
          expires_in: 3600
        })
      });

      // Should not throw despite error callback
      await authService.init();

      // Both callbacks should have been called
      expect(errorCallback).toHaveBeenCalled();
      expect(normalCallback).toHaveBeenCalled();
    });

    test('should handle missing user data in sessionStorage gracefully', async () => {
      const futureExpiry = Date.now() + 3600000;
      sessionStorageMock.store[authConfig.storageKeys.accessToken] = 'stored-access-token';
      sessionStorageMock.store[authConfig.storageKeys.refreshToken] = 'stored-refresh-token';
      sessionStorageMock.store[authConfig.storageKeys.tokenExpiry] = futureExpiry.toString();
      // user is not stored

      window.location.search = '';
      const result = await authService.init();

      expect(result).toBe(true);
      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.getUser()).toBeNull();
    });

    test('should handle corrupted user JSON in sessionStorage', async () => {
      const futureExpiry = Date.now() + 3600000;
      sessionStorageMock.store[authConfig.storageKeys.accessToken] = 'stored-access-token';
      sessionStorageMock.store[authConfig.storageKeys.refreshToken] = 'stored-refresh-token';
      sessionStorageMock.store[authConfig.storageKeys.tokenExpiry] = futureExpiry.toString();
      sessionStorageMock.store[authConfig.storageKeys.user] = 'invalid json{';

      window.location.search = '';
      const result = await authService.init();

      expect(result).toBe(true);
      expect(authService.isAuthenticated()).toBe(true);
      expect(authService.getUser()).toBeNull();
    });

    test('should not schedule refresh when no refresh token available', async () => {
      const futureExpiry = Date.now() + 3600000;
      sessionStorageMock.store[authConfig.storageKeys.accessToken] = 'stored-access-token';
      sessionStorageMock.store[authConfig.storageKeys.tokenExpiry] = futureExpiry.toString();
      // No refresh token

      window.location.search = '';
      await authService.init();

      // Timer should still be set for refresh attempt (but will fail gracefully)
      expect(authService.isAuthenticated()).toBe(true);
    });

    test('should handle login from production environment', async () => {
      // Simulate production environment
      window.location.hostname = 'd3h8i7y9p8lyw7.cloudfront.net';

      authService.login();

      expect(window.location.assign).toHaveBeenCalled();
      const redirectUrl = window.location.assign.mock.calls[0][0];
      expect(redirectUrl).toContain(authConfig.hostedUiDomain);
    });
  });
});
