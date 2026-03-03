/**
 * Tests for resetUserPassword Lambda function
 * Admin-triggered password reset for user
 *
 * TDD: RED phase - Writing failing tests first
 */

import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CognitoIdentityProviderClient,
  AdminResetUserPasswordCommand
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
  const module = await import('../resetUserPassword.mjs');

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

// Helper function to create API Gateway event for POST request
const createEvent = (username, headers = { Authorization: 'Bearer valid-token' }) => ({
  httpMethod: 'POST',
  headers,
  pathParameters: { username }
});

describe('resetUserPassword Lambda', () => {
  describe('successful password reset', () => {
    test('should reset user password and return 200 status', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminResetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBeDefined();
    });

    test('should call AdminResetUserPasswordCommand with correct parameters', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminResetUserPasswordCommand).resolves({});

      // Act
      await handler(createEvent(targetUsername));

      // Assert
      const calls = cognitoMock.commandCalls(AdminResetUserPasswordCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Username).toBe(targetUsername);
    });

    test('should return success confirmation with username', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminResetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.username).toBe(targetUsername);
      expect(body.message).toContain('password');
    });

    test('should indicate user will be forced to change password', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminResetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      const body = JSON.parse(result.body);
      // Message should mention temporary password or force change
      expect(body.message.toLowerCase()).toMatch(/temporary|force|change/);
    });
  });

  describe('user not found', () => {
    test('should return 404 when user does not exist', async () => {
      // Arrange
      const targetUsername = 'nonexistent-user@example.com';
      const error = new Error('User does not exist');
      error.name = 'UserNotFoundException';
      cognitoMock.on(AdminResetUserPasswordCommand).rejects(error);

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('not found');
    });

    test('should not expose internal error details for UserNotFoundException', async () => {
      // Arrange
      const targetUsername = 'nonexistent-user@example.com';
      const error = new Error('User does not exist in the user pool');
      error.name = 'UserNotFoundException';
      cognitoMock.on(AdminResetUserPasswordCommand).rejects(error);

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      const body = JSON.parse(result.body);
      expect(body.error).toBe('User not found');
    });
  });

  describe('validation', () => {
    test('should return 400 for missing username in path', async () => {
      // Arrange
      const event = {
        httpMethod: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        pathParameters: null
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toBeDefined();
    });

    test('should return 400 for empty username in path', async () => {
      // Arrange
      const event = {
        httpMethod: 'POST',
        headers: { Authorization: 'Bearer valid-token' },
        pathParameters: { username: '' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
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
      const result = await handler(createEvent('target-user@example.com', {}));

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
      const result = await handler(createEvent('target-user@example.com'));

      // Assert
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Permission denied');
    });

    test('should check manage-users permission', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminResetUserPasswordCommand).resolves({});

      // Act
      await handler(createEvent(targetUsername));

      // Assert
      expect(checkPermission).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' }),
        'manage-users'
      );
    });

    test('should allow admin users to reset passwords', async () => {
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
      cognitoMock.on(AdminResetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

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
      cognitoMock.on(AdminResetUserPasswordCommand).rejects(error);

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.statusCode).toBe(500);
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(result.body)).toHaveProperty('error');
    });

    test('should include CORS headers in error response', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const error = new Error('Cognito service error');
      cognitoMock.on(AdminResetUserPasswordCommand).rejects(error);

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });

    test('should handle InvalidParameterException', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const error = new Error('Invalid parameter');
      error.name = 'InvalidParameterException';
      cognitoMock.on(AdminResetUserPasswordCommand).rejects(error);

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.statusCode).toBe(400);
    });

    test('should handle NotAuthorizedException', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const error = new Error('Not authorized');
      error.name = 'NotAuthorizedException';
      cognitoMock.on(AdminResetUserPasswordCommand).rejects(error);

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.statusCode).toBe(403);
    });
  });

  describe('response format', () => {
    test('should include CORS headers in success response', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminResetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toContain('POST');
      expect(result.headers['Access-Control-Allow-Headers']).toContain('Authorization');
    });

    test('should return Content-Type application/json', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminResetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('user status behavior', () => {
    test('should trigger email with temporary password', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminResetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert - AdminResetUserPasswordCommand triggers email
      const calls = cognitoMock.commandCalls(AdminResetUserPasswordCommand);
      expect(calls).toHaveLength(1);
      expect(result.statusCode).toBe(200);
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
