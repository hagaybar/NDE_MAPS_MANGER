import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';

const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const PREFIX = 'versions/maps/';

const s3Client = new S3Client({});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Parse version metadata from SVG filename
 * Filename pattern: {originalName}_{timestamp}_{username}.svg
 * Example: floor_0_2026-03-01T12-00-00-000Z_admin.svg
 * Timestamp format in filename: 2026-03-01T12-00-00-000Z (dashes instead of colons)
 *
 * @param {string} key - S3 object key
 * @returns {Object} - Parsed metadata with originalName, timestamp and username
 */
const parseVersionFilename = (key) => {
  const filename = key.replace(PREFIX, '');

  // Pattern: {originalName}_{timestamp}_{username}.svg
  // Example: floor_0_2026-03-01T12-00-00-000Z_admin.svg
  // Timestamp in filename uses dashes instead of colons: 2026-03-01T12-00-00-000Z
  // The original name can contain underscores (e.g., floor_0, floor_1)
  // Timestamp format: YYYY-MM-DDTHH-MM-SS-mmmZ
  const match = filename.match(/^(.+)_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z)_(.+)\.svg$/);

  if (match) {
    const originalName = match[1];
    const rawTimestamp = match[2];
    const username = match[3];

    // Convert timestamp back to ISO format (replace dashes with colons in time part)
    // Input: 2026-03-01T12-00-00-000Z
    // Output: 2026-03-01T12:00:00.000Z
    const [datePart, timePart] = rawTimestamp.split('T');
    // timePart: 12-00-00-000Z
    const timeMatch = timePart.match(/^(\d{2})-(\d{2})-(\d{2})-(\d{3})Z$/);

    if (timeMatch) {
      const isoTimestamp = `${datePart}T${timeMatch[1]}:${timeMatch[2]}:${timeMatch[3]}.${timeMatch[4]}Z`;

      return {
        originalName: `${originalName}.svg`,
        timestamp: isoTimestamp,
        username
      };
    }
  }

  // Fallback for malformed filenames
  return {
    originalName: null,
    timestamp: null,
    username: 'unknown'
  };
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

    // Filter SVG files and group by original filename
    const versionsByFile = {};

    (response.Contents || [])
      .filter((obj) => obj.Key.endsWith('.svg'))
      .forEach((obj) => {
        const parsed = parseVersionFilename(obj.Key);

        // Skip files that couldn't be parsed (no originalName)
        if (!parsed.originalName) {
          return;
        }

        const version = {
          key: obj.Key,
          timestamp: parsed.timestamp,
          username: parsed.username,
          size: obj.Size,
        };

        // Group by original filename
        if (!versionsByFile[parsed.originalName]) {
          versionsByFile[parsed.originalName] = [];
        }
        versionsByFile[parsed.originalName].push(version);
      });

    // Sort each group by timestamp (newest first)
    for (const filename of Object.keys(versionsByFile)) {
      versionsByFile[filename].sort((a, b) => {
        // Handle null timestamps (place them at the end)
        if (!a.timestamp && !b.timestamp) return 0;
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return new Date(b.timestamp) - new Date(a.timestamp);
      });
    }

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        versions: versionsByFile,
      }),
    };
  } catch (error) {
    console.error('Error listing SVG versions:', error);

    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to list SVG versions',
      }),
    };
  }
};
