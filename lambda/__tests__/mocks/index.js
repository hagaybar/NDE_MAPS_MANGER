/**
 * AWS SDK Mock Helpers Index
 * Re-exports all mock helpers for convenient importing
 */

export * from './s3Mock.js';
export * from './cloudfrontMock.js';

// Import default exports
import s3Mock from './s3Mock.js';
import cloudFrontMock from './cloudfrontMock.js';

// JWT mock exports (using dynamic import for ESM compatibility)
export const loadJwtMock = async () => {
  const jwtMock = await import('./jwt-mock.mjs');
  return jwtMock;
};

/**
 * Reset all AWS mocks to their initial state
 */
export const resetAllMocks = () => {
  s3Mock.reset();
  cloudFrontMock.reset();
};

export { s3Mock, cloudFrontMock };
