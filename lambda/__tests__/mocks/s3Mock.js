/**
 * AWS S3 Mock Helpers
 * Provides mock configurations for S3 operations using aws-sdk-client-mock
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  S3Client,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command
} from '@aws-sdk/client-s3';
import { Readable } from 'stream';
import { sdkStreamMixin } from '@smithy/util-stream';

// Create S3 mock client
export const s3Mock = mockClient(S3Client);

/**
 * Reset the S3 mock to its initial state
 */
export const resetS3Mock = () => {
  s3Mock.reset();
};

/**
 * Create a mock readable stream for S3 GetObject responses
 * @param {string} content - The content to return
 * @returns {Object} Mock stream with transformToString method
 */
export const createMockS3Stream = (content) => {
  const stream = new Readable();
  stream.push(content);
  stream.push(null);

  const sdkStream = sdkStreamMixin(stream);
  return sdkStream;
};

/**
 * Mock S3 GetObjectCommand to return specified content
 * @param {string} content - The content to return
 * @param {Object} metadata - Optional metadata to include in response
 */
export const mockGetObject = (content, metadata = {}) => {
  s3Mock.on(GetObjectCommand).resolves({
    Body: createMockS3Stream(content),
    ContentType: metadata.contentType || 'text/plain',
    ContentLength: content.length,
    LastModified: metadata.lastModified || new Date(),
    ETag: metadata.etag || '"mock-etag"',
    ...metadata
  });
};

/**
 * Mock S3 GetObjectCommand to throw an error
 * @param {string} errorCode - The error code (e.g., 'NoSuchKey')
 * @param {string} message - The error message
 */
export const mockGetObjectError = (errorCode = 'NoSuchKey', message = 'The specified key does not exist.') => {
  const error = new Error(message);
  error.name = errorCode;
  error.$metadata = { httpStatusCode: errorCode === 'NoSuchKey' ? 404 : 500 };
  s3Mock.on(GetObjectCommand).rejects(error);
};

/**
 * Mock S3 PutObjectCommand to succeed
 * @param {Object} response - Optional response data
 */
export const mockPutObject = (response = {}) => {
  s3Mock.on(PutObjectCommand).resolves({
    ETag: '"mock-etag"',
    VersionId: 'mock-version-id',
    ...response
  });
};

/**
 * Mock S3 PutObjectCommand to throw an error
 * @param {string} errorCode - The error code
 * @param {string} message - The error message
 */
export const mockPutObjectError = (errorCode = 'AccessDenied', message = 'Access Denied') => {
  const error = new Error(message);
  error.name = errorCode;
  error.$metadata = { httpStatusCode: 403 };
  s3Mock.on(PutObjectCommand).rejects(error);
};

/**
 * Mock S3 DeleteObjectCommand to succeed
 * @param {Object} response - Optional response data
 */
export const mockDeleteObject = (response = {}) => {
  s3Mock.on(DeleteObjectCommand).resolves({
    DeleteMarker: true,
    VersionId: 'mock-version-id',
    ...response
  });
};

/**
 * Mock S3 DeleteObjectCommand to throw an error
 * @param {string} errorCode - The error code
 * @param {string} message - The error message
 */
export const mockDeleteObjectError = (errorCode = 'AccessDenied', message = 'Access Denied') => {
  const error = new Error(message);
  error.name = errorCode;
  error.$metadata = { httpStatusCode: 403 };
  s3Mock.on(DeleteObjectCommand).rejects(error);
};

/**
 * Mock S3 ListObjectsV2Command to return specified objects
 * @param {Array} objects - Array of object keys to return
 * @param {Object} options - Additional options (prefix, isTruncated, etc.)
 */
export const mockListObjects = (objects = [], options = {}) => {
  const contents = objects.map((obj, index) => ({
    Key: typeof obj === 'string' ? obj : obj.Key,
    Size: typeof obj === 'object' ? obj.Size : 1024,
    LastModified: typeof obj === 'object' ? obj.LastModified : new Date(),
    ETag: `"mock-etag-${index}"`,
    StorageClass: 'STANDARD'
  }));

  s3Mock.on(ListObjectsV2Command).resolves({
    Contents: contents,
    KeyCount: contents.length,
    MaxKeys: options.maxKeys || 1000,
    Name: options.bucketName || 'mock-bucket',
    Prefix: options.prefix || '',
    IsTruncated: options.isTruncated || false,
    ContinuationToken: options.continuationToken,
    NextContinuationToken: options.nextContinuationToken
  });
};

/**
 * Mock S3 ListObjectsV2Command to throw an error
 * @param {string} errorCode - The error code
 * @param {string} message - The error message
 */
export const mockListObjectsError = (errorCode = 'AccessDenied', message = 'Access Denied') => {
  const error = new Error(message);
  error.name = errorCode;
  error.$metadata = { httpStatusCode: 403 };
  s3Mock.on(ListObjectsV2Command).rejects(error);
};

/**
 * Get all calls made to a specific S3 command
 * @param {Function} command - The command class (e.g., GetObjectCommand)
 * @returns {Array} Array of call inputs
 */
export const getS3Calls = (command) => {
  return s3Mock.commandCalls(command).map(call => call.args[0].input);
};

export default s3Mock;
