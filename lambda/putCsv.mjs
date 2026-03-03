import { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command, DeleteObjectsCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';
import { validateToken, createAuthResponse } from './auth-middleware.mjs';
import { checkPermission } from './role-auth.mjs';

const s3 = new S3Client({ region: 'us-east-1' });
const cloudfront = new CloudFrontClient({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const DISTRIBUTION_ID = 'E5SR0E5GM5GSB';
const MAX_VERSIONS = 20;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'PUT, OPTIONS',
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

  // Check permission - editor role required for write
  const permResult = checkPermission(authResult.user, 'write');
  if (!permResult.allowed) {
    return createAuthResponse(403, { error: permResult.reason });
  }

  try {
    // Parse request body
    const body = JSON.parse(event.body || '{}');
    const { csvContent } = body;

    if (!csvContent) {
      return {
        statusCode: 400,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ error: 'csvContent is required' })
      };
    }

    // Extract username from authenticated user token instead of body
    const sanitizedUsername = (authResult.user.username || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '_');
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const versionKey = `versions/data/mapping_${timestamp}_${sanitizedUsername}.csv`;

    // Step 1: Get current file and save as version
    try {
      const getCurrentCommand = new GetObjectCommand({
        Bucket: BUCKET,
        Key: 'data/mapping.csv'
      });
      const currentResponse = await s3.send(getCurrentCommand);
      const currentContent = await currentResponse.Body.transformToString();

      // Save current version
      const saveVersionCommand = new PutObjectCommand({
        Bucket: BUCKET,
        Key: versionKey,
        Body: currentContent,
        ContentType: 'text/csv; charset=utf-8'
      });
      await s3.send(saveVersionCommand);
      console.log(`Saved version: ${versionKey}`);
    } catch (error) {
      // If file doesn't exist yet, that's okay - skip versioning
      if (error.name !== 'NoSuchKey') {
        console.error('Error saving version:', error);
      }
    }

    // Step 2: Write new content to data/mapping.csv
    const putCommand = new PutObjectCommand({
      Bucket: BUCKET,
      Key: 'data/mapping.csv',
      Body: csvContent,
      ContentType: 'text/csv; charset=utf-8'
    });
    await s3.send(putCommand);
    console.log('Updated data/mapping.csv');

    // Step 3: List versions and prune old ones (keep last MAX_VERSIONS)
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

    // Step 4: Invalidate CloudFront cache
    const invalidationCommand = new CreateInvalidationCommand({
      DistributionId: DISTRIBUTION_ID,
      InvalidationBatch: {
        CallerReference: `mapping-csv-${Date.now()}`,
        Paths: {
          Quantity: 1,
          Items: ['/data/mapping.csv']
        }
      }
    });
    await cloudfront.send(invalidationCommand);
    console.log('CloudFront cache invalidated for /data/mapping.csv');

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        success: true,
        message: 'CSV updated successfully',
        versionSaved: versionKey
      })
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
