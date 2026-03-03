/**
 * restoreVersion Lambda function
 * Restores a CSV version from versions/data/ to data/mapping.csv
 *
 * Endpoint: POST /api/versions/csv/{versionId}/restore
 * Request body: {} (username extracted from auth token)
 *
 * Flow:
 * 1. Validate versionId and authenticate user
 * 2. Get current file (data/mapping.csv) and save as backup
 * 3. Get version file and copy to data/mapping.csv
 * 4. Invalidate CloudFront cache
 * 5. Enforce retention policy (MAX_VERSIONS = 20)
 */

import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';

const s3 = new S3Client({ region: 'us-east-1' });
const cloudfront = new CloudFrontClient({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const DISTRIBUTION_ID = 'E5SR0E5GM5GSB';
const MAX_VERSIONS = 20;

// CORS headers
const corsHeaders = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// Version filename pattern: mapping_{timestamp}_{username}.csv
const VERSION_PATTERN = /^mapping_\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z_[a-zA-Z0-9_-]+\.csv$/;

/**
 * Validate versionId format
 * @param {string} versionId - Version filename
 * @returns {boolean} - True if valid
 */
const isValidVersionId = (versionId) => {
  if (!versionId) return false;
  // Check for path traversal attempts
  if (versionId.includes('..') || versionId.includes('/')) return false;
  return VERSION_PATTERN.test(versionId);
};

/**
 * Check if request is OPTIONS preflight
 * @param {Object} event - Lambda event
 * @returns {boolean}
 */
const isOptionsRequest = (event) => {
  return event.httpMethod === 'OPTIONS' ||
    event.requestContext?.http?.method === 'OPTIONS';
};

export const handler = async (event) => {
  try {
    // Handle OPTIONS preflight
    if (isOptionsRequest(event)) {
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: ''
      };
    }

    // Validate token
    const authResult = await validateToken(event);
    if (!authResult.isValid) {
      return createAuthResponse(authResult.statusCode, { error: authResult.error });
    }

    // Check permission - editor role required for restore-versions
    const permResult = checkPermission(authResult.user, 'restore-versions');
    if (!permResult.allowed) {
      return createAuthResponse(403, { error: permResult.reason });
    }

    // Get versionId from path parameters
    const versionId = event.pathParameters?.versionId;

    // Validate versionId
    if (!versionId) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'versionId is required' })
      };
    }

    if (!isValidVersionId(versionId)) {
      return {
        statusCode: 400,
        headers: corsHeaders,
        body: JSON.stringify({ error: 'Invalid versionId format' })
      };
    }

    // Extract username from authenticated user token instead of body
    const username = authResult.user.username || 'unknown';
    const sanitizedUsername = username.replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupKey = `versions/data/mapping_${timestamp}_${sanitizedUsername}.csv`;
    const versionKey = `versions/data/${versionId}`;

    // Step 1: Get version file first to verify it exists
    let versionContent;
    try {
      const getVersionCommand = new GetObjectCommand({
        Bucket: BUCKET,
        Key: versionKey
      });
      const versionResponse = await s3.send(getVersionCommand);
      versionContent = await versionResponse.Body.transformToString();
    } catch (error) {
      if (error.name === 'NoSuchKey') {
        return {
          statusCode: 404,
          headers: corsHeaders,
          body: JSON.stringify({ error: `Version not found: ${versionId}` })
        };
      }
      throw error;
    }

    // Step 2: Get current file and save as backup (if it exists)
    let backupCreated = null;
    try {
      const getCurrentCommand = new GetObjectCommand({
        Bucket: BUCKET,
        Key: 'data/mapping.csv'
      });
      const currentResponse = await s3.send(getCurrentCommand);
      const currentContent = await currentResponse.Body.transformToString();

      // Save backup
      const saveBackupCommand = new PutObjectCommand({
        Bucket: BUCKET,
        Key: backupKey,
        Body: currentContent,
        ContentType: 'text/csv; charset=utf-8'
      });
      await s3.send(saveBackupCommand);
      backupCreated = backupKey;
      console.log(`Created backup: ${backupKey}`);
    } catch (error) {
      // If current file doesn't exist, that's okay - skip backup
      if (error.name !== 'NoSuchKey') {
        console.error('Error creating backup:', error);
        throw error;
      }
      console.log('No current file exists, skipping backup');
    }

    // Step 3: Write version content to data/mapping.csv
    const putCommand = new PutObjectCommand({
      Bucket: BUCKET,
      Key: 'data/mapping.csv',
      Body: versionContent,
      ContentType: 'text/csv; charset=utf-8'
    });
    await s3.send(putCommand);
    console.log(`Restored version: ${versionKey} to data/mapping.csv`);

    // Step 4: Enforce retention policy - prune old versions (keep last MAX_VERSIONS)
    const listCommand = new ListObjectsV2Command({
      Bucket: BUCKET,
      Prefix: 'versions/data/mapping_'
    });
    const listResponse = await s3.send(listCommand);

    if (listResponse.Contents && listResponse.Contents.length > MAX_VERSIONS) {
      // Sort by LastModified descending (newest first)
      const sortedVersions = listResponse.Contents.sort(
        (a, b) => new Date(b.LastModified) - new Date(a.LastModified)
      );

      // Get versions to delete (all except the newest MAX_VERSIONS)
      const versionsToDelete = sortedVersions.slice(MAX_VERSIONS);

      if (versionsToDelete.length > 0) {
        const deleteCommand = new DeleteObjectsCommand({
          Bucket: BUCKET,
          Delete: {
            Objects: versionsToDelete.map(obj => ({ Key: obj.Key })),
            Quiet: true
          }
        });
        await s3.send(deleteCommand);
        console.log(`Pruned ${versionsToDelete.length} old versions`);
      }
    }

    // Step 5: Invalidate CloudFront cache
    const invalidationCommand = new CreateInvalidationCommand({
      DistributionId: DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `restore-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ['/data/mapping.csv']
        }
      }
    });
    await cloudfront.send(invalidationCommand);
    console.log('CloudFront cache invalidated for /data/mapping.csv');

    // Build response
    const response = {
      success: true,
      message: 'Version restored successfully',
      restoredFrom: versionKey
    };

    if (backupCreated) {
      response.backupCreated = backupCreated;
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify(response)
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ error: error.message })
    };
  }
};
