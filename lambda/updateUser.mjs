/**
 * Update User Lambda Function
 * Updates user attributes (role, enable/disable, allowedRanges) in Cognito User Pool
 * Requires admin role to access
 */

import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  AdminGetUserCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { validateRangeConfig } from './range-validation.mjs';

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-1_g9q5cPhVg';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// Valid roles that can be assigned to users
const VALID_ROLES = ['admin', 'editor'];

/**
 * Validate role against allowed roles
 * @param {string} role - Role to validate
 * @returns {boolean} True if valid role
 */
const isValidRole = (role) => {
  return VALID_ROLES.includes(role);
};

/**
 * Parse and validate request body
 * @param {string} body - Request body string
 * @returns {{ data?: Object, error?: string }} Parsed data or error message
 */
const parseAndValidateBody = (body) => {
  // Check for missing body
  if (!body) {
    return { error: 'Request body is required' };
  }

  // Parse JSON
  let data;
  try {
    data = JSON.parse(body);
  } catch (e) {
    return { error: 'Invalid JSON in request body' };
  }

  // Check if body has at least one valid field
  if (data.role === undefined && data.enabled === undefined && data.allowedRanges === undefined) {
    return { error: 'Request must include role, enabled, or allowedRanges field' };
  }

  // Validate role if provided
  if (data.role !== undefined && !isValidRole(data.role)) {
    return { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` };
  }

  // Validate enabled if provided
  if (data.enabled !== undefined && typeof data.enabled !== 'boolean') {
    return { error: 'enabled must be a boolean value' };
  }

  // Validate allowedRanges if provided
  if (data.allowedRanges !== undefined) {
    // allowedRanges can be null (to clear restrictions) or a valid range config object
    if (data.allowedRanges !== null) {
      const rangeValidation = validateRangeConfig(data.allowedRanges);
      if (!rangeValidation.valid) {
        const errorMessages = rangeValidation.errors.map(e => `${e.path}: ${e.message}`).join('; ');
        return { error: `Invalid allowedRanges configuration: ${errorMessages}` };
      }
    }
  }

  return { data };
};

/**
 * Lambda handler for updating Cognito users
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

  // Extract username from path parameters
  const username = event.pathParameters?.username;
  if (!username) {
    return {
      statusCode: 400,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'Username is required in path' })
    };
  }

  // Parse and validate request body
  const { data, error: validationError } = parseAndValidateBody(event.body);
  if (validationError) {
    return {
      statusCode: 400,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: validationError })
    };
  }

  const { role, enabled, allowedRanges } = data;

  // Prevent self-modification (admin cannot change own role or disable self)
  if (username === authResult.user.username) {
    return {
      statusCode: 403,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'You cannot modify your own account' })
    };
  }

  try {
    // First verify the user exists
    const getUserCommand = new AdminGetUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username
    });
    await cognito.send(getUserCommand);

    // Build user attributes to update
    const userAttributes = [];

    // Add role if provided
    if (role !== undefined) {
      userAttributes.push({ Name: 'custom:role', Value: role });
    }

    // Add allowedRanges if provided
    if (allowedRanges !== undefined) {
      // Store as JSON string; null clears the attribute (store as empty string)
      const rangesValue = allowedRanges === null ? '' : JSON.stringify(allowedRanges);
      userAttributes.push({ Name: 'custom:allowedRanges', Value: rangesValue });
    }

    // Update attributes if any were provided
    if (userAttributes.length > 0) {
      const updateAttributesCommand = new AdminUpdateUserAttributesCommand({
        UserPoolId: USER_POOL_ID,
        Username: username,
        UserAttributes: userAttributes
      });
      await cognito.send(updateAttributesCommand);
    }

    // Update enabled status if provided
    if (enabled !== undefined) {
      if (enabled) {
        const enableCommand = new AdminEnableUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: username
        });
        await cognito.send(enableCommand);
      } else {
        const disableCommand = new AdminDisableUserCommand({
          UserPoolId: USER_POOL_ID,
          Username: username
        });
        await cognito.send(disableCommand);
      }
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'User updated successfully',
        username: username
      })
    };
  } catch (error) {
    console.error('Error updating user:', error);

    // Handle user not found
    if (error.name === 'UserNotFoundException') {
      return {
        statusCode: 404,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'User not found' })
      };
    }

    // Generic error
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
