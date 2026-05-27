import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

function streamFromString(s) { return { get Body() { return Readable.from([Buffer.from(s)]); } }; }
function event(body) {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer admin-token' },
    body: JSON.stringify(body),
  };
}

describe('applyReconcileToStaging', () => {
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
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'alice', files: ['maps/floor_1.svg'] }))
    );
    s3Mock.on(PutObjectCommand).resolves({});

    ({ handler } = await import('../applyReconcileToStaging.mjs'));
  });

  test('rename action rewrites svgCode on affected rows', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,
`)
    );

    const resp = await handler(event({
      floor: 1,
      reconcileMap: {
        'CC_X': { action: 'rename', to: 'CC_NEW' },
      },
    }));
    expect(resp.statusCode).toBe(200);
    expect(JSON.parse(resp.body).affectedRows).toBe(1);

    const csvPut = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'staging/data/mapping.csv');
    expect(csvPut).toBeDefined();
    const csvBody = csvPut.args[0].input.Body;
    expect(csvBody).toContain('CC_NEW');
    expect(csvBody).not.toContain('CC_X,');  // CC_X line gone
    expect(csvBody).toContain('CB_0');       // floor 0 row untouched
  });

  test('delete action removes affected rows (floor-scoped)', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,0,,,,
`)
    );

    const resp = await handler(event({
      floor: 1,
      reconcileMap: { 'CC_X': { action: 'delete' } },
    }));
    expect(resp.statusCode).toBe(200);
    expect(JSON.parse(resp.body).affectedRows).toBe(1);

    const csvPut = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'staging/data/mapping.csv');
    const csvBody = csvPut.args[0].input.Body;
    // floor 1 CC_X row should be gone
    expect(csvBody.match(/CC_X,,,1/g) || []).toHaveLength(0);
    // floor 0 CC_X row should remain (delete is floor-scoped)
    expect(csvBody.match(/CC_X,,,0/g) || []).toHaveLength(1);
  });

  test('rejects 423 if caller does not own the lock', async () => {
    s3Mock.reset();
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'bob' }))
    );

    const resp = await handler(event({ floor: 1, reconcileMap: {} }));
    expect(resp.statusCode).toBe(423);
  });

  test('add action appends a validated new-shelf row (#57)', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_X" data-map-object="shelf"/><rect id="NEW_1" data-map-object="shelf"/></svg>')
    );

    const resp = await handler(event({
      floor: 1,
      reconcileMap: {
        'NEW_1': { action: 'add', fields: { libraryName: 'Lib', collectionName: 'Coll', rangeStart: 'A1', rangeEnd: 'A9' } },
      },
    }));
    expect(resp.statusCode).toBe(200);

    const csvPut = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'staging/data/mapping.csv');
    expect(csvPut).toBeDefined();
    const csvBody = csvPut.args[0].input.Body;
    expect(csvBody).toContain('NEW_1');
    // The appended row carries the supplied fields, svgCode NEW_1, floor 1.
    expect(csvBody).toMatch(/Lib,,Coll,,A1,A9,NEW_1,,,1,,,,/);
  });

  test('add rejects 422 when a required field is missing', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="NEW_1" data-map-object="shelf"/></svg>')
    );

    const resp = await handler(event({
      floor: 1,
      reconcileMap: {
        // collectionName omitted
        'NEW_1': { action: 'add', fields: { libraryName: 'Lib', rangeStart: 'A1', rangeEnd: 'A9' } },
      },
    }));
    expect(resp.statusCode).toBe(422);
    expect(JSON.parse(resp.body).svgCode).toBe('NEW_1');
  });

  test('add rejects 422 when range start>end or prefix mismatch', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="NEW_1" data-map-object="shelf"/></svg>')
    );

    const resp = await handler(event({
      floor: 1,
      reconcileMap: {
        'NEW_1': { action: 'add', fields: { libraryName: 'Lib', collectionName: 'Coll', rangeStart: 'A9', rangeEnd: 'A1' } },
      },
    }));
    expect(resp.statusCode).toBe(422);
    expect(JSON.parse(resp.body).svgCode).toBe('NEW_1');
  });

  test('add rejects 422 when svgCode does not resolve on its floor', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );
    // SVG lacks NEW_1
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_X" data-map-object="shelf"/></svg>')
    );

    const resp = await handler(event({
      floor: 1,
      reconcileMap: {
        'NEW_1': { action: 'add', fields: { libraryName: 'Lib', collectionName: 'Coll', rangeStart: 'A1', rangeEnd: 'A9' } },
      },
    }));
    expect(resp.statusCode).toBe(422);
    expect(JSON.parse(resp.body).svgCode).toBe('NEW_1');
  });

  test('rename and add in one reconcileMap both apply', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_Y" data-map-object="shelf"/><rect id="NEW_1" data-map-object="shelf"/></svg>')
    );

    const resp = await handler(event({
      floor: 1,
      reconcileMap: {
        'CC_X': { action: 'rename', to: 'CC_Y' },
        'NEW_1': { action: 'add', fields: { libraryName: 'Lib', collectionName: 'Coll', rangeStart: 'A1', rangeEnd: 'A9' } },
      },
    }));
    expect(resp.statusCode).toBe(200);

    const csvPut = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'staging/data/mapping.csv');
    const csvBody = csvPut.args[0].input.Body;
    expect(csvBody).toContain('CC_Y');
    expect(csvBody).not.toContain('CC_X,');
    expect(csvBody).toContain('NEW_1');
  });
});
