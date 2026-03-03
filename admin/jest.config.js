export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  transform: {},
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  collectCoverageFrom: [
    'components/**/*.js',
    'auth-service.js',
    'auth-config.js',
    '!**/__tests__/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  injectGlobals: true
};
