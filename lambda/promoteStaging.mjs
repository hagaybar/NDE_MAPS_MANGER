import { S3Client, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
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
  if (!authResult.valid) return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  const perm = checkPermission(authResult.claims, 'admin');
  if (!perm.allowed) return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);

  const user = authResult.claims.sub;
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

  // Copy staged files to production
  const promotedVersions = {};
  const cdnPaths = [];
  for (const file of meta.files || []) {
    const stagedKey = `staging/${file}`;
    const prodKey = file;
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
