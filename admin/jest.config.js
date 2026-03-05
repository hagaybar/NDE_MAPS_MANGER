export default {
  testEnvironment: 'jsdom',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.js'],
  moduleFileExtensions: ['js', 'json'],
  transform: {},
  setupFilesAfterEnv: ['<rootDir>/__tests__/setup.js'],
  collectCoverageFrom: [
    'components/**/*.js',
    'services/**/*.js',
    'auth-service.js',
    'auth-config.js',
    '!**/__tests__/**'
  ],
  coverageDirectory: 'coverage',
  verbose: true,
  injectGlobals: true,
  moduleNameMapper: {
    '^../i18n\\.js\\?v=\\d+$': '<rootDir>/__tests__/mocks/i18n.js',
    '^../services/data-model\\.js$': '<rootDir>/services/data-model.js',
    '^./data-model\\.js$': '<rootDir>/services/data-model.js'
  }
};
