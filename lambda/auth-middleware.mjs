/**
 * Auth Middleware for JWT Validation
 * Validates Cognito JWT tokens and extracts user information
 */

import * as jose from 'jose';

// Cognito configuration - can be overridden via environment or setConfig
let cognitoConfig = {
  userPoolId: process.env.COGNITO_USER_POOL_ID || 'us-east-1_g9q5cPhVg',
  region: process.env.AWS_REGION || 'us-east-1'
};

/**
 * Get the issuer URL for the configured Cognito user pool
 * @returns {string} Cognito issuer URL
 */
const getIssuer = () => {
  return `https://cognito-idp.${cognitoConfig.region}.amazonaws.com/${cognitoConfig.userPoolId}`;
};

/**
 * Get the JWKS URL for the configured Cognito user pool
 * @returns {string} JWKS endpoint URL
 */
const getJwksUri = () => {
  return `${getIssuer()}/.well-known/jwks.json`;
};

// JWKS cache for performance - keyed by issuer to support testing with different issuers
const jwksCache = new Map();
const JWKS_CACHE_TTL = 3600000; // 1 hour in milliseconds

/**
 * Configure Cognito settings (useful for testing)
 * @param {Object} config - Configuration object
 * @param {string} config.userPoolId - Cognito User Pool ID
 * @param {string} config.region - AWS region
 */
export const setConfig = (config) => {
  cognitoConfig = { ...cognitoConfig, ...config };
};

/**
 * Get JWKS from cache or fetch from Cognito
 * @param {string} issuer - Token issuer URL
 * @returns {Promise<Object>} JWKS key set
 */
const getJwks = async (issuer) => {
  const now = Date.now();
  const jwksUri = `${issuer}/.well-known/jwks.json`;

  // Check cache
  const cached = jwksCache.get(issuer);
  if (cached && (now - cached.time) < JWKS_CACHE_TTL) {
    return cached.jwks;
  }

  // Fetch fresh JWKS
  const response = await fetch(jwksUri);
  if (!response.ok) {
    throw new Error(`Failed to fetch JWKS: ${response.status}`);
  }

  const jwks = await response.json();

  // Cache the JWKS
  jwksCache.set(issuer, { jwks, time: now });

  return jwks;
};

/**
 * Extract token from Authorization header
 * Handles both "Bearer <token>" and raw token formats
 * @param {Object} event - API Gateway event
 * @returns {string|null} Token string or null
 */
const extractTokenFromHeader = (event) => {
  const headers = event.headers || {};

  // Check both capitalized and lowercase header names
  const authHeader = headers.Authorization || headers.authorization;

  if (!authHeader) {
    return null;
  }

  const trimmed = authHeader.trim();
  if (!trimmed) {
    return null;
  }

  // Handle Bearer token format
  if (trimmed.toLowerCase().startsWith('bearer ')) {
    const token = trimmed.slice(7).trim();
    return token || null;
  }

  // Raw token format
  return trimmed;
};

/**
 * Verify JWT signature using JWKS
 * @param {string} token - JWT token string
 * @returns {Promise<Object>} Verified JWT payload
 */
const verifyToken = async (token) => {
  const issuer = getIssuer();
  const jwks = await getJwks(issuer);

  // Create JWKS key set
  const keySet = jose.createLocalJWKSet(jwks);

  // Verify the token
  const { payload } = await jose.jwtVerify(token, keySet, {
    issuer: issuer
  });

  return payload;
};

/**
 * Extract user information from token claims
 * @param {string} token - JWT token string
 * @returns {Promise<Object|null>} User object or null if extraction fails
 */
export const extractUser = async (token) => {
  if (!token) {
    return null;
  }

  try {
    // Decode token without verification (for extracting claims)
    const decoded = jose.decodeJwt(token);

    return {
      username: decoded['cognito:username'] || decoded.name || decoded.sub,
      role: decoded['custom:role'] || (decoded['cognito:groups'] && decoded['cognito:groups'][0]) || 'viewer',
      email: decoded.email || null,
      sub: decoded.sub
    };
  } catch (error) {
    return null;
  }
};

/**
 * Create API Gateway response for authentication errors
 * @param {number} statusCode - HTTP status code
 * @param {Object} body - Response body
 * @returns {Object} API Gateway response object
 */
export const createAuthResponse = (statusCode, body) => {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS'
    },
    body: JSON.stringify(body)
  };
};

/**
 * Validate JWT token from API Gateway event
 * @param {Object} event - API Gateway event
 * @returns {Promise<Object>} Validation result with isValid, user, error, statusCode
 */
export const validateToken = async (event) => {
  // Extract token from header
  const token = extractTokenFromHeader(event);

  if (!token) {
    return {
      isValid: false,
      statusCode: 401,
      error: 'Missing authorization token',
      user: undefined
    };
  }

  try {
    // Verify token signature and expiration
    const payload = await verifyToken(token);

    // Extract user information
    const user = {
      username: payload['cognito:username'] || payload.name || payload.sub,
      role: payload['custom:role'] || (payload['cognito:groups'] && payload['cognito:groups'][0]) || 'viewer',
      email: payload.email || null,
      sub: payload.sub
    };

    return {
      isValid: true,
      user,
      error: undefined
    };
  } catch (error) {
    let errorMessage = 'Invalid token';

    if (error.code === 'ERR_JWT_EXPIRED') {
      errorMessage = 'Token expired';
    } else if (error.code === 'ERR_JWS_SIGNATURE_VERIFICATION_FAILED') {
      errorMessage = 'Invalid signature';
    } else if (error.message && error.message.includes('no applicable key')) {
      // This happens when the key ID doesn't match any key in JWKS (invalid signature scenario)
      errorMessage = 'Invalid signature - key not found';
    } else if (error.message) {
      errorMessage = error.message;
    }

    return {
      isValid: false,
      statusCode: 401,
      error: errorMessage,
      user: undefined
    };
  }
};

/**
 * Clear JWKS cache (useful for testing)
 */
export const clearJwksCache = () => {
  jwksCache.clear();
};

export default {
  validateToken,
  extractUser,
  createAuthResponse,
  clearJwksCache
};
