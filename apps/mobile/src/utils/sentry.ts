import * as Sentry from '@sentry/browser';

const FALLBACK_DSN = 'https://40ea86a7d90882954ba134211f163d73@o4511346150080512.ingest.us.sentry.io/4511346151587840';

const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN || FALLBACK_DSN;
const environment = process.env.EXPO_PUBLIC_SENTRY_ENVIRONMENT || (__DEV__ ? 'development' : 'production');

let initialized = false;

export function initSentry() {
  if (initialized) return;
  initialized = true;

  Sentry.init({
    dsn,
    environment,
    integrations: [
      Sentry.consoleLoggingIntegration({
        levels: ['warn', 'error'],
      }),
    ],
  });
}

export function captureException(
  error: unknown,
  context?: { tags?: Record<string, string>; extra?: Record<string, unknown> }
) {
  Sentry.withScope(scope => {
    if (context?.tags) {
      Object.entries(context.tags).forEach(([key, value]) => {
        scope.setTag(key, value);
      });
    }
    if (context?.extra) {
      scope.setExtras(context.extra);
    }
    if (error instanceof Error) {
      Sentry.captureException(error);
    } else {
      Sentry.captureException(new Error(String(error)));
    }
  });
}

export function setSentryUser(user: { id: string; employeeId?: string } | null) {
  if (user) {
    Sentry.setUser({ id: user.id, employeeId: user.employeeId });
  } else {
    Sentry.setUser(null);
  }
}
