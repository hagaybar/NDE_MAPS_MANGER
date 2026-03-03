/**
 * Authentication Test Fixtures
 * Pre-defined tokens and claims for testing JWT authentication
 */

import {
  generateValidToken,
  generateExpiredToken,
  generateInvalidSignatureToken,
  generateMalformedToken,
  getMockCognitoConfig,
  initMockKeys
} from '../mocks/jwt-mock.mjs';

/**
 * Test user definitions
 */
export const testUsers = {
  admin: {
    username: 'admin-user',
    email: 'admin@taulibrary.edu',
    role: 'admin'
  },
  editor: {
    username: 'editor-user',
    email: 'editor@taulibrary.edu',
    role: 'editor'
  },
  viewer: {
    username: 'viewer-user',
    email: 'viewer@taulibrary.edu',
    role: 'viewer'
  }
};

/**
 * Token fixture cache to avoid regenerating tokens
 */
let tokenCache = null;

/**
 * Initialize all test tokens
 * Call this in beforeAll() to set up fixtures
 * @returns {Promise<Object>} Token fixtures object
 */
export const initAuthFixtures = async () => {
  // Initialize mock keys first
  await initMockKeys();

  tokenCache = {
    // Valid tokens
    validAdminToken: await generateValidToken({
      username: testUsers.admin.username,
      email: testUsers.admin.email,
      role: testUsers.admin.role
    }),

    validEditorToken: await generateValidToken({
      username: testUsers.editor.username,
      email: testUsers.editor.email,
      role: testUsers.editor.role
    }),

    validViewerToken: await generateValidToken({
      username: testUsers.viewer.username,
      email: testUsers.viewer.email,
      role: testUsers.viewer.role
    }),

    // Short-lived token (expires in 5 seconds)
    shortLivedToken: await generateValidToken({
      username: 'short-lived-user',
      role: 'editor',
      expiresIn: 5
    }),

    // Long-lived token (expires in 24 hours)
    longLivedToken: await generateValidToken({
      username: 'long-lived-user',
      role: 'admin',
      expiresIn: 86400
    }),

    // Invalid tokens
    expiredToken: await generateExpiredToken({
      username: 'expired-user',
      role: 'editor'
    }),

    invalidSignatureToken: await generateInvalidSignatureToken({
      username: 'invalid-sig-user',
      role: 'admin'
    }),

    // Malformed tokens
    malformedTokens: {
      empty: generateMalformedToken('empty'),
      spaces: generateMalformedToken('spaces'),
      incomplete: generateMalformedToken('incomplete'),
      invalidBase64: generateMalformedToken('invalid-base64'),
      noDots: generateMalformedToken('no-dots'),
      random: generateMalformedToken('random')
    }
  };

  return tokenCache;
};

/**
 * Get cached tokens (must call initAuthFixtures first)
 * @returns {Object} Token fixtures object
 */
export const getAuthFixtures = () => {
  if (!tokenCache) {
    throw new Error('Auth fixtures not initialized. Call initAuthFixtures() in beforeAll()');
  }
  return tokenCache;
};

/**
 * Reset token cache (useful for cleanup)
 */
export const resetAuthFixtures = () => {
  tokenCache = null;
};

/**
 * Create authorization header value
 * @param {string} token - JWT token
 * @returns {string} Bearer token header value
 */
export const createAuthHeader = (token) => {
  return `Bearer ${token}`;
};

/**
 * Create API Gateway event with authorization header
 * @param {string} token - JWT token
 * @param {Object} eventOverrides - Additional event properties
 * @returns {Object} Mock API Gateway event
 */
export const createAuthenticatedEvent = (token, eventOverrides = {}) => {
  return {
    httpMethod: 'GET',
    path: '/',
    headers: {
      Authorization: createAuthHeader(token),
      ...eventOverrides.headers
    },
    queryStringParameters: null,
    pathParameters: null,
    body: null,
    isBase64Encoded: false,
    requestContext: {
      authorizer: null,
      identity: {
        sourceIp: '127.0.0.1'
      }
    },
    ...eventOverrides
  };
};

