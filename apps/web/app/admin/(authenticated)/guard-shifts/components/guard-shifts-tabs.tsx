'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import { AdminNavLink } from '../../components/admin-nav-link';

export default function GuardShiftsTabs() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activeTab = pathname.includes('/day-offs') ? 'day-offs' : 'shifts';

  const queryString = searchParams.toString();
  const shiftsHref = queryString ? `/admin/guard-shifts?${queryString}` : '/admin/guard-shifts';
  const dayOffsHref = queryString ? `/admin/guard-shifts/day-offs?${queryString}` : '/admin/guard-shifts/day-offs';

  return (
    <div className="flex border-b border-border mb-6">
      <AdminNavLink
        href={shiftsHref}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeTab === 'shifts'
            ? 'border-red-600 text-red-600'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Guard Shifts
      </AdminNavLink>
      <AdminNavLink
        href={dayOffsHref}
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeTab === 'day-offs'
            ? 'border-red-600 text-red-600'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        🌴 Day Offs
      </AdminNavLink>
    </div>
  );
}
