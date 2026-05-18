import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { parseSvg } from './shared/svg-shelves.mjs';
import { acquireLock, recordFile } from './shared/staging-meta.mjs';

const s3 = new S3Client({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';

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
  if (!authResult.valid) {
    return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  }
  const permission = checkPermission(authResult.claims, 'admin');
  if (!permission.allowed) {
    return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);
  }

  const user = authResult.claims.sub;
  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return createAuthResponse(400, { error: 'Invalid JSON body' }, CORS_HEADERS);
  }

  const { floor, svgBase64 } = body;
  if (![0, 1, 2].includes(Number(floor))) {
    return createAuthResponse(400, { error: 'floor must be 0, 1, or 2' }, CORS_HEADERS);
  }
  if (!svgBase64 || typeof svgBase64 !== 'string') {
    return createAuthResponse(400, { error: 'svgBase64 is required' }, CORS_HEADERS);
  }

  let svgString;
  try {
    svgString = Buffer.from(svgBase64, 'base64').toString('utf-8');
  } catch {
    return createAuthResponse(400, { error: 'svgBase64 is not valid base64' }, CORS_HEADERS);
  }

  // Parse and validate the SVG
  let parsed;
  try {
    parsed = parseSvg(svgString);
  } catch (err) {
    return createAuthResponse(400, { error: 'Could not parse SVG', detail: err.message }, CORS_HEADERS);
  }
  if (parsed.shelves.length === 0) {
    return createAuthResponse(400, { error: 'No shelves found in uploaded SVG' }, CORS_HEADERS);
  }
  if (parsed.duplicates.length > 0) {
    return createAuthResponse(400, { error: 'Duplicate shelf IDs', ids: parsed.duplicates }, CORS_HEADERS);
  }

  // Acquire the lock
  const lock = await acquireLock(BUCKET, user);
  if (!lock.acquired) {
    return createAuthResponse(423, {
      error: `Staging in use by ${lock.heldBy}`,
      heldBy: lock.heldBy,
    }, CORS_HEADERS);
  }

  // Write the SVG to staging
  const key = `staging/maps/floor_${floor}.svg`;
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: svgString,
    ContentType: 'image/svg+xml',
  }));
  await recordFile(BUCKET, `maps/floor_${floor}.svg`);

  return createAuthResponse(200, {
    ok: true,
    staged: key,
    shelves: parsed.shelves,
    meta: lock.meta,
  }, CORS_HEADERS);
};
