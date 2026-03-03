/**
 * Create User Lambda Function
 * Creates new users in Cognito User Pool with email as username and role assignment
 * Requires admin role to access
 */

import { CognitoIdentityProviderClient, AdminCreateUserCommand } from '@aws-sdk/client-cognito-identity-provider';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';

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
 * Validate email format using regex
 * @param {string} email - Email to validate
 * @returns {boolean} True if valid email format
 */
const isValidEmail = (email) => {
  if (!email || typeof email !== 'string') {
    return false;
  }
  // Basic email validation regex
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
};

/**
 * Validate role against allowed roles
 * @param {string} role - Role to validate
 * @returns {boolean} True if valid role
 */
const isValidRole = (role) => {
  return VALID_ROLES.includes(role);
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
 * Map Cognito user to clean response format (without sensitive data)
 * @param {Object} cognitoUser - Raw Cognito user object
 * @returns {Object} Cleaned user object
 */
const mapUser = (cognitoUser) => {
  const attributes = cognitoUser.Attributes || [];

  return {
    username: cognitoUser.Username,
    email: getAttribute(attributes, 'email'),
    status: cognitoUser.UserStatus,
    role: getAttribute(attributes, 'custom:role'),
    createdAt: cognitoUser.UserCreateDate ? cognitoUser.UserCreateDate.toISOString() : null,
    lastModified: cognitoUser.UserLastModifiedDate ? cognitoUser.UserLastModifiedDate.toISOString() : null
  };
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

  // Validate email
  if (!data.email) {
    return { error: 'email is required' };
  }
  if (!isValidEmail(data.email)) {
    return { error: 'Invalid email format' };
  }

  // Validate role
  if (!data.role) {
    return { error: 'role is required' };
  }
  if (!isValidRole(data.role)) {
    return { error: `Invalid role. Must be one of: ${VALID_ROLES.join(', ')}` };
  }

  return { data };
};

/**
 * Lambda handler for creating Cognito users
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

  const { email, role } = data;

  try {
    // Build AdminCreateUserCommand input
    const commandInput = {
      UserPoolId: USER_POOL_ID,
      Username: email,  // Use email as username
      UserAttributes: [
        { Name: 'email', Value: email },
        { Name: 'email_verified', Value: 'true' },
        { Name: 'custom:role', Value: role }
      ],
      DesiredDeliveryMediums: ['EMAIL']  // Send temporary password via email
    };

    // Execute AdminCreateUserCommand
    const command = new AdminCreateUserCommand(commandInput);
    const response = await cognito.send(command);

    // Map user to clean format (without password)
    const user = mapUser(response.User);

    return {
      statusCode: 201,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ user })
    };
  } catch (error) {
    console.error('Error creating user:', error);

    // Handle user already exists
    if (error.name === 'UsernameExistsException') {
      return {
        statusCode: 409,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'User with this email already exists' })
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
