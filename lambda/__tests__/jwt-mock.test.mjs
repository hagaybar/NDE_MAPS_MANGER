/**
 * JWT Mock Utilities Tests
 * Verifies the JWT mock infrastructure works correctly
 */

import * as jose from 'jose';
import {
  initMockKeys,
  getMockJwks,
  generateValidToken,
  generateExpiredToken,
  generateInvalidSignatureToken,
  generateMalformedToken,
  createCognitoClaims,
  mockJwksFetch,
  restoreFetch,
  resetMockKeys,
  getMockCognitoConfig
} from './mocks/jwt-mock.mjs';

import {
  initAuthFixtures,
  getAuthFixtures,
  resetAuthFixtures,
  createAuthenticatedEvent,
  createUnauthenticatedEvent,
  createInvalidAuthHeaderEvent,
  authTestCases,
  testUsers
} from './fixtures/auth-fixtures.mjs';

describe('JWT Mock Utilities', () => {
  beforeAll(async () => {
    await initMockKeys();
  });

  afterAll(() => {
    resetMockKeys();
  });

  describe('initMockKeys', () => {
    it('should initialize and return key pair and JWK', async () => {
      const { keyPair, jwk } = await initMockKeys();

      expect(keyPair).toBeDefined();
      expect(keyPair.publicKey).toBeDefined();
      expect(keyPair.privateKey).toBeDefined();
      expect(jwk).toBeDefined();
      expect(jwk.kid).toBe('test-key-id-001');
      expect(jwk.alg).toBe('RS256');
      expect(jwk.use).toBe('sig');
    });
  });

  describe('getMockJwks', () => {
    it('should return JWKS with one key', async () => {
      const jwks = await getMockJwks();

      expect(jwks).toBeDefined();
      expect(jwks.keys).toHaveLength(1);
      expect(jwks.keys[0].kid).toBe('test-key-id-001');
    });
  });

  describe('createCognitoClaims', () => {
    it('should create valid Cognito-style claims', () => {
      const claims = createCognitoClaims({
        username: 'testuser',
        role: 'admin',
        email: 'test@example.com'
      });

      expect(claims.sub).toContain('testuser');
      expect(claims['cognito:username']).toBe('testuser');
      expect(claims['cognito:groups']).toContain('admin');
      expect(claims['custom:role']).toBe('admin');
      expect(claims.email).toBe('test@example.com');
      expect(claims.token_use).toBe('id');
      expect(claims.exp).toBeGreaterThan(claims.iat);
    });
  });

  describe('generateValidToken', () => {
    it('should generate a valid JWT token', async () => {
      const token = await generateValidToken({
        username: 'testuser',
        role: 'editor'
      });

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('should generate token with correct claims', async () => {
      const token = await generateValidToken({
        username: 'admin',
        role: 'admin',
        email: 'admin@test.com'
      });

      const jwks = await getMockJwks();
      const publicKey = await jose.importJWK(jwks.keys[0], 'RS256');
      const { payload } = await jose.jwtVerify(token, publicKey, {
        issuer: getMockCognitoConfig().issuer
      });

      expect(payload['cognito:username']).toBe('admin');
      expect(payload['custom:role']).toBe('admin');
      expect(payload.email).toBe('admin@test.com');
    });
  });

  describe('generateExpiredToken', () => {
    it('should generate an expired token', async () => {
      const token = await generateExpiredToken({
        username: 'expireduser',
        role: 'editor'
      });

      expect(token).toBeDefined();

      // Decode without verification to check expiration
      const decoded = jose.decodeJwt(token);
      expect(decoded.exp).toBeLessThan(Math.floor(Date.now() / 1000));
    });
  });

  describe('generateInvalidSignatureToken', () => {
    it('should generate a token with invalid signature', async () => {
      const token = await generateInvalidSignatureToken({
        username: 'badsig',
        role: 'admin'
      });

      expect(token).toBeDefined();

      // Try to verify with the correct JWKS - should fail
      const jwks = await getMockJwks();
      const publicKey = await jose.importJWK(jwks.keys[0], 'RS256');

      await expect(
        jose.jwtVerify(token, publicKey)
      ).rejects.toThrow();
    });
  });

  describe('generateMalformedToken', () => {
    it('should generate various malformed tokens', () => {
      expect(generateMalformedToken('empty')).toBe('');
      expect(generateMalformedToken('spaces')).toBe('   ');
      expect(generateMalformedToken('no-dots')).toBe('thisIsNotAValidJwtTokenAtAll');
      expect(generateMalformedToken('random')).toBe('completely-invalid-jwt-token-string');
    });
  });

  describe('mockJwksFetch', () => {
    let originalFetch;

    afterEach(() => {
      if (originalFetch) {
        restoreFetch(originalFetch);
      }
    });

    it('should mock fetch for JWKS endpoint', async () => {
      const jwksUri = getMockCognitoConfig().jwksUri;
      originalFetch = await mockJwksFetch(jwksUri);

      const response = await fetch(jwksUri);
      const jwks = await response.json();

      expect(response.ok).toBe(true);
      expect(jwks.keys).toHaveLength(1);
    });

    it('should simulate JWKS endpoint failure', async () => {
      const jwksUri = getMockCognitoConfig().jwksUri;
      originalFetch = await mockJwksFetch(jwksUri, { shouldFail: true, failureStatus: 503 });

      const response = await fetch(jwksUri);

      expect(response.ok).toBe(false);
      expect(response.status).toBe(503);
    });
  });
});

describe('Auth Fixtures', () => {
  beforeAll(async () => {
    await initAuthFixtures();
  });

  afterAll(() => {
    resetAuthFixtures();
    resetMockKeys();
  });

  describe('initAuthFixtures', () => {
    it('should initialize all token fixtures', () => {
      const fixtures = getAuthFixtures();

      expect(fixtures.validAdminToken).toBeDefined();
      expect(fixtures.validEditorToken).toBeDefined();
      expect(fixtures.validViewerToken).toBeDefined();
      expect(fixtures.expiredToken).toBeDefined();
      expect(fixtures.invalidSignatureToken).toBeDefined();
      expect(fixtures.malformedTokens).toBeDefined();
    });
  });

  describe('createAuthenticatedEvent', () => {
    it('should create event with Authorization header', () => {
      const fixtures = getAuthFixtures();
      const event = createAuthenticatedEvent(fixtures.validAdminToken);

      expect(event.headers.Authorization).toBeDefined();
      expect(event.headers.Authorization).toContain('Bearer');
      expect(event.httpMethod).toBe('GET');
    });

    it('should allow overriding event properties', () => {
      const fixtures = getAuthFixtures();
      const event = createAuthenticatedEvent(fixtures.validEditorToken, {
        httpMethod: 'POST',
        path: '/api/csv',
        body: JSON.stringify({ data: 'test' })
      });

      expect(event.httpMethod).toBe('POST');
      expect(event.path).toBe('/api/csv');
      expect(event.body).toContain('data');
    });
  });

  describe('createUnauthenticatedEvent', () => {
    it('should create event without Authorization header', () => {
      const event = createUnauthenticatedEvent();

      expect(event.headers.Authorization).toBeUndefined();
    });
  });

  describe('createInvalidAuthHeaderEvent', () => {
    it('should create events with various invalid auth headers', () => {
      const noBearer = createInvalidAuthHeaderEvent('no-bearer');
      expect(noBearer.headers.Authorization).not.toContain('Bearer');

      const basicAuth = createInvalidAuthHeaderEvent('basic-auth');
      expect(basicAuth.headers.Authorization).toContain('Basic');

      const empty = createInvalidAuthHeaderEvent('empty');
      expect(empty.headers.Authorization).toBe('');

      const bearerOnly = createInvalidAuthHeaderEvent('bearer-only');
      expect(bearerOnly.headers.Authorization).toBe('Bearer');
    });
  });

  describe('authTestCases', () => {
    it('should provide valid token test cases', () => {
      const cases = authTestCases.validTokenCases();

      expect(cases).toHaveLength(2);
      expect(cases[0].name).toBe('admin user');
      expect(cases[1].name).toBe('editor user');
    });

    it('should provide invalid token test cases', () => {
      const cases = authTestCases.invalidTokenCases();

      expect(cases.length).toBeGreaterThan(0);
      expect(cases.some(c => c.name.includes('expired'))).toBe(true);
      expect(cases.some(c => c.name.includes('invalid signature'))).toBe(true);
    });

    it('should provide role access test cases', () => {
      const adminOnlyCases = authTestCases.roleAccessCases(['admin']);

      expect(adminOnlyCases.find(c => c.role === 'admin').shouldHaveAccess).toBe(true);
      expect(adminOnlyCases.find(c => c.role === 'editor').shouldHaveAccess).toBe(false);

      const editorCases = authTestCases.roleAccessCases(['admin', 'editor']);
      expect(editorCases.find(c => c.role === 'editor').shouldHaveAccess).toBe(true);
    });
  });

  describe('testUsers', () => {
    it('should have predefined test users', () => {
      expect(testUsers.admin).toBeDefined();
      expect(testUsers.admin.role).toBe('admin');
      expect(testUsers.editor).toBeDefined();
      expect(testUsers.editor.role).toBe('editor');
    });
  });
});
