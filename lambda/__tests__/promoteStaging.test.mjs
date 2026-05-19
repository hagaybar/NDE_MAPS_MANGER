import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { Readable } from 'stream';

const s3Mock = mockClient(S3Client);
const cfMock = mockClient(CloudFrontClient);

function streamFromString(s) { return { get Body() { return Readable.from([Buffer.from(s)]); } }; }
function event() {
  return { httpMethod: 'POST', headers: { authorization: 'Bearer admin-token' }, body: '{}' };
}

describe('promoteStaging', () => {
  let handler;

  beforeEach(async () => {
    s3Mock.reset();
    cfMock.reset();
    jest.unstable_mockModule('../auth-middleware.mjs', () => ({
      validateToken: jest.fn().mockResolvedValue({ isValid: true, user: { sub: 'alice', role: 'admin' } }),
      createAuthResponse: jest.fn((status, body) => ({ statusCode: status, headers: {}, body: JSON.stringify(body) })),
    }));
    jest.unstable_mockModule('../role-auth.mjs', () => ({
      checkPermission: jest.fn().mockReturnValue({ allowed: true }),
    }));
    s3Mock.on(PutObjectCommand).resolves({});
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});
    cfMock.on(CreateInvalidationCommand).resolves({});

    ({ handler } = await import('../promoteStaging.mjs'));
  });

  test('promotes staged files to production and clears staging', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['maps/floor_1.svg', 'data/mapping.csv'],
      }))
    );
    // Fixtures for the final re-validation
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_NEW" data-map-object="shelf"/></svg>')
    );
    // Floors 0 and 2 have no staged SVG — fall back to prod (must explicitly reject so fetchObjectOrFallback catches NoSuchKey)
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,
Lib,LibHe,Coll,CollHe,000,999,CC_NEW,,,1,,,,
`)
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);

    // Files should be copied to production paths
    const copies = s3Mock.commandCalls(CopyObjectCommand);
    expect(copies.find(c => c.args[0].input.Key === 'maps/floor_1.svg')).toBeDefined();
    expect(copies.find(c => c.args[0].input.Key === 'data/mapping.csv')).toBeDefined();

    // CloudFront invalidation
    const invalidations = cfMock.commandCalls(CreateInvalidationCommand);
    expect(invalidations.length).toBe(1);

    // Staging cleared (meta reset)
    const metaWrite = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'staging/.meta.json');
    expect(metaWrite).toBeDefined();
    expect(JSON.parse(metaWrite.args[0].input.Body).locked).toBe(false);
  });

  test('returns 422 if final re-validation fails (Git-rebase race)', async () => {
    // Same staged files, but production CSV changed in the meantime to reference a removed shelf
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['maps/floor_1.svg'],
      }))
    );
    // Staged: floor_1 SVG no longer has CC_X
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).resolves(
      streamFromString('<svg><rect id="CC_NEW" data-map-object="shelf"/></svg>')
    );
    // Floors 0 and 2 have no staged SVG — fall back to prod (must explicitly reject so fetchObjectOrFallback catches NoSuchKey)
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    // No staged CSV — fall back to prod
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    // Prod CSV references CC_X (which no longer exists in the staged SVG)
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CC_X,,,1,,,,
`)
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(422);
    expect(JSON.parse(resp.body).errors).toBeDefined();
  });
});
