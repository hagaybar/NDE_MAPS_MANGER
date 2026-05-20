import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

function streamFromString(s) { return { get Body() { return Readable.from([Buffer.from(s)]); } }; }
function event() { return { httpMethod: 'GET', headers: { authorization: 'Bearer admin-token' } }; }

describe('getStagingStatus', () => {
  let handler;

  beforeEach(async () => {
    s3Mock.reset();
    jest.unstable_mockModule('../auth-middleware.mjs', () => ({
      validateToken: jest.fn().mockResolvedValue({ isValid: true, user: { sub: 'alice', role: 'admin' } }),
      createAuthResponse: jest.fn((status, body) => ({ statusCode: status, headers: {}, body: JSON.stringify(body) })),
    }));
    jest.unstable_mockModule('../role-auth.mjs', () => ({
      checkPermission: jest.fn().mockReturnValue({ allowed: true }),
    }));

    ({ handler } = await import('../getStagingStatus.mjs'));
  });

  test('returns empty state when no staging active', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.locked).toBe(false);
  });

  test('returns active staging state with files and last validation', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['maps/floor_1.svg'],
        lastValidated: { ok: false, errors: [{ rowIndex: 5 }] },
      }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.locked).toBe(true);
    expect(body.owner).toBe('alice');
    expect(body.files).toContain('maps/floor_1.svg');
    expect(body.lastValidated.ok).toBe(false);
  });
});
