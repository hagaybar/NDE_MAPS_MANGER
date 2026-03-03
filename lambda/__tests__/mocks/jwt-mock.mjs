/**
 * JWT Mock Utilities for Testing
 * Provides mock JWT generation and JWKS endpoint simulation for testing Lambda auth
 */

import * as jose from 'jose';

// Mock RSA key pair for testing (generated deterministically for tests)
let mockKeyPair = null;
let mockJwk = null;

/**
 * Initialize mock key pair for JWT signing
 * Uses RSA-256 for Cognito compatibility
 */
export const initMockKeys = async () => {
  if (!mockKeyPair) {
    mockKeyPair = await jose.generateKeyPair('RS256', { extractable: true });
    const publicKeyJwk = await jose.exportJWK(mockKeyPair.publicKey);
    mockJwk = {
      ...publicKeyJwk,
      kid: 'test-key-id-001',
      alg: 'RS256',
      use: 'sig'
    };
  }
  return { keyPair: mockKeyPair, jwk: mockJwk };
};

/**
 * Get the mock JWKS (JSON Web Key Set) response
 * Simulates Cognito JWKS endpoint response
 * @returns {Object} JWKS response object
 */
export const getMockJwks = async () => {
  const { jwk } = await initMockKeys();
  return {
    keys: [jwk]
  };
};

/**
 * Generate mock Cognito-style JWT claims
 * @param {Object} options - Claim options
 * @param {string} options.username - The username (sub claim)
 * @param {string} options.role - User role (admin or editor)
 * @param {string} options.email - User email
 * @param {number} options.expiresIn - Token expiration in seconds (default: 3600)
 * @param {string} options.issuer - Token issuer (default: mock Cognito issuer)
 * @param {string} options.audience - Token audience (default: mock client ID)
 * @returns {Object} JWT claims object
 */
export const createCognitoClaims = ({
  username = 'test-user',
  role = 'editor',
  email = 'test@example.com',
  expiresIn = 3600,
  issuer = 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_mockPoolId',
  audience = 'mock-client-id'
} = {}) => {
  const now = Math.floor(Date.now() / 1000);

  return {
    // Standard JWT claims
    sub: `user-${username}-uuid`,
    iss: issuer,
    aud: audience,
    iat: now,
    exp: now + expiresIn,
    auth_time: now,
    token_use: 'id',

    // Cognito-specific claims
    'cognito:username': username,
    'cognito:groups': [role],
    'custom:role': role,

    // User profile claims
    email: email,
    email_verified: true,
    name: username
  };
};

/**
 * Generate a valid mock JWT token
 * @param {Object} options - Token generation options
 * @param {string} options.username - The username
 * @param {string} options.role - User role (admin or editor)
 * @param {string} options.email - User email
 * @param {number} options.expiresIn - Token expiration in seconds
 * @param {Object} options.additionalClaims - Additional claims to include
 * @returns {Promise<string>} Signed JWT token string
 */
export const generateValidToken = async ({
  username = 'test-user',
  role = 'editor',
  email,
  expiresIn = 3600,
  additionalClaims = {}
} = {}) => {
  const { keyPair, jwk } = await initMockKeys();

  const claims = createCognitoClaims({
    username,
    role,
    email: email || `${username}@example.com`,
    expiresIn
  });

  const token = await new jose.SignJWT({ ...claims, ...additionalClaims })
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })
    .sign(mockKeyPair.privateKey);

  return token;
};

/**
 * Generate an expired JWT token
 * @param {Object} options - Token generation options
 * @returns {Promise<string>} Expired JWT token string
 */
export const generateExpiredToken = async ({
  username = 'test-user',
  role = 'editor'
} = {}) => {
  const { keyPair, jwk } = await initMockKeys();

  const now = Math.floor(Date.now() / 1000);
  const claims = {
    ...createCognitoClaims({ username, role }),
    iat: now - 7200, // Issued 2 hours ago
    exp: now - 3600  // Expired 1 hour ago
  };

  const token = await new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })
    .sign(mockKeyPair.privateKey);

  return token;
};

