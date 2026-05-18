import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand, NoSuchKey } from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import {
  readMeta,
  acquireLock,
  releaseLock,
  recordValidation,
  recordFile,
} from '../../shared/staging-meta.mjs';

const s3Mock = mockClient(S3Client);
const BUCKET = 'test-bucket';

function streamFromString(s) {
  return { Body: Readable.from([Buffer.from(s)]) };
}

describe('staging-meta', () => {
  beforeEach(() => s3Mock.reset());

  test('readMeta returns empty state when .meta.json does not exist', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    const meta = await readMeta(BUCKET);
    expect(meta).toEqual({ locked: false, owner: null, files: [], lastValidated: null });
  });

  test('acquireLock succeeds when no lock exists', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(PutObjectCommand).resolves({});
    const result = await acquireLock(BUCKET, 'alice');
    expect(result.acquired).toBe(true);
    expect(result.meta.owner).toBe('alice');
    expect(result.meta.locked).toBe(true);
  });

  test('acquireLock fails when lock is held by someone else', async () => {
    const existing = JSON.stringify({ locked: true, owner: 'bob', acquiredAt: '2026-05-13T10:00:00Z', files: [] });
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(streamFromString(existing));
    const result = await acquireLock(BUCKET, 'alice');
    expect(result.acquired).toBe(false);
    expect(result.heldBy).toBe('bob');
  });

  test('acquireLock succeeds when same user re-acquires (idempotent)', async () => {
    const existing = JSON.stringify({ locked: true, owner: 'alice', acquiredAt: '2026-05-13T10:00:00Z', files: [] });
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(streamFromString(existing));
    s3Mock.on(PutObjectCommand).resolves({});
    const result = await acquireLock(BUCKET, 'alice');
    expect(result.acquired).toBe(true);
  });

  test('releaseLock writes an empty meta', async () => {
    s3Mock.on(PutObjectCommand).resolves({});
    await releaseLock(BUCKET);
    const putCalls = s3Mock.commandCalls(PutObjectCommand);
    expect(putCalls.length).toBe(1);
    const body = JSON.parse(putCalls[0].args[0].input.Body);
    expect(body.locked).toBe(false);
  });
});
