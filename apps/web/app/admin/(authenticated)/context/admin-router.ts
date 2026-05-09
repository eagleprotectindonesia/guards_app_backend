'use client';

import { useRouter } from 'next/navigation';
import { useAdminNavigationPending } from './admin-navigation-pending-context';

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

  return {
    pendingHref,
    isNavigating,
    push: (href: string, options?: NavigateOptions) => {
      startNavigation(href);
      router.push(href, options);
    },
    replace: (href: string, options?: NavigateOptions) => {
      startNavigation(href);
      router.replace(href, options);
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
      router.prefetch(href);
    },
  };
}
