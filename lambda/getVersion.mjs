import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';

const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const PREFIX = 'versions/data/';

const s3Client = new S3Client({ region: 'us-east-1' });

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Validate versionId format
 * Pattern: mapping_{timestamp}_{username}.csv
 * Timestamp format: YYYY-MM-DDTHH-MM-SS-MMMZ (with dashes instead of colons for filename safety)
 * Username can contain underscores
 *
 * @param {string} versionId - The version ID to validate
 * @returns {boolean} - True if valid, false otherwise
 */
const isValidVersionId = (versionId) => {
  if (!versionId || typeof versionId !== 'string') {
    return false;
  }

  // Check for path traversal attempts
  if (versionId.includes('..') || versionId.includes('/') || versionId.includes('\\')) {
    return false;
  }

  // Pattern: mapping_{timestamp}_{username}.csv
  // Timestamp: YYYY-MM-DDTHH-MM-SS-MMMZ (dashes instead of colons, with milliseconds)
  // Username: one or more word characters (including underscores)
  const pattern = /^mapping_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[\w]+\.csv$/;

  return pattern.test(versionId);
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

  // Extract versionId from path parameters
  const versionId = event.pathParameters?.versionId;

  // Validate versionId is present
  if (!versionId) {
    return {
      statusCode: 400,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: 'Missing required parameter: versionId',
      }),
    };
  }

  // Validate versionId format
  if (!isValidVersionId(versionId)) {
    return {
      statusCode: 400,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: 'Invalid versionId format. Expected: mapping_{timestamp}_{username}.csv',
      }),
    };
  }

  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: `${PREFIX}${versionId}`,
    });

    const response = await s3Client.send(command);
    const csvContent = await response.Body.transformToString();

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'text/csv; charset=utf-8',
      },
      body: csvContent,
    };
  } catch (error) {
    console.error('Error getting version:', error);

    // Check for NoSuchKey error (version not found)
    if (error.name === 'NoSuchKey') {
      return {
        statusCode: 404,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          error: `Version not found: ${versionId}`,
        }),
      };
    }

    // Return 500 for other errors
    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to retrieve version',
      }),
    };
  }
};
