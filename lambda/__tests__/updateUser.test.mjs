/**
 * Tests for updateUser Lambda function
 * Updates user attributes (role, enable/disable) in Cognito User Pool
 *
 * TDD: RED phase - Writing failing tests first
 */

import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CognitoIdentityProviderClient,
  AdminUpdateUserAttributesCommand,
  AdminEnableUserCommand,
  AdminDisableUserCommand,
  AdminGetUserCommand
} from '@aws-sdk/client-cognito-identity-provider';

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
  const module = await import('../updateUser.mjs');

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
const createEvent = (username, body, headers = { Authorization: 'Bearer valid-token' }) => ({
  headers,
  pathParameters: { username },
  body: JSON.stringify(body)
});

// Helper function to create mock Cognito get user response
const createMockCognitoUser = (username, email, role, enabled = true) => ({
  Username: username,
  UserStatus: 'CONFIRMED',
  Enabled: enabled,
  UserCreateDate: new Date('2024-01-15T10:00:00Z'),
  UserLastModifiedDate: new Date('2024-01-15T10:00:00Z'),
  UserAttributes: [
    { Name: 'email', Value: email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'sub', Value: `sub-${username}` },
    { Name: 'custom:role', Value: role }
  ]
});

describe('updateUser Lambda', () => {
  describe('successful role update', () => {
    test('should update user role and return 200 status', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const requestBody = { role: 'editor' };

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'admin')
      );
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toContain('updated');
    });

    test('should call AdminUpdateUserAttributesCommand with correct role attribute', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const requestBody = { role: 'admin' };

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'editor')
      );
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

      // Act
      await handler(createEvent(targetUsername, requestBody));

      // Assert
      const calls = cognitoMock.commandCalls(AdminUpdateUserAttributesCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Username).toBe(targetUsername);
      const roleAttr = calls[0].args[0].input.UserAttributes.find(attr => attr.Name === 'custom:role');
      expect(roleAttr).toBeDefined();
      expect(roleAttr.Value).toBe('admin');
    });

    test('should accept editor role', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const requestBody = { role: 'editor' };

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'admin')
      );
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(200);
    });

    test('should accept admin role', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const requestBody = { role: 'admin' };

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'editor')
      );
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(200);
    });
  });

  describe('enable/disable user', () => {
    test('should disable user when enabled is false', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const requestBody = { enabled: false };

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'editor', true)
      );
      cognitoMock.on(AdminDisableUserCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(200);
      const calls = cognitoMock.commandCalls(AdminDisableUserCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Username).toBe(targetUsername);
    });

    test('should enable user when enabled is true', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const requestBody = { enabled: true };

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'editor', false)
      );
      cognitoMock.on(AdminEnableUserCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(200);
      const calls = cognitoMock.commandCalls(AdminEnableUserCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Username).toBe(targetUsername);
    });

    test('should update both role and enabled status in same request', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const requestBody = { role: 'editor', enabled: false };

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'admin', true)
      );
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});
      cognitoMock.on(AdminDisableUserCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(200);
      expect(cognitoMock.commandCalls(AdminUpdateUserAttributesCommand)).toHaveLength(1);
      expect(cognitoMock.commandCalls(AdminDisableUserCommand)).toHaveLength(1);
    });
  });

  describe('self-modification prevention', () => {
    test('should return 403 when admin tries to change own role', async () => {
      // Arrange
      const adminUsername = 'admin-user';
      const requestBody = { role: 'editor' };

      validateToken.mockResolvedValue({
        isValid: true,
        user: { username: adminUsername, role: 'admin', email: 'admin@example.com' }
      });

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(adminUsername, 'admin@example.com', 'admin')
      );

      // Act
      const result = await handler(createEvent(adminUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('cannot');
    });

    test('should return 403 when admin tries to disable own account', async () => {
      // Arrange
      const adminUsername = 'admin-user';
      const requestBody = { enabled: false };

      validateToken.mockResolvedValue({
        isValid: true,
        user: { username: adminUsername, role: 'admin', email: 'admin@example.com' }
      });

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(adminUsername, 'admin@example.com', 'admin')
      );

      // Act
      const result = await handler(createEvent(adminUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('cannot');
    });

    test('should allow admin to modify other users', async () => {
      // Arrange
      const adminUsername = 'admin-user';
      const targetUsername = 'other-user@example.com';
      const requestBody = { role: 'editor' };

      validateToken.mockResolvedValue({
        isValid: true,
        user: { username: adminUsername, role: 'admin', email: 'admin@example.com' }
      });

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'admin')
      );
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(200);
    });
  });

  describe('user not found', () => {
    test('should return 404 when user does not exist', async () => {
      // Arrange
      const targetUsername = 'nonexistent-user@example.com';
      const requestBody = { role: 'editor' };

      const error = new Error('User does not exist');
      error.name = 'UserNotFoundException';
      cognitoMock.on(AdminGetUserCommand).rejects(error);

      // Act
      const result = await handler(createEvent(targetUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('not found');
    });
  });

  describe('validation', () => {
    test('should return 400 for invalid role', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const requestBody = { role: 'superuser' };

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'editor')
      );

      // Act
      const result = await handler(createEvent(targetUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('role');
    });

    test('should return 400 for empty body', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const requestBody = {};

      // Act
      const result = await handler(createEvent(targetUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBeDefined();
    });

    test('should return 400 for missing username in path', async () => {
      // Arrange
      const requestBody = { role: 'editor' };
      const event = {
        headers: { Authorization: 'Bearer valid-token' },
        pathParameters: null,
        body: JSON.stringify(requestBody)
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
    });

    test('should return 400 for invalid JSON body', async () => {
      // Arrange
      const event = {
        headers: { Authorization: 'Bearer valid-token' },
        pathParameters: { username: 'target-user@example.com' },
        body: 'invalid-json'
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid');
    });

    test('should return 400 when enabled is not boolean', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const requestBody = { enabled: 'yes' };

      // Act
      const result = await handler(createEvent(targetUsername, requestBody));

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('enabled');
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
      const result = await handler(createEvent('target-user@example.com', { role: 'editor' }, {}));

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
        'target-user@example.com',
        { role: 'editor' },
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
      const result = await handler(createEvent('target-user@example.com', { role: 'editor' }));

      // Assert
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Permission denied');
    });

    test('should check manage-users permission', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'editor')
      );
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

      // Act
      await handler(createEvent(targetUsername, { role: 'admin' }));

      // Assert
      expect(checkPermission).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' }),
        'manage-users'
      );
    });

    test('should allow admin users to update users', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      validateToken.mockResolvedValue({
        isValid: true,
        user: { username: 'admin-user', role: 'admin', email: 'admin@example.com' }
      });
      checkPermission.mockReturnValue({
        allowed: true,
        reason: 'Operation "manage-users" authorized for role "admin"'
      });

      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'editor')
      );
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername, { role: 'admin' }));

      // Assert
      expect(result.statusCode).toBe(200);
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
      const targetUsername = 'target-user@example.com';
      const error = new Error('Cognito service error');
      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'editor')
      );
      cognitoMock.on(AdminUpdateUserAttributesCommand).rejects(error);

      // Act
      const result = await handler(createEvent(targetUsername, { role: 'admin' }));

      // Assert
      expect(result.statusCode).toBe(500);
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(result.body)).toHaveProperty('error');
    });

    test('should include CORS headers in error response', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const error = new Error('Cognito service error');
      cognitoMock.on(AdminGetUserCommand).rejects(error);

      // Act
      const result = await handler(createEvent(targetUsername, { role: 'admin' }));

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('response format', () => {
    test('should include CORS headers in success response', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'editor')
      );
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername, { role: 'admin' }));

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toContain('PUT');
      expect(result.headers['Access-Control-Allow-Headers']).toContain('Authorization');
    });

    test('should return updated user information', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminGetUserCommand).resolves(
        createMockCognitoUser(targetUsername, targetUsername, 'editor')
      );
      cognitoMock.on(AdminUpdateUserAttributesCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername, { role: 'admin' }));

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBeDefined();
      expect(body.username).toBe(targetUsername);
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
