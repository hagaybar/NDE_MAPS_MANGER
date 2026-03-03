/**
 * Delete User Lambda Function
 * Deletes user from Cognito User Pool
 * Requires admin role to access
 */

import {
  CognitoIdentityProviderClient,
  AdminDeleteUserCommand
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
 * Lambda handler for deleting Cognito users
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

  // Prevent self-deletion (admin cannot delete own account)
  if (username === authResult.user.username) {
    return {
      statusCode: 403,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: 'You cannot delete your own account' })
    };
  }

  try {
    // Delete the user from Cognito
    const deleteUserCommand = new AdminDeleteUserCommand({
      UserPoolId: USER_POOL_ID,
      Username: username
    });
    await cognito.send(deleteUserCommand);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: 'User deleted successfully',
        username: username
      })
    };
  } catch (error) {
    console.error('Error deleting user:', error);

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
