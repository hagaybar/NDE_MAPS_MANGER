/**
 * Reset User Password Lambda Function
 * Admin-triggered password reset for user
 * Sends a new temporary password via email
 * User will be forced to change password on next login (FORCE_CHANGE_PASSWORD status)
 */

import {
  CognitoIdentityProviderClient,
  AdminResetUserPasswordCommand
} from '@aws-sdk/client-cognito-identity-provider';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';

const cognito = new CognitoIdentityProviderClient({ region: process.env.AWS_REGION || 'us-east-1' });
const USER_POOL_ID = process.env.COGNITO_USER_POOL_ID || 'us-east-1_g9q5cPhVg';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

/**
 * Lambda handler for resetting user password
 * POST /api/users/{username}/reset-password
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

  try {
    // Reset the user's password - this triggers email with temporary password
    // and sets user status to FORCE_CHANGE_PASSWORD
    const resetPasswordCommand = new AdminResetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: username
    });
    await cognito.send(resetPasswordCommand);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'Password reset initiated. A temporary password has been sent via email. User will be forced to change password on next login.',
        username: username
      })
    };
  } catch (error) {
    console.error('Error resetting user password:', error);

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

    // Handle invalid parameter
    if (error.name === 'InvalidParameterException') {
      return {
        statusCode: 400,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: error.message })
      };
    }

    // Handle not authorized (Cognito-level authorization)
    if (error.name === 'NotAuthorizedException') {
      return {
        statusCode: 403,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: error.message })
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
