'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import { UnauthorizedError } from './auth-errors';

export function AuthBoundary({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const isHandlingUnauthorized = useRef(false);

  useEffect(() => {
    const handleUnauthorized = (error: unknown) => {
      if (!(error instanceof UnauthorizedError) || isHandlingUnauthorized.current) {
        return;
      }

      isHandlingUnauthorized.current = true;
      queryClient.clear();
      router.replace('/employee/login');
    };

    const unsubscribeQueryCache = queryClient.getQueryCache().subscribe((event) => {
      if (!event || !('query' in event)) return;
      handleUnauthorized(event.query.state.error);
    });

    const unsubscribeMutationCache = queryClient.getMutationCache().subscribe((event) => {
      if (!event || !('mutation' in event)) return;
      if (!event.mutation) return;
      handleUnauthorized(event.mutation.state.error);
    });

    return () => {
      unsubscribeQueryCache();
      unsubscribeMutationCache();
    };
  }, [queryClient, router]);

  return <>{children}</>;
}
