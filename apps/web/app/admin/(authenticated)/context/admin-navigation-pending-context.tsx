'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';

type AdminNavigationPendingContextValue = {
  pendingHref: string | null;
  isNavigating: boolean;
  startNavigation: (href: string) => void;
  clearNavigation: () => void;
};

const AdminNavigationPendingContext = createContext<AdminNavigationPendingContextValue | undefined>(undefined);

export function AdminNavigationPendingProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const searchParamsString = searchParams.toString();
  const [pendingHref, setPendingHref] = useState<string | null>(null);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setPendingHref(null);
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [pathname, searchParamsString]);

  useEffect(() => {
    if (!pendingHref) return;

    const timeout = window.setTimeout(() => {
      setPendingHref(null);
    }, 8000);

    return () => window.clearTimeout(timeout);
  }, [pendingHref]);

  const startNavigation = useCallback((href: string) => {
    setPendingHref(href);
  }, []);

  const clearNavigation = useCallback(() => {
    setPendingHref(null);
  }, []);

  const value = useMemo(
    () => ({
      pendingHref,
      isNavigating: pendingHref !== null,
      startNavigation,
      clearNavigation,
    }),
    [pendingHref, startNavigation, clearNavigation]
  );

  return <AdminNavigationPendingContext.Provider value={value}>{children}</AdminNavigationPendingContext.Provider>;
}

export function useAdminNavigationPending() {
  const context = useContext(AdminNavigationPendingContext);

  if (!context) {
    throw new Error('useAdminNavigationPending must be used within AdminNavigationPendingProvider');
  }

  return context;
}
