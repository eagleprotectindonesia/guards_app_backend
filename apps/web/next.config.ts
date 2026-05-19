import type { NextConfig } from 'next';
import path from 'path';
import { withSentryConfig } from '@sentry/nextjs';
import dotenv from 'dotenv';

if (process.env.CI !== 'true') {
  // Use the monorepo root .env as a local fallback. CI and Docker builds should
  // continue to rely on explicit environment injection.
  dotenv.config({ path: path.resolve(__dirname, '../../.env') });
}
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
const sentryDebug = process.env.SENTRY_LOG_LEVEL === 'debug';

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,
  widenClientFileUpload: true,
  silent: !isCi,
  debug: sentryDebug,
  disableLogger: true,
  tunnelRoute: '/monitoring',
});
