import { S3Client, GetObjectCommand, PutObjectCommand, CopyObjectCommand, DeleteObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { parseSvg } from './shared/svg-shelves.mjs';
import { validateBundle } from './shared/validateBundle.mjs';
import { readMeta, releaseLock } from './shared/staging-meta.mjs';
import { parseCsvContent } from './range-validation.mjs';

const s3 = new S3Client({ region: 'us-east-1' });
const cloudfront = new CloudFrontClient({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const DISTRIBUTION_ID = 'E5SR0E5GM5GSB';
const MAX_VERSIONS = 20;

// Map filename extension -> Content-Type for backup writes. Mirrors the
// values used by the legacy single-file save Lambdas (putCsv/uploadSvg).
const CONTENT_TYPE_BY_EXT = {
  '.csv': 'text/csv; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers: CORS_HEADERS, body: '' };
  }

  const authResult = await validateToken(event);
  if (!authResult.isValid) return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  const perm = checkPermission(authResult.user, 'delete');
  if (!perm.allowed) return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);

  const user = authResult.user.sub;
  const meta = await readMeta(BUCKET);
  if (!meta.locked) {
    return createAuthResponse(409, { error: 'No staging area is currently active' }, CORS_HEADERS);
  }
  if (meta.owner !== user) {
    return createAuthResponse(423, { error: `Staging is owned by ${meta.owner}`, heldBy: meta.owner }, CORS_HEADERS);
  }

  // Re-validate as final gate
  const svgShelfIdsByFloor = {};
  for (const floor of [0, 1, 2]) {
    const svg = await fetchObjectOrFallback(`staging/maps/floor_${floor}.svg`, `maps/floor_${floor}.svg`);
    const { shelves } = parseSvg(svg);
    svgShelfIdsByFloor[floor] = new Set(shelves);
  }
  const csvString = await fetchObjectOrFallback('staging/data/mapping.csv', 'data/mapping.csv');
  const { rows } = parseCsvContent(csvString);
  const csvRowsForValidation = rows.map((row, idx) => ({
    rowIndex: idx,
    svgCode: String(row.svgCode || ''),
    floor: Number(row.floor),
  }));
  const result = validateBundle(csvRowsForValidation, svgShelfIdsByFloor);
  if (!result.ok) {
    return createAuthResponse(422, {
      error: 'Bundle invariant violation at promote time (production changed during staging)',
      errors: result.errors,
    }, CORS_HEADERS);
  }

  // Build sanitized username for backup filenames. Mirrors putCsv.mjs
  // convention: prefer email, fall back to username, then 'unknown'. Sanitize
  // with the same regex so the filename matches the existing versions/ scheme.
  const userIdentifier =
    authResult.user.email || authResult.user.username || 'unknown';
  const sanitizedUsername = userIdentifier.replace(/[^a-zA-Z0-9_@.-]/g, '_');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

  // Copy staged files to production. Before each copy, back up the current
  // production object to versions/<dir>/<base>_<ts>_<user>.<ext>. This makes
  // promote symmetrical with putCsv/uploadSvg so a destructive promote is
  // recoverable via the Versions tab (see issue #60).
  const promotedVersions = {};
  const cdnPaths = [];
  const backedUpPrefixes = new Set();
  for (const file of meta.files || []) {
    const stagedKey = `staging/${file}`;
    const prodKey = file;

    // Step A: read the current production file and write it to versions/.
    // First-time promotes (prodKey absent) skip backup and proceed with copy.
    const versionInfo = buildVersionKey(prodKey, timestamp, sanitizedUsername);
    if (versionInfo) {
      try {
        const currentResp = await s3.send(new GetObjectCommand({
          Bucket: BUCKET,
          Key: prodKey,
        }));
        const currentBytes = await streamToBuffer(currentResp.Body);
        await s3.send(new PutObjectCommand({
          Bucket: BUCKET,
          Key: versionInfo.key,
          Body: currentBytes,
          ContentType: versionInfo.contentType,
        }));
        backedUpPrefixes.add(versionInfo.listPrefix);
        console.log(`Backed up ${prodKey} -> ${versionInfo.key}`);
      } catch (err) {
        if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
          console.log(`No prior production object at ${prodKey}; skipping backup (first promote).`);
        } else {
          console.error(`Failed to back up ${prodKey} before promote:`, err);
        }
      }
    }

    // Step B: perform the copy from staging to production.
    try {
      await s3.send(new CopyObjectCommand({
        Bucket: BUCKET,
        Key: prodKey,
        CopySource: `${BUCKET}/${stagedKey}`,
      }));
      promotedVersions[file] = 'updated';
      cdnPaths.push(`/${prodKey}`);
    } catch (err) {
      // Attempt rollback: nothing to roll back at this point because we've only
      // touched this single file. Return 500 with explicit instructions.
      console.error(`Promote failed at ${prodKey}:`, err);
      return createAuthResponse(500, {
        error: 'Promote failed mid-copy',
        recovery: 'failed',
        partialState: promotedVersions,
        manualRecovery: 'Check S3 version history for affected files',
      }, CORS_HEADERS);
    }
  }

  // Retention: prune oldest backups beyond MAX_VERSIONS for each file we
  // actually backed up. Mirrors putCsv's policy so the Versions tab caps at 20.
  for (const prefix of backedUpPrefixes) {
    try {
      const listResp = await s3.send(new ListObjectsV2Command({
        Bucket: BUCKET,
        Prefix: prefix,
      }));
      if (listResp.Contents && listResp.Contents.length > MAX_VERSIONS) {
        const sorted = listResp.Contents.sort(
          (a, b) => new Date(b.LastModified) - new Date(a.LastModified)
        );
        const toDelete = sorted.slice(MAX_VERSIONS);
        if (toDelete.length > 0) {
          await s3.send(new DeleteObjectsCommand({
            Bucket: BUCKET,
            Delete: {
              Objects: toDelete.map(obj => ({ Key: obj.Key })),
              Quiet: true,
            },
          }));
          console.log(`Pruned ${toDelete.length} old versions under ${prefix}`);
        }
      }
    } catch (err) {
      // Retention failure must not block promote.
      console.error(`Retention pruning failed for prefix ${prefix}:`, err);
    }
  }

  // Invalidate CloudFront
  if (cdnPaths.length > 0) {
    await cloudfront.send(new CreateInvalidationCommand({
      DistributionId: DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `promote-${Date.now()}`,
        Paths: { Quantity: cdnPaths.length, Items: cdnPaths },
      },
    }));
  }

  // Clear staging objects + release lock
  for (const file of meta.files || []) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `staging/${file}` })).catch(() => {});
  }
  await releaseLock(BUCKET);

  return createAuthResponse(200, {
    ok: true,
    promotedVersions,
  }, CORS_HEADERS);
};

