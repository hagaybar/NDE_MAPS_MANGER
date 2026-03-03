/**
 * Tests for createUser Lambda function
 * Creates new users in Cognito User Pool with email and role
 *
 * TDD: RED phase - Writing failing tests first
 */

import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { CognitoIdentityProviderClient, AdminCreateUserCommand, UsernameExistsException } from '@aws-sdk/client-cognito-identity-provider';

// Mock auth modules before importing handler
jest.unstable_mockModule('../auth-middleware.mjs', () => ({
  validateToken: jest.fn().mockResolvedValue({
    isValid: true,
    user: { username: 'admin-user', role: 'admin', email: 'admin@example.com' }
  }),
  createAuthResponse: jest.fn((statusCode, body) => ({
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS'
    },
    body: JSON.stringify(body)
  }))
}));

jest.unstable_mockModule('../role-auth.mjs', () => ({
  checkPermission: jest.fn().mockReturnValue({
    allowed: true,
    reason: 'Operation authorized'
  })
}));

// Create Cognito mock
const cognitoMock = mockClient(CognitoIdentityProviderClient);

// Import the handler and mocked modules after setting up mocks
let handler;
let validateToken;
let checkPermission;
let createAuthResponse;

beforeAll(async () => {
  // Dynamically import the handler and mocked modules
  const authMiddleware = await import('../auth-middleware.mjs');
  const roleAuth = await import('../role-auth.mjs');
  const module = await import('../createUser.mjs');

  handler = module.handler;
  validateToken = authMiddleware.validateToken;
  createAuthResponse = authMiddleware.createAuthResponse;
  checkPermission = roleAuth.checkPermission;
});

beforeEach(() => {
  // Reset mocks before each test
  cognitoMock.reset();
  jest.clearAllMocks();

  // Reset default auth behavior - admin user
  validateToken.mockResolvedValue({
    isValid: true,
    user: { username: 'admin-user', role: 'admin', email: 'admin@example.com' }
  });
  checkPermission.mockReturnValue({
    allowed: true,
    reason: 'Operation authorized'
  });
});

// Helper function to create API Gateway event
const createEvent = (body, headers = { Authorization: 'Bearer valid-token' }) => ({
  headers,
  body: JSON.stringify(body)
});

// Helper function to create mock Cognito create user response
const createMockCognitoResponse = (username, email, role) => ({
  User: {
    Username: username,
    UserStatus: 'FORCE_CHANGE_PASSWORD',
    Enabled: true,
    UserCreateDate: new Date('2024-01-15T10:00:00Z'),
    UserLastModifiedDate: new Date('2024-01-15T10:00:00Z'),
    Attributes: [
      { Name: 'email', Value: email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'sub', Value: `sub-${username}` },
      { Name: 'custom:role', Value: role }
    ]
  }
});

