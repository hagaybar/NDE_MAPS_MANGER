import { jest } from '@jest/globals';
import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
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
      validateToken: jest.fn().mockResolvedValue({ isValid: true, user: { sub: 'alice', username: 'alice', role: 'admin' } }),
      createAuthResponse: jest.fn((status, body) => ({ statusCode: status, headers: {}, body: JSON.stringify(body) })),
    }));
    jest.unstable_mockModule('../role-auth.mjs', () => ({
      checkPermission: jest.fn().mockReturnValue({ allowed: true }),
    }));
    s3Mock.on(PutObjectCommand).resolves({});
    s3Mock.on(CopyObjectCommand).resolves({});
    s3Mock.on(DeleteObjectCommand).resolves({});
    s3Mock.on(ListObjectsV2Command).resolves({ Contents: [] });
    s3Mock.on(DeleteObjectsCommand).resolves({});
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
    // Production files exist — backup step will read them before promote
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_1.svg' }).resolves(streamFromString('<svg><rect id="OLD_SHELF" data-map-object="shelf"/></svg>'));
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(streamFromString('prior-csv'));

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

  // --- Version-backup behavior (issue #60) ---

  // Shared setup helper for the backup tests.
  function setupSingleFileSvgPromote(prodSvgBody) {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['maps/floor_0.svg'],
      }))
    );
    // Re-validation: staged floor_0 has shelf CB_0; floors 1+2 staged absent (fall back to prod-empty).
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).resolves(
      streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>')
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_1.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    // No staged CSV — fall back to prod for validation.
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    // Prod CSV references CB_0 (validates fine).
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,
`)
    );
    // Prod floor_0.svg returned for the BACKUP read (separately from validation, which read staged floor_0).
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString(prodSvgBody));
  }

  test('creates a versioned backup of the prod SVG before overwriting it', async () => {
    setupSingleFileSvgPromote('<svg><rect id="LEGACY_SHELF" data-map-object="shelf"/></svg>');

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);

    // A PutObjectCommand should have written to versions/maps/floor_0_<ts>_<user>.svg
    const versionPuts = s3Mock.commandCalls(PutObjectCommand).filter(c =>
      /^versions\/maps\/floor_0_.+_alice\.svg$/.test(c.args[0].input.Key)
    );
    expect(versionPuts.length).toBe(1);
    // The backup body must match the prior production content (Buffer or string).
    const body = versionPuts[0].args[0].input.Body;
    const bodyStr = Buffer.isBuffer(body) ? body.toString('utf-8') : String(body);
    expect(bodyStr).toContain('LEGACY_SHELF');

    // The CopyObjectCommand for the same prod key must still have run.
    const copies = s3Mock.commandCalls(CopyObjectCommand);
    expect(copies.find(c => c.args[0].input.Key === 'maps/floor_0.svg')).toBeDefined();
  });

  test('creates backups for every file in meta.files before any prod overwrite', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['maps/floor_0.svg', 'data/mapping.csv'],
      }))
    );
    // Re-validation
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).resolves(
      streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>')
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_1.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    // Staged CSV
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,
`)
    );
    // Prod content used by the BACKUP step
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(streamFromString('<svg><rect id="LEGACY_SHELF" data-map-object="shelf"/></svg>'));
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(streamFromString('prior-csv-bytes'));

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);

    // Both backups present.
    const allPuts = s3Mock.commandCalls(PutObjectCommand);
    const svgBackup = allPuts.find(c => /^versions\/maps\/floor_0_.+_alice\.svg$/.test(c.args[0].input.Key));
    const csvBackup = allPuts.find(c => /^versions\/data\/mapping_.+_alice\.csv$/.test(c.args[0].input.Key));
    expect(svgBackup).toBeDefined();
    expect(csvBackup).toBeDefined();

    // Ordering invariant: every backup PutObject must precede the CopyObjectCommand for the same file.
    const allCalls = s3Mock.calls();
    const idxOf = pred => allCalls.findIndex(pred);

    const idxSvgBackup = idxOf(c =>
      c.args[0] instanceof PutObjectCommand &&
      /^versions\/maps\/floor_0_.+_alice\.svg$/.test(c.args[0].input.Key)
    );
    const idxSvgCopy = idxOf(c =>
      c.args[0] instanceof CopyObjectCommand && c.args[0].input.Key === 'maps/floor_0.svg'
    );
    const idxCsvBackup = idxOf(c =>
      c.args[0] instanceof PutObjectCommand &&
      /^versions\/data\/mapping_.+_alice\.csv$/.test(c.args[0].input.Key)
    );
    const idxCsvCopy = idxOf(c =>
      c.args[0] instanceof CopyObjectCommand && c.args[0].input.Key === 'data/mapping.csv'
    );

    expect(idxSvgBackup).toBeGreaterThan(-1);
    expect(idxSvgCopy).toBeGreaterThan(-1);
    expect(idxCsvBackup).toBeGreaterThan(-1);
    expect(idxCsvCopy).toBeGreaterThan(-1);
    expect(idxSvgBackup).toBeLessThan(idxSvgCopy);
    expect(idxCsvBackup).toBeLessThan(idxCsvCopy);
  });

  test('applies MAX_VERSIONS=20 retention by deleting oldest backups beyond 20', async () => {
    setupSingleFileSvgPromote('<svg><rect id="LEGACY_SHELF" data-map-object="shelf"/></svg>');

    // Simulate 22 existing backups (so 21 + the new one = 22; should prune 2).
    const existing = Array.from({ length: 22 }, (_, i) => ({
      Key: `versions/maps/floor_0_2026-05-${String(i + 1).padStart(2, '0')}T00-00-00-000Z_alice.svg`,
      LastModified: new Date(2026, 4, i + 1),
    }));
    s3Mock.on(ListObjectsV2Command, { Prefix: 'versions/maps/floor_0_' }).resolves({
      Contents: existing,
    });

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);

    // DeleteObjectsCommand should have been called with the 2 oldest entries.
    const deleteCalls = s3Mock.commandCalls(DeleteObjectsCommand);
    expect(deleteCalls.length).toBe(1);
    const deletedKeys = deleteCalls[0].args[0].input.Delete.Objects.map(o => o.Key);
    expect(deletedKeys.length).toBe(2);
    // Oldest two are May 1 and May 2.
    expect(deletedKeys).toEqual(expect.arrayContaining([
      'versions/maps/floor_0_2026-05-01T00-00-00-000Z_alice.svg',
      'versions/maps/floor_0_2026-05-02T00-00-00-000Z_alice.svg',
    ]));
  });

  test('NoSuchKey on production file is non-fatal — promote proceeds without backup', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['maps/floor_0.svg'],
      }))
    );
    // Re-validation: floor_0 staged exists; floors 1+2 staged absent.
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).resolves(
      streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>')
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_1.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    // No staged CSV → fall back to prod for validation.
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,0,,,,
`)
    );
    // Prod floor_0 does NOT exist (first-ever promote of this file).
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(200);

    // No backup PutObject for versions/maps/floor_0_* should have been attempted.
    const versionPuts = s3Mock.commandCalls(PutObjectCommand).filter(c =>
      /^versions\/maps\/floor_0_/.test(c.args[0].input.Key)
    );
    expect(versionPuts.length).toBe(0);

    // The CopyObjectCommand still happened — promote proceeded.
    const copies = s3Mock.commandCalls(CopyObjectCommand);
    expect(copies.find(c => c.args[0].input.Key === 'maps/floor_0.svg')).toBeDefined();
  });
});
