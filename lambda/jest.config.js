/** @type {import('jest').Config} */
export default {
  // Use ESM module support
  testEnvironment: 'node',

  // Transform ESM modules
  transform: {},

  // File extensions to consider
  moduleFileExtensions: ['mjs', 'js', 'json'],

  // Test file patterns
  testMatch: [
    '**/__tests__/**/*.test.mjs',
    '**/__tests__/**/*.test.js'
  ],

  // Setup files to run before tests
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],

  // Coverage configuration
  collectCoverage: false,
  collectCoverageFrom: [
    '*.mjs',
    '!jest.config.js'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 0,
      functions: 0,
      lines: 0,
      statements: 0
    }
  },

  // Module name mapper for ESM imports
  moduleNameMapper: {},

  // Verbose output
  verbose: true,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,

  // Timeout for async tests (10 seconds)
  testTimeout: 10000,

  // Note: .mjs files are automatically treated as ESM
  // extensionsToTreatAsEsm is only needed for .js files when type: module
};
