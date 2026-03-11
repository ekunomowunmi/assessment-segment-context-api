module.exports = {
  testEnvironment: 'node',
  watchman: false,
  transform: {
    '^.+\\.js$': 'babel-jest',
  },
  transformIgnorePatterns: [],
  moduleFileExtensions: ['js', 'json'],
  testMatch: ['**/tests/**/*.test.js'],
  collectCoverageFrom: [
    'src/**/*.js',
    '!src/database/migrate.js',
    '!src/database/connection.js', // Infrastructure code, tested separately
    '!src/index.js',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  // Coverage thresholds - target 80% coverage overall
  coverageThreshold: {
    global: {
      branches: 69,
      functions: 77,
      lines: 78,
      statements: 78,
    },
    './src/services/vertexAIService.js': {
      branches: 70,
      functions: 70,
      lines: 50,
      statements: 50,
    },
  },
};
