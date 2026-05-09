'use client';

import { useAdminNavigationPending } from '../context/admin-navigation-pending-context';

export function AdminNavigationProgressBar() {
  const { isNavigating } = useAdminNavigationPending();

  if (!isNavigating) {
    return <div className="h-0.5 w-full" aria-hidden="true" />;
  }

  return (
    <div className="h-0.5 w-full overflow-hidden bg-transparent" aria-hidden="true">
      <div className="h-full w-1/3 rounded-full bg-red-500 animate-pulse" />
    </div>
  );
}
