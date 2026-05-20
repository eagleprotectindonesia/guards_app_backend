'use client';

import * as Sentry from '@sentry/nextjs';
import NextError from 'next/error';
import { useEffect } from 'react';
import { getSentryClientContext } from '@/lib/sentry-client-context';

export default function GlobalError({ error }: { error: Error & { digest?: string } }) {
  useEffect(() => {
    const capture = async () => {
      const context = await getSentryClientContext();
      const isDomInsertionError =
        error.name === 'NotFoundError' || (typeof error.message === 'string' && error.message.includes('insertBefore'));

      Sentry.withScope((scope) => {
        scope.setTag('feature', 'global_client_error');
        if (isDomInsertionError) {
          scope.setTag('error_family', 'dom_node_insertion');
        }
        scope.setContext('client', context);
        scope.setContext('global_error', {
          name: error.name,
          message: error.message,
          digest: error.digest,
        });
        Sentry.captureException(error);
      });
    };

    void capture();
  }, [error]);

  return (
    <html>
      <body>
        <NextError statusCode={0} />
      </body>
    </html>
  );
}