/**
 * Create API Gateway event without authorization
 * @param {Object} eventOverrides - Additional event properties
 * @returns {Object} Mock API Gateway event
 */
export const createUnauthenticatedEvent = (eventOverrides = {}) => {
  return {
    httpMethod: 'GET',
    path: '/',
    headers: {},
    queryStringParameters: null,
    pathParameters: null,
    body: null,
    isBase64Encoded: false,
    requestContext: {
      authorizer: null,
      identity: {
        sourceIp: '127.0.0.1'
      }
    },
    ...eventOverrides
  };
};

/**
 * Create API Gateway event with invalid authorization header formats
 * @param {string} type - Type of invalid header
 * @returns {Object} Mock API Gateway event
 */
export const createInvalidAuthHeaderEvent = (type = 'no-bearer') => {
  const headers = {};

  switch (type) {
    case 'no-bearer':
      headers.Authorization = 'some-token-without-bearer-prefix';
      break;
    case 'lowercase':
      headers.authorization = 'Bearer valid-format-lowercase-header';
      break;
    case 'basic-auth':
      headers.Authorization = 'Basic dXNlcm5hbWU6cGFzc3dvcmQ=';
      break;
    case 'empty':
      headers.Authorization = '';
      break;
    case 'bearer-only':
      headers.Authorization = 'Bearer';
      break;
    case 'bearer-space':
      headers.Authorization = 'Bearer ';
      break;
    default:
      throw new Error(`Unknown invalid auth header type: ${type}`);
  }

  return createUnauthenticatedEvent({ headers });
};

/**
 * Test case generators for common auth scenarios
 */
export const authTestCases = {
  /**
   * Generate test cases for valid tokens
   */
  validTokenCases: () => [
    { name: 'admin user', role: 'admin', getToken: () => getAuthFixtures().validAdminToken },
    { name: 'editor user', role: 'editor', getToken: () => getAuthFixtures().validEditorToken }
  ],

  /**
   * Generate test cases for invalid tokens
   */
  invalidTokenCases: () => [
    { name: 'expired token', getToken: () => getAuthFixtures().expiredToken, expectedError: 'Token expired' },
    { name: 'invalid signature', getToken: () => getAuthFixtures().invalidSignatureToken, expectedError: 'Invalid signature' },
    { name: 'malformed token', getToken: () => getAuthFixtures().malformedTokens.random, expectedError: 'Invalid token' },
    { name: 'empty token', getToken: () => getAuthFixtures().malformedTokens.empty, expectedError: 'Invalid token' }
  ],

  /**
   * Generate test cases for missing auth
   */
  missingAuthCases: () => [
    { name: 'no authorization header', getEvent: () => createUnauthenticatedEvent() },
    { name: 'empty authorization header', getEvent: () => createInvalidAuthHeaderEvent('empty') },
    { name: 'bearer only (no token)', getEvent: () => createInvalidAuthHeaderEvent('bearer-only') }
  ],

  /**
   * Generate test cases for role-based access
   */
  roleAccessCases: (allowedRoles) => [
    {
      name: 'admin user',
      role: 'admin',
      getToken: () => getAuthFixtures().validAdminToken,
      shouldHaveAccess: allowedRoles.includes('admin')
    },
    {
      name: 'editor user',
      role: 'editor',
      getToken: () => getAuthFixtures().validEditorToken,
      shouldHaveAccess: allowedRoles.includes('editor')
    },
    {
      name: 'viewer user',
      role: 'viewer',
      getToken: () => getAuthFixtures().validViewerToken,
      shouldHaveAccess: allowedRoles.includes('viewer')
    }
  ]
};

/**
 * Mock Cognito configuration export
 */
export const cognitoConfig = getMockCognitoConfig();

export default {
  testUsers,
  initAuthFixtures,
  getAuthFixtures,
  resetAuthFixtures,
  createAuthHeader,
  createAuthenticatedEvent,
  createUnauthenticatedEvent,
  createInvalidAuthHeaderEvent,
  authTestCases,
  cognitoConfig
};
