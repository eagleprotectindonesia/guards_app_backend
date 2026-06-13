'use client';

import React, { createContext, useCallback, useContext, useMemo } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import {
  getAdminDashboardHref,
  getSelectedAdminDashboardTab,
  type AdminTabSlug,
} from '@/lib/admin-tab-routing';

type AdminDashboardTabContextValue = {
  selectedTab: AdminTabSlug;
  setSelectedTab: (tab: AdminTabSlug) => void;
};

const AdminDashboardTabContext = createContext<AdminDashboardTabContextValue | undefined>(undefined);

export function AdminDashboardTabProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const selectedTab = useMemo(() => getSelectedAdminDashboardTab(pathname, searchParams), [pathname, searchParams]);

  const setSelectedTab = useCallback(
    (tab: AdminTabSlug) => {
      router.push(getAdminDashboardHref(tab));
    },
    [router]
  );

  const value = useMemo(
    () => ({
      selectedTab,
      setSelectedTab,
    }),
    [selectedTab, setSelectedTab]
  );

  return <AdminDashboardTabContext.Provider value={value}>{children}</AdminDashboardTabContext.Provider>;
}

export function useAdminDashboardTab() {
  const context = useContext(AdminDashboardTabContext);
  if (context === undefined) {
    throw new Error('useAdminDashboardTab must be used within AdminDashboardTabProvider');
  }
  return context;
}
