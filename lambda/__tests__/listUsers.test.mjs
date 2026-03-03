/**
 * Tests for listUsers Lambda function
 * Verifies the Lambda function correctly lists Cognito users with pagination
 *
 * TDD: RED phase - Writing failing tests first
 */

import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { CognitoIdentityProviderClient, ListUsersCommand } from '@aws-sdk/client-cognito-identity-provider';

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
  const module = await import('../listUsers.mjs');

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

// Helper function to create mock Cognito user
const createMockCognitoUser = (username, email, status = 'CONFIRMED', role = 'editor') => ({
  Username: username,
  UserStatus: status,
  Enabled: true,
  UserCreateDate: new Date('2024-01-15T10:00:00Z'),
  UserLastModifiedDate: new Date('2024-01-20T15:30:00Z'),
  Attributes: [
    { Name: 'email', Value: email },
    { Name: 'email_verified', Value: 'true' },
    { Name: 'sub', Value: `sub-${username}` },
    { Name: 'custom:role', Value: role }
  ]
});

describe('listUsers Lambda', () => {
  describe('successful operations', () => {
    test('should return list of users with 200 status', async () => {
      // Arrange
      const mockUsers = [
        createMockCognitoUser('user1', 'user1@example.com', 'CONFIRMED', 'editor'),
        createMockCognitoUser('user2', 'user2@example.com', 'CONFIRMED', 'admin')
      ];

      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
        PaginationToken: null
      });

      // Act
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.users).toHaveLength(2);
      expect(body.users[0].username).toBe('user1');
      expect(body.users[0].email).toBe('user1@example.com');
    });

    test('should return users with correct fields', async () => {
      // Arrange
      const mockUsers = [
        createMockCognitoUser('testuser', 'test@example.com', 'CONFIRMED', 'editor')
      ];

      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
        PaginationToken: null
      });

      // Act
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      const user = body.users[0];

      expect(user).toHaveProperty('username', 'testuser');
      expect(user).toHaveProperty('email', 'test@example.com');
      expect(user).toHaveProperty('status', 'CONFIRMED');
      expect(user).toHaveProperty('role', 'editor');
      expect(user).toHaveProperty('createdAt');
      expect(user).toHaveProperty('lastModified');
    });

    test('should include CORS headers in response', async () => {
      // Arrange
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [],
        PaginationToken: null
      });

      // Act
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toContain('GET');
      expect(result.headers['Access-Control-Allow-Headers']).toContain('Authorization');
    });

    test('should return empty array when no users exist', async () => {
      // Arrange
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [],
        PaginationToken: null
      });

      // Act
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.users).toEqual([]);
    });
  });

  describe('pagination', () => {
    test('should return pagination token when more users exist', async () => {
      // Arrange
      const mockUsers = [
        createMockCognitoUser('user1', 'user1@example.com')
      ];

      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
        PaginationToken: 'next-page-token'
      });

      // Act
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.nextToken).toBe('next-page-token');
    });

    test('should use pagination token from query parameter', async () => {
      // Arrange
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [],
        PaginationToken: null
      });

      // Act
      await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: { nextToken: 'previous-page-token' }
      });

      // Assert
      const calls = cognitoMock.commandCalls(ListUsersCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.PaginationToken).toBe('previous-page-token');
    });

    test('should not include nextToken when there are no more pages', async () => {
      // Arrange
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [createMockCognitoUser('user1', 'user1@example.com')],
        PaginationToken: null
      });

      // Act
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      const body = JSON.parse(result.body);
      expect(body.nextToken).toBeUndefined();
    });

    test('should respect limit parameter', async () => {
      // Arrange
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [],
        PaginationToken: null
      });

      // Act
      await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: { limit: '10' }
      });

      // Assert
      const calls = cognitoMock.commandCalls(ListUsersCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Limit).toBe(10);
    });
  });

  describe('search/filter functionality', () => {
    test('should filter users by username when search parameter provided', async () => {
      // Arrange
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [createMockCognitoUser('john', 'john@example.com')],
        PaginationToken: null
      });

      // Act
      await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: { search: 'john' }
      });

      // Assert
      const calls = cognitoMock.commandCalls(ListUsersCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Filter).toContain('john');
    });

    test('should search by email when search contains @', async () => {
      // Arrange
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [createMockCognitoUser('john', 'john@example.com')],
        PaginationToken: null
      });

      // Act
      await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: { search: 'john@example.com' }
      });

      // Assert
      const calls = cognitoMock.commandCalls(ListUsersCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input.Filter).toContain('email');
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
      const result = await handler({ headers: {} });

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
      const result = await handler({ headers: { Authorization: 'Bearer invalid' } });

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
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      expect(result.statusCode).toBe(403);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Permission denied');
    });

    test('should return 403 for users with no role', async () => {
      // Arrange
      validateToken.mockResolvedValue({
        isValid: true,
        user: { username: 'no-role-user', email: 'user@example.com' }
      });
      checkPermission.mockReturnValue({
        allowed: false,
        reason: 'User has no role assigned',
        statusCode: 403
      });

      // Act
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      expect(result.statusCode).toBe(403);
    });

    test('should check manage-users permission', async () => {
      // Arrange
      cognitoMock.on(ListUsersCommand).resolves({
        Users: [],
        PaginationToken: null
      });

      // Act
      await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      expect(checkPermission).toHaveBeenCalledWith(
        expect.objectContaining({ role: 'admin' }),
        'manage-users'
      );
    });

    test('should allow admin users to list users', async () => {
      // Arrange
      validateToken.mockResolvedValue({
        isValid: true,
        user: { username: 'admin-user', role: 'admin', email: 'admin@example.com' }
      });
      checkPermission.mockReturnValue({
        allowed: true,
        reason: 'Operation "manage-users" authorized for role "admin"'
      });

      cognitoMock.on(ListUsersCommand).resolves({
        Users: [createMockCognitoUser('user1', 'user1@example.com')],
        PaginationToken: null
      });

      // Act
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

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
      const error = new Error('Cognito service error');
      cognitoMock.on(ListUsersCommand).rejects(error);

      // Act
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      expect(result.statusCode).toBe(500);
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(result.body)).toHaveProperty('error');
    });

    test('should include error message in response body', async () => {
      // Arrange
      const errorMessage = 'User pool not found';
      const error = new Error(errorMessage);
      cognitoMock.on(ListUsersCommand).rejects(error);

      // Act
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      const body = JSON.parse(result.body);
      expect(body.error).toBe(errorMessage);
    });

    test('should handle users with missing attributes gracefully', async () => {
      // Arrange - user with minimal attributes
      const mockUsers = [{
        Username: 'minimal-user',
        UserStatus: 'CONFIRMED',
        Enabled: true,
        UserCreateDate: new Date('2024-01-15T10:00:00Z'),
        UserLastModifiedDate: new Date('2024-01-20T15:30:00Z'),
        Attributes: [] // No attributes
      }];

      cognitoMock.on(ListUsersCommand).resolves({
        Users: mockUsers,
        PaginationToken: null
      });

      // Act
      const result = await handler({
        headers: { Authorization: 'Bearer valid-token' },
        queryStringParameters: {}
      });

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.users[0].username).toBe('minimal-user');
      expect(body.users[0].email).toBeNull();
      expect(body.users[0].role).toBeNull();
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
