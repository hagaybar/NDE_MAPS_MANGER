import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';

const s3 = new S3Client({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

export const handler = async (event) => {
  // Handle CORS preflight
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: ''
    };
  }

  // Validate token
  const authResult = await validateToken(event);
  if (!authResult.isValid) {
    return createAuthResponse(authResult.statusCode, { error: authResult.error });
  }

  // Check permission - editor role required
  const permResult = checkPermission(authResult.user, 'read');
  if (!permResult.allowed) {
    return createAuthResponse(403, { error: permResult.reason });
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: 'data/mapping.csv'
    });

    const response = await s3.send(command);
    const csvContent = await response.Body.transformToString();

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8'
      },
      body: csvContent
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
