'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AttendanceTabs() {
  const pathname = usePathname();
  const activeTab = pathname.includes('/office') ? 'office' : 'shifts';

  return (
    <div className="flex border-b border-border mb-6">
      <Link
        href="/admin/attendance"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeTab === 'shifts'
            ? 'border-red-600 text-red-600'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Shift Attendance
      </Link>
      <Link
        href="/admin/attendance/office"
        className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          activeTab === 'office'
            ? 'border-red-600 text-red-600'
            : 'border-transparent text-muted-foreground hover:text-foreground'
        }`}
      >
        Office Attendance
      </Link>
    </div>
  );
}
