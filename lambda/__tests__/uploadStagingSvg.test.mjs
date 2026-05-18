import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

function streamFromString(s) { return { Body: Readable.from([Buffer.from(s)]) }; }
function event({ floor = 1, svgBase64, user = 'alice' } = {}) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer admin-token' },
    body: JSON.stringify({ floor, svgBase64 }),
    requestContext: { authorizer: { claims: { sub: user, 'cognito:groups': 'admin' } } },
  };
}

describe('uploadStagingSvg', () => {
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
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(PutObjectCommand).resolves({});

    ({ handler } = await import('../uploadStagingSvg.mjs'));
  });

  test('writes SVG to staging/maps/floor_N.svg, acquires lock', async () => {
    const svg = '<svg><rect id="CB_0" data-map-object="shelf"/></svg>';
    const resp = await handler(event({ floor: 1, svgBase64: Buffer.from(svg).toString('base64') }));
    expect(resp.statusCode).toBe(200);

    const puts = s3Mock.commandCalls(PutObjectCommand);
    const svgPut = puts.find(c => c.args[0].input.Key === 'staging/maps/floor_1.svg');
    expect(svgPut).toBeDefined();

    const metaPut = puts.find(c => c.args[0].input.Key === 'staging/.meta.json');
    expect(metaPut).toBeDefined();
    const meta = JSON.parse(metaPut.args[0].input.Body);
    expect(meta.locked).toBe(true);
    expect(meta.owner).toBe('alice');
  });

  test('rejects 423 if lock is held by another user', async () => {
    s3Mock.reset();
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'bob' }))
    );
    s3Mock.on(PutObjectCommand).resolves({});

    // Plan deviation: original test used '<svg/>' which has zero shelves and
    // therefore short-circuits at the shelf-count guard with a 400 before the
    // lock is ever checked. Implementation (per plan) validates SVG *before*
    // attempting to acquire the lock, so we give this test a valid 1-shelf
    // SVG so it actually exercises the lock-held branch the test is named for.
    const svg = '<svg><rect id="CC_0" data-map-object="shelf"/></svg>';
    const resp = await handler(event({ floor: 1, svgBase64: Buffer.from(svg).toString('base64') }));
    expect(resp.statusCode).toBe(423);
    const body = JSON.parse(resp.body);
    expect(body.heldBy).toBe('bob');
  });

  test('rejects 400 for malformed SVG', async () => {
    const malformed = '<svg><rect unclosed';  // missing close tag
    const resp = await handler(event({ floor: 1, svgBase64: Buffer.from(malformed).toString('base64') }));
    expect(resp.statusCode).toBe(400);
    expect(JSON.parse(resp.body).error).toMatch(/parse/i);
  });

  test('rejects 400 for SVG with zero shelves found', async () => {
    const noShelves = '<svg><rect id="not-a-shelf"/></svg>';
    const resp = await handler(event({ floor: 1, svgBase64: Buffer.from(noShelves).toString('base64') }));
    expect(resp.statusCode).toBe(400);
    expect(JSON.parse(resp.body).error).toMatch(/no shelves/i);
  });
});
