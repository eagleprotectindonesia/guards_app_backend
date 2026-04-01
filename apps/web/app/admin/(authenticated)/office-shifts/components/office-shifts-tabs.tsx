'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function OfficeShiftsTabs() {
  const pathname = usePathname();
  const activeTab = pathname.includes('/day-offs') ? 'day-offs' : 'shifts';

  return (
    <div className="flex border-b border-border mb-6">
      <Link
        href="/admin/office-shifts"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeTab === 'shifts'
            ? 'border-red-600 text-red-600'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Office Shifts
      </Link>
      <Link
        href="/admin/office-shifts/day-offs"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeTab === 'day-offs'
            ? 'border-red-600 text-red-600'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        🌴 Day Offs
      </Link>
    </div>
  );
}
