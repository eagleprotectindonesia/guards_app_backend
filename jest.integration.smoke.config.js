const base = require('./jest.config');

module.exports = {
  ...base,
  testMatch: [
    '<rootDir>/apps/web/tests/integration/attendance-api.test.ts',
    '<rootDir>/apps/web/tests/integration/checkin-api.test.ts',
  ],
};
