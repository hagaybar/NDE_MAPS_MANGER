/**
 * Reset User Password Lambda Function
 * Admin-triggered password reset for user (Option A — self-service code).
 *
 * Uses Cognito AdminResetUserPasswordCommand, which:
 *  - sets the account status to RESET_REQUIRED, and
 *  - emails the user a bare verification CODE via the forgot-password template.
 * It does NOT send a temporary password and does NOT set FORCE_CHANGE_PASSWORD.
 * The user completes the reset on the login page's "Forgot your password?" flow
 * (enter the emailed code, then choose a new password). No password value is
 * ever generated, returned, or surfaced to the admin.
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
    // Reset the user's password - this sets the account to RESET_REQUIRED and
    // emails the user a verification CODE (via the forgot-password template).
    // It does NOT send a temporary password and does NOT set FORCE_CHANGE_PASSWORD.
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
        message: 'Password reset initiated. A verification code has been emailed to the user. They complete the reset on the login page via "Forgot your password?" (enter the code, then set a new password).',
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
