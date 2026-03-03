/**
 * Tests for restoreVersion Lambda function
 * Verifies the Lambda function correctly restores a CSV version from S3
 *
 * Endpoint: POST /api/versions/csv/{versionId}/restore
 *
 * Flow:
 * 1. Create backup of current data/mapping.csv to versions/data/
 * 2. Copy version file to data/mapping.csv
 * 3. Invalidate CloudFront cache
 * 4. Enforce retention policy (MAX_VERSIONS = 20)
 */

import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';

// Mock auth modules before importing handler
jest.unstable_mockModule('../auth-middleware.mjs', () => ({
  validateToken: jest.fn().mockResolvedValue({
    isValid: true,
    user: { username: 'admin', role: 'editor', email: 'admin@example.com' }
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

// Create mocks
const s3Mock = mockClient(S3Client);
const cloudfrontMock = mockClient(CloudFrontClient);

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
  const module = await import('../restoreVersion.mjs');

  handler = module.handler;
  validateToken = authMiddleware.validateToken;
  checkPermission = roleAuth.checkPermission;
});

beforeEach(() => {
  // Reset mocks before each test
  s3Mock.reset();
  cloudfrontMock.reset();
  jest.clearAllMocks();

  // Mock Date.now for consistent timestamps
  jest.useFakeTimers();
  jest.setSystemTime(new Date('2026-03-01T12:00:00.000Z'));

  // Reset default auth behavior
  validateToken.mockResolvedValue({
    isValid: true,
    user: { username: 'admin', role: 'editor', email: 'admin@example.com' }
  });
  checkPermission.mockReturnValue({
    allowed: true,
    reason: 'Operation authorized'
  });
});

afterEach(() => {
  jest.useRealTimers();
});

describe('restoreVersion Lambda', () => {
  describe('authentication', () => {
    test('should return 401 for missing authorization token', async () => {
      // Arrange
      validateToken.mockResolvedValue({
        isValid: false,
        statusCode: 401,
        error: 'Missing authorization token'
      });

      const event = {
        pathParameters: { versionId: 'mapping_2026-02-28T10-00-00-000Z_user1.csv' },
        body: JSON.stringify({}),
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
        user: { username: 'viewer', role: 'viewer' }
      });
      checkPermission.mockReturnValue({
        allowed: false,
        reason: 'Permission denied - role "viewer" is not allowed to perform "restore-versions"',
        statusCode: 403
      });

      const event = {
        pathParameters: { versionId: 'mapping_2026-02-28T10-00-00-000Z_user1.csv' },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(403);
    });

    test('should use authenticated username for backup filename', async () => {
      // Arrange
      const currentCsvContent = 'current,data';
      const versionCsvContent = 'version,data';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      validateToken.mockResolvedValue({
        isValid: true,
        user: { username: 'authenticated-user', role: 'editor' }
      });

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}), // No username in body - should use auth token
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      const body = JSON.parse(result.body);
      expect(body.backupCreated).toContain('authenticated-user');
    });
  });

  describe('backup creation before restore', () => {
    test('should create backup of current file before restore', async () => {
      // Arrange
      const currentCsvContent = 'id,name,location\n1,Current,Floor1';
      const versionCsvContent = 'id,name,location\n1,Version,Floor2';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      // Mock getting current file
      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });

      // Mock getting version file
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });

      // Mock PutObject operations
      s3Mock.on(PutObjectCommand).resolves({});

      // Mock ListObjectsV2 for retention (no versions to delete)
      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: []
      });

      // Mock CloudFront invalidation
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);

      // Verify backup was created
      const putCalls = s3Mock.commandCalls(PutObjectCommand);
      const backupCall = putCalls.find(call =>
        call.args[0].input.Key.startsWith('versions/data/mapping_') &&
        call.args[0].input.Body === currentCsvContent
      );
      expect(backupCall).toBeDefined();
    });

    test('should include username in backup filename', async () => {
      // Arrange
      const currentCsvContent = 'current,data';
      const versionCsvContent = 'version,data';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      const body = JSON.parse(result.body);
      expect(body.backupCreated).toContain('admin'); // From validateToken mock default
    });
  });

  describe('restore operation', () => {
    test('should copy version content to data/mapping.csv', async () => {
      // Arrange
      const currentCsvContent = 'current,data';
      const versionCsvContent = 'version,data,restored';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      await handler(event);

      // Assert - verify the restored content was written to data/mapping.csv
      const putCalls = s3Mock.commandCalls(PutObjectCommand);
      const restoreCall = putCalls.find(call =>
        call.args[0].input.Key === 'data/mapping.csv'
      );
      expect(restoreCall).toBeDefined();
      expect(restoreCall.args[0].input.Body).toBe(versionCsvContent);
    });

    test('should return success with backup and restored version details', async () => {
      // Arrange
      const currentCsvContent = 'current,data';
      const versionCsvContent = 'version,data';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.message).toBe('Version restored successfully');
      expect(body.backupCreated).toMatch(/^versions\/data\/mapping_.*_admin\.csv$/);
      expect(body.restoredFrom).toBe(`versions/data/${versionId}`);
    });
  });

  describe('CloudFront cache invalidation', () => {
    test('should invalidate CloudFront cache after restore', async () => {
      // Arrange
      const currentCsvContent = 'current,data';
      const versionCsvContent = 'version,data';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      await handler(event);

      // Assert
      const cfCalls = cloudfrontMock.commandCalls(CreateInvalidationCommand);
      expect(cfCalls).toHaveLength(1);
      expect(cfCalls[0].args[0].input.DistributionId).toBe('E5SR0E5GM5GSB');
      expect(cfCalls[0].args[0].input.InvalidationBatch.Paths.Items).toContain('/data/mapping.csv');
    });
  });

  describe('retention policy enforcement', () => {
    test('should enforce MAX_VERSIONS (20) retention after restore', async () => {
      // Arrange
      const currentCsvContent = 'current,data';
      const versionCsvContent = 'version,data';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});

      // Create 22 versions (exceeds MAX_VERSIONS = 20)
      const mockVersions = [];
      for (let i = 0; i < 22; i++) {
        const date = new Date(2026, 1, i + 1);
        mockVersions.push({
          Key: `versions/data/mapping_${date.toISOString().replace(/[:.]/g, '-')}_user.csv`,
          LastModified: date,
          Size: 1000
        });
      }

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockVersions
      });
      s3Mock.on(DeleteObjectsCommand).resolves({});
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      await handler(event);

      // Assert - should delete 2 oldest versions (22 - 20 = 2)
      const deleteCalls = s3Mock.commandCalls(DeleteObjectsCommand);
      expect(deleteCalls).toHaveLength(1);
      expect(deleteCalls[0].args[0].input.Delete.Objects).toHaveLength(2);
    });

    test('should not delete versions if under MAX_VERSIONS', async () => {
      // Arrange
      const currentCsvContent = 'current,data';
      const versionCsvContent = 'version,data';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});

      // Only 5 versions (under MAX_VERSIONS = 20)
      const mockVersions = [];
      for (let i = 0; i < 5; i++) {
        mockVersions.push({
          Key: `versions/data/mapping_2026-02-0${i + 1}T10-00-00-000Z_user.csv`,
          LastModified: new Date(2026, 1, i + 1),
          Size: 1000
        });
      }

      s3Mock.on(ListObjectsV2Command).resolves({
        Contents: mockVersions
      });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      await handler(event);

      // Assert - should not delete any versions
      const deleteCalls = s3Mock.commandCalls(DeleteObjectsCommand);
      expect(deleteCalls).toHaveLength(0);
    });
  });

  describe('error handling - version not found', () => {
    test('should return 404 if version file does not exist', async () => {
      // Arrange
      const currentCsvContent = 'current,data';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_nonexistent.csv';

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });

      const error = new Error('The specified key does not exist.');
      error.name = 'NoSuchKey';
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).rejects(error);

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(404);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('not found');
    });
  });

  describe('input validation', () => {
    test('should return 400 for missing versionId', async () => {
      // Arrange
      const event = {
        pathParameters: {},
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('versionId');
    });

    test('should return 400 for invalid versionId format', async () => {
      // Arrange
      const event = {
        pathParameters: { versionId: 'invalid-format.csv' },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error).toContain('Invalid versionId format');
    });

    test('should use default username when not provided and auth has no username', async () => {
      // Arrange
      const currentCsvContent = 'current,data';
      const versionCsvContent = 'version,data';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      validateToken.mockResolvedValue({
        isValid: true,
        user: { role: 'editor' } // No username in auth
      });

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      const body = JSON.parse(result.body);
      expect(body.backupCreated).toContain('unknown');
    });
  });

  describe('CORS headers', () => {
    test('should include CORS headers in success response', async () => {
      // Arrange
      const currentCsvContent = 'current,data';
      const versionCsvContent = 'version,data';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
      expect(result.headers['Access-Control-Allow-Headers']).toBe('Content-Type, Authorization');
      expect(result.headers['Content-Type']).toBe('application/json');
    });

    test('should include CORS headers in error response', async () => {
      // Arrange
      const event = {
        pathParameters: { versionId: 'invalid' },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
    });

    test('should handle OPTIONS preflight request', async () => {
      // Arrange
      const event = {
        httpMethod: 'OPTIONS',
        pathParameters: { versionId: 'mapping_2026-02-28T10-00-00-000Z_user1.csv' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(result.headers['Access-Control-Allow-Methods']).toBe('POST, OPTIONS');
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
        pathParameters: { versionId: 'mapping_2026-02-28T10-00-00-000Z_user1.csv' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(200);
      expect(result.headers['Access-Control-Allow-Origin']).toBe('*');
    });
  });

  describe('S3 error handling', () => {
    test('should return 500 for S3 errors during restore', async () => {
      // Arrange
      const currentCsvContent = 'current,data';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });

      const error = new Error('Internal S3 Error');
      error.name = 'InternalError';
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).rejects(error);

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert
      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error).toBeDefined();
    });

    test('should handle case when current file does not exist (no backup needed)', async () => {
      // Arrange
      const versionCsvContent = 'version,data';
      const versionId = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

      // Current file doesn't exist
      const noSuchKeyError = new Error('The specified key does not exist.');
      noSuchKeyError.name = 'NoSuchKey';
      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).rejects(noSuchKeyError);

      s3Mock.on(GetObjectCommand, { Key: `versions/data/${versionId}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      // Act
      const result = await handler(event);

      // Assert - should still succeed, just without creating a backup
      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
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

  test('cloudfront mock is working', () => {
    expect(cloudfrontMock).toBeDefined();
    expect(typeof cloudfrontMock.on).toBe('function');
    expect(typeof cloudfrontMock.reset).toBe('function');
  });
});
