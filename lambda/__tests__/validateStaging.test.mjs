import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);

function streamFromString(s) { return { get Body() { return Readable.from([Buffer.from(s)]); } }; }
function event() {
  return {
    httpMethod: 'POST',
    headers: { authorization: 'Bearer admin-token' },
    body: '{}',
  };
}

describe('validateStaging', () => {
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
    s3Mock.on(PutObjectCommand).resolves({});

    ({ handler } = await import('../validateStaging.mjs'));
  });

  test('returns ok:true when staged SVG is consistent with prod CSV', async () => {
    // staged: floor 1 SVG with CC_X
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_X" data-map-object="shelf"/></svg>')
    );
    // floors 0 and 2 have no staged SVG — fall back to prod (aws-sdk-client-mock v4 returns undefined for unmocked calls, not NoSuchKey, so we must reject explicitly to exercise fetchObjectOrFallback)
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    // unchanged prod files
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'alice', files: ['maps/floor_1.svg'] }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(true);
    expect(body.errors).toEqual([]);
  });

  test('returns ok:false when staged SVG breaks an existing CSV ref', async () => {
    // staged floor 1 SVG no longer has CC_X
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_NEW" data-map-object="shelf"/></svg>')
    );
    // floors 0 and 2 have no staged SVG — fall back to prod (aws-sdk-client-mock v4 returns undefined for unmocked calls, not NoSuchKey, so we must reject explicitly to exercise fetchObjectOrFallback)
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'alice', files: ['maps/floor_1.svg'] }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);
    expect(body.ok).toBe(false);
    expect(body.errors[0]).toMatchObject({ svgCode: 'CC_X', floor: 1, type: 'shelf-not-found' });
    expect(body.summary.removedRefs).toEqual([{ svgCode: 'CC_X', floor: 1, affectedRowCount: 1 }]);
  });

  test('summary distinguishes newly-added, removed, and unmapped shelves', async () => {
    // Production SVG floor 1: CC_X (mapped), CC_ORPH (pre-existing orphan), CC_DROP (will be dropped)
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_X" data-map-object="shelf"/><rect id="CC_ORPH" data-map-object="shelf"/><rect id="CC_DROP" data-map-object="shelf"/></svg>')
    );
    // Staged SVG floor 1: keeps CC_X + CC_ORPH, adds genuinely-new CC_NEW, drops CC_DROP
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_X" data-map-object="shelf"/><rect id="CC_ORPH" data-map-object="shelf"/><rect id="CC_NEW" data-map-object="shelf"/></svg>')
    );
    // floors 0 and 2: no staged SVG — fall back to prod
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    // prod CSV: only CC_X mapped on floor 1
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({ locked: true, owner: 'alice', files: ['maps/floor_1.svg'] }))
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);
    const body = JSON.parse(resp.body);

    // newly added: only the genuinely-new shelf (staged SVG \ prod SVG)
    expect(body.summary.newlyAddedShelves).toEqual([{ svgCode: 'CC_NEW', floor: 1 }]);
    // removed: dropped from the SVG (prod SVG \ staged SVG)
    expect(body.summary.removedShelves).toEqual([{ svgCode: 'CC_DROP', floor: 1 }]);
    // unmapped: all staged shelves not referenced by CSV (orphan + new) == legacy addedShelves
    expect(body.summary.unmappedShelves).toEqual([
      { svgCode: 'CC_ORPH', floor: 1 },
      { svgCode: 'CC_NEW', floor: 1 },
    ]);
    expect(body.summary.addedShelves).toEqual([
      { svgCode: 'CC_ORPH', floor: 1 },
      { svgCode: 'CC_NEW', floor: 1 },
    ]);
    // back-compat: removedRefs unchanged (CC_X still present in staged SVG)
    expect(body.summary.removedRefs).toEqual([]);
  });
});
