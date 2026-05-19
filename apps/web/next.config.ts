import type { NextConfig } from 'next';
import path from 'path';
import { withSentryConfig } from '@sentry/nextjs';
// import dotenv from 'dotenv';

// 🌍 Load environment variables from the root .env file
// This ensures they are available on all machines/OSs without manual symlinking
// dotenv.config({ path: path.resolve(__dirname, '../../.env') });
// const isBeta = process.env.APP_ENV === 'beta';

const nextConfig: NextConfig = {
  output: 'standalone',
  outputFileTracingRoot: path.join(__dirname, '../../'),
  /* config options here */
  // basePath: isBeta ? '/beta' : '',

  experimental: {
    authInterrupts: true,
  },
};

const isCi = process.env.CI === 'true';
const sentryStrict = process.env.SENTRY_UPLOAD_STRICT === '1';
const sentryDebug = process.env.SENTRY_LOG_LEVEL === 'debug';

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !isCi,
  debug: sentryDebug,
  widenClientFileUpload: true,
  disableLogger: true,
  tunnelRoute: '/monitoring',
  ...(sentryStrict
    ? {
        errorHandler(error) {
          throw error;
        },
      }
    : {}),
});
