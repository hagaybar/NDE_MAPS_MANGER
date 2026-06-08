/**
 * Reset User Password Lambda Function
 * Admin-assisted password reset (admin SETS a temporary password).
 *
 * Uses Cognito AdminSetUserPasswordCommand with Permanent:false, which:
 *  - sets a server-generated temporary password on the account, and
 *  - puts the account into FORCE_CHANGE_PASSWORD status, so the user MUST
 *    choose their own new password at next sign-in.
 * NO email is sent by this action. The temporary password is generated here and
 * returned to the admin so they can relay it to the user out-of-band (e.g. by
 * phone or in person). The user signs in with it and is immediately required to
 * pick a permanent password.
 *
 * SECURITY: the generated temporary password is NEVER logged. It is only
 * returned once in the HTTP response body for the admin to relay.
 */

import crypto from 'crypto';
import {
  CognitoIdentityProviderClient,
  AdminSetUserPasswordCommand
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

// Character sets for the temporary password. Ambiguous characters (0/O, 1/l/I)
// are deliberately excluded so the admin can read the password aloud / type it
// without confusion. Symbols are limited to a couple of safe, unambiguous ones.
const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O
const LOWER = 'abcdefghijkmnpqrstuvwxyz'; // no l, o
const DIGITS = '23456789'; // no 0, 1
const SYMBOLS = '!#';
const ALL = UPPER + LOWER + DIGITS + SYMBOLS;
const TEMP_PASSWORD_LENGTH = 14;

/**
 * Pick one random character from a string using a CSPRNG (crypto.randomInt).
 * @param {string} charset - non-empty source string
 * @returns {string} a single character
 */
const pick = (charset) => charset[crypto.randomInt(charset.length)];

/**
 * Generate a strong temporary password that satisfies the Cognito pool policy
 * (MinimumLength 8, RequireNumbers true). We over-deliver for robustness: ~14
 * characters guaranteed to contain at least one upper, one lower and one digit,
 * with the remainder drawn from the full (ambiguity-free) alphabet, then shuffled
 * so the guaranteed characters are not in fixed positions. All randomness comes
 * from Node's crypto module (never Math.random).
 * @returns {string} the temporary password
 */
const generateTemporaryPassword = () => {
  // Guarantee policy/robustness requirements with one of each required class.
  const required = [pick(UPPER), pick(LOWER), pick(DIGITS)];
  const chars = [...required];
  while (chars.length < TEMP_PASSWORD_LENGTH) {
    chars.push(pick(ALL));
  }
  // Fisher–Yates shuffle with crypto randomness so guaranteed chars are spread.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
};

/**
 * Lambda handler for admin-assisted password reset.
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

  // Generate the temporary password server-side. NEVER log this value.
  const temporaryPassword = generateTemporaryPassword();

  try {
    // Set the temporary password with Permanent:false. This puts the account in
    // FORCE_CHANGE_PASSWORD status so the user must choose a new password at next
    // sign-in. No email is sent by this command; the admin relays the password.
    const setPasswordCommand = new AdminSetUserPasswordCommand({
      UserPoolId: USER_POOL_ID,
      Username: username,
      Password: temporaryPassword,
      Permanent: false
    });
    await cognito.send(setPasswordCommand);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        message: "Temporary password set. Give it to the user and ask them to sign in — they'll be required to choose a new password.",
        username: username,
        temporaryPassword: temporaryPassword
      })
    };
  } catch (error) {
    // Log the error only — never the temporary password.
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
