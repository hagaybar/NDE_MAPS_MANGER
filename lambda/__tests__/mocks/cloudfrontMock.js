/**
 * AWS CloudFront Mock Helpers
 * Provides mock configurations for CloudFront operations using aws-sdk-client-mock
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  CloudFrontClient,
  CreateInvalidationCommand,
  GetInvalidationCommand
} from '@aws-sdk/client-cloudfront';

// Create CloudFront mock client
export const cloudFrontMock = mockClient(CloudFrontClient);

/**
 * Reset the CloudFront mock to its initial state
 */
export const resetCloudFrontMock = () => {
  cloudFrontMock.reset();
};

/**
 * Mock CloudFront CreateInvalidationCommand to succeed
 * @param {Object} options - Options for the mock response
 */
export const mockCreateInvalidation = (options = {}) => {
  const invalidationId = options.invalidationId || 'MOCK_INVALIDATION_ID';

  cloudFrontMock.on(CreateInvalidationCommand).resolves({
    Location: `https://cloudfront.amazonaws.com/2020-05-31/distribution/${options.distributionId || 'MOCK_DIST_ID'}/invalidation/${invalidationId}`,
    Invalidation: {
      Id: invalidationId,
      Status: 'InProgress',
      CreateTime: new Date(),
      InvalidationBatch: {
        Paths: {
          Quantity: options.pathCount || 1,
          Items: options.paths || ['/*']
        },
        CallerReference: options.callerReference || 'mock-caller-ref'
      }
    }
  });
};

/**
 * Mock CloudFront CreateInvalidationCommand to throw an error
 * @param {string} errorCode - The error code
 * @param {string} message - The error message
 */
export const mockCreateInvalidationError = (errorCode = 'AccessDenied', message = 'Access Denied') => {
  const error = new Error(message);
  error.name = errorCode;
  error.$metadata = { httpStatusCode: 403 };
  cloudFrontMock.on(CreateInvalidationCommand).rejects(error);
};

/**
 * Mock CloudFront GetInvalidationCommand to return status
 * @param {Object} options - Options for the mock response
 */
export const mockGetInvalidation = (options = {}) => {
  cloudFrontMock.on(GetInvalidationCommand).resolves({
    Invalidation: {
      Id: options.invalidationId || 'MOCK_INVALIDATION_ID',
      Status: options.status || 'Completed',
      CreateTime: options.createTime || new Date(),
      InvalidationBatch: {
        Paths: {
          Quantity: options.pathCount || 1,
          Items: options.paths || ['/*']
        },
        CallerReference: options.callerReference || 'mock-caller-ref'
      }
    }
  });
};

/**
 * Mock CloudFront GetInvalidationCommand to throw an error
 * @param {string} errorCode - The error code
 * @param {string} message - The error message
 */
export const mockGetInvalidationError = (errorCode = 'NoSuchInvalidation', message = 'The specified invalidation does not exist.') => {
  const error = new Error(message);
  error.name = errorCode;
  error.$metadata = { httpStatusCode: 404 };
  cloudFrontMock.on(GetInvalidationCommand).rejects(error);
};

/**
 * Get all calls made to a specific CloudFront command
 * @param {Function} command - The command class (e.g., CreateInvalidationCommand)
 * @returns {Array} Array of call inputs
 */
export const getCloudFrontCalls = (command) => {
  return cloudFrontMock.commandCalls(command).map(call => call.args[0].input);
};

export default cloudFrontMock;
