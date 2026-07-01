'use client';

import { useCallback } from 'react';
import { useSearchParams } from 'next/navigation';
import { useAdminRouter } from '../../context/admin-router';

export function useFilterUrlSync(pathname: string) {
  const router = useAdminRouter();
  const searchParams = useSearchParams();

  const apply = useCallback(
    (filters: Record<string, string | null | undefined>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(filters)) {
        if (value === null || value === undefined) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      params.set('page', '1');
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, searchParams, pathname]
  );

  const clear = useCallback(() => {
    const params = new URLSearchParams();
    const sortBy = searchParams.get('sortBy');
    const sortOrder = searchParams.get('sortOrder');
    if (sortBy) params.set('sortBy', sortBy);
    if (sortOrder) params.set('sortOrder', sortOrder);
    params.set('page', '1');
    router.push(`${pathname}?${params.toString()}`);
  }, [router, searchParams, pathname]);

  return { apply, clear };
}
