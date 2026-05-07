const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: ['<rootDir>/apps/web/tests/integration/**/*.test.ts'],
};
