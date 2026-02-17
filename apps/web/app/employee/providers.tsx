'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState } from 'react';
import { SocketProvider } from '@/components/socket-provider';
import './i18n';
import { UnauthorizedError } from './auth-errors';
import { AuthBoundary } from './auth-boundary';

export default function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            // With SSR, we usually want to set some default staleTime
            // above 0 to avoid refetching immediately on the client
            staleTime: 60 * 1000,
            retry: (failureCount, error) => {
              if (error instanceof UnauthorizedError) {
                return false;
              }
              return failureCount < 3;
            },
          },
        },
      })
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AuthBoundary>
        <SocketProvider role="employee">
          {children}
        </SocketProvider>
      </AuthBoundary>
    </QueryClientProvider>
  );
}
