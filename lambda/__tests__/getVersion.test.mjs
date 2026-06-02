/**
 * Tests for getVersion Lambda function
 * Verifies the Lambda function correctly retrieves a specific CSV version from S3
 *
 * Version filename pattern: mapping_{timestamp}_{username}.csv
 * Example: mapping_2026-03-01T12-00-00-000Z_admin.csv
 * S3 Path: versions/data/{versionId}
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

beforeAll(async () => {
  const authMiddleware = await import('../auth-middleware.mjs');
  const roleAuth = await import('../role-auth.mjs');
  const module = await import('../getVersion.mjs');

  handler = module.handler;
  validateToken = authMiddleware.validateToken;
  checkPermission = roleAuth.checkPermission;
});

beforeEach(() => {
  // Reset mock before each test
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

describe('getVersion Lambda', () => {
  describe('successful operations', () => {
    // #123 CONTRACT CHANGE (spec dispute — see PR): getVersion now returns JSON
    // { content, timestamp, username } instead of a raw text/csv body, because the
    // ONLY consumer (version-preview) calls response.json() and reads those three
    // fields. timestamp + username are parsed from the versionId filename.
    test('should return JSON { content, timestamp, username } with 200 for a valid versionId', async () => {
      // Arrange
      const mockCsvContent = 'id,name,location\n1,Test,Floor1';
      const versionId = 'mapping_2026-03-01T12-00-00-000Z_admin.csv';

      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream(mockCsvContent),
        ContentType: 'text/csv'
      });

      const event = {
        pathParameters: {
          versionId: versionId
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(result.body);
      expect(body.content).toBe(mockCsvContent);
      expect(body.timestamp).toBe('2026-03-01T12:00:00.000Z'); // ISO, parsed from filename
      expect(body.username).toBe('admin');
    });

    test('should call S3 with correct bucket and key path', async () => {
      // Arrange
      const versionId = 'mapping_2026-03-01T12-00-00-000Z_editor.csv';
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream('test,data')
      });

      const event = {
        pathParameters: {
          versionId: versionId
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      await handler(event);

      // Assert
      const calls = s3Mock.commandCalls(GetObjectCommand);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toEqual({
        Bucket: 'tau-cenlib-primo-assets-hagay-3602',
        Key: `versions/data/${versionId}`
      });
    });

    test('should handle versionId with underscores in username', async () => {
      // Arrange
      const versionId = 'mapping_2026-03-01T12-00-00-000Z_john_doe.csv';
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream('data')
      });

      const event = {
        pathParameters: {
          versionId: versionId
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert (#123: username with underscores is parsed correctly from the filename)
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.username).toBe('john_doe');
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

      const event = {
        pathParameters: {
          versionId: 'mapping_2026-03-01T12-00-00-000Z_admin.csv'
        },
        headers: {}
      };

      // Act
      const result = await handler(event);

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
        reason: 'Permission denied',
        statusCode: 403
      });

      const event = {
        pathParameters: {
          versionId: 'mapping_2026-03-01T12-00-00-000Z_admin.csv'
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(403);
    });
  });

  describe('versionId validation', () => {
    test('should return 400 for missing versionId', async () => {
      // Arrange
      const event = {
        pathParameters: {},
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('versionId');
    });

    test('should return 400 for null pathParameters', async () => {
      // Arrange
      const event = {
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('versionId');
    });

    test('should return 400 for invalid versionId format (no mapping_ prefix)', async () => {
      // Arrange
      const event = {
        pathParameters: {
          versionId: 'invalid_2026-03-01T12-00-00-000Z_admin.csv'
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid versionId format');
    });

    test('should return 400 for invalid versionId format (no .csv extension)', async () => {
      // Arrange
      const event = {
        pathParameters: {
          versionId: 'mapping_2026-03-01T12-00-00-000Z_admin.txt'
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid versionId format');
    });

    test('should return 400 for invalid versionId format (invalid timestamp)', async () => {
      // Arrange
      const event = {
        pathParameters: {
          versionId: 'mapping_invalid-timestamp_admin.csv'
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid versionId format');
    });

    test('should return 400 for versionId with path traversal attempt', async () => {
      // Arrange
      const event = {
        pathParameters: {
          versionId: '../mapping_2026-03-01T12-00-00-000Z_admin.csv'
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid versionId format');
    });

    test('should accept valid versionId with milliseconds in timestamp', async () => {
      // Arrange
      const versionId = 'mapping_2026-03-01T12-00-00-000Z_admin.csv';
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream('valid,data')
      });

      const event = {
        pathParameters: {
          versionId: versionId
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
    });
  });

  describe('error handling', () => {
    test('should return 404 for non-existent version (NoSuchKey error)', async () => {
      // Arrange
      const error = new Error('The specified key does not exist.');
      error.name = 'NoSuchKey';
      error.$metadata = { httpStatusCode: 404 };
      s3Mock.on(GetObjectCommand).rejects(error);

      const event = {
        pathParameters: {
          versionId: 'mapping_2026-03-01T12-00-00-000Z_admin.csv'
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('not found');
    });

    test('should return 500 for other S3 errors', async () => {
      // Arrange
      const error = new Error('Internal S3 Error');
      error.name = 'InternalError';
      s3Mock.on(GetObjectCommand).rejects(error);

      const event = {
        pathParameters: {
          versionId: 'mapping_2026-03-01T12-00-00-000Z_admin.csv'
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBeDefined();
    });

    test('should return 500 for AccessDenied error', async () => {
      // Arrange
      const error = new Error('Access Denied');
      error.name = 'AccessDenied';
      s3Mock.on(GetObjectCommand).rejects(error);

      const event = {
        pathParameters: {
          versionId: 'mapping_2026-03-01T12-00-00-000Z_admin.csv'
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(500);
    });
  });

  describe('CORS headers', () => {
    test('should include CORS headers in success response', async () => {
      // Arrange
      const versionId = 'mapping_2026-03-01T12-00-00-000Z_admin.csv';
      s3Mock.on(GetObjectCommand).resolves({
        Body: createMockStream('test,data')
      });

      const event = {
        pathParameters: {
          versionId: versionId
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
      expect(result.headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
    });

    test('should include CORS headers in 404 error response', async () => {
      // Arrange
      const error = new Error('The specified key does not exist.');
      error.name = 'NoSuchKey';
      s3Mock.on(GetObjectCommand).rejects(error);

      const event = {
        pathParameters: {
          versionId: 'mapping_2026-03-01T12-00-00-000Z_admin.csv'
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });

    test('should include CORS headers in 400 error response', async () => {
      // Arrange
      const event = {
        pathParameters: {
          versionId: 'invalid-format'
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });

    test('should include CORS headers in 500 error response', async () => {
      // Arrange
      const error = new Error('S3 error');
      s3Mock.on(GetObjectCommand).rejects(error);

      const event = {
        pathParameters: {
          versionId: 'mapping_2026-03-01T12-00-00-000Z_admin.csv'
        },
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('OPTIONS preflight', () => {
    test('should handle OPTIONS preflight request (httpMethod)', async () => {
      // Arrange
      const event = {
        httpMethod: 'OPTIONS',
        pathParameters: {
          versionId: 'mapping_2026-03-01T12-00-00-000Z_admin.csv'
        }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
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
        },
        pathParameters: {
          versionId: 'mapping_2026-03-01T12-00-00-000Z_admin.csv'
        }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });
});

// Verification tests
describe('Jest Setup Verification', () => {
  test('Jest is configured correctly for ESM', () => {
    expect(true).toBe(true);
  });

  test('aws-sdk-client-mock is working', () => {
    expect(s3Mock).toBeDefined();
    expect(typeof s3Mock.on).toBe('function');
    expect(typeof s3Mock.reset).toBe('function');
  });
});