async function fetchObjectOrFallback(primaryKey, fallbackKey) {
  try {
    const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: primaryKey }));
    return await streamToString(resp.Body);
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey') {
      const resp = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: fallbackKey }));
      return await streamToString(resp.Body);
    }
    throw err;
  }
}

async function streamToString(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString('utf-8');
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks);
}

/**
 * Build the version-backup S3 key and list-prefix for a given production file.
 *
 * Returns null if the file's extension is not in the known set (defensive: the
 * staging system only ever promotes .csv/.svg today, but if a future caller
 * adds something unknown we skip backup rather than write an untyped object).
 *
 * @param {string} prodKey   e.g. "maps/floor_0.svg" or "data/mapping.csv"
 * @param {string} timestamp ISO timestamp with `[:.]` replaced by `-`
 * @param {string} sanitizedUsername
 * @returns {{key: string, listPrefix: string, contentType: string} | null}
 */
function buildVersionKey(prodKey, timestamp, sanitizedUsername) {
  const lastSlash = prodKey.lastIndexOf('/');
  const dir = lastSlash >= 0 ? prodKey.slice(0, lastSlash) : '';
  const filename = lastSlash >= 0 ? prodKey.slice(lastSlash + 1) : prodKey;
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return null;
  const base = filename.slice(0, dot);
  const ext = filename.slice(dot); // includes leading "."
  const contentType = CONTENT_TYPE_BY_EXT[ext];
  if (!contentType) return null;
  const listPrefix = `versions/${dir}/${base}_`;
  const key = `${listPrefix}${timestamp}_${sanitizedUsername}${ext}`;
  return { key, listPrefix, contentType };
}