/**
 * Generate a JWT token with invalid signature
 * Uses a different key than the one in JWKS
 * @param {Object} options - Token generation options
 * @returns {Promise<string>} JWT token with invalid signature
 */
export const generateInvalidSignatureToken = async ({
  username = 'test-user',
  role = 'editor'
} = {}) => {
  // Generate a different key pair (not in JWKS)
  const wrongKeyPair = await jose.generateKeyPair('RS256');

  const claims = createCognitoClaims({ username, role });

  const token = await new jose.SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'wrong-key-id', typ: 'JWT' })
    .sign(wrongKeyPair.privateKey);

  return token;
};

/**
 * Generate a malformed token string
 * @param {string} type - Type of malformed token
 * @returns {string} Malformed token string
 */
export const generateMalformedToken = (type = 'random') => {
  switch (type) {
    case 'empty':
      return '';
    case 'spaces':
      return '   ';
    case 'incomplete':
      return 'eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0';
    case 'invalid-base64':
      return 'not.valid.base64!!!';
    case 'no-dots':
      return 'thisIsNotAValidJwtTokenAtAll';
    case 'random':
    default:
      return 'completely-invalid-jwt-token-string';
  }
};

/**
 * Create a mock JWKS endpoint handler for fetch mocking
 * @returns {Object} Mock response object
 */
export const createMockJwksHandler = async () => {
  const jwks = await getMockJwks();
  return {
    ok: true,
    status: 200,
    json: async () => jwks,
    text: async () => JSON.stringify(jwks)
  };
};

/**
 * Create a failing JWKS endpoint handler
 * @param {number} statusCode - HTTP status code
 * @param {string} message - Error message
 * @returns {Object} Mock error response object
 */
export const createFailingJwksHandler = (statusCode = 500, message = 'Internal Server Error') => {
  return {
    ok: false,
    status: statusCode,
    statusText: message,
    json: async () => { throw new Error(message); },
    text: async () => message
  };
};

/**
 * Mock fetch for JWKS endpoints
 * @param {string} jwksUri - The JWKS URI to mock
 * @param {Object} options - Mock options
 * @param {boolean} options.shouldFail - Whether the endpoint should fail
 * @param {number} options.failureStatus - HTTP status for failure
 * @returns {Function} Original fetch function for restoration
 */
export const mockJwksFetch = async (jwksUri, { shouldFail = false, failureStatus = 500 } = {}) => {
  const originalFetch = globalThis.fetch;

  globalThis.fetch = async (url, options) => {
    if (url === jwksUri || url.includes('.well-known/jwks.json')) {
      if (shouldFail) {
        return createFailingJwksHandler(failureStatus);
      }
      return await createMockJwksHandler();
    }
    // Fall back to original fetch for other URLs
    return originalFetch(url, options);
  };

  return originalFetch;
};

/**
 * Restore original fetch after mocking
 * @param {Function} originalFetch - The original fetch function
 */
export const restoreFetch = (originalFetch) => {
  globalThis.fetch = originalFetch;
};

/**
 * Reset mock keys (useful between tests)
 */
export const resetMockKeys = () => {
  mockKeyPair = null;
  mockJwk = null;
};

/**
 * Get mock Cognito configuration for testing
 * @returns {Object} Mock Cognito configuration
 */
export const getMockCognitoConfig = () => ({
  userPoolId: 'us-east-1_mockPoolId',
  clientId: 'mock-client-id',
  region: 'us-east-1',
  issuer: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_mockPoolId',
  jwksUri: 'https://cognito-idp.us-east-1.amazonaws.com/us-east-1_mockPoolId/.well-known/jwks.json'
});

export default {
  initMockKeys,
  getMockJwks,
  createCognitoClaims,
  generateValidToken,
  generateExpiredToken,
  generateInvalidSignatureToken,
  generateMalformedToken,
  createMockJwksHandler,
  createFailingJwksHandler,
  mockJwksFetch,
  restoreFetch,
  resetMockKeys,
  getMockCognitoConfig
};
