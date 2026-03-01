import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';

const s3 = new S3Client({ region: 'us-east-1' });
const BUCKET = 'tau-cenlib-primo-assets-hagay-3602';

export const handler = async (event) => {
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
        'Content-Type': 'text/csv; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type'
      },
      body: csvContent
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      },
      body: JSON.stringify({ error: error.message })
    };
  }
};
