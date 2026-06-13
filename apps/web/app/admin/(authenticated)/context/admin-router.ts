'use client';

import { useRouter } from 'next/navigation';
import { useAdminNavigationPending } from './admin-navigation-pending-context';
import { appendDashboardTabToHref } from '@/lib/admin-tab-routing';
import { useAdminDashboardTab } from './admin-dashboard-tab-context';

type Router = ReturnType<typeof useRouter>;
type NavigateOptions = Parameters<Router['push']>[1];

type AdminRouter = {
  pendingHref: string | null;
  isNavigating: boolean;
  push: (href: string, options?: NavigateOptions) => void;
  replace: (href: string, options?: NavigateOptions) => void;
  refresh: () => void;
  back: () => void;
  prefetch: (href: string) => void;
};

export function useAdminRouter(): AdminRouter {
  const router = useRouter();
  const { pendingHref, isNavigating, startNavigation, clearNavigation } = useAdminNavigationPending();
  const { selectedTab } = useAdminDashboardTab();

  return {
    pendingHref,
    isNavigating,
    push: (href: string, options?: NavigateOptions) => {
      const resolvedHref = appendDashboardTabToHref(href, selectedTab);
      startNavigation(resolvedHref);
      router.push(resolvedHref, options);
    },
    replace: (href: string, options?: NavigateOptions) => {
      const resolvedHref = appendDashboardTabToHref(href, selectedTab);
      startNavigation(resolvedHref);
      router.replace(resolvedHref, options);
    },
    refresh: () => {
      clearNavigation();
      router.refresh();
    },
    back: () => {
      clearNavigation();
      router.back();
    },
    prefetch: (href: string) => {
      router.prefetch(appendDashboardTabToHref(href, selectedTab));
    },
  };
}
