/**
 * Tests for getCsv Lambda function
 * Verifies the Lambda function correctly retrieves CSV data from S3
 */

import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';

// Mock auth modules before importing handler
jest.unstable_mockModule('../auth-middleware.mjs', () => ({
  validateToken: jest.fn().mockResolvedValue({
    isValid: true,
    user: { username: 'test-user', role: 'editor', email: 'test@example.com' }
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

// Create S3 mock
const s3Mock = mockClient(S3Client);

// Helper to create mock S3 stream
const createMockStream = (content) => {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);
  return sdkStreamMixin(stream);
};

// Import the handler and mocked modules after setting up mocks
let handler;
let validateToken;
let checkPermission;
let createAuthResponse;

beforeAll(async () => {
  // Dynamically import the handler and mocked modules
  const authMiddleware = await import('../auth-middleware.mjs');
  const roleAuth = await import('../role-auth.mjs');
  const module = await import('../getCsv.mjs');

  handler = module.handler;
  validateToken = authMiddleware.validateToken;
  createAuthResponse = authMiddleware.createAuthResponse;
  checkPermission = roleAuth.checkPermission;
});

beforeEach(() => {
  // Reset mocks before each test
  s3Mock.reset();
  jest.clearAllMocks();

  // Reset default auth behavior
  validateToken.mockResolvedValue({
    isValid: true,
    user: { username: 'test-user', role: 'editor', email: 'test@example.com' }
  });
  checkPermission.mockReturnValue({
    allowed: true,
    reason: 'Operation authorized'
  });
});

describe('getCsv Lambda', () => {
  describe('successful operations', () => {
    test('should return CSV content with 200 status', async () => {
      // Arrange
      const mockCsvContent = 'id,name,location\n1,Test,Floor1';
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(mockCsvContent),
        ContentType: 'text/csv'
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.body).toBe(mockCsvContent);
      expect(result.headers['Content-Type']).toBe('text/csv; charset=utf-8');
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });

    test('should include CORS headers in response', async () => {
      // Arrange
      const mockCsvContent = 'test,data';
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(mockCsvContent)
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
      expect(result.headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
    });

    test('should call S3 with correct bucket and key', async () => {
      // Arrange
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream('test')
      });

      // Act
      await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toEqual({
        Bucket: 'tau-cenlib-primo-assets-hagay-3602',
        Key: 'data/mapping.csv'
      });
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

    test('should return 403 for insufficient permissions', async () => {
      // Arrange
      validateToken.mockResolvedValue({
        isValid: true,
        user: { username: 'test-user', role: 'viewer' }
      });
      checkPermission.mockReturnValue({
        allowed: false,
        reason: 'Permission denied - role "viewer" is not allowed to perform "read"',
        statusCode: 403
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.statusCode).toBe(403);
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
      expect(result.headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
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
    test('should return 500 status on S3 error', async () => {
      // Arrange
      const error = new Error('S3 error');
      error.name = 'NoSuchKey';
      s3Mock.on(GetObjectCommand).rejects(error);

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.statusCode).toBe(500);
      expect(result.headers['Content-Type']).toBe('application/json');
      expect(JSON.parse(result.body)).toHaveProperty('error');
    });

    test('should include error message in response body', async () => {
      // Arrange
      const errorMessage = 'The specified key does not exist.';
      const error = new Error(errorMessage);
      s3Mock.on(GetObjectCommand).rejects(error);

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const body = JSON.parse(result.body);
      expect(body.error).toBe(errorMessage);
    });
  });
});

// Simple verification test
describe('Jest Setup Verification', () => {
  test('Jest is configured correctly for ESM', () => {
    expect(true).toBe(true);
  });

  test('aws-sdk-client-mock is working', () => {
    expect(s3Mock).toBeDefined();
    expect(typeof s3Mock.on).toBe('function');
    expect(typeof s3Mock.reset).toBe('function');
  });

  test('async/await works correctly', async () => {
    const asyncFn = async () => 'success';
    const result = await asyncFn();
    expect(result).toBe('success');
  });
});
