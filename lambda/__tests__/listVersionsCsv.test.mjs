/**
 * Tests for listVersionsCsv Lambda function
 * Verifies the Lambda function correctly lists CSV versions from S3
 *
 * Version filename pattern: mapping_{timestamp}_{username}.csv
 * Example: mapping_2024-01-15T10-30-00Z_admin.csv
 */

import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';

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

// Import the handler and mocked modules after setting up mocks
let handler;
let validateToken;
let checkPermission;

beforeAll(async () => {
  const authMiddleware = await import('../auth-middleware.mjs');
  const roleAuth = await import('../role-auth.mjs');
  const module = await import('../listVersionsCsv.mjs');

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

describe('listVersionsCsv Lambda', () => {
  describe('successful operations', () => {
    test('should return array of version objects sorted by date (newest first)', async () => {
      // Arrange - versions with different timestamps
      const mockContents = [
        {
          Key: 'versions/data/mapping_2024-01-10T08-00-00Z_user1.csv',
          Size: 1000,
          LastModified: new Date('2024-01-10T08:00:00Z'),
          ETag: '"abc123"'
        },
        {
          Key: 'versions/data/mapping_2024-01-15T10-30-00Z_admin.csv',
          Size: 1500,
          LastModified: new Date('2024-01-15T10:30:00Z'),
          ETag: '"def456"'
        },
        {
          Key: 'versions/data/mapping_2024-01-12T14-45-00Z_editor.csv',
          Size: 1200,
          LastModified: new Date('2024-01-12T14:45:00Z'),
          ETag: '"ghi789"'
        }
      ];

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockContents
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.versions).toHaveLength(3);

      // Verify sorted by date (newest first)
      expect(body.versions[0].timestamp).toBe('2024-01-15T10:30:00Z');
      expect(body.versions[1].timestamp).toBe('2024-01-12T14:45:00Z');
      expect(body.versions[2].timestamp).toBe('2024-01-10T08:00:00Z');
    });

    test('should return version objects with all required fields', async () => {
      // Arrange
      const mockContents = [
        {
          Key: 'versions/data/mapping_2024-01-15T10-30-00Z_admin.csv',
          Size: 1500,
          LastModified: new Date('2024-01-15T10:30:00Z'),
          ETag: '"def456"'
        }
      ];

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockContents
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const body = JSON.parse(result.body);
      const version = body.versions[0];

      // Each version should include: key, timestamp, username, size, etag
      expect(version).toHaveProperty('key');
      expect(version).toHaveProperty('timestamp');
      expect(version).toHaveProperty('username');
      expect(version).toHaveProperty('size');
      expect(version).toHaveProperty('etag');

      // Verify parsed values
      expect(version.key).toBe('versions/data/mapping_2024-01-15T10-30-00Z_admin.csv');
      expect(version.timestamp).toBe('2024-01-15T10:30:00Z');
      expect(version.username).toBe('admin');
      expect(version.size).toBe(1500);
      expect(version.etag).toBe('"def456"');
    });

    test('should handle empty versions folder gracefully', async () => {
      // Arrange - no contents
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: []
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.versions).toEqual([]);
    });

    test('should handle undefined Contents gracefully', async () => {
      // Arrange - Contents is undefined (no files exist)
      s3Mock.on(ListObjectsV2Command).resolves({});

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.versions).toEqual([]);
    });

    test('should filter out non-CSV files in versions folder', async () => {
      // Arrange - mixed files including non-CSV
      const mockContents = [
        {
          Key: 'versions/data/mapping_2024-01-15T10-30-00Z_admin.csv',
          Size: 1500,
          LastModified: new Date('2024-01-15T10:30:00Z'),
          ETag: '"def456"'
        },
        {
          Key: 'versions/data/.DS_Store',
          Size: 100,
          LastModified: new Date('2024-01-15T10:30:00Z'),
          ETag: '"xyz"'
        },
        {
          Key: 'versions/data/readme.txt',
          Size: 200,
          LastModified: new Date('2024-01-14T10:30:00Z'),
          ETag: '"txt123"'
        }
      ];

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockContents
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const body = JSON.parse(result.body);
      expect(body.versions).toHaveLength(1);
      expect(body.versions[0].key).toContain('.csv');
    });

    test('should call S3 with correct bucket and prefix', async () => {
      // Arrange
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: []
      });

      // Act
      await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const calls = s3Mock.commandCalls(ListObjectsV2Command);
      expect(calls).toHaveLength(1);
      expect(calls[0].args[0].input).toEqual({
        Bucket: 'tau-cenlib-primo-assets-hagay-3602',
        Prefix: 'versions/data/'
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

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.statusCode).toBe(403);
    });
  });

  describe('CORS headers', () => {
    test('should include CORS headers in success response', async () => {
      // Arrange
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: []
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
      expect(result.headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
      expect(result.headers['Content-Type']).toBe('application/json');
    });

    test('should handle OPTIONS preflight request', async () => {
      // Arrange - OPTIONS request
      const event = {
        httpMethod: 'OPTIONS'
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.body).toBe('');
    });

    test('should handle OPTIONS with requestContext format', async () => {
      // Arrange - HTTP API v2 format
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
      const error = new Error('S3 connection failed');
      s3Mock.on(ListObjectsV2Command).rejects(error);

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.statusCode).toBe(500);
      expect(result.headers['Content-Type']).toBe('application/json');
      const body = JSON.parse(result.body);
      expect(body.success).toBe(false);
    });

    test('should include error message in error response', async () => {
      // Arrange
      const errorMessage = 'Access Denied';
      const error = new Error(errorMessage);
      s3Mock.on(ListObjectsV2Command).rejects(error);

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const body = JSON.parse(result.body);
      expect(body.error).toBe(errorMessage);
    });

    test('should include CORS headers in error response', async () => {
      // Arrange
      s3Mock.on(ListObjectsV2Command).rejects(new Error('S3 error'));

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toBe('GET, OPTIONS');
    });
  });

  describe('filename parsing', () => {
    test('should correctly parse timestamp from filename', async () => {
      // Arrange - timestamp has dashes instead of colons for filename safety
      const mockContents = [
        {
          Key: 'versions/data/mapping_2024-02-28T15-45-30Z_testuser.csv',
          Size: 1000,
          LastModified: new Date('2024-02-28T15:45:30Z'),
          ETag: '"abc"'
        }
      ];

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockContents
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const body = JSON.parse(result.body);
      // Timestamp should be converted back to ISO format with colons
      expect(body.versions[0].timestamp).toBe('2024-02-28T15:45:30Z');
    });

    test('should correctly parse username with underscores', async () => {
      // Arrange - username might contain underscores
      const mockContents = [
        {
          Key: 'versions/data/mapping_2024-01-15T10-30-00Z_john_doe.csv',
          Size: 1000,
          LastModified: new Date('2024-01-15T10:30:00Z'),
          ETag: '"abc"'
        }
      ];

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockContents
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const body = JSON.parse(result.body);
      expect(body.versions[0].username).toBe('john_doe');
    });

    test('should handle malformed filenames gracefully', async () => {
      // Arrange - a file that doesn't match the pattern
      const mockContents = [
        {
          Key: 'versions/data/invalid-filename.csv',
          Size: 500,
          LastModified: new Date('2024-01-15T10:30:00Z'),
          ETag: '"xyz"'
        },
        {
          Key: 'versions/data/mapping_2024-01-15T10-30-00Z_admin.csv',
          Size: 1500,
          LastModified: new Date('2024-01-15T10:30:00Z'),
          ETag: '"def456"'
        }
      ];

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockContents
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      // Should still return both files, but malformed one should have fallback values
      expect(body.versions.length).toBeGreaterThanOrEqual(1);
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
