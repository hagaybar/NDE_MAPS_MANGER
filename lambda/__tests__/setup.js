/**
 * Jest Setup File
 * Common test setup and global configurations
 */

// Set test environment variables
process.env.AWS_REGION = 'us-east-1';
process.env.NODE_ENV = 'test';

// Note: In ESM mode with experimental VM modules, jest global methods
// like setTimeout should be configured in jest.config.js instead

// Export test utilities
export const testUtils = {
  /**
   * Create a mock API Gateway event
   */
  createApiGatewayEvent: (overrides = {}) => ({
    httpMethod: 'GET',
    path: '/',
    headers: {},
    queryStringParameters: null,
    pathParameters: null,
    body: null,
    isBase64Encoded: false,
    ...overrides
  }),

  /**
   * Create a mock Lambda context
   */
  createLambdaContext: (overrides = {}) => ({
    functionName: 'test-function',
    functionVersion: '$LATEST',
    invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test-function',
    memoryLimitInMB: '128',
    awsRequestId: 'test-request-id',
    logGroupName: '/aws/lambda/test-function',
    logStreamName: '2024/01/01/[$LATEST]test-stream',
    getRemainingTimeInMillis: () => 30000,
    ...overrides
  }),

  /**
   * Wait for a specified number of milliseconds
   */
  delay: (ms) => new Promise(resolve => setTimeout(resolve, ms))
};
