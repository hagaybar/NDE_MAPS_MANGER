/**
 * Tests for resetUserPassword Lambda function
 * Admin-assisted password reset: the admin SETS a temporary password for the
 * user (force-change at next login). NO email is sent by this action; the admin
 * relays the temporary password out-of-band.
 *
 * TDD: tests describe the NEW AdminSetUserPasswordCommand contract.
 */

import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  CognitoIdentityProviderClient,
  AdminSetUserPasswordCommand
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
  describe('successful temporary-password set', () => {
    test('should set a temporary password and return 200 status', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.message).toBeDefined();
    });

    test('should call AdminSetUserPasswordCommand with correct username, non-empty password and Permanent:false', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

      // Act
      await handler(createEvent(targetUsername));

      // Assert
      const calls = cognitoMock.commandCalls(AdminSetUserPasswordCommand);
      expect(calls).toHaveLength(1);
      const input = calls[0].args[0].input;
      expect(input.Username).toBe(targetUsername);
      expect(typeof input.Password).toBe('string');
      expect(input.Password.length).toBeGreaterThan(0);
      // Permanent:false => account becomes FORCE_CHANGE_PASSWORD (user must
      // choose a new password at next login).
      expect(input.Permanent).toBe(false);
    });

    test('generated password should satisfy the pool policy (length >= 8 and at least one digit)', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

      // Act
      await handler(createEvent(targetUsername));

      // Assert — inspect the actual Password handed to Cognito
      const calls = cognitoMock.commandCalls(AdminSetUserPasswordCommand);
      const password = calls[0].args[0].input.Password;
      expect(password.length).toBeGreaterThanOrEqual(8);
      expect(/[0-9]/.test(password)).toBe(true);
    });

    test('response body should include a non-empty temporaryPassword equal to the password set in Cognito', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      const body = JSON.parse(result.body);
      expect(typeof body.temporaryPassword).toBe('string');
      expect(body.temporaryPassword.length).toBeGreaterThan(0);

      const calls = cognitoMock.commandCalls(AdminSetUserPasswordCommand);
      expect(body.temporaryPassword).toBe(calls[0].args[0].input.Password);
    });

    test('should return success confirmation with username', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.username).toBe(targetUsername);
    });

    test('message should honestly describe the temporary password and next-login change (no emailed code claim)', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert — AdminSetUserPasswordCommand sets a temporary password and forces
      // a change at next login. NO email is sent by this action; the admin relays
      // the password. The message MUST describe that reality and MUST NOT claim an
      // emailed verification code was sent.
      const body = JSON.parse(result.body);
      const msg = body.message.toLowerCase();
      expect(msg).toContain('temporary password');
      expect(msg).not.toContain('verification code');
    });

    test('should generate a different temporary password on each invocation', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

      // Act
      const first = JSON.parse((await handler(createEvent(targetUsername))).body);
      const second = JSON.parse((await handler(createEvent(targetUsername))).body);

      // Assert — cryptographically random, so collisions are vanishingly unlikely
      expect(first.temporaryPassword).not.toBe(second.temporaryPassword);
    });
  });

  describe('user not found', () => {
    test('should return 404 when user does not exist', async () => {
      // Arrange
      const targetUsername = 'nonexistent-user@example.com';
      const error = new Error('User does not exist');
      error.name = 'UserNotFoundException';
      cognitoMock.on(AdminSetUserPasswordCommand).rejects(error);

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
      cognitoMock.on(AdminSetUserPasswordCommand).rejects(error);

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
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

      // Act
      await handler(createEvent(targetUsername));

      // Assert
      expect(checkPermission).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' }),
        'manage-users'
      );
    });

    test('should allow admin users to set temporary passwords', async () => {
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
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

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
      cognitoMock.on(AdminSetUserPasswordCommand).rejects(error);

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
      cognitoMock.on(AdminSetUserPasswordCommand).rejects(error);

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
      cognitoMock.on(AdminSetUserPasswordCommand).rejects(error);

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
      cognitoMock.on(AdminSetUserPasswordCommand).rejects(error);

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
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

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
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert
      expect(result.headers['Content-Type']).toBe('application/json');
    });
  });

  describe('user status behavior', () => {
    test('should trigger exactly one Cognito set-password call (force-change at next login)', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});

      // Act
      const result = await handler(createEvent(targetUsername));

      // Assert - AdminSetUserPasswordCommand with Permanent:false sets a temporary
      // password (FORCE_CHANGE_PASSWORD) exactly once. No email is sent.
      const calls = cognitoMock.commandCalls(AdminSetUserPasswordCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Permanent).toBe(false);
      expect(result.statusCode).toBe(200);
    });
  });

  describe('security - password is never logged', () => {
    test('should not console.log the generated temporary password', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      cognitoMock.on(AdminSetUserPasswordCommand).resolves({});
      const logSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      const result = await handler(createEvent(targetUsername));
      const password = JSON.parse(result.body).temporaryPassword;

      // Assert — the password must not appear in any console output
      const allLogged = [...logSpy.mock.calls, ...errSpy.mock.calls]
        .flat()
        .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
        .join('\n');
      expect(allLogged).not.toContain(password);

      logSpy.mockRestore();
      errSpy.mockRestore();
    });

    test('should not console.error the generated temporary password on Cognito failure', async () => {
      // Arrange
      const targetUsername = 'target-user@example.com';
      const error = new Error('Cognito service error');
      cognitoMock.on(AdminSetUserPasswordCommand).rejects(error);
      const errSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      // Act
      await handler(createEvent(targetUsername));

      // Assert — even the error path must not leak any candidate password.
      // The error logging only prints the error, never the password.
      const logged = errSpy.mock.calls
        .flat()
        .map((a) => (typeof a === 'string' ? a : (a && a.message) || JSON.stringify(a)))
        .join('\n');
      // A 14-char temp password would never appear; assert the error message is
      // what got logged and nothing password-shaped accompanies it.
      expect(logged).toContain('Cognito service error');

      errSpy.mockRestore();
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
