import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

function streamFromString(s) { return { get Body() { return Readable.from([Buffer.from(s)]); } }; }
function event() { return { httpMethod: 'POST', headers: { authorization: 'Bearer admin-token' }, body: '{}' }; }

describe('clearStaging', () => {
  let handler;

  beforeEach(async () => {
    s3Mock.reset();
    jest.unstable_mockModule('../auth-middleware.mjs', () => ({
      validateToken: jest.fn().mockResolvedValue({ valid: true, claims: { sub: 'alice', 'cognito:groups': ['admin'] } }),
      createAuthResponse: jest.fn((status, body) => ({ statusCode: status, headers: {}, body: JSON.stringify(body) })),
    }));
    jest.unstable_mockModule('../role-auth.mjs', () => ({
      checkPermission: jest.fn().mockReturnValue({ allowed: true }),
    }));
    s3Mock.on(PutObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});

    ({ handler } = await import('../clearStaging.mjs'));
  });

  test('deletes staged files and releases lock', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['maps/floor_1.svg', 'data/mapping.csv'],
      }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);

    const deletes = s3Mock.commandCalls(DeleteObjectCommand);
    expect(deletes.find(c => c.args[0].input.Key === 'staging/maps/floor_1.svg')).toBeDefined();
    expect(deletes.find(c => c.args[0].input.Key === 'staging/data/mapping.csv')).toBeDefined();

    const metaPut = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'staging/.meta.json');
    expect(JSON.parse(metaPut.args[0].input.Body).locked).toBe(false);
  });

  test('rejects 423 if caller does not own the lock', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'bob' }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(423);
  });
});
