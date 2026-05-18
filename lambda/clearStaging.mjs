import { S3Client, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { readMeta, releaseLock } from './shared/staging-meta.mjs';

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
  if (!authResult.valid) return createAuthResponse(401, { error: 'Invalid token' }, CORS_HEADERS);
  const perm = checkPermission(authResult.claims, 'admin');
  if (!perm.allowed) return createAuthResponse(403, { error: 'Admin role required' }, CORS_HEADERS);

  const user = authResult.claims.sub;
  const meta = await readMeta(BUCKET);
  if (!meta.locked) {
    return createAuthResponse(200, { ok: true, message: 'No active staging' }, CORS_HEADERS);
  }
  if (meta.owner !== user) {
    return createAuthResponse(423, { error: `Staging is owned by ${meta.owner}`, heldBy: meta.owner }, CORS_HEADERS);
  }

  for (const file of meta.files || []) {
    await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: `staging/${file}` })).catch(() => {});
  }
  await releaseLock(BUCKET);

  return createAuthResponse(200, { ok: true }, CORS_HEADERS);
};
