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

    // Non-SVG files (CSV) keep the server-side copy path.
    const copies = s3Mock.commandCalls(CopyObjectCommand);
    expect(copies.find(c => c.args[0].input.Key === 'data/mapping.csv')).toBeDefined();
    // CSV is never read+stamped+put — it must NOT be copied via a stamp Put.
    expect(copies.find(c => c.args[0].input.Key === 'maps/floor_1.svg')).toBeUndefined();

    // SVG map files are read, stamped, and PutObject'd to the prod key
    // (read+stamp+put instead of a server-side copy).
    const prodSvgPut = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'maps/floor_1.svg');
    expect(prodSvgPut).toBeDefined();
    const putBody = prodSvgPut.args[0].input.Body;
    const putStr = Buffer.isBuffer(putBody) ? putBody.toString('utf-8') : String(putBody);
    // The staged shelf CC_NEW lacked a uid → promoted bytes carry one.
    expect(putStr).toContain('data-shelf-uid="');
    expect(putStr).toContain('id="CC_NEW"');

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

  // #88: a staged CSV with a blank-floor row must NOT be promotable, even when
  // its svgCode is a real floor-0 shelf. Pre-fix `Number('')===0` let CB_0
  // resolve against floor 0 and the promote succeeded (200), publishing a
  // blank-floor row that the Primo add-on then mislocated to floor 2.
  test('returns 422 and does not overwrite production when a staged row has a blank floor', async () => {
    s3Mock.on(GetObjectCommand, { Key: 'staging/.meta.json' }).resolves(
      streamFromString(JSON.stringify({
        locked: true,
        owner: 'alice',
        files: ['data/mapping.csv'],
      }))
    );
    // No staged SVGs — fall back to prod for re-validation.
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_0.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_1.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    s3Mock.on(GetObjectCommand, { Key: 'staging/maps/floor_2.svg' }).rejects(
      Object.assign(new Error('NoSuchKey'), { name: 'NoSuchKey' })
    );
    // CB_0 is a real floor-0 shelf in production.
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_0.svg' }).resolves(
      streamFromString('<svg><rect id="CB_0" data-map-object="shelf"/></svg>')
    );
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_1.svg' }).resolves(streamFromString('<svg/>'));
    s3Mock.on(GetObjectCommand, { Key: 'maps/floor_2.svg' }).resolves(streamFromString('<svg/>'));
    // Staged CSV: CB_0 row with a BLANK floor (10th column empty).
    s3Mock.on(GetObjectCommand, { Key: 'staging/data/mapping.csv' }).resolves(
      streamFromString(`libraryName,libraryNameHe,collectionName,collectionNameHe,rangeStart,rangeEnd,svgCode,description,descriptionHe,floor,shelfLabel,shelfLabelHe,notes,notesHe
Lib,LibHe,Coll,CollHe,000,999,CB_0,,,,,,,
`)
    );

    const resp = await handler(event());
    expect(resp.statusCode).toBe(422);
    expect(JSON.parse(resp.body).errors).toContainEqual(
      expect.objectContaining({ svgCode: 'CB_0', type: 'invalid-floor' })
    );

    // Production must be untouched — no copy or stamped put to data/mapping.csv.
    const csvCopies = s3Mock.commandCalls(CopyObjectCommand)
      .filter(c => c.args[0].input.Key === 'data/mapping.csv');
    const csvPuts = s3Mock.commandCalls(PutObjectCommand)
      .filter(c => c.args[0].input.Key === 'data/mapping.csv');
    expect(csvCopies.length).toBe(0);
    expect(csvPuts.length).toBe(0);
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

    // SVG promote now reads+stamps+Puts to the prod key (no server-side copy).
    const copies = s3Mock.commandCalls(CopyObjectCommand);
    expect(copies.find(c => c.args[0].input.Key === 'maps/floor_0.svg')).toBeUndefined();
    const prodPut = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'maps/floor_0.svg');
    expect(prodPut).toBeDefined();
    const prodBody = prodPut.args[0].input.Body;
    const prodStr = Buffer.isBuffer(prodBody) ? prodBody.toString('utf-8') : String(prodBody);
    // Promoted bytes come from the STAGED svg (CB_0) and carry a stamped uid.
    expect(prodStr).toContain('id="CB_0"');
    expect(prodStr).toContain('data-shelf-uid="');
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
    // SVG now promotes via a stamped PutObject to the prod key (not a copy).
    const idxSvgPromote = idxOf(c =>
      c.args[0] instanceof PutObjectCommand && c.args[0].input.Key === 'maps/floor_0.svg'
    );
    const idxCsvBackup = idxOf(c =>
      c.args[0] instanceof PutObjectCommand &&
      /^versions\/data\/mapping_.+_alice\.csv$/.test(c.args[0].input.Key)
    );
    const idxCsvCopy = idxOf(c =>
      c.args[0] instanceof CopyObjectCommand && c.args[0].input.Key === 'data/mapping.csv'
    );

    expect(idxSvgBackup).toBeGreaterThan(-1);
    expect(idxSvgPromote).toBeGreaterThan(-1);
    expect(idxCsvBackup).toBeGreaterThan(-1);
    expect(idxCsvCopy).toBeGreaterThan(-1);
    // The version backup must precede the prod overwrite for each file.
    expect(idxSvgBackup).toBeLessThan(idxSvgPromote);
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

    // The stamped prod PutObject still happened — promote proceeded.
    const prodPut = s3Mock.commandCalls(PutObjectCommand)
      .find(c => c.args[0].input.Key === 'maps/floor_0.svg');
    expect(prodPut).toBeDefined();
  });
});
