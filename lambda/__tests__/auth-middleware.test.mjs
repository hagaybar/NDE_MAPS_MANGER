/**
 * Auth Middleware Tests
 * TDD approach: RED -> GREEN -> REFACTOR
 *
 * Tests JWT validation for Cognito tokens
 */

import {
  initAuthFixtures,
  getAuthFixtures,
  resetAuthFixtures,
  createAuthenticatedEvent,
  createUnauthenticatedEvent,
  createInvalidAuthHeaderEvent,
  testUsers
} from './fixtures/auth-fixtures.mjs';

import {
  mockJwksFetch,
  restoreFetch,
  resetMockKeys,
  getMockCognitoConfig
} from './mocks/jwt-mock.mjs';

// Import the module under test (will fail initially - RED phase)
import {
  validateToken,
  extractUser,
  createAuthResponse,
  setConfig,
  clearJwksCache
} from '../auth-middleware.mjs';

describe('Auth Middleware', () => {
  let fixtures;
  let originalFetch;
  const mockConfig = getMockCognitoConfig();

  beforeAll(async () => {
    // Configure auth-middleware to use mock Cognito config
    setConfig({
      userPoolId: mockConfig.userPoolId,
      region: mockConfig.region
    });
    // Clear any cached JWKS
    clearJwksCache();
    // Initialize auth fixtures (generates test tokens)
    fixtures = await initAuthFixtures();
    // Mock the JWKS fetch endpoint
    originalFetch = await mockJwksFetch(mockConfig.jwksUri);
  });

  afterAll(() => {
    // Restore original fetch
    restoreFetch(originalFetch);
    resetAuthFixtures();
    resetMockKeys();
  });

  describe('validateToken', () => {
    describe('Valid tokens', () => {
      it('should return valid user with admin role for valid admin token', async () => {
        const event = createAuthenticatedEvent(fixtures.validAdminToken);

        const result = await validateToken(event);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.user).toBeDefined();
        expect(result.user.username).toBe(testUsers.admin.username);
        expect(result.user.role).toBe('admin');
      });

      it('should return valid user with editor role for valid editor token', async () => {
        const event = createAuthenticatedEvent(fixtures.validEditorToken);

        const result = await validateToken(event);

        expect(result.isValid).toBe(true);
        expect(result.error).toBeUndefined();
        expect(result.user).toBeDefined();
        expect(result.user.username).toBe(testUsers.editor.username);
        expect(result.user.role).toBe('editor');
      });

      it('should handle raw token format (without Bearer prefix)', async () => {
        // Create event with raw token (no Bearer prefix)
        const event = {
          ...createUnauthenticatedEvent(),
          headers: {
            Authorization: fixtures.validAdminToken
          }
        };

        const result = await validateToken(event);

        expect(result.isValid).toBe(true);
        expect(result.user.username).toBe(testUsers.admin.username);
      });

      it('should handle lowercase authorization header', async () => {
        const event = {
          ...createUnauthenticatedEvent(),
          headers: {
            authorization: `Bearer ${fixtures.validEditorToken}`
          }
        };

        const result = await validateToken(event);

        expect(result.isValid).toBe(true);
        expect(result.user.role).toBe('editor');
      });
    });

    describe('Invalid tokens', () => {
      it('should return 401 for expired token', async () => {
        const event = createAuthenticatedEvent(fixtures.expiredToken);

        const result = await validateToken(event);

        expect(result.isValid).toBe(false);
        expect(result.statusCode).toBe(401);
        expect(result.error).toMatch(/expired/i);
        expect(result.user).toBeUndefined();
      });

      it('should return 401 for invalid signature token', async () => {
        const event = createAuthenticatedEvent(fixtures.invalidSignatureToken);

        const result = await validateToken(event);

        expect(result.isValid).toBe(false);
        expect(result.statusCode).toBe(401);
        expect(result.error).toMatch(/signature|invalid/i);
        expect(result.user).toBeUndefined();
      });

      it('should return 401 for malformed token', async () => {
        const event = createAuthenticatedEvent(fixtures.malformedTokens.random);

        const result = await validateToken(event);

        expect(result.isValid).toBe(false);
        expect(result.statusCode).toBe(401);
        expect(result.error).toBeDefined();
        expect(result.user).toBeUndefined();
      });

      it('should return 401 for incomplete token', async () => {
        const event = createAuthenticatedEvent(fixtures.malformedTokens.incomplete);

        const result = await validateToken(event);

        expect(result.isValid).toBe(false);
        expect(result.statusCode).toBe(401);
      });
    });

    describe('Missing token', () => {
      it('should return 401 for missing Authorization header', async () => {
        const event = createUnauthenticatedEvent();

        const result = await validateToken(event);

        expect(result.isValid).toBe(false);
        expect(result.statusCode).toBe(401);
        expect(result.error).toMatch(/missing|authorization/i);
        expect(result.user).toBeUndefined();
      });

      it('should return 401 for empty Authorization header', async () => {
        const event = createInvalidAuthHeaderEvent('empty');

        const result = await validateToken(event);

        expect(result.isValid).toBe(false);
        expect(result.statusCode).toBe(401);
      });

      it('should return 401 for Bearer only (no token)', async () => {
        const event = createInvalidAuthHeaderEvent('bearer-only');

        const result = await validateToken(event);

        expect(result.isValid).toBe(false);
        expect(result.statusCode).toBe(401);
      });

      it('should return 401 for Bearer with space but no token', async () => {
        const event = createInvalidAuthHeaderEvent('bearer-space');

        const result = await validateToken(event);

        expect(result.isValid).toBe(false);
        expect(result.statusCode).toBe(401);
      });
    });
  });

  describe('extractUser', () => {
    it('should extract username from token claims', async () => {
      const user = await extractUser(fixtures.validAdminToken);

      expect(user.username).toBe(testUsers.admin.username);
    });

    it('should extract role from custom:role claim', async () => {
      const user = await extractUser(fixtures.validAdminToken);

      expect(user.role).toBe('admin');
    });

    it('should extract email from token claims', async () => {
      const user = await extractUser(fixtures.validEditorToken);

      expect(user.email).toBe(testUsers.editor.email);
    });

    it('should return null for invalid token', async () => {
      const user = await extractUser(fixtures.malformedTokens.random);

      expect(user).toBeNull();
    });

    it('should return null for empty token', async () => {
      const user = await extractUser('');

      expect(user).toBeNull();
    });

    it('should return null for null/undefined token', async () => {
      const user1 = await extractUser(null);
      const user2 = await extractUser(undefined);

      expect(user1).toBeNull();
      expect(user2).toBeNull();
    });
  });

  describe('createAuthResponse', () => {
    it('should create response with correct statusCode', () => {
      const response = createAuthResponse(401, { error: 'Unauthorized' });

      expect(response.statusCode).toBe(401);
    });

    it('should create response with JSON body', () => {
      const body = { error: 'Token expired' };
      const response = createAuthResponse(401, body);

      expect(JSON.parse(response.body)).toEqual(body);
    });

    it('should include CORS headers', () => {
      const response = createAuthResponse(401, { error: 'Unauthorized' });

      expect(response.headers['Access-Control-Allow-Origin']).toBeDefined();
      expect(response.headers['Content-Type']).toBe('application/json');
    });

    it('should create 403 forbidden response', () => {
      const response = createAuthResponse(403, { error: 'Forbidden' });

      expect(response.statusCode).toBe(403);
      expect(JSON.parse(response.body).error).toBe('Forbidden');
    });
  });

  describe('JWKS caching', () => {
    it('should cache JWKS for performance', async () => {
      // Track fetch calls
      let fetchCallCount = 0;
      const originalGlobalFetch = globalThis.fetch;

      globalThis.fetch = async (...args) => {
        fetchCallCount++;
        return originalGlobalFetch(...args);
      };

      // Reset cache by importing fresh module (we'll need to implement cache clearing)
      const event = createAuthenticatedEvent(fixtures.validAdminToken);

      // First validation - should fetch JWKS
      await validateToken(event);
      const firstCallCount = fetchCallCount;

      // Second validation - should use cached JWKS
      await validateToken(event);

      // JWKS should be fetched only once (cached)
      // Note: First call might be 0 if JWKS was already cached from previous tests
      // The important thing is no additional fetches happened
      expect(fetchCallCount).toBe(firstCallCount);

      globalThis.fetch = originalGlobalFetch;
    });
  });
});
