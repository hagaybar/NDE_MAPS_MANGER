import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';

const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const PREFIX = 'maps/';

const s3Client = new S3Client({});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export const handler = async (event) => {
  // Handle preflight OPTIONS request
  if (event.httpMethod === 'OPTIONS' || event.requestContext?.http?.method === 'OPTIONS') {
    return {
      statusCode: 200,
      headers: CORS_HEADERS,
      body: '',
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
    const command = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: PREFIX,
    });

    const response = await s3Client.send(command);

    const files = (response.Contents || [])
      .filter((obj) => obj.Key.endsWith('.svg'))
      .map((obj) => ({
        name: obj.Key.replace(PREFIX, ''),
        size: obj.Size,
        lastModified: obj.LastModified.toISOString(),
      }));

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        files,
      }),
    };
  } catch (error) {
    console.error('Error listing SVG files:', error);

    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to list SVG files',
      }),
    };
  }
};
