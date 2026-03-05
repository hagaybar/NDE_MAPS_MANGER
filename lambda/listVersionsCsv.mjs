import { S3Client, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';

const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const PREFIX = 'versions/data/';

const s3Client = new S3Client({});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

/**
 * Parse version metadata from filename
 * Filename pattern: mapping_{timestamp}_{username}.csv
 * Timestamp format in filename: 2024-01-15T10-30-00Z (dashes instead of colons)
 *
 * @param {string} key - S3 object key
 * @returns {Object} - Parsed metadata with timestamp and username
 */
const parseVersionFilename = (key) => {
  const filename = key.replace(PREFIX, '');

  // Pattern: mapping_{timestamp}_{username}.csv
  // Timestamp in filename uses dashes instead of colons/dots: 2026-03-05T13-31-21-407Z
  // Match with optional milliseconds: HH-MM-SS or HH-MM-SS-mmm
  const match = filename.match(/^mapping_(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}(?:-\d{3})?Z)_(.+)\.csv$/);

  if (match) {
    // Convert timestamp back to ISO format
    const rawTimestamp = match[1];
    // Split at T to separate date and time
    const [datePart, timePart] = rawTimestamp.split('T');
    // Time part is like: 13-31-21-407Z or 13-31-21Z
    // Need to convert to: 13:31:21.407Z or 13:31:21Z
    const timeMatch = timePart.match(/^(\d{2})-(\d{2})-(\d{2})(?:-(\d{3}))?Z$/);

    if (timeMatch) {
      const [, hours, minutes, seconds, millis] = timeMatch;
      const isoTimestamp = millis
        ? `${datePart}T${hours}:${minutes}:${seconds}.${millis}Z`
        : `${datePart}T${hours}:${minutes}:${seconds}Z`;

      return {
        timestamp: isoTimestamp,
        username: match[2]
      };
    }
  }

  // Fallback for malformed filenames
  return {
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

    // Filter and map CSV files to version objects
    const versions = (response.Contents || [])
      .filter((obj) => obj.Key.endsWith('.csv'))
      .map((obj) => {
        const parsed = parseVersionFilename(obj.Key);
        return {
          key: obj.Key,
          timestamp: parsed.timestamp,
          username: parsed.username,
          size: obj.Size,
          etag: obj.ETag,
        };
      })
      // Sort by timestamp (newest first)
      .sort((a, b) => {
        // Handle null timestamps (place them at the end)
        if (!a.timestamp && !b.timestamp) return 0;
        if (!a.timestamp) return 1;
        if (!b.timestamp) return -1;
        return new Date(b.timestamp) - new Date(a.timestamp);
      });

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        versions,
      }),
    };
  } catch (error) {
    console.error('Error listing CSV versions:', error);

    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to list CSV versions',
      }),
    };
  }
};
