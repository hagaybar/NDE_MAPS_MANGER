/**
 * Tests for listVersionsSvg Lambda function
 * Verifies the Lambda function correctly lists SVG versions from S3 grouped by filename
 *
 * Version filename pattern: {originalName}_{timestamp}_{username}.svg
 * Example: floor_0_2026-03-01T12-00-00-000Z_admin.svg
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
  const module = await import('../listVersionsSvg.mjs');

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

describe('listVersionsSvg Lambda', () => {
  describe('grouping by filename', () => {
    test('should return versions grouped by original SVG filename', async () => {
      // Arrange - versions for different floor SVGs
      const mockContents = [
        {
          Key: 'versions/maps/floor_0_2026-03-01T12-00-00-000Z_admin.svg',
          Size: 12345,
          LastModified: new Date('2026-03-01T12:00:00Z'),
          ETag: '"abc123"'
        },
        {
          Key: 'versions/maps/floor_1_2026-03-01T10-00-00-000Z_user1.svg',
          Size: 23456,
          LastModified: new Date('2026-03-01T10:00:00Z'),
          ETag: '"def456"'
        },
        {
          Key: 'versions/maps/floor_0_2026-02-28T10-00-00-000Z_user1.svg',
          Size: 12340,
          LastModified: new Date('2026-02-28T10:00:00Z'),
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
      expect('floor_0.svg' in body.versions).toBe(true);
      expect('floor_1.svg' in body.versions).toBe(true);
      expect(body.versions['floor_0.svg']).toHaveLength(2);
      expect(body.versions['floor_1.svg']).toHaveLength(1);
    });

    test('should handle floor_2 SVG versions correctly', async () => {
      // Arrange
      const mockContents = [
        {
          Key: 'versions/maps/floor_2_2026-03-01T12-00-00-000Z_admin.svg',
          Size: 34567,
          LastModified: new Date('2026-03-01T12:00:00Z'),
          ETag: '"xyz123"'
        }
      ];

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockContents
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const body = JSON.parse(result.body);
      expect('floor_2.svg' in body.versions).toBe(true);
      expect(body.versions['floor_2.svg']).toHaveLength(1);
    });
  });

  describe('sorting within groups', () => {
    test('should sort versions within each group by date (newest first)', async () => {
      // Arrange - multiple versions of floor_0 with different timestamps
      const mockContents = [
        {
          Key: 'versions/maps/floor_0_2026-01-10T08-00-00-000Z_user1.svg',
          Size: 1000,
          LastModified: new Date('2026-01-10T08:00:00Z'),
          ETag: '"abc"'
        },
        {
          Key: 'versions/maps/floor_0_2026-03-01T12-00-00-000Z_admin.svg',
          Size: 1500,
          LastModified: new Date('2026-03-01T12:00:00Z'),
          ETag: '"def"'
        },
        {
          Key: 'versions/maps/floor_0_2026-02-15T14-30-00-000Z_editor.svg',
          Size: 1200,
          LastModified: new Date('2026-02-15T14:30:00Z'),
          ETag: '"ghi"'
        }
      ];

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockContents
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const body = JSON.parse(result.body);
      const floor0Versions = body.versions['floor_0.svg'];

      // Verify sorted by date (newest first)
      expect(floor0Versions[0].timestamp).toBe('2026-03-01T12:00:00.000Z');
      expect(floor0Versions[1].timestamp).toBe('2026-02-15T14:30:00.000Z');
      expect(floor0Versions[2].timestamp).toBe('2026-01-10T08:00:00.000Z');
    });
  });

  describe('version object fields', () => {
    test('should include key, timestamp, username, and size in each version', async () => {
      // Arrange
      const mockContents = [
        {
          Key: 'versions/maps/floor_0_2026-03-01T12-00-00-000Z_admin.svg',
          Size: 12345,
          LastModified: new Date('2026-03-01T12:00:00Z'),
          ETag: '"abc123"'
        }
      ];

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockContents
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const body = JSON.parse(result.body);
      const version = body.versions['floor_0.svg'][0];

      expect(version).toHaveProperty('key');
      expect(version).toHaveProperty('timestamp');
      expect(version).toHaveProperty('username');
      expect(version).toHaveProperty('size');

      // Verify parsed values
      expect(version.key).toBe('versions/maps/floor_0_2026-03-01T12-00-00-000Z_admin.svg');
      expect(version.timestamp).toBe('2026-03-01T12:00:00.000Z');
      expect(version.username).toBe('admin');
      expect(version.size).toBe(12345);
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

  describe('empty folder handling', () => {
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
      expect(body.versions).toEqual({});
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
      expect(body.versions).toEqual({});
    });
  });

  describe('file filtering', () => {
    test('should filter out non-SVG files in versions folder', async () => {
      // Arrange - mixed files including non-SVG
      const mockContents = [
        {
          Key: 'versions/maps/floor_0_2026-03-01T12-00-00-000Z_admin.svg',
          Size: 12345,
          LastModified: new Date('2026-03-01T12:00:00Z'),
          ETag: '"abc"'
        },
        {
          Key: 'versions/maps/.DS_Store',
          Size: 100,
          LastModified: new Date('2026-03-01T10:00:00Z'),
          ETag: '"xyz"'
        },
        {
          Key: 'versions/maps/readme.txt',
          Size: 200,
          LastModified: new Date('2026-02-28T10:00:00Z'),
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
      expect(Object.keys(body.versions)).toHaveLength(1);
      expect('floor_0.svg' in body.versions).toBe(true);
    });
  });

  describe('S3 configuration', () => {
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
        Prefix: 'versions/maps/'
      });
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
    test('should correctly parse timestamp with milliseconds from filename', async () => {
      // Arrange - timestamp has dashes instead of colons for filename safety
      const mockContents = [
        {
          Key: 'versions/maps/floor_0_2026-02-28T15-45-30-123Z_testuser.svg',
          Size: 1000,
          LastModified: new Date('2026-02-28T15:45:30.123Z'),
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
      expect(body.versions['floor_0.svg'][0].timestamp).toBe('2026-02-28T15:45:30.123Z');
    });

    test('should correctly parse username with underscores', async () => {
      // Arrange - username might contain underscores
      const mockContents = [
        {
          Key: 'versions/maps/floor_1_2026-01-15T10-30-00-000Z_john_doe.svg',
          Size: 1000,
          LastModified: new Date('2026-01-15T10:30:00Z'),
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
      expect(body.versions['floor_1.svg'][0].username).toBe('john_doe');
    });

    test('should handle malformed filenames gracefully', async () => {
      // Arrange - a file that doesn't match the pattern
      const mockContents = [
        {
          Key: 'versions/maps/invalid-filename.svg',
          Size: 500,
          LastModified: new Date('2026-01-15T10:30:00Z'),
          ETag: '"xyz"'
        },
        {
          Key: 'versions/maps/floor_0_2026-03-01T12-00-00-000Z_admin.svg',
          Size: 12345,
          LastModified: new Date('2026-03-01T12:00:00Z'),
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
      // Should include the valid file
      expect('floor_0.svg' in body.versions).toBe(true);
    });

    test('should handle multiple floor numbers correctly', async () => {
      // Arrange - versions for floors 0, 1, and 2
      const mockContents = [
        {
          Key: 'versions/maps/floor_0_2026-03-01T12-00-00-000Z_admin.svg',
          Size: 10000,
          LastModified: new Date('2026-03-01T12:00:00Z'),
          ETag: '"a"'
        },
        {
          Key: 'versions/maps/floor_1_2026-03-01T12-00-00-000Z_admin.svg',
          Size: 20000,
          LastModified: new Date('2026-03-01T12:00:00Z'),
          ETag: '"b"'
        },
        {
          Key: 'versions/maps/floor_2_2026-03-01T12-00-00-000Z_admin.svg',
          Size: 30000,
          LastModified: new Date('2026-03-01T12:00:00Z'),
          ETag: '"c"'
        }
      ];

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockContents
      });

      // Act
      const result = await handler({ headers: { Authorization: 'Bearer valid-token' } });

      // Assert
      const body = JSON.parse(result.body);
      expect(Object.keys(body.versions)).toHaveLength(3);
      expect('floor_0.svg' in body.versions).toBe(true);
      expect('floor_1.svg' in body.versions).toBe(true);
      expect('floor_2.svg' in body.versions).toBe(true);
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
