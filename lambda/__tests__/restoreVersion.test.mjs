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
import { _clearCache } from '../shared/fetch-floor-svgs.mjs';

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

// Helper for floor-SVG GETs consumed by fetchFloorSvgs (it reads Body as a raw
// async-iterable stream, not via transformToString). Mirrors putCsv.test.mjs.
const streamFromString = (s) => ({
  Body: Readable.from([Buffer.from(s)]),
  ETag: `"${Date.now()}-${Math.random()}"`,
});

// Real 14-column header line so parseCsvContent maps svgCode (col 7) and
// floor (col 10). Matches putCsv.test.mjs HEADER_LINE.
const HEADER_LINE =
  'libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe';

// Register deterministic floor-SVG GET mocks so the REAL fetchFloorSvgs +
// validateBundle run. floor_0 contains shelf CB_0; floors 1/2 are empty.
// (Do NOT mock validateBundle/fetchFloorSvgs directly — HR4: assert the API
// contract, not internals.)
const mockFloorSvgs = () => {
  s3Mock
    .on(GetObjectCommand, { Key: 'maps/floor_0.svg' })
    .resolves(streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>'));
  s3Mock
    .on(GetObjectCommand, { Key: 'maps/floor_1.svg' })
    .resolves(streamFromString('<svg></svg>'));
  s3Mock
    .on(GetObjectCommand, { Key: 'maps/floor_2.svg' })
    .resolves(streamFromString('<svg></svg>'));
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
  _clearCache(); // fetch-floor-svgs caches shelf sets by ETag; clear between tests
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

  // --- #55: warn-and-allow-override bundle-invariant gate on restore ---
  // The version being restored is validated against the CURRENT floor SVGs.
  // A clean version restores as today (AC1). An orphaned version (references a
  // shelf absent from today's maps) is REFUSED with a 409 warn payload and
  // writes nothing (AC2/AC4) unless the caller explicitly overrides (AC3); the
  // server is the gate regardless of client (AC5).
  describe('bundle invariant on restore (#55)', () => {
    const VERSION_ID = 'mapping_2026-02-28T10-00-00-000Z_user1.csv';

    // AC1 — clean version restores with 200, no requiresOverride, and writes.
    test('AC1: clean version (all svgCodes resolve on current floors) restores with 200 and NO requiresOverride', async () => {
      mockFloorSvgs();
      const currentCsvContent = `${HEADER_LINE}\n`;
      // Version's only svgCode (CB_0 on floor 0) resolves on the mocked maps.
      const versionCsvContent = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,`;

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${VERSION_ID}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId: VERSION_ID },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      // Clean restore must keep today's success shape — no warn keys.
      expect(body.requiresOverride).toBeUndefined();
      expect(body.applied).toBeUndefined();
    });

    test('AC1: clean version writes the restored content to data/mapping.csv', async () => {
      mockFloorSvgs();
      const currentCsvContent = `${HEADER_LINE}\n`;
      const versionCsvContent = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,`;

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${VERSION_ID}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId: VERSION_ID },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      await handler(event);

      const dataPuts = s3Mock
        .commandCalls(PutObjectCommand)
        .filter((c) => c.args[0].input.Key === 'data/mapping.csv');
      expect(dataPuts.length).toBe(1);
      expect(dataPuts[0].args[0].input.Body).toBe(versionCsvContent);
    });

    // AC2 — orphaned version, no override: 409 warn, nothing written.
    test('AC2: orphaned version without override => 409 requiresOverride:true, applied:false, orphans + affectedEntryCount', async () => {
      mockFloorSvgs();
      const currentCsvContent = `${HEADER_LINE}\n`;
      // MISSING is absent from every mocked floor set => shelf-not-found.
      const versionCsvContent = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,MISSING,,,0,,,,`;

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${VERSION_ID}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId: VERSION_ID },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      expect(body.requiresOverride).toBe(true);
      expect(body.applied).toBe(false);
      expect(Array.isArray(body.orphans)).toBe(true);
      expect(body.orphans.length).toBeGreaterThan(0);
      expect(body.orphans[0]).toEqual(
        expect.objectContaining({
          svgCode: 'MISSING',
          affectedRowCount: expect.any(Number),
        })
      );
      // affectedEntryCount counts catalog ENTRIES (rows), == sum of affectedRowCount.
      const sumRows = body.orphans.reduce((s, o) => s + o.affectedRowCount, 0);
      expect(body.affectedEntryCount).toBe(sumRows);
      expect(body.affectedEntryCount).toBe(1);
    });

    test('AC2: orphaned version without override writes NOTHING (no data/mapping.csv put, no backup put)', async () => {
      mockFloorSvgs();
      const currentCsvContent = `${HEADER_LINE}\n`;
      const versionCsvContent = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,MISSING,,,0,,,,`;

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${VERSION_ID}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId: VERSION_ID },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      await handler(event);

      const puts = s3Mock.commandCalls(PutObjectCommand);
      // No write of the restored content.
      const dataPuts = puts.filter((c) => c.args[0].input.Key === 'data/mapping.csv');
      expect(dataPuts.length).toBe(0);
      // No backup-of-current PutObject either (the warn return is before Step 2).
      const backupPuts = puts.filter((c) => c.args[0].input.Key.startsWith('versions/data/'));
      expect(backupPuts.length).toBe(0);
    });

    // AC2 — entry-count semantics: count ENTRIES, not distinct shelf codes.
    test('AC2: affectedEntryCount counts catalog ENTRIES not distinct shelves (two rows, same missing shelf)', async () => {
      mockFloorSvgs();
      const currentCsvContent = `${HEADER_LINE}\n`;
      // Two rows both reference the SAME missing svgCode MISSING on floor 0.
      const versionCsvContent =
        `${HEADER_LINE}\n` +
        'Lib,LibHe,Coll,CollHe,000,499,MISSING,,,0,,,,\n' +
        'Lib,LibHe,Coll,CollHe,500,999,MISSING,,,0,,,,';

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${VERSION_ID}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId: VERSION_ID },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const body = JSON.parse(result.body);
      // One distinct missing shelf...
      expect(body.orphans.length).toBe(1);
      expect(body.orphans[0].svgCode).toBe('MISSING');
      // ...referenced by two catalog entries.
      expect(body.orphans[0].affectedRowCount).toBe(2);
      expect(body.affectedEntryCount).toBe(2);
    });

    // AC3 — orphaned version + explicit override: writes, backup-first, summary.
    test('AC3: orphaned version WITH body {override:true} => 200 success with orphanSummary', async () => {
      mockFloorSvgs();
      const currentCsvContent = `${HEADER_LINE}\n`;
      const versionCsvContent = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,MISSING,,,0,,,,`;

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${VERSION_ID}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId: VERSION_ID },
        body: JSON.stringify({ override: true }),
        headers: { Authorization: 'Bearer valid-token' }
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.success).toBe(true);
      expect(body.orphanSummary).toEqual(
        expect.objectContaining({
          overridden: true,
          affectedEntryCount: 1,
        })
      );
      expect(Array.isArray(body.orphanSummary.orphans)).toBe(true);
      expect(body.orphanSummary.orphans[0].svgCode).toBe('MISSING');
    });

    test('AC3: override backs up CURRENT file BEFORE writing the restored version', async () => {
      mockFloorSvgs();
      const currentCsvContent = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,`;
      const versionCsvContent = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,MISSING,,,0,,,,`;

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${VERSION_ID}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId: VERSION_ID },
        body: JSON.stringify({ override: true }),
        headers: { Authorization: 'Bearer valid-token' }
      };

      await handler(event);

      const puts = s3Mock.commandCalls(PutObjectCommand);
      const backupIdx = puts.findIndex(
        (c) =>
          c.args[0].input.Key.startsWith('versions/data/mapping_') &&
          c.args[0].input.Body === currentCsvContent
      );
      const restoreIdx = puts.findIndex(
        (c) => c.args[0].input.Key === 'data/mapping.csv'
      );
      // Both writes happened, and the backup-of-current precedes the restore write.
      expect(backupIdx).toBeGreaterThanOrEqual(0);
      expect(restoreIdx).toBeGreaterThanOrEqual(0);
      expect(backupIdx).toBeLessThan(restoreIdx);
      // The restore write carries the version content.
      expect(puts[restoreIdx].args[0].input.Body).toBe(versionCsvContent);
    });

    // AC4 — a 409-warned request leaves production fully untouched.
    test('AC4: a 409-warned request makes no data/mapping.csv write and no CloudFront invalidation', async () => {
      mockFloorSvgs();
      const currentCsvContent = `${HEADER_LINE}\n`;
      const versionCsvContent = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,MISSING,,,0,,,,`;

      s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
        Body: createMockStream(currentCsvContent)
      });
      s3Mock.on(GetObjectCommand, { Key: `versions/data/${VERSION_ID}` }).resolves({
        Body: createMockStream(versionCsvContent)
      });
      s3Mock.on(PutObjectCommand).resolves({});
      s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
      cloudfrontMock.on(CreateInvalidationCommand).resolves({});

      const event = {
        pathParameters: { versionId: VERSION_ID },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(409);
      const dataPuts = s3Mock
        .commandCalls(PutObjectCommand)
        .filter((c) => c.args[0].input.Key === 'data/mapping.csv');
      expect(dataPuts.length).toBe(0);
      expect(cloudfrontMock.commandCalls(CreateInvalidationCommand).length).toBe(0);
    });

    // AC5 — the gate is server-side: no override variant the client could send
    // (missing body, '{}', {override:false}) writes a broken bundle. Only an
    // explicit {override:true} writes.
    test('AC5: server refuses orphaned restore regardless of client (missing body, {}, {override:false} all 409; only {override:true} writes)', async () => {
      const versionCsvContent = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,MISSING,,,0,,,,`;
      const currentCsvContent = `${HEADER_LINE}\n`;

      const runWith = async (bodyValue) => {
        s3Mock.reset();
        cloudfrontMock.reset();
        _clearCache();
        mockFloorSvgs();
        s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves({
          Body: createMockStream(currentCsvContent)
        });
        s3Mock.on(GetObjectCommand, { Key: `versions/data/${VERSION_ID}` }).resolves({
          Body: createMockStream(versionCsvContent)
        });
        s3Mock.on(PutObjectCommand).resolves({});
        s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
        cloudfrontMock.on(CreateInvalidationCommand).resolves({});

        const event = {
          pathParameters: { versionId: VERSION_ID },
          headers: { Authorization: 'Bearer valid-token' },
          ...(bodyValue !== undefined ? { body: bodyValue } : {}),
        };
        const result = await handler(event);
        const dataPuts = s3Mock
          .commandCalls(PutObjectCommand)
          .filter((c) => c.args[0].input.Key === 'data/mapping.csv');
        return { result, dataPutCount: dataPuts.length };
      };

      // No body at all.
      const noBody = await runWith(undefined);
      expect(noBody.result.statusCode).toBe(409);
      expect(JSON.parse(noBody.result.body).requiresOverride).toBe(true);
      expect(noBody.dataPutCount).toBe(0);

      // Empty object body.
      const emptyBody = await runWith(JSON.stringify({}));
      expect(emptyBody.result.statusCode).toBe(409);
      expect(emptyBody.dataPutCount).toBe(0);

      // Explicit override:false.
      const overrideFalse = await runWith(JSON.stringify({ override: false }));
      expect(overrideFalse.result.statusCode).toBe(409);
      expect(overrideFalse.dataPutCount).toBe(0);

      // Only override:true writes.
      const overrideTrue = await runWith(JSON.stringify({ override: true }));
      expect(overrideTrue.result.statusCode).toBe(200);
      expect(overrideTrue.dataPutCount).toBe(1);
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

    test('should accept versionId with email-style username (dots and @)', async () => {
      // Cognito usernames are often email addresses; the versionId regex
      // must allow `.` and `@` in the username portion.
      const versionId = 'mapping_2026-05-13T11-28-32-995Z_idoah@tauex.tau.ac.il.csv';
      const currentCsvContent = 'current,data';
      const versionCsvContent = 'version,data';

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

      const result = await handler(event);

      expect(result.statusCode).not.toBe(400);
    });

    test('should still reject path-traversal even when the regex would otherwise allow chars', async () => {
      // The separate `..` / `/` guard catches path-traversal attempts before
      // the regex runs.
      const event = {
        pathParameters: { versionId: 'mapping_2026-02-28T10-00-00-000Z_..user.csv' },
        body: JSON.stringify({}),
        headers: { Authorization: 'Bearer valid-token' }
      };

      const result = await handler(event);

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
