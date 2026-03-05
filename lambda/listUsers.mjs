/**
 * List Users Lambda Function
 * Lists all users in Cognito User Pool with pagination
 * Requires admin role to access
 */

import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-1_g9q5cPhVg';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

/**
 * Extract attribute value from Cognito user attributes array
 * @param {Array} attributes - Cognito user attributes
 * @param {string} name - Attribute name to find
 * @returns {string|null} Attribute value or null if not found
 */
const getAttribute = (attributes, name) => {
  if (!attributes || !Array.isArray(attributes)) {
    return null;
  }
  const attr = attributes.find(a => a.Name === name);
  return attr ? attr.Value : null;
};

/**
 * Parse allowedRanges JSON string from Cognito attribute
 * @param {string|null} rangesStr - JSON string of allowed ranges
 * @returns {Object|null} Parsed ranges object or null
 */
const parseAllowedRanges = (rangesStr) => {
  if (!rangesStr || rangesStr.trim() === '') {
    return null;
  }
  try {
    return JSON.parse(rangesStr);
  } catch (e) {
    console.warn('Failed to parse allowedRanges:', e.message);
    return null;
  }
};

/**
 * Map Cognito user to clean response format
 * @param {Object} cognitoUser - Raw Cognito user object
 * @returns {Object} Cleaned user object
 */
const mapUser = (cognitoUser) => {
  const attributes = cognitoUser.Attributes || [];
  const allowedRangesStr = getAttribute(attributes, 'custom:allowedRanges');

  return {
    username: cognitoUser.Username,
    email: getAttribute(attributes, 'email'),
    status: cognitoUser.UserStatus,
    role: getAttribute(attributes, 'custom:role'),
    allowedRanges: parseAllowedRanges(allowedRangesStr),
    createdAt: cognitoUser.UserCreateDate ? cognitoUser.UserCreateDate.toISOString() : null,
    lastModified: cognitoUser.UserLastModifiedDate ? cognitoUser.UserLastModifiedDate.toISOString() : null
  };
};

/**
 * Build Cognito filter string based on search parameter
 * @param {string} search - Search query
 * @returns {string|undefined} Cognito filter string or undefined
 */
const buildFilter = (search) => {
  if (!search || search.trim() === '') {
    return undefined;
  }

  const trimmedSearch = search.trim();

  // If search contains @, assume email search
  if (trimmedSearch.includes('@')) {
    return `email ^= "${trimmedSearch}"`;
  }

  // Otherwise search by username
  return `username ^= "${trimmedSearch}"`;
};

/**
 * Lambda handler for listing Cognito users
 * @param {Object} event - API Gateway event
 * @returns {Object} API Gateway response
 */
export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // Validate token
  const authResult = await validateToken(event);
  if (!authResult.isValid) {
    return createAuthResponse(authResult.statusCode, { error: authResult.error });
  }

  // Check permission - admin role required (manage-users operation)
  const permResult = checkPermission(authResult.user, 'manage-users');
  if (!permResult.allowed) {
    return createAuthResponse(403, { error: permResult.reason });
  }

  try {
    // Parse query parameters
    const queryParams = event.queryStringParameters || {};
    const search = queryParams.search;
    const nextToken = queryParams.nextToken;
    const limit = queryParams.limit ? parseInt(queryParams.limit, 10) : undefined;

    // Build ListUsersCommand input
    const commandInput = {
      UserPoolId: USER_POOL_ID
    };

    // Add pagination token if provided
    if (nextToken) {
      commandInput.PaginationToken = nextToken;
    }

    // Add limit if provided
    if (limit) {
      commandInput.Limit = limit;
    }

    // Add filter if search provided
    const filter = buildFilter(search);
    if (filter) {
      commandInput.Filter = filter;
    }

    // Execute ListUsersCommand
    const command = new ListUsersCommand(commandInput);
    const response = await cognito.send(command);

    // Map users to clean format
    const users = (response.Users || []).map(mapUser);

    // Build response body
    const responseBody = {
      users
    };

    // Include pagination token if more results exist
    if (response.PaginationToken) {
      responseBody.nextToken = response.PaginationToken;
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(responseBody)
    };
  } catch (error) {
    console.error('Error listing users:', error);
    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