describe('createUser Lambda', () => {
  describe('successful user creation', () => {
    test('should create user with email as username and return 201 status', async () => {
      // Arrange
      const requestBody = {
        email: 'newuser@example.com',
        role: 'editor'
      };

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('newuser@example.com', 'newuser@example.com', 'editor')
      );

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.user).toBeDefined();
      expect(body.user.email).toBe('newuser@example.com');
    });

    test('should use email as username in Cognito', async () => {
      // Arrange
      const requestBody = {
        email: 'test@example.com',
        role: 'editor'
      };

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('test@example.com', 'test@example.com', 'editor')
      );

      // Act
      await handler(createEvent(requestBody));

      // Assert
      const calls = cognitoMock.commandCalls(AdminCreateUserCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Username).toBe('test@example.com');
    });

    test('should set custom:role attribute on user', async () => {
      // Arrange
      const requestBody = {
        email: 'admin@example.com',
        role: 'admin'
      };

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('admin@example.com', 'admin@example.com', 'admin')
      );

      // Act
      await handler(createEvent(requestBody));

      // Assert
      const calls = cognitoMock.commandCalls(AdminCreateUserCommand);
      expect(calls).toHaveLength(1);
      const userAttributes = calls[0].args[0].input.UserAttributes;
      const roleAttr = userAttributes.find(attr => attr.Name === 'custom:role');
      expect(roleAttr).toBeDefined();
      expect(roleAttr.Value).toBe('admin');
    });

    test('should set email attribute on user', async () => {
      // Arrange
      const requestBody = {
        email: 'user@example.com',
        role: 'editor'
      };

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('user@example.com', 'user@example.com', 'editor')
      );

      // Act
      await handler(createEvent(requestBody));

      // Assert
      const calls = cognitoMock.commandCalls(AdminCreateUserCommand);
      const userAttributes = calls[0].args[0].input.UserAttributes;
      const emailAttr = userAttributes.find(attr => attr.Name === 'email');
      expect(emailAttr).toBeDefined();
      expect(emailAttr.Value).toBe('user@example.com');
    });

    test('should set DesiredDeliveryMediums to EMAIL', async () => {
      // Arrange
      const requestBody = {
        email: 'user@example.com',
        role: 'editor'
      };

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('user@example.com', 'user@example.com', 'editor')
      );

      // Act
      await handler(createEvent(requestBody));

      // Assert
      const calls = cognitoMock.commandCalls(AdminCreateUserCommand);
      expect(calls[0].args[0].input.DesiredDeliveryMediums).toContain('EMAIL');
    });

    test('should return user info without password', async () => {
      // Arrange
      const requestBody = {
        email: 'user@example.com',
        role: 'editor'
      };

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('user@example.com', 'user@example.com', 'editor')
      );

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      const body = JSON.parse(result.body);
      expect(body.user.password).toBeUndefined();
      expect(body.user.temporaryPassword).toBeUndefined();
    });

    test('should return created user with all expected fields', async () => {
      // Arrange
      const requestBody = {
        email: 'complete@example.com',
        role: 'editor'
      };

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('complete@example.com', 'complete@example.com', 'editor')
      );

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(201);
      const body = JSON.parse(result.body);
      expect(body.user).toHaveProperty('username', 'complete@example.com');
      expect(body.user).toHaveProperty('email', 'complete@example.com');
      expect(body.user).toHaveProperty('status', 'FORCE_CHANGE_PASSWORD');
      expect(body.user).toHaveProperty('role', 'editor');
      expect(body.user).toHaveProperty('createdAt');
    });

    test('should include CORS headers in response', async () => {
      // Arrange
      const requestBody = {
        email: 'user@example.com',
        role: 'editor'
      };

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('user@example.com', 'user@example.com', 'editor')
      );

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(result.headers['Access-Control-Allow-Headers']).toContain('Authorization');
    });
  });

  describe('email validation', () => {
    test('should return 400 for missing email', async () => {
      // Arrange
      const requestBody = {
        role: 'editor'
      };

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('email');
    });

    test('should return 400 for invalid email format', async () => {
      // Arrange
      const requestBody = {
        email: 'invalid-email',
        role: 'editor'
      };

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('email');
    });

    test('should return 400 for email without @', async () => {
      // Arrange
      const requestBody = {
        email: 'userexample.com',
        role: 'editor'
      };

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(400);
    });

    test('should return 400 for email without domain', async () => {
      // Arrange
      const requestBody = {
        email: 'user@',
        role: 'editor'
      };

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(400);
    });

    test('should return 400 for empty email', async () => {
      // Arrange
      const requestBody = {
        email: '',
        role: 'editor'
      };

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(400);
    });

    test('should accept valid email formats', async () => {
      // Arrange
      const requestBody = {
        email: 'valid.user+tag@sub.example.com',
        role: 'editor'
      };

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('valid.user+tag@sub.example.com', 'valid.user+tag@sub.example.com', 'editor')
      );

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(201);
    });
  });

  describe('role validation', () => {
    test('should return 400 for missing role', async () => {
      // Arrange
      const requestBody = {
        email: 'user@example.com'
      };

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('role');
    });

    test('should return 400 for invalid role', async () => {
      // Arrange
      const requestBody = {
        email: 'user@example.com',
        role: 'superuser'
      };

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('role');
    });

    test('should accept admin role', async () => {
      // Arrange
      const requestBody = {
        email: 'admin@example.com',
        role: 'admin'
      };

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('admin@example.com', 'admin@example.com', 'admin')
      );

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(201);
    });

    test('should accept editor role', async () => {
      // Arrange
      const requestBody = {
        email: 'editor@example.com',
        role: 'editor'
      };

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('editor@example.com', 'editor@example.com', 'editor')
      );

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(201);
    });
  });

  describe('user already exists', () => {
    test('should return 409 when user already exists', async () => {
      // Arrange
      const requestBody = {
        email: 'existing@example.com',
        role: 'editor'
      };

      const error = new Error('User already exists');
      error.name = 'UsernameExistsException';
      cognitoMock.on(AdminCreateUserCommand).rejects(error);

      // Act
      const result = await handler(createEvent(requestBody));

      // Assert
      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('exists');
    });
  });

  describe('authentication', () => {
    test('should return 401 for missing authorization token', async () => {
      // Arrange
      validateToken.mockResolvedValue({
        isValid: false,
        statusCode: 401,
        error: 'Missing authorization token'
      });

      // Act
      const result = await handler(createEvent({ email: 'user@example.com', role: 'editor' }, {}));

      // Assert
      expect(result.statusCode).toBe(401);
      const body = JSON.parse(result.body);
      expect(body.error).toBe('Missing authorization token');
    });

    test('should return 401 for invalid token', async () => {
      // Arrange
      validateToken.mockResolvedValue({
        isValid: false,
        statusCode: 401,
        error: 'Invalid token'
      });

      // Act
      const result = await handler(createEvent(
        { email: 'user@example.com', role: 'editor' },
        { Authorization: 'Bearer invalid' }
      ));

      // Assert
      expect(result.statusCode).toBe(401);
    });
  });

  describe('authorization - admin role required', () => {
    test('should return 403 for non-admin users (editor role)', async () => {
      // Arrange
      validateToken.mockResolvedValue({
        isValid: true,
        user: { username: 'editor-user', role: 'editor', email: 'editor@example.com' }
      });
      checkPermission.mockReturnValue({
        allowed: false,
        reason: 'Permission denied - role "editor" is not allowed to perform "manage-users"',
        statusCode: 403
      });

      // Act
      const result = await handler(createEvent({ email: 'newuser@example.com', role: 'editor' }));

      // Assert
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Permission denied');
    });

    test('should check manage-users permission', async () => {
      // Arrange
      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('user@example.com', 'user@example.com', 'editor')
      );

      // Act
      await handler(createEvent({ email: 'user@example.com', role: 'editor' }));

      // Assert
      expect(checkPermission).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' }),
        'manage-users'
      );
    });

    test('should allow admin users to create users', async () => {
      // Arrange
      validateToken.mockResolvedValue({
        isValid: true,
        user: { username: 'admin-user', role: 'admin', email: 'admin@example.com' }
      });
      checkPermission.mockReturnValue({
        allowed: true,
        reason: 'Operation "manage-users" authorized for role "admin"'
      });

      cognitoMock.on(AdminCreateUserCommand).resolves(
        createMockCognitoResponse('newuser@example.com', 'newuser@example.com', 'editor')
      );

      // Act
      const result = await handler(createEvent({ email: 'newuser@example.com', role: 'editor' }));

      // Assert
      expect(result.statusCode).toBe(201);
    });
  });

  describe('CORS preflight', () => {
    test('should handle OPTIONS preflight request', async () => {
      // Arrange
      const event = {
        httpMethod: 'OPTIONS'
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Headers']).toContain('Authorization');
      expect(result.body).toBe('');
    });

    test('should handle OPTIONS with requestContext format (HTTP API v2)', async () => {
      // Arrange
      const event = {
        requestContext: {
          http: {
            method: 'OPTIONS'
          }
        }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('error handling', () => {
    test('should return 500 status on Cognito error', async () => {
      // Arrange
      const error = new Error('Cognito service error');
      cognitoMock.on(AdminCreateUserCommand).rejects(error);

      // Act
      const result = await handler(createEvent({ email: 'user@example.com', role: 'editor' }));

      // Assert
      expect(result.statusCode).toBe(500);
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(result.body)).toHaveProperty('error');
    });

    test('should return 400 for invalid JSON body', async () => {
      // Arrange
      const event = {
        headers: { Authorization: 'Bearer valid-token' },
        body: 'invalid-json'
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid');
    });

    test('should return 400 for missing body', async () => {
      // Arrange
      const event = {
        headers: { Authorization: 'Bearer valid-token' },
        body: null
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
    });
  });
});

// Simple verification test
describe('Jest Setup Verification', () => {
  test('Jest is configured correctly for ESM', () => {
    expect(true).toBe(true);
  });

  test('aws-sdk-client-mock is working with Cognito', () => {
    expect(cognitoMock).toBeDefined();
    expect(typeof cognitoMock.on).toBe('function');
    expect(typeof cognitoMock.reset).toBe('function');
  });

  test('async/await works correctly', async () => {
    const asyncFn = async () => 'success';
    const result = await asyncFn();
    expect(result).toBe('success');
  });
});
