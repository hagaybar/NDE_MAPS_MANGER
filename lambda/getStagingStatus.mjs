import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';
import { readMeta } from './shared/staging-meta.mjs';

const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
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

  const meta = await readMeta(BUCKET);
  return createAuthResponse(200, meta, CORS_HEADERS);
};
