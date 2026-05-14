/**
 * Tests for putCsv Lambda — bundle-invariant check (flag-gated).
 *
 * Verifies that the validation step inserted before the S3 write:
 *  - Rejects 422 when BUNDLE_INVARIANT_ENABLED=true and a CSV row references
 *    an svgCode missing from the floor's SVG shelf set.
 *  - Logs but proceeds (200) when BUNDLE_INVARIANT_ENABLED is off.
 *  - Accepts a valid CSV when the flag is on.
 */

import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';
import { _clearCache } from '../shared/fetch-floor-svgs.mjs';

// Mock auth modules before importing handler — same shape as other Lambda tests.
jest.unstable_mockModule('../auth-middleware.mjs', () => ({
  validateToken: jest.fn().mockResolvedValue({
    isValid: true,
    user: { username: 'test-admin', role: 'admin', email: 'admin@example.com' },
  }),
  createAuthResponse: jest.fn((statusCode, body) => ({
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'PUT, OPTIONS',
    },
    body: JSON.stringify(body),
  })),
}));

jest.unstable_mockModule('../role-auth.mjs', () => ({
  checkPermission: jest.fn().mockReturnValue({
    allowed: true,
    reason: 'Operation authorized',
  }),
}));

const s3Mock = mockClient(S3Client);
const cfMock = mockClient(CloudFrontClient);

function streamFromString(s) {
  const stream = Readable.from([Buffer.from(s)]);
  return { Body: stream, ETag: `"${Date.now()}-${Math.random()}"` };
}

function transformableStream(content) {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);
  return sdkStreamMixin(stream);
}

function makeEvent(csvBody, token = 'admin-token') {
  return {
    httpMethod: 'PUT',
    headers: { authorization: `Bearer ${token}` },
    body: JSON.stringify({ csvContent: csvBody }),
  };
}

const HEADER_LINE =
  'libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe';

let handler;

beforeAll(async () => {
  ({ handler } = await import('../putCsv.mjs'));
});

beforeEach(() => {
  s3Mock.reset();
  cfMock.reset();
  _clearCache();
  jest.clearAllMocks();
  delete process.env.BUNDLE_INVARIANT_ENABLED;

  // Floor SVG GETs — used by fetchFloorSvgs. floor_0 has shelf CB_0; others are empty.
  s3Mock
    .on(GetObjectCommand, { Key: 'maps/floor_0.svg' })
    .resolves(streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>'));
  s3Mock
    .on(GetObjectCommand, { Key: 'maps/floor_1.svg' })
    .resolves(streamFromString('<svg></svg>'));
  s3Mock
    .on(GetObjectCommand, { Key: 'maps/floor_2.svg' })
    .resolves(streamFromString('<svg></svg>'));

  // GET of the current data/mapping.csv (for version-save). Use the
  // sdk-stream-mixin variant because that handler calls transformToString().
  s3Mock
    .on(GetObjectCommand, { Key: 'data/mapping.csv' })
    .resolves({ Body: transformableStream(`${HEADER_LINE}\n`) });

  // Write paths and bookkeeping commands all succeed.
  s3Mock.on(PutObjectCommand).resolves({});
  s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
  s3Mock.on(DeleteObjectsCommand).resolves({});
  cfMock.on(CreateInvalidationCommand).resolves({});
});

describe('putCsv — bundle invariant', () => {
  test('with flag ON: rejects 422 when CSV references a missing shelf', async () => {
    process.env.BUNDLE_INVARIANT_ENABLED = 'true';
    // CSV has a row pointing at MISSING which is not in any SVG.
    const csv = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,MISSING,,,0,,,,`;

    const resp = await handler(makeEvent(csv));

    expect(resp.statusCode).toBe(422);
    const body = JSON.parse(resp.body);
    expect(body.errors).toContainEqual(
      expect.objectContaining({
        svgCode: 'MISSING',
        type: 'shelf-not-found',
      })
    );

    // Critically: no write of the new mapping.csv happened.
    const dataPuts = s3Mock
      .commandCalls(PutObjectCommand)
      .filter((c) => c.args[0].input.Key === 'data/mapping.csv');
    expect(dataPuts.length).toBe(0);
  });

  test('with flag OFF: logs but proceeds when CSV references a missing shelf', async () => {
    process.env.BUNDLE_INVARIANT_ENABLED = 'false';
    const csv = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,MISSING,,,0,,,,`;

    const resp = await handler(makeEvent(csv));

    expect(resp.statusCode).toBe(200);
    // PutObjectCommand for data/mapping.csv should have been called.
    const dataPuts = s3Mock
      .commandCalls(PutObjectCommand)
      .filter((c) => c.args[0].input.Key === 'data/mapping.csv');
    expect(dataPuts.length).toBeGreaterThan(0);
  });

  test('with flag ON: accepts a valid CSV', async () => {
    process.env.BUNDLE_INVARIANT_ENABLED = 'true';
    const csv = `${HEADER_LINE}\nLib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,`;

    const resp = await handler(makeEvent(csv));

    expect(resp.statusCode).toBe(200);
    const dataPuts = s3Mock
      .commandCalls(PutObjectCommand)
      .filter((c) => c.args[0].input.Key === 'data/mapping.csv');
    expect(dataPuts.length).toBeGreaterThan(0);
  });
});
