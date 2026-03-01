import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, HeadObjectCommand } from '@aws-sdk/client-s3';
import { CloudFrontClient, CreateInvalidationCommand } from '@aws-sdk/client-cloudfront';

const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';
const CF_DIST_ID = 'E5SR0E5GM5GSB';
const PREFIX = 'maps/';
const VERSIONS_PREFIX = 'versions/maps/';

const s3Client = new S3Client({});
const cfClient = new CloudFrontClient({});

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, DELETE, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const generateTimestamp = () => {
  const now = new Date();
  return now.toISOString().replace(/[-:T]/g, '').split('.')[0];
};

const fileExists = async (key) => {
  try {
    await s3Client.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch (error) {
    if (error.name === 'NotFound' || error.$metadata?.httpStatusCode === 404) {
      return false;
    }
    throw error;
  }
};

const getFileContent = async (key) => {
  const response = await s3Client.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return await response.Body.transformToString();
};

const invalidateCloudFront = async (path) => {
  const command = new CreateInvalidationCommand({
    DistributionId: CF_DIST_ID,
    InvalidationBatch: {
      CallerReference: `invalidation-${Date.now()}`,
      Paths: {
        Quantity: 1,
        Items: [path],
      },
    },
  });
  await cfClient.send(command);
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

  try {
    // Parse request body
    let body;
    try {
      body = JSON.parse(event.body || '{}');
    } catch {
      return {
        statusCode: 400,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          error: 'Invalid JSON in request body',
        }),
      };
    }

    const { filename, username } = body;

    // Validate required fields
    if (!filename || !username) {
      return {
        statusCode: 400,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          error: 'Missing required fields: filename and username are required',
        }),
      };
    }

    // Sanitize filename
    const sanitizedFilename = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
    const fileKey = `${PREFIX}${sanitizedFilename}`;

    // Check if file exists
    const exists = await fileExists(fileKey);
    if (!exists) {
      return {
        statusCode: 404,
        headers: {
          ...CORS_HEADERS,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          success: false,
          error: 'File not found',
        }),
      };
    }

    // Backup the file before deletion
    const existingContent = await getFileContent(fileKey);
    const basename = sanitizedFilename.replace('.svg', '');
    const timestamp = generateTimestamp();
    const backupKey = `${VERSIONS_PREFIX}${basename}_${timestamp}_${username}_deleted.svg`;

    await s3Client.send(new PutObjectCommand({
      Bucket: BUCKET,
      Key: backupKey,
      Body: existingContent,
      ContentType: 'image/svg+xml',
    }));

    // Delete the file
    await s3Client.send(new DeleteObjectCommand({
      Bucket: BUCKET,
      Key: fileKey,
    }));

    // Invalidate CloudFront cache
    await invalidateCloudFront(`/${fileKey}`);

    return {
      statusCode: 200,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: true,
        message: 'File deleted successfully (backup created)',
        filename: sanitizedFilename,
        backupKey,
      }),
    };
  } catch (error) {
    console.error('Error deleting SVG file:', error);

    return {
      statusCode: 500,
      headers: {
        ...CORS_HEADERS,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        success: false,
        error: error.message || 'Failed to delete SVG file',
      }),
    };
  }
};
